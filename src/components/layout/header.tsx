'use client'

import React, { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Clock, Calendar, ShieldCheck, Bell } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'

const titles: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard Principal', subtitle: 'Visão geral de desempenho financeiro e estoque' },
  '/pdv': { title: 'Frente de Caixa (PDV)', subtitle: 'Registro rápido e seguro de vendas' },
  '/estoque': { title: 'Gestão de Estoque', subtitle: 'Cadastro de produtos, categorias e alertas' },
  '/compras': { title: 'Entrada de Mercadorias', subtitle: 'Registro de compras e fornecedores' },
  '/historico': { title: 'Histórico de Vendas', subtitle: 'Consultas, detalhes e comprovantes' },
  '/relatorios': { title: 'Relatórios & CMV', subtitle: 'Análise de margens de lucro e faturamento' },
  '/usuarios': { title: 'Gestão de Usuários', subtitle: 'Controle de acessos de operadores e admins' },
}

export function Header() {
  const pathname = usePathname()
  const { profile } = useAuth()
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date()
      setTime(
        now.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      )
      setDate(
        now.toLocaleDateString('pt-BR', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
        })
      )
    }

    updateDateTime()
    const timer = setInterval(updateDateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  if (pathname === '/login') return null

  const info = titles[pathname] || {
    title: 'Finish Bebidas',
    subtitle: 'Sistema Profissional de Gestão',
  }

  return (
    <header className="flex h-20 items-center justify-between border-b border-slate-800 bg-slate-900/50 px-8 backdrop-blur-md sticky top-0 z-20">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">{info.title}</h1>
        <p className="text-xs text-slate-400">{info.subtitle}</p>
      </div>

      <div className="flex items-center gap-6">
        {/* Relógio em Tempo Real */}
        <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2 text-slate-200 shadow-inner">
          <Clock size={16} className="text-amber-400" />
          <span className="font-mono text-sm font-semibold tracking-wider text-white">
            {time || '00:00:00'}
          </span>
          <span className="text-slate-700">|</span>
          <Calendar size={14} className="text-slate-400" />
          <span className="text-xs font-medium capitalize text-slate-400">{date}</span>
        </div>

        {/* Badge de Status */}
        <div className="hidden sm:flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Sistema Conectado
        </div>
      </div>
    </header>
  )
}
