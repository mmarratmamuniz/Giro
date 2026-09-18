'use client'

import React, { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Clock, Calendar, ShieldCheck, Bell, Menu } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useMobileMenu } from '@/contexts/mobile-menu-context'

const titles: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard Principal', subtitle: 'Visão geral de desempenho financeiro e estoque' },
  '/pdv': { title: 'Frente de Caixa (PDV)', subtitle: 'Registro rápido e seguro de vendas' },
  '/caixa': { title: 'Controle de Caixa', subtitle: 'Abertura, sangrias, suprimentos e conciliação de turno' },
  '/estoque': { title: 'Gestão de Estoque', subtitle: 'Cadastro de produtos, categorias e alertas' },
  '/compras': { title: 'Entrada de Mercadorias', subtitle: 'Registro de compras e fornecedores' },
  '/historico': { title: 'Histórico de Vendas', subtitle: 'Consultas, detalhes e comprovantes' },
  '/relatorios': { title: 'Relatórios & CMV', subtitle: 'Análise de margens de lucro e faturamento' },
  '/usuarios': { title: 'Gestão de Usuários', subtitle: 'Controle de acessos de operadores e admins' },
}

export function Header() {
  const pathname = usePathname()
  const { profile } = useAuth()
  const { toggleMobileMenu } = useMobileMenu()
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
    title: 'Giro',
    subtitle: 'Sistema Profissional de Gestão',
  }

  return (
    <header className="flex h-16 sm:h-20 items-center justify-between border-b border-slate-800 bg-slate-900/50 px-4 sm:px-8 backdrop-blur-md sticky top-0 z-20">
      <div className="flex items-center gap-3">
        {/* Botão de Menu Hambúrguer (Mobile) */}
        <button
          onClick={toggleMobileMenu}
          className="lg:hidden flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800/80 text-amber-400 hover:bg-slate-700 active:scale-95 transition"
          aria-label="Abrir Menu Lateral"
        >
          <Menu size={22} />
        </button>

        <div className="overflow-hidden">
          <h1 className="text-base sm:text-xl font-bold tracking-tight text-white truncate max-w-[200px] sm:max-w-none">
            {info.title}
          </h1>
          <p className="text-[11px] sm:text-xs text-slate-400 hidden sm:block truncate">{info.subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-6">
        {/* Relógio em Tempo Real */}
        <div className="flex items-center gap-2 sm:gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-1.5 sm:px-4 sm:py-2 text-slate-200 shadow-inner">
          <Clock size={14} className="text-amber-400 shrink-0" />
          <span className="font-mono text-xs sm:text-sm font-semibold tracking-wider text-white">
            {time || '00:00:00'}
          </span>
          <span className="text-slate-700 hidden md:inline">|</span>
          <Calendar size={14} className="text-slate-400 hidden md:inline" />
          <span className="text-xs font-medium capitalize text-slate-400 hidden md:inline">{date}</span>
        </div>

        {/* Badge de Status */}
        <div className="hidden md:flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Conectado
        </div>
      </div>
    </header>
  )
}
