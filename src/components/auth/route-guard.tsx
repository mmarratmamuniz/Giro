'use client'

import React, { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, loading } = useAuth()

  useEffect(() => {
    if (loading) return

    // Se estiver na tela de login, não bloqueia
    if (pathname === '/login') return

    // Se o usuário for operador de caixa, só pode acessar o PDV
    if (profile?.role === 'operator') {
      if (pathname !== '/pdv') {
        router.replace('/pdv')
      }
    }
  }, [profile, loading, pathname, router])

  // Se for operador e estiver tentando renderizar outra página enquanto redireciona, mostra loading discreto
  if (!loading && profile?.role === 'operator' && pathname !== '/pdv' && pathname !== '/login') {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-slate-500 font-medium">
        Redirecionando para Frente de Caixa (PDV)...
      </div>
    )
  }

  return <>{children}</>
}
