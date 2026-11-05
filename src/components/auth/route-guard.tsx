'use client'

import React, { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, profile, loading } = useAuth()

  useEffect(() => {
    if (loading) return

    // Tela de login é pública
    if (pathname === '/login') return

    // Se não há usuário ou perfil com role válido, redireciona para login
    if (!user || !profile?.role) {
      router.replace('/login')
      return
    }

    const isCashier = profile.role === 'cashier_operator' || profile.role === 'operator'

    // Operador de caixa só pode acessar PDV e Caixa
    if (isCashier) {
      if (pathname !== '/pdv' && pathname !== '/caixa') {
        router.replace('/pdv')
        return
      }
    }

    // Gerente de filial ou regional não pode acessar Redes
    if ((profile.role === 'branch_admin' || profile.role === 'unit_admin') && pathname === '/redes') {
      router.replace('/')
      return
    }
  }, [user, profile, loading, pathname, router])

  if (pathname === '/login') {
    return <>{children}</>
  }

  // Deny-by-default: enquanto carrega ou se não houver usuário/perfil válido
  if (loading || !user || !profile?.role) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-900 text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-sm font-medium">
            {loading ? 'Validando sessão e permissões...' : 'Acesso não autorizado. Redirecionando...'}
          </p>
        </div>
      </div>
    )
  }

  const isCashier = profile.role === 'cashier_operator' || profile.role === 'operator'
  const isBranchOrUnit = profile.role === 'branch_admin' || profile.role === 'unit_admin'

  // Bloqueio de renderização para operador fora do escopo permitido
  if (isCashier && pathname !== '/pdv' && pathname !== '/caixa') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-900 text-slate-400">
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-medium text-emerald-400">Acesso Restrito: Redirecionando para o PDV...</p>
        </div>
      </div>
    )
  }

  // Bloqueio de renderização para gestor de filial em redes
  if (isBranchOrUnit && pathname === '/redes') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-900 text-slate-400">
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-medium text-amber-400">Acesso Restrito: Redirecionando para o Início...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
