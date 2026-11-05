'use client'

import React, { useState, useEffect } from 'react'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { useFeedback } from '@/contexts/feedback-context'
import { Users, Shield, UserPlus, Trash2, CheckCircle2, X, AlertTriangle, Building2, MapPin, Store } from 'lucide-react'
import { useNetwork } from '@/contexts/network-context'

export default function UsuariosPage() {
  const [profiles, setProfiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  
  // Campos do formulário
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<
    'super_admin' | 'network_admin' | 'unit_admin' | 'branch_admin' | 'cashier_operator'
  >('cashier_operator')

  const [selectedNetworkId, setSelectedNetworkId] = useState('')
  const [selectedUnitId, setSelectedUnitId] = useState('')
  const [selectedBranchId, setSelectedBranchId] = useState('')

  const [submitting, setSubmitting] = useState(false)

  // Modal de Exclusão
  const [deletingUser, setDeletingUser] = useState<any | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { user: currentUser, profile: currentProfile } = useAuth()
  const { networks, units, branches } = useNetwork()
  const { showSuccess, showError } = useFeedback()
  const [supabase] = useState(() => createClient())

  // Carregar perfis respeitando a regra estrita da árvore descendente (Down-Tree)
  async function loadProfiles() {
    if (!currentProfile) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      let query = supabase
        .from('profiles')
        .select(`
          *,
          network:networks(id, name),
          unit:units(id, name),
          branch:branches(id, name)
        `)
        .order('created_at')

      if (currentProfile.role === 'super_admin') {
        // Super Admin vê todos
      } else if (currentProfile.role === 'network_admin') {
        // Admin de Rede: vê a si mesmo e cargos abaixo na sua rede (sem ver super_admin)
        if (currentProfile.network_id) {
          query = query
            .eq('network_id', currentProfile.network_id)
            .neq('role', 'super_admin')
        } else {
          query = query.eq('id', currentUser?.id || '')
        }
      } else if (currentProfile.role === 'unit_admin') {
        // Admin de Unidade: vê a si mesmo e cargos da sua unidade
        if (currentProfile.unit_id) {
          query = query
            .eq('unit_id', currentProfile.unit_id)
            .in('role', ['unit_admin', 'branch_admin', 'cashier_operator', 'operator'])
        } else {
          query = query.eq('id', currentUser?.id || '')
        }
      } else if (currentProfile.role === 'branch_admin') {
        // Admin de Filial (Gerente): vê a si mesmo e caixas da SUA FILIAL
        if (currentProfile.branch_id) {
          query = query
            .eq('branch_id', currentProfile.branch_id)
            .in('role', ['branch_admin', 'cashier_operator', 'operator'])
        } else {
          query = query.eq('id', currentUser?.id || '')
        }
      } else {
        // Operadores de caixa veem apenas a própria conta
        query = query.eq('id', currentUser?.id || '')
      }

      const { data, error } = await query
      if (error) throw error
      if (data) setProfiles(data)
    } catch (err) {
      console.error('Erro ao carregar usuários:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (currentProfile) {
      loadProfiles()
    } else {
      setLoading(false)
    }
  }, [currentProfile])

  // Atualizar seleção padrão quando as redes carregarem
  useEffect(() => {
    if (networks.length > 0 && !selectedNetworkId) {
      setSelectedNetworkId(networks[0].id)
    }
  }, [networks, selectedNetworkId])

  // Filtrar unidades pela rede selecionada
  const availableUnits = units.filter((u) => u.network_id === selectedNetworkId)

  // Filtrar filiais pela unidade selecionada
  const availableBranches = branches.filter((b) => b.unit_id === selectedUnitId)

  // Abrir modal configurando escopo do usuário logado
  const handleOpenCreateModal = () => {
    setEmail('')
    setPassword('')
    setFullName('')

    if (currentProfile?.role === 'branch_admin') {
      setRole('cashier_operator')
      setSelectedNetworkId(currentProfile.network_id || '')
      setSelectedUnitId(currentProfile.unit_id || '')
      setSelectedBranchId(currentProfile.branch_id || '')
    } else if (currentProfile?.role === 'unit_admin') {
      setRole('cashier_operator')
      setSelectedNetworkId(currentProfile.network_id || '')
      setSelectedUnitId(currentProfile.unit_id || '')
      setSelectedBranchId('')
    } else if (currentProfile?.role === 'network_admin') {
      setRole('cashier_operator')
      setSelectedNetworkId(currentProfile.network_id || '')
      setSelectedUnitId('')
      setSelectedBranchId('')
    } else {
      setRole('cashier_operator')
      if (networks.length > 0) setSelectedNetworkId(networks[0].id)
    }

    setIsModalOpen(true)
  }

  // Criar Usuário no Supabase Auth com cliente isolado (sem deslogar o admin) e configurar via RPC
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)

      let targetRole = role
      let netId = selectedNetworkId || null
      let unId = selectedUnitId || null
      let brId = selectedBranchId || null

      // Trava estrita de segurança pelo perfil de quem está criando
      if (currentProfile?.role === 'branch_admin') {
        targetRole = 'cashier_operator'
        brId = currentProfile.branch_id || null
        unId = currentProfile.unit_id || null
        netId = currentProfile.network_id || null
      } else if (currentProfile?.role === 'unit_admin') {
        unId = currentProfile.unit_id || null
        netId = currentProfile.network_id || null
        if (targetRole !== 'branch_admin' && targetRole !== 'cashier_operator') {
          targetRole = 'cashier_operator'
        }
      } else if (currentProfile?.role === 'network_admin') {
        netId = currentProfile.network_id || null
        if (targetRole === 'super_admin' || targetRole === 'network_admin') {
          targetRole = 'branch_admin'
        }
      }

      // Se for branch_admin ou cashier_operator, a filial é obrigatória
      if ((targetRole === 'branch_admin' || targetRole === 'cashier_operator') && !brId) {
        throw new Error('Selecione a Filial para este usuário.')
      }

      // Se for unit_admin, a unidade é obrigatória
      if (targetRole === 'unit_admin' && !unId) {
        throw new Error('Selecione a Unidade / Regional para este usuário.')
      }

      // Se selecionou filial, obter unit e network automáticos
      if (brId) {
        const branchObj = branches.find((b) => b.id === brId)
        if (branchObj) {
          unId = branchObj.unit_id
          netId = branchObj.network_id
        }
      } else if (unId) {
        const unitObj = units.find((u) => u.id === unId)
        if (unitObj) {
          netId = unitObj.network_id
        }
      }

      // Cliente isolado para NÃO sobrescrever a sessão do administrador
      const isolatedClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        }
      )

      const { data, error: signUpError } = await isolatedClient.auth.signUp({
        email,
        password,
      })

      if (signUpError) throw signUpError

      if (!data.user) {
        throw new Error('Falha ao registrar novo usuário no serviço de autenticação.')
      }

      // Configurar perfil e vínculos de forma auditada via RPC do admin logado
      const { error: configError } = await supabase.rpc('admin_configure_new_user', {
        p_user_id: data.user.id,
        p_full_name: fullName.trim(),
        p_role: targetRole,
        p_network_id: netId,
        p_unit_id: unId,
        p_branch_id: brId,
      })

      if (configError) throw configError

      showSuccess('Usuário Cadastrado!', `${fullName || email} foi cadastrado e liberado para acesso imediato.`)
      setIsModalOpen(false)
      setEmail('')
      setPassword('')
      setFullName('')
      loadProfiles()
    } catch (err: any) {
      showError('Erro ao criar usuário', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Deletar Usuário via RPC seguro
  const handleDeleteUser = async () => {
    if (!deletingUser) return
    try {
      setDeleting(true)
      const { error } = await supabase.rpc('admin_delete_user', {
        p_user_id: deletingUser.id,
      })
      if (error) throw error

      showSuccess('Usuário Removido', 'A conta de acesso foi excluída com sucesso.')
      setDeletingUser(null)
      loadProfiles()
    } catch (err: any) {
      showError('Erro ao excluir usuário', err.message)
    } finally {
      setDeleting(false)
    }
  }

  const isSuperAdminUser = currentProfile?.role === 'super_admin'
  const isNetworkAdmin = currentProfile?.role === 'network_admin'
  const isBranchAdmin = currentProfile?.role === 'branch_admin'

  const renderRoleBadge = (r: string) => {
    switch (r) {
      case 'super_admin':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-[10px] font-extrabold text-amber-400">
            <Shield size={10} /> Super Admin Global
          </span>
        )
      case 'network_admin':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/20 border border-blue-500/30 px-2 py-0.5 text-[10px] font-extrabold text-blue-400">
            <Building2 size={10} /> Admin de Rede
          </span>
        )
      case 'unit_admin':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 text-[10px] font-extrabold text-indigo-400">
            <MapPin size={10} /> Admin Unidade (Polo)
          </span>
        )
      case 'branch_admin':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-extrabold text-emerald-400">
            <Store size={10} /> Gerente da Filial
          </span>
        )
      case 'cashier_operator':
      case 'operator':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-300">
            Operador de Caixa (PDV)
          </span>
        )
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-white tracking-tight">Equipe & Controle de Acessos</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Gerencie os operadores, gerentes de filiais e administradores com isolamento estrito de rede.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20 transition cursor-pointer"
        >
          <UserPlus size={16} /> Novo Usuário
        </button>
      </div>

      {/* Tabela de Usuários */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold uppercase">
              <tr>
                <th className="py-3 px-4">Nome</th>
                <th className="py-3 px-4">E-mail</th>
                <th className="py-3 px-4">Nível de Acesso</th>
                <th className="py-3 px-4">Vínculo Territorial</th>
                <th className="py-3 px-4">Criado em</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Carregando usuários da rede...
                  </td>
                </tr>
              ) : profiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Nenhum usuário cadastrado sob seu escopo hierárquico.
                  </td>
                </tr>
              ) : (
                profiles.map((p) => {
                  const isProfileSuperAdmin = p.role === 'super_admin'
                  const isSelf = p.id === currentProfile?.id || p.id === currentUser?.id

                  // Permissão de exclusão baseada na hierarquia sem travas hardcoded por e-mail
                  const canDelete =
                    !isSelf &&
                    (!isProfileSuperAdmin || currentProfile?.role === 'super_admin') &&
                    (isSuperAdminUser ||
                      (isNetworkAdmin && p.role !== 'network_admin') ||
                      (currentProfile?.role === 'unit_admin' && (p.role === 'branch_admin' || p.role === 'cashier_operator' || p.role === 'operator')) ||
                      (isBranchAdmin && (p.role === 'cashier_operator' || p.role === 'operator')))

                  // Vínculo hierárquico textual
                  let vinculoText = 'Plataforma Global'
                  if (p.branch?.name) {
                    vinculoText = `Filial: ${p.branch.name}`
                  } else if (p.unit?.name) {
                    vinculoText = `Unidade: ${p.unit.name}`
                  } else if (p.network?.name) {
                    vinculoText = `Rede: ${p.network.name}`
                  }

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                        {p.full_name || 'Usuário'}
                        {isSelf && (
                          <span className="rounded-md bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-300">
                            VOCÊ
                          </span>
                        )}
                        {isProfileSuperAdmin && (
                          <span className="rounded-md bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-300">
                            SUPER ADMIN
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-mono">{p.email || '-'}</td>
                      <td className="py-3 px-4">
                        {renderRoleBadge(p.role)}
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-medium">
                        <span className="inline-flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-[11px]">
                          {vinculoText}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400">{formatDate(p.created_at)}</td>
                      <td className="py-3 px-4 text-right">
                        {canDelete && (
                          <button
                            onClick={() => setDeletingUser(p)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition cursor-pointer"
                            title="Excluir Usuário"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE NOVO USUÁRIO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">
                {isBranchAdmin ? 'Cadastrar Novo Operador de Caixa' : 'Criar Novo Acesso'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ex: João da Silva"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">E-mail de Acesso</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operador@giro.com"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Senha Inicial</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Seletor de Cargo */}
              {isBranchAdmin ? (
                <div>
                  <label className="text-xs font-semibold text-slate-400">Cargo / Nível</label>
                  <div className="mt-1 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white">
                    <span className="font-bold text-blue-400">Operador de Caixa</span>
                    <span className="text-[10px] text-slate-500">Exclusivo para frente de caixa (PDV)</span>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-semibold text-slate-400">Nível de Acesso (Cargo)</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                  >
                    <option value="cashier_operator">Operador de Caixa (Exclusivo PDV / Caixa da Filial)</option>
                    <option value="branch_admin">Administrador da Filial (Gerente da Loja)</option>
                    {(isSuperAdminUser || isNetworkAdmin) && (
                      <option value="unit_admin">Administrador da Unidade (Gerente do Polo / Regional)</option>
                    )}
                    {isSuperAdminUser && (
                      <option value="network_admin">Administrador da Rede (Gestão de Todas as Unidades/Lojas)</option>
                    )}
                  </select>
                </div>
              )}

              {/* Seletor de Rede (Apenas Super Admin) */}
              {isSuperAdminUser && networks.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-400">Rede *</label>
                  <select
                    value={selectedNetworkId}
                    onChange={(e) => {
                      setSelectedNetworkId(e.target.value)
                      setSelectedUnitId('')
                      setSelectedBranchId('')
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                  >
                    {networks.map((n) => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Seletor de Unidade / Regional (Não exibido para Branch Admin) */}
              {!isBranchAdmin && (role === 'unit_admin' || role === 'branch_admin' || role === 'cashier_operator') && (
                <div>
                  <label className="text-xs font-semibold text-slate-400">Unidade / Regional *</label>
                  <select
                    value={selectedUnitId}
                    onChange={(e) => {
                      setSelectedUnitId(e.target.value)
                      setSelectedBranchId('')
                    }}
                    required={role === 'unit_admin'}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                  >
                    <option value="">Selecione a Unidade...</option>
                    {availableUnits.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} {u.city ? `(${u.city})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Filial / Loja */}
              {isBranchAdmin ? (
                <div>
                  <label className="text-xs font-semibold text-slate-400">Filial Vinculada</label>
                  <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white">
                    <Store size={14} className="text-emerald-400" />
                    <span className="font-bold text-emerald-400">
                      {branches.find((b) => b.id === currentProfile.branch_id)?.name || 'Sua Filial'}
                    </span>
                    <span className="text-[10px] text-slate-500 ml-auto font-medium">(Loja Gerenciada)</span>
                  </div>
                </div>
              ) : (
                (role === 'branch_admin' || role === 'cashier_operator') && (
                  <div>
                    <label className="text-xs font-semibold text-slate-400">Filial / Loja *</label>
                    <select
                      value={selectedBranchId}
                      onChange={(e) => setSelectedBranchId(e.target.value)}
                      required
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                    >
                      <option value="">Selecione a Filial...</option>
                      {availableBranches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                )
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-400 hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-amber-500 px-6 py-2 text-xs font-extrabold text-slate-950 hover:bg-amber-400 transition cursor-pointer"
                >
                  {submitting ? 'Criando...' : 'Cadastrar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 pb-3 border-b border-slate-800">
              <AlertTriangle size={22} />
              <h3 className="text-base font-bold text-white">Excluir Usuário</h3>
            </div>

            <p className="text-xs text-slate-300 mt-4">
              Tem certeza que deseja remover o usuário <strong>{deletingUser.full_name || deletingUser.email}</strong>?
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Esta ação revoga imediatamente o acesso e remove a conta do sistema.
            </p>

            <div className="flex justify-end gap-2 pt-6">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-400 hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={deleting}
                className="rounded-xl bg-rose-500 px-5 py-2 text-xs font-extrabold text-white hover:bg-rose-600 disabled:opacity-50 transition cursor-pointer"
              >
                {deleting ? 'Excluindo...' : 'Sim, Excluir Usuário'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
