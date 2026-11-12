'use client'

import React, { useState, useEffect } from 'react'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { useFeedback } from '@/contexts/feedback-context'
import {
  Users,
  Shield,
  UserPlus,
  Trash2,
  X,
  AlertTriangle,
  Building2,
  Store,
  Pencil,
  Image as ImageIcon,
  Upload,
  Loader2,
} from 'lucide-react'
import { GiroLogoIcon, NetworkLogo, resizeImageFileToBase64 } from '@/components/ui/giro-logo'
import { useNetwork } from '@/contexts/network-context'

export default function UsuariosPage() {
  const [profiles, setProfiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  
  // Campos de Criação
  const [fullName, setFullName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'super_admin' | 'network_admin' | 'cashier_operator'>('cashier_operator')

  const [selectedNetworkId, setSelectedNetworkId] = useState('')
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Estados de Edição
  const [editingUser, setEditingUser] = useState<any | null>(null)
  const [editFullName, setEditFullName] = useState('')
  const [editJobTitle, setEditJobTitle] = useState('')
  const [editRole, setEditRole] = useState<'super_admin' | 'network_admin' | 'cashier_operator'>('cashier_operator')
  const [editNetworkId, setEditNetworkId] = useState('')
  const [editBranchId, setEditBranchId] = useState('')
  const [editNewPassword, setEditNewPassword] = useState('')
  const [updatingUser, setUpdatingUser] = useState(false)

  // Modal de Exclusão
  const [deletingUser, setDeletingUser] = useState<any | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Gerenciamento de Logos das Redes (Super Admin)
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false)
  const [uploadingLogoId, setUploadingLogoId] = useState<string | null>(null)

  const { user: currentUser, profile: currentProfile } = useAuth()
  const { networks, branches, reloadStructure } = useNetwork()
  const { showSuccess, showError } = useFeedback()
  const [supabase] = useState(() => createClient())

  const isSuperAdmin = currentProfile?.role === 'super_admin'

  // Upload rápido de logo da rede
  async function handleUploadNetworkLogo(networkId: string, file: File) {
    if (!isSuperAdmin) {
      showError('Acesso Restrito', 'Apenas o Super Admin tem permissão para cadastrar ou alterar logos de redes.')
      return
    }
    try {
      setUploadingLogoId(networkId)
      const b64 = await resizeImageFileToBase64(file, 256)
      const { error } = await supabase
        .from('networks')
        .update({ logo_url: b64 })
        .eq('id', networkId)

      if (error) throw error
      showSuccess('Logo Atualizada!', 'A logo da rede foi alterada com sucesso.')
      reloadStructure()
    } catch (err: any) {
      showError('Erro no upload', err.message || 'Falha ao processar imagem.')
    } finally {
      setUploadingLogoId(null)
    }
  }

  // Carregar perfis respeitando hierarquia
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
          branch:branches(id, name)
        `)
        .order('created_at')

      if (currentProfile.role === 'super_admin') {
        // Super Admin vê todos
      } else if (currentProfile.role === 'network_admin') {
        // Admin de Rede: vê membros da sua rede (sem ver super_admin)
        if (currentProfile.network_id) {
          query = query
            .eq('network_id', currentProfile.network_id)
            .neq('role', 'super_admin')
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

  const isSuperAdminUser = currentProfile?.role === 'super_admin'
  const isNetworkAdmin = currentProfile?.role === 'network_admin'

  // Filtrar unidades (branches) pela rede ativa
  const activeNetworkId = isSuperAdminUser ? selectedNetworkId : (currentProfile?.network_id || selectedNetworkId)
  const availableBranches = branches.filter((b) => b.network_id === activeNetworkId)

  // Unidades disponíveis no formulário de edição
  const editActiveNetworkId = isSuperAdminUser ? editNetworkId : (currentProfile?.network_id || editNetworkId)
  const editAvailableBranches = branches.filter((b) => b.network_id === editActiveNetworkId)

  // Abrir modal configurando escopo do usuário logado
  const handleOpenCreateModal = () => {
    setEmail('')
    setPassword('')
    setFullName('')
    setJobTitle('')
    setRole('cashier_operator')

    if (currentProfile?.role === 'network_admin') {
      setSelectedNetworkId(currentProfile.network_id || '')
      setSelectedBranchId('')
    } else if (isSuperAdminUser) {
      if (networks.length > 0) setSelectedNetworkId(networks[0].id)
      setSelectedBranchId('')
    }

    setIsModalOpen(true)
  }

  // Abrir modal de edição pré-preenchido
  const handleOpenEditModal = (p: any) => {
    setEditingUser(p)
    setEditFullName(p.full_name || '')
    setEditJobTitle(p.job_title || '')
    setEditRole(p.role || 'cashier_operator')
    setEditNetworkId(p.network_id || currentProfile?.network_id || '')
    setEditBranchId(p.branch_id || '')
    setEditNewPassword('')
  }

  // Criar Usuário no Supabase Auth com cliente isolado e configurar via RPC
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)

      let targetRole = role
      let netId = activeNetworkId || null
      let brId = selectedBranchId || null

      if (currentProfile?.role === 'network_admin') {
        netId = currentProfile.network_id || null
        if (targetRole === 'super_admin') {
          throw new Error('Administrador de rede não possui permissão para atribuir o cargo super_admin.')
        }
      }

      if (targetRole === 'cashier_operator' && !brId) {
        throw new Error('Selecione a Unidade em que o operador de caixa trabalhará.')
      }

      if (brId) {
        const branchObj = branches.find((b) => b.id === brId)
        if (branchObj) {
          netId = branchObj.network_id
        }
      }

      const effectiveJobTitle =
        jobTitle.trim() ||
        (targetRole === 'super_admin'
          ? 'Super Admin'
          : targetRole === 'network_admin'
          ? 'Administrador de Rede'
          : 'Operador de Caixa')

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

      const { error: configError } = await supabase.rpc('admin_configure_new_user', {
        p_user_id: data.user.id,
        p_full_name: fullName.trim(),
        p_role: targetRole,
        p_network_id: netId,
        p_unit_id: null,
        p_branch_id: brId,
        p_job_title: effectiveJobTitle,
      })

      if (configError) throw configError

      showSuccess('Usuário Cadastrado!', `${fullName || email} foi cadastrado e liberado para acesso imediato.`)
      setIsModalOpen(false)
      setEmail('')
      setPassword('')
      setFullName('')
      setJobTitle('')
      loadProfiles()
    } catch (err: any) {
      showError('Erro ao criar usuário', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Submeter Edição de Usuário via RPC admin_update_user
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    try {
      setUpdatingUser(true)

      let targetRole = editRole
      let netId = editActiveNetworkId || null
      let brId = editBranchId || null

      if (currentProfile?.role === 'network_admin') {
        netId = currentProfile.network_id || null
        if (targetRole === 'super_admin') {
          throw new Error('Administrador de rede não possui permissão para atribuir o cargo super_admin.')
        }
      }

      if (targetRole === 'cashier_operator' && !brId) {
        throw new Error('Selecione a Unidade em que o operador de caixa trabalhará.')
      }

      if (brId) {
        const branchObj = branches.find((b) => b.id === brId)
        if (branchObj) {
          netId = branchObj.network_id
        }
      }

      if (editNewPassword.trim() && editNewPassword.trim().length < 6) {
        throw new Error('A nova senha deve possuir pelo menos 6 caracteres.')
      }

      const { error } = await supabase.rpc('admin_update_user', {
        p_user_id: editingUser.id,
        p_full_name: editFullName.trim(),
        p_role: targetRole,
        p_network_id: netId,
        p_branch_id: brId,
        p_job_title: editJobTitle.trim() || null,
        p_new_password: editNewPassword.trim() || null,
      })

      if (error) throw error

      showSuccess('Usuário Atualizado!', `As alterações para "${editFullName}" foram salvas com sucesso.`)
      setEditingUser(null)
      loadProfiles()
    } catch (err: any) {
      showError('Erro ao atualizar usuário', err.message)
    } finally {
      setUpdatingUser(false)
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

      showSuccess('Usuário Removido', 'A conta de acesso foi excluída e o histórico preservado com segurança.')
      setDeletingUser(null)
      loadProfiles()
    } catch (err: any) {
      showError('Erro ao excluir usuário', err.message)
    } finally {
      setDeleting(false)
    }
  }

  const renderRoleBadge = (r: string) => {
    switch (r) {
      case 'super_admin':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-[10px] font-extrabold text-amber-400">
            <Shield size={10} /> Super Admin Global
          </span>
        )
      case 'network_admin':
      case 'admin':
      case 'unit_admin':
      case 'branch_admin':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/20 border border-blue-500/30 px-2 py-0.5 text-[10px] font-extrabold text-blue-400">
            <Building2 size={10} /> Administrador de Rede
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
            Gerencie os administradores e operadores de caixa com papéis simplificados, edição instantânea e histórico preservado.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isSuperAdminUser && (
            <button
              type="button"
              onClick={() => setIsLogoModalOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-850 px-3.5 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-800 hover:text-white transition cursor-pointer shadow-sm"
              title="Gerenciar as logos das redes (exclusivo Super Admin)"
            >
              <ImageIcon size={15} className="text-amber-400" />
              <span>Logos das Redes</span>
            </button>
          )}
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20 transition cursor-pointer"
          >
            <UserPlus size={16} /> Novo Usuário
          </button>
        </div>
      </div>

      {/* Tabela de Usuários */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold uppercase">
              <tr>
                <th className="py-3 px-4">Nome & Função</th>
                <th className="py-3 px-4">E-mail</th>
                <th className="py-3 px-4">Permissão</th>
                <th className="py-3 px-4">Unidade / Local</th>
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

                  // Permissão de exclusão: super_admin exclui qualquer um exceto a si; network_admin exclui membros da sua rede (exceto a si e super_admin)
                  const canDelete =
                    !isSelf &&
                    (!isProfileSuperAdmin || isSuperAdminUser) &&
                    (isSuperAdminUser || (isNetworkAdmin && !isProfileSuperAdmin))

                  // Vínculo textual
                  let vinculoText = 'Todas as Unidades (Rede)'
                  if (p.branch?.name) {
                    vinculoText = `Unidade: ${p.branch.name}`
                  } else if (p.network?.name && !isProfileSuperAdmin) {
                    vinculoText = `Rede: ${p.network.name}`
                  } else if (isProfileSuperAdmin) {
                    vinculoText = 'Plataforma Global'
                  }

                  const displayedJobTitle =
                    p.job_title ||
                    (p.role === 'super_admin'
                      ? 'Super Admin'
                      : p.role === 'network_admin'
                      ? 'Administrador de Rede'
                      : 'Operador de Caixa')

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{p.full_name || 'Usuário'}</span>
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
                          </div>
                          <span className="text-[11px] font-semibold text-amber-400/90 mt-0.5">
                            {displayedJobTitle}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-mono">{p.email || '-'}</td>
                      <td className="py-3 px-4">
                        {renderRoleBadge(p.role)}
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-medium">
                        <span className="inline-flex items-center gap-2 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-[11px]">
                          {isProfileSuperAdmin ? (
                            <GiroLogoIcon size={16} />
                          ) : (
                            <NetworkLogo
                              network={networks.find((n) => n.id === p.network_id || n.id === p.network?.id) || p.network}
                              size={16}
                              className="rounded-sm"
                            />
                          )}
                          <span>{vinculoText}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400">{formatDate(p.created_at)}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(p)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-500/10 hover:text-amber-400 transition cursor-pointer"
                            title="Editar Usuário"
                          >
                            <Pencil size={15} />
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => setDeletingUser(p)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition cursor-pointer"
                              title="Excluir Usuário"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: NOVO USUÁRIO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Criar Novo Acesso</h3>
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
                <label className="text-xs font-semibold text-slate-400">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ex: João da Silva"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Nome da Função / Cargo (Livre) */}
              <div>
                <label className="text-xs font-semibold text-slate-400">
                  Nome da Função / Cargo (Exibição Livre)
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder={
                    role === 'network_admin'
                      ? 'Ex: Gerente Geral, Diretor de Loja, Administrador'
                      : 'Ex: Operador de Caixa, Auxiliar de Caixa, Fiscal de Loja'
                  }
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Define como o cargo aparecerá no crachá e na equipe (ex: "Gerente de Loja", "Operador de Caixa").
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">E-mail de Acesso *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@giro.com"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Senha Inicial *</label>
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

              {/* Seletor de Permissão do Sistema (Role) */}
              <div>
                <label className="text-xs font-semibold text-slate-400">Permissão do Sistema *</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                >
                  <option value="cashier_operator">Operador de Caixa (Apenas PDV e Caixa)</option>
                  <option value="network_admin">Administrador de Rede (Acesso Completo)</option>
                  {isSuperAdminUser && (
                    <option value="super_admin">Super Admin Global (Acesso Irrestrito)</option>
                  )}
                </select>
              </div>

              {/* Seletor de Rede */}
              {isSuperAdminUser ? (
                networks.length > 0 && (
                  <div>
                    <label className="text-xs font-semibold text-slate-400">Rede *</label>
                    <select
                      value={selectedNetworkId}
                      onChange={(e) => {
                        setSelectedNetworkId(e.target.value)
                        setSelectedBranchId('')
                      }}
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                    >
                      {networks.map((n) => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                      ))}
                    </select>
                  </div>
                )
              ) : (
                <div>
                  <label className="text-xs font-semibold text-slate-400">Rede Vinculada</label>
                  <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white">
                    <Building2 size={14} className="text-blue-400" />
                    <span className="font-bold text-blue-400">
                      {networks.find((n) => n.id === (currentProfile?.network_id || selectedNetworkId))?.name || 'Sua Rede'}
                    </span>
                    <span className="text-[10px] text-slate-500 ml-auto font-medium">(Rede Própria)</span>
                  </div>
                </div>
              )}

              {/* Seletor de Unidade */}
              <div>
                <label className="text-xs font-semibold text-slate-400">
                  Unidade {role === 'cashier_operator' ? '*' : '(Opcional para Admin)'}
                </label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  required={role === 'cashier_operator'}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                >
                  {role === 'network_admin' && (
                    <option value="">Todas as Unidades da Rede (Acesso Global)</option>
                  )}
                  {role === 'cashier_operator' && (
                    <option value="">Selecione a Unidade...</option>
                  )}
                  {availableBranches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

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

      {/* MODAL 2: EDITAR USUÁRIO */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Pencil className="text-amber-400" size={18} />
                <h3 className="text-base font-bold text-white">Editar Usuário</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="Ex: João da Silva"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Nome da Função / Cargo (Livre) */}
              <div>
                <label className="text-xs font-semibold text-slate-400">
                  Nome da Função / Cargo (Exibição Livre)
                </label>
                <input
                  type="text"
                  value={editJobTitle}
                  onChange={(e) => setEditJobTitle(e.target.value)}
                  placeholder="Ex: Diretor Geral, Gerente de Loja, Operador de Caixa"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Exibido na equipe e no crachá inferior da barra lateral.
                </p>
              </div>

              {/* E-mail (Informativo) */}
              <div>
                <label className="text-xs font-semibold text-slate-400">E-mail de Acesso</label>
                <input
                  type="email"
                  disabled
                  value={editingUser.email || ''}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-400 cursor-not-allowed font-mono"
                />
              </div>

              {/* Permissão do Sistema */}
              <div>
                <label className="text-xs font-semibold text-slate-400">Permissão do Sistema *</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as any)}
                  disabled={editingUser.id === currentProfile?.id && currentProfile?.role !== 'super_admin'}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="cashier_operator">Operador de Caixa (Apenas PDV e Caixa)</option>
                  <option value="network_admin">Administrador de Rede (Acesso Completo)</option>
                  {isSuperAdminUser && (
                    <option value="super_admin">Super Admin Global (Acesso Irrestrito)</option>
                  )}
                </select>
                {editingUser.id === currentProfile?.id && currentProfile?.role !== 'super_admin' && (
                  <p className="text-[10px] text-amber-400/80 mt-1">
                    Você não pode alterar o seu próprio nível de permissão.
                  </p>
                )}
              </div>

              {/* Seletor de Rede (apenas Super Admin pode transferir entre redes) */}
              {isSuperAdminUser ? (
                networks.length > 0 && (
                  <div>
                    <label className="text-xs font-semibold text-slate-400">Rede *</label>
                    <select
                      value={editNetworkId}
                      onChange={(e) => {
                        setEditNetworkId(e.target.value)
                        setEditBranchId('')
                      }}
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                    >
                      {networks.map((n) => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                      ))}
                    </select>
                  </div>
                )
              ) : (
                <div>
                  <label className="text-xs font-semibold text-slate-400">Rede Vinculada</label>
                  <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white">
                    <Building2 size={14} className="text-blue-400" />
                    <span className="font-bold text-blue-400">
                      {networks.find((n) => n.id === editActiveNetworkId)?.name || 'Sua Rede'}
                    </span>
                    <span className="text-[10px] text-slate-500 ml-auto font-medium">(Rede Atual)</span>
                  </div>
                </div>
              )}

              {/* Seletor de Unidade */}
              <div>
                <label className="text-xs font-semibold text-slate-400">
                  Unidade {editRole === 'cashier_operator' ? '*' : '(Opcional para Admin)'}
                </label>
                <select
                  value={editBranchId}
                  onChange={(e) => setEditBranchId(e.target.value)}
                  required={editRole === 'cashier_operator'}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                >
                  {editRole === 'network_admin' && (
                    <option value="">Todas as Unidades da Rede (Acesso Global)</option>
                  )}
                  {editRole === 'cashier_operator' && (
                    <option value="">Selecione a Unidade...</option>
                  )}
                  {editAvailableBranches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Nova Senha Opcional */}
              <div>
                <label className="text-xs font-semibold text-slate-400">
                  Alterar Senha de Acesso (Opcional)
                </label>
                <input
                  type="password"
                  value={editNewPassword}
                  onChange={(e) => setEditNewPassword(e.target.value)}
                  placeholder="Deixe em branco para manter a senha atual"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Se preenchido, a senha será redefinida imediatamente (mínimo 6 caracteres).
                </p>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-400 hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updatingUser}
                  className="rounded-xl bg-amber-500 px-6 py-2 text-xs font-extrabold text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition cursor-pointer"
                >
                  {updatingUser ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CONFIRMAÇÃO DE EXCLUSÃO */}
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
              Esta ação revoga imediatamente o acesso. O histórico de vendas, fechamentos de caixa e compras da loja será preservado com segurança.
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

      {/* MODAL 4: GERENCIAR LOGOS DAS REDES (SUPER ADMIN) */}
      {isLogoModalOpen && isSuperAdminUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <ImageIcon size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Logos Oficiais das Redes</h3>
                  <p className="text-[11px] text-slate-400">Defina ou altere a logo de cada rede (exclusivo Super Admin)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLogoModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {networks.length === 0 ? (
                <p className="text-center py-6 text-xs text-slate-500">Nenhuma rede cadastrada.</p>
              ) : (
                networks.map((net) => (
                  <div
                    key={net.id}
                    className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-800 bg-slate-950/60"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <NetworkLogo network={net} size={44} className="rounded-xl border-slate-700 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-white truncate">{net.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {net.document_cnpj ? `CNPJ: ${net.document_cnpj}` : 'Rede Principal'}
                        </p>
                      </div>
                    </div>

                    <label
                      className={`inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-amber-500 hover:text-slate-950 transition cursor-pointer shadow-sm shrink-0 ${
                        uploadingLogoId === net.id ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      {uploadingLogoId === net.id ? (
                        <Loader2 size={13} className="animate-spin text-amber-400" />
                      ) : (
                        <Upload size={13} />
                      )}
                      <span>{uploadingLogoId === net.id ? 'Salvando...' : 'Alterar Logo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingLogoId === net.id}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleUploadNetworkLogo(net.id, file)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setIsLogoModalOpen(false)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
