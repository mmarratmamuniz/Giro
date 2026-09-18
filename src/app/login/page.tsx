'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Store, Lock, Mail, ArrowRight, ShieldCheck } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      // Verificar se é operador ou admin para direcionar para a página correta
      if (data.user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single()

        if (prof?.role === 'operator') {
          router.push('/pdv')
        } else {
          router.push('/')
        }
      } else {
        router.push('/')
      }

      router.refresh()
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha na autenticação. Verifique seu e-mail e senha.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-md">
        {/* Logo & Título */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 mb-4">
            <Store size={30} className="text-slate-950" />
          </div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">
            FINISH <span className="text-amber-400">BEBIDAS</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">Acesso ao Sistema de Gestão Comercial</p>
        </div>

        {errorMsg && (
          <div className="mt-6 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400 text-center font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300">E-mail</label>
            <div className="relative mt-1">
              <Mail className="absolute left-3.5 top-3 text-slate-500" size={16} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu-email@finishbebidas.com"
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
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 py-3 text-xs font-extrabold text-slate-950 shadow-md shadow-amber-500/20 hover:brightness-110 disabled:opacity-50 transition mt-2"
          >
            {loading ? 'Entrando...' : 'Entrar no Sistema'} <ArrowRight size={14} />
          </button>
        </form>

        <div className="mt-8 border-t border-slate-800/80 pt-4 text-center">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck size={13} className="text-amber-500" /> Autenticação Segura via Supabase
          </span>
        </div>
      </div>
    </div>
  )
}
