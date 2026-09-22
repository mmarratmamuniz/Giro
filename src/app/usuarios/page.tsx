'use client'

import React, { useState, useEffect } from 'react'
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
    'network_admin' | 'unit_admin' | 'branch_admin' | 'cashier_operator'
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
  const supabase = createClient()

  async function loadProfiles() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          network:networks(id, name),
          unit:units(id, name),
          branch:branches(id, name)
        `)
        .order('created_at')
      if (error) throw error
      if (data) setProfiles(data)
    } catch (err) {
      console.error('Erro ao carregar usuários:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfiles()
  }, [])

  // Atualizar seleção padrão quando as redes/filiais carregarem
  useEffect(() => {
    if (networks.length > 0 && !selectedNetworkId) {
      setSelectedNetworkId(networks[0].id)
    }
  }, [networks])

  // Filtrar unidades pela rede selecionada
  const availableUnits = units.filter((u) => u.network_id === selectedNetworkId)

  // Filtrar filiais pela unidade selecionada
  const availableBranches = branches.filter((b) => b.unit_id === selectedUnitId)

  // Criar Usuário no Supabase Auth com metadados hierárquicos
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)

      let netId = selectedNetworkId || null
      let unId = selectedUnitId || null
      let brId = selectedBranchId || null

      // Se for branch_admin ou cashier_operator, a filial é obrigatória
      if ((role === 'branch_admin' || role === 'cashier_operator') && !brId) {
        throw new Error('Selecione a Filial para este usuário.')
      }

      // Se for unit_admin, a unidade é obrigatória
      if (role === 'unit_admin' && !unId) {
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

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role,
            network_id: netId,
            unit_id: unId,
            branch_id: brId,
          },
        },
      })

      if (error) throw error

      // Atualizar diretamente a tabela de perfis caso o trigger não tenha herdado as FKs
      if (data.user) {
        await supabase
          .from('profiles')
          .update({
            full_name: fullName,
            role,
            network_id: netId,
            unit_id: unId,
            branch_id: brId,
          })
          .eq('id', data.user.id)
      }

      showSuccess('Usuário Cadastrado!', `${fullName || email} foi cadastrado com sucesso.`)
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
      const { error } = await supabase.rpc('delete_user_by_admin', {
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

  // Renderiza a badge correta para cada papel
  const renderRoleBadge = (roleKey: string) => {
    switch (roleKey) {
      case 'super_admin':
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <Shield size={10} /> Super Admin
          </span>
        )
      case 'network_admin':
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            <Building2 size={10} /> Admin de Rede
          </span>
        )
      case 'unit_admin':
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            <MapPin size={10} /> Admin de Unidade
          </span>
        )
      case 'branch_admin':
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <Store size={10} /> Admin de Filial
          </span>
        )
      case 'cashier_operator':
      case 'operator':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
            Operador de Caixa
          </span>
        )
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-base font-bold text-white">Equipe e Acessos do Sistema</h4>
          <p className="text-xs text-slate-400">Controle de Administradores de Rede, Unidade, Filial e Caixas</p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
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
                <th className="py-3.5 px-4">Nome</th>
                <th className="py-3.5 px-4">E-mail</th>
                <th className="py-3.5 px-4">Cargo / Nível</th>
                <th className="py-3.5 px-4">Vínculo na Árvore</th>
                <th className="py-3.5 px-4">Data de Cadastro</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {profiles.map((p) => {
                const isSuperAdmin = p.role === 'super_admin' || p.email === 'munizsheik08@gmail.com'
                const isSelf = p.id === currentUser?.id

                // Vinculo hierárquico textual
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
                      {isSuperAdmin && (
                        <span className="rounded-md bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-300">
                          MANTENEDOR
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
                      {!isSuperAdmin && !isSelf && (
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
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE NOVO USUÁRIO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Criar Novo Acesso</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
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

              <div>
                <label className="text-xs font-semibold text-slate-400">Nível de Acesso (Cargo)</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="cashier_operator">Operador de Caixa (Exclusivo PDV / Caixa da Filial)</option>
                  <option value="branch_admin">Administrador da Filial (Gerente da Loja)</option>
                  <option value="unit_admin">Administrador da Unidade (Gerente do Polo / Regional)</option>
                  <option value="network_admin">Administrador da Rede (Gestão de Todas as Unidades/Lojas)</option>
                </select>
              </div>

              {/* Seletor de Rede */}
              {networks.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-400">Rede *</label>
                  <select
                    value={selectedNetworkId}
                    onChange={(e) => {
                      setSelectedNetworkId(e.target.value)
                      setSelectedUnitId('')
                      setSelectedBranchId('')
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  >
                    {networks.map((n) => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Seletor de Unidade / Regional */}
              {(role === 'unit_admin' || role === 'branch_admin' || role === 'cashier_operator') && (
                <div>
                  <label className="text-xs font-semibold text-slate-400">Unidade / Regional *</label>
                  <select
                    value={selectedUnitId}
                    onChange={(e) => {
                      setSelectedUnitId(e.target.value)
                      setSelectedBranchId('')
                    }}
                    required={role === 'unit_admin'}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">Selecione a Unidade...</option>
                    {availableUnits.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} {u.city ? `(${u.city})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Seletor de Filial */}
              {(role === 'branch_admin' || role === 'cashier_operator') && (
                <div>
                  <label className="text-xs font-semibold text-slate-400">Filial / Loja *</label>
                  <select
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    required
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">Selecione a Filial...</option>
                    {availableBranches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-400 hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-amber-500 px-6 py-2 text-xs font-extrabold text-slate-950 hover:bg-amber-400 transition"
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
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-400 hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deleting}
                className="rounded-xl bg-rose-500 px-5 py-2 text-xs font-extrabold text-white hover:bg-rose-600 transition"
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
