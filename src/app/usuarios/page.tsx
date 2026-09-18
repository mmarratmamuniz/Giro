'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { useFeedback } from '@/contexts/feedback-context'
import { Users, Shield, UserPlus, Trash2, CheckCircle2, X, AlertTriangle } from 'lucide-react'

export default function UsuariosPage() {
  const [profiles, setProfiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'admin' | 'operator'>('operator')
  const [submitting, setSubmitting] = useState(false)

  // Modal de Exclusão
  const [deletingUser, setDeletingUser] = useState<any | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { user: currentUser } = useAuth()
  const { showSuccess, showError } = useFeedback()
  const supabase = createClient()

  async function loadProfiles() {
    try {
      setLoading(true)
      const { data, error } = await supabase.from('profiles').select('*').order('created_at')
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

  // Criar Usuário no Supabase Auth
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role,
          },
        },
      })

      if (error) throw error

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

  // Excluir Usuário (Controle Total do ADM)
  const handleDeleteUser = async () => {
    if (!deletingUser) return

    try {
      setDeleting(true)
      const { error } = await supabase.rpc('delete_user_by_admin', {
        p_user_id: deletingUser.id,
      })

      if (error) throw error

      showSuccess(
        'Usuário Excluído!',
        `${deletingUser.full_name || deletingUser.email} foi removido do sistema.`
      )
      setDeletingUser(null)
      loadProfiles()
    } catch (err: any) {
      showError('Erro ao excluir usuário', err.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-base font-bold text-white">Operadores e Administradores</h4>
          <p className="text-xs text-slate-400">Controle total de acessos do sistema</p>
        </div>

        <button
          disabled
          title="Cadastro disponível após implantação do convite seguro por empresa"
          className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20 transition"
        >
          <UserPlus size={16} /> Cadastro em preparação
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
                <th className="py-3.5 px-4">Perfil</th>
                <th className="py-3.5 px-4">Data de Cadastro</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {profiles.map((p) => {
                const isMainAdmin = p.email === 'munizsheik08@gmail.com'
                const isSelf = p.id === currentUser?.id

                return (
                  <tr key={p.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                      {p.full_name || 'Usuário'}
                      {isMainAdmin && (
                        <span className="rounded-md bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-400">
                          ADM GERAL
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-mono">{p.email || '-'}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          p.role === 'admin'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        }`}
                      >
                        <Shield size={10} />
                        {p.role === 'admin' ? 'Administrador' : 'Operador'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400">{formatDate(p.created_at)}</td>
                    <td className="py-3 px-4 text-right">
                      {!isMainAdmin && !isSelf && (
                        <button
                          disabled
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition"
                          title="Exclusão disponível após validação de administrador e empresa no servidor"
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
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
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
                <label className="text-xs font-semibold text-slate-400">Nível de Permissão</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="operator">Operador (Acesso a PDV, Caixa e Estoque)</option>
                  <option value="admin">Administrador (Acesso Completo e Relatórios)</option>
                </select>
              </div>

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
