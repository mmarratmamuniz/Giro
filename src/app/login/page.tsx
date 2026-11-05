'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Store,
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  Building2,
  Computer,
  Sparkles,
  Zap,
} from 'lucide-react'

const testProfiles = [
  {
    title: 'Super Admin',
    desc: 'Visão Global e Todas as Redes',
    email: 'super@giro.com',
    badge: 'Acesso Irrestrito',
    badgeColor: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
    icon: ShieldCheck,
  },
  {
    title: 'Admin de Rede',
    desc: 'Grupo OVO (Todas as filiais)',
    email: 'admin.rede@giro.com',
    badge: 'Multi-Lojas',
    badgeColor: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
    icon: Building2,
  },
  {
    title: 'Gerente Filial Centro',
    desc: 'Loja Centro (Estoque e Caixa)',
    email: 'gerente.centro@giro.com',
    badge: 'Gestão Loja',
    badgeColor: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
    icon: Store,
  },
  {
    title: 'Operador Caixa Centro',
    desc: 'Loja Centro • Terminal de Vendas',
    email: 'caixa.centro@giro.com',
    badge: 'Apenas PDV',
    badgeColor: 'border-purple-500/40 bg-purple-500/10 text-purple-400',
    icon: Computer,
  },
  {
    title: 'Operador Caixa Praia',
    desc: 'Filial Praia • Terminal de Vendas',
    email: 'caixa.praia@giro.com',
    badge: 'Apenas PDV',
    badgeColor: 'border-rose-500/40 bg-rose-500/10 text-rose-400',
    icon: Computer,
  },
]

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  const isDev = process.env.NODE_ENV === 'development'

  const executeLogin = async (loginEmail: string, loginPass: string) => {
    setErrorMsg('')
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPass,
      })

      if (error) throw error

      if (data.user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single()

        if (!prof) {
          await supabase.auth.signOut()
          setErrorMsg('Perfil de acesso não vinculado a uma filial/rede. Contate o administrador do sistema.')
          return
        }

        if (prof.role === 'cashier_operator' || prof.role === 'operator') {
          router.push('/pdv')
        } else {
          router.push('/')
        }
      } else {
        router.push('/')
      }

      router.refresh()
    } catch (err: any) {
      if (err.message?.includes('not confirmed')) {
        setErrorMsg('E-mail não confirmado. Execute o script seed_usuarios_teste.sql no SQL Editor do Supabase.')
      } else if (err.message?.includes('Failed to fetch') || err.message?.includes('fetch failed')) {
        setErrorMsg('⚠️ Não foi possível conectar ao banco de dados (Failed to fetch). O seu projeto no Supabase pode estar PAUSADO por inatividade. Acesse o painel do Supabase (supabase.com/dashboard) e clique em "Restore project" para reativar.')
      } else {
        setErrorMsg(err.message || 'Falha na autenticação. Verifique suas informações.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    executeLogin(email, password)
  }

  const handleQuickLogin = (targetEmail: string) => {
    if (!isDev) return
    setEmail(targetEmail)
    setPassword('123456')
    executeLogin(targetEmail, '123456')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 sm:p-8">
      <div className={`w-full ${isDev ? 'max-w-4xl grid grid-cols-1 lg:grid-cols-12' : 'max-w-md'} gap-6 items-stretch`}>
        
        {/* Card Principal de Login */}
        <div className={`${isDev ? 'lg:col-span-6' : 'w-full'} rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-md flex flex-col justify-between`}>
          <div>
            {/* Logo & Título */}
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 mb-4">
                <Store size={30} className="text-slate-950" />
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">
                GIRO <span className="text-amber-400">SISTEMA</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">Acesso ao Sistema de Gestão Comercial</p>
            </div>

            {errorMsg && (
              <div className="mt-6 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400 text-center font-medium leading-relaxed">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300">E-mail</label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3.5 top-3 text-slate-500" size={16} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu-email@giro.com"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Senha</label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3.5 top-3 text-slate-500" size={16} />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 py-3 text-xs font-extrabold text-slate-950 shadow-md shadow-amber-500/20 hover:brightness-110 disabled:opacity-50 transition mt-2 cursor-pointer"
              >
                {loading ? 'Entrando...' : 'Entrar no Sistema'} <ArrowRight size={14} />
              </button>
            </form>
          </div>

          <div className="mt-8 border-t border-slate-800/80 pt-4 text-center">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
              <ShieldCheck size={13} className="text-amber-500" /> Autenticação Segura via Supabase
            </span>
          </div>
        </div>

        {/* Card Lateral: Acesso Rápido de Teste (Cargos Fictícios) - Apenas em Desenvolvimento */}
        {isDev && (
          <div className="lg:col-span-6 rounded-3xl border border-amber-500/20 bg-gradient-to-b from-slate-900/90 via-slate-900/60 to-slate-950 p-6 shadow-2xl backdrop-blur-md flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Zap size={18} className="text-amber-400" />
                  <h3 className="text-sm font-extrabold text-white">Acesso Rápido de Teste</h3>
                </div>
                <span className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                  Dev Only (Senha: 123456)
                </span>
              </div>

              <p className="text-xs text-slate-400 mt-2 mb-4">
                Clique em qualquer cargo para testar instantaneamente as permissões, menus e restrições de cada perfil:
              </p>

              <div className="space-y-2.5">
                {testProfiles.map((p) => {
                  const Icon = p.icon
                  return (
                    <button
                      key={p.email}
                      type="button"
                      disabled={loading}
                      onClick={() => handleQuickLogin(p.email)}
                      className="w-full flex items-center justify-between p-3 rounded-2xl border border-slate-800/80 bg-slate-950/70 hover:bg-slate-850 hover:border-amber-500/40 text-left transition group cursor-pointer disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-amber-400 group-hover:scale-105 transition">
                          <Icon size={18} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white group-hover:text-amber-300 transition">
                              {p.title}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold border ${p.badgeColor}`}
                            >
                              {p.badge}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{p.desc}</p>
                          <p className="text-[10px] font-mono text-slate-500">{p.email}</p>
                        </div>
                      </div>

                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 border border-slate-800 text-slate-400 group-hover:bg-amber-500 group-hover:text-slate-950 transition">
                        <ArrowRight size={14} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3 text-[11px] text-slate-400 flex items-center gap-2">
              <Sparkles size={16} className="text-amber-400 shrink-0" />
              <span>
                Ambiente de desenvolvimento ativo. Clique em qualquer cargo acima para alternar de perfil com a senha <strong className="text-amber-300">123456</strong>.
              </span>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
