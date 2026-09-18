'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

interface MobileMenuContextType {
  isMobileOpen: boolean
  openMobileMenu: () => void
  closeMobileMenu: () => void
  toggleMobileMenu: () => void
}

const MobileMenuContext = createContext<MobileMenuContextType>({
  isMobileOpen: false,
  openMobileMenu: () => {},
  closeMobileMenu: () => {},
  toggleMobileMenu: () => {},
})

export function MobileMenuProvider({ children }: { children: React.ReactNode }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const pathname = usePathname()

  // Fecha o menu móvel sempre que navegar para outra página
  useEffect(() => {
    setIsMobileOpen(false)
  }, [pathname])

  const openMobileMenu = () => setIsMobileOpen(true)
  const closeMobileMenu = () => setIsMobileOpen(false)
  const toggleMobileMenu = () => setIsMobileOpen((prev) => !prev)

  return (
    <MobileMenuContext.Provider
      value={{
        isMobileOpen,
        openMobileMenu,
        closeMobileMenu,
        toggleMobileMenu,
      }}
    >
      {children}
    </MobileMenuContext.Provider>
  )
}

export const useMobileMenu = () => useContext(MobileMenuContext)
