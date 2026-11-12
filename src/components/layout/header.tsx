'use client'

import React, { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Clock, Calendar, Menu, Building2, Store, MapPin } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useMobileMenu } from '@/contexts/mobile-menu-context'
import { useNetwork } from '@/contexts/network-context'

const titles: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard Principal', subtitle: 'Visão geral de desempenho financeiro e estoque' },
  '/pdv': { title: 'Frente de Caixa (PDV)', subtitle: 'Registro rápido e seguro de vendas' },
  '/caixa': { title: 'Controle de Caixa', subtitle: 'Abertura, sangrias, suprimentos e conciliação de turno' },
  '/estoque': { title: 'Gestão de Estoque', subtitle: 'Cadastro de produtos, categorias e alertas' },
  '/compras': { title: 'Entrada de Mercadorias', subtitle: 'Registro de compras e fornecedores' },
  '/historico': { title: 'Relatórios & Histórico', subtitle: 'Consultas, detalhes e comprovantes' },
  '/relatorios': { title: 'Relatórios & Histórico', subtitle: 'DRE, vendas, fechamentos de caixa e compras' },
  '/usuarios': { title: 'Gestão de Usuários', subtitle: 'Controle de acessos de operadores e admins' },
  '/redes': { title: 'Redes & Unidades', subtitle: 'Gestão da estrutura de redes, unidades e caixas' },
}

export function Header() {
  const pathname = usePathname()
  const { profile } = useAuth()
  const { toggleMobileMenu } = useMobileMenu()
  const { 
    networks, 
    branches, 
    selectedNetworkId, 
    selectedBranchId, 
    setSelectedNetworkId, 
    setSelectedBranchId 
  } = useNetwork()

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

  const isSuperOrNetwork = profile?.role === 'super_admin' || profile?.role === 'network_admin'

  // Filtrar unidades (branches) pela rede selecionada
  const availableBranches = selectedNetworkId === 'ALL'
    ? branches
    : branches.filter((b) => b.network_id === selectedNetworkId)

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

      <div className="flex items-center gap-2 sm:gap-4">
        {/* Seletor Corporativo de Rede e Unidade (2 Níveis) */}
        {isSuperOrNetwork && (networks.length > 0 || branches.length > 0) && (
          <div className="hidden md:flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-xl p-1 text-xs">
            {profile?.role === 'super_admin' && networks.length > 0 && (
              <div className="flex items-center gap-1.5 px-2">
                <Building2 size={13} className="text-amber-400" />
                <select
                  value={selectedNetworkId}
                  onChange={(e) => {
                    setSelectedNetworkId(e.target.value)
                    setSelectedBranchId('ALL')
                  }}
                  className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-slate-900 text-white">Todas as Redes</option>
                  {networks.map((n) => (
                    <option key={n.id} value={n.id} className="bg-slate-900 text-white">
                      {n.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {availableBranches.length > 0 && (
              <div className={`flex items-center gap-1.5 px-2 ${profile?.role === 'super_admin' && networks.length > 0 ? 'border-l border-slate-800' : ''}`}>
                <Store size={13} className="text-amber-400" />
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-slate-900 text-white">Todas as Unidades</option>
                  {availableBranches.map((b) => (
                    <option key={b.id} value={b.id} className="bg-slate-900 text-white">
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Badge Informativo da Unidade Fixa para Usuários com Unidade Vinculada */}
        {(!isSuperOrNetwork || profile?.branch_id) && (profile?.branch_id || selectedBranchId !== 'ALL') && (
          <div className="hidden sm:flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5 text-xs shadow-sm">
            <Store size={14} className="text-emerald-400 shrink-0" />
            <span className="text-slate-400 font-medium">Unidade:</span>
            <span className="font-bold text-white">
              {branches.find((b) => b.id === (profile?.branch_id || selectedBranchId))?.name || 'Unidade'}
            </span>
          </div>
        )}

        {/* Relógio em Tempo Real */}
        <div className="flex items-center gap-2 sm:gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-1.5 sm:px-4 sm:py-2 text-slate-200 shadow-inner">
          <Clock size={14} className="text-amber-400 shrink-0" />
          <span className="font-mono text-xs sm:text-sm font-semibold tracking-wider text-white">
            {time || '00:00:00'}
          </span>
          <span className="text-slate-700 hidden lg:inline">|</span>
          <Calendar size={14} className="text-slate-400 hidden lg:inline" />
          <span className="text-xs font-medium capitalize text-slate-400 hidden lg:inline">{date}</span>
        </div>
      </div>
    </header>
  )
}
