'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ShoppingCart,
  DollarSign,
  Package,
  Truck,
  History,
  FileBarChart,
  Users,
  LogOut,
  Store,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useMobileMenu } from '@/contexts/mobile-menu-context'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pdv', label: 'Frente de Caixa (PDV)', icon: ShoppingCart },
  { href: '/caixa', label: 'Controle de Caixa', icon: DollarSign },
  { href: '/estoque', label: 'Estoque & Produtos', icon: Package },
  { href: '/compras', label: 'Entrada / Compras', icon: Truck },
  { href: '/historico', label: 'Histórico de Vendas', icon: History },
  { href: '/relatorios', label: 'Relatórios & CMV', icon: FileBarChart, adminOnly: true },
  { href: '/usuarios', label: 'Usuários', icon: Users, adminOnly: true },
]

export function Sidebar() {
  const pathname = usePathname()
  const { profile, signOut } = useAuth()
  const { isMobileOpen, closeMobileMenu } = useMobileMenu()
  const [collapsed, setCollapsed] = useState(false)

  // Ocultar sidebar na tela de login
  if (pathname === '/login') return null

  const isAdmin = profile?.role === 'admin'

  return (
    <>
      {/* Backdrop transparente/escuro para fechar ao tocar fora no celular */}
      {isMobileOpen && (
        <div
          onClick={closeMobileMenu}
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-800 bg-slate-900 text-slate-100 transition-all duration-300',
          // No Desktop (lg): posição relativa normal no fluxo
          'lg:static lg:translate-x-0',
          // No Mobile: gaveta deslizante
          isMobileOpen ? 'translate-x-0 w-72 shadow-2xl' : '-translate-x-full w-72 lg:w-64',
          // Estado recolhido (apenas no desktop)
          collapsed && 'lg:w-20'
        )}
      >
        {/* Botão de Toggle de Recolher no Desktop */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute -right-3 top-8 h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-slate-950 shadow-md hover:bg-amber-400"
          title={collapsed ? 'Expandir Menu' : 'Recolher Menu'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {/* Logo e Botão Fechar no Mobile */}
        <div className="flex h-20 items-center justify-between px-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 font-bold shadow-lg shadow-amber-500/20">
              <Store size={22} className="text-slate-950" />
            </div>
            {(!collapsed || isMobileOpen) && (
              <div className="flex flex-col overflow-hidden">
                <span className="font-extrabold tracking-tight text-lg text-white">
                  GIRO <span className="text-amber-400">SISTEMA</span>
                </span>
                <span className="text-[10px] font-medium tracking-wider text-slate-400 uppercase">
                  Gestão Comercial
                </span>
              </div>
            )}
          </div>

          {/* Botão fechar exclusivo do celular */}
          <button
            onClick={closeMobileMenu}
            className="lg:hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navegação de Menus */}
        <nav className="flex-1 space-y-1.5 p-3 overflow-y-auto">
          {navItems.map((item) => {
            // Se for operador de caixa, só vê a Frente de Caixa (PDV)
            if (profile?.role === 'operator' && item.href !== '/pdv') {
              return null
            }

            // Itens exclusivos de admin
            if (item.adminOnly && !isAdmin) return null

            const Icon = item.icon
            const isActive = pathname === item.href

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => closeMobileMenu()}
                className={cn(
                  'flex items-center gap-3.5 rounded-xl px-3.5 py-3 text-sm font-semibold transition-all duration-200',
                  isActive
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-bold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={20} className="shrink-0" />
                {(!collapsed || isMobileOpen) && <span className="truncate">{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Rodapé / Usuário Logado */}
        <div className="border-t border-slate-800 p-3">
          <div
            className={cn(
              'flex items-center gap-3 rounded-xl bg-slate-950/50 p-2.5',
              collapsed && !isMobileOpen && 'justify-center'
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 font-bold text-amber-400 text-sm">
              {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
            </div>
            {(!collapsed || isMobileOpen) && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <span className="truncate text-xs font-semibold text-white">
                  {profile?.full_name || 'Operador'}
                </span>
                <span className="text-[10px] font-medium text-amber-400 capitalize">
                  {profile?.role === 'admin' ? 'Administrador' : 'Operador'}
                </span>
              </div>
            )}
            {(!collapsed || isMobileOpen) && (
              <button
                onClick={() => signOut()}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition"
                title="Sair do Sistema"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
