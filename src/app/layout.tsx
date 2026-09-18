import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/auth-context'
import { CartProvider } from '@/contexts/cart-context'
import { MobileMenuProvider } from '@/contexts/mobile-menu-context'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Finish Bebidas | Gestão Comercial',
  description: 'Sistema de Gestão Profissional para Conveniências e Mercados',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${inter.className} bg-slate-950 text-slate-100 antialiased min-h-screen selection:bg-amber-500 selection:text-slate-950`}>
        <AuthProvider>
          <CartProvider>
            <MobileMenuProvider>
              <div className="flex h-screen overflow-hidden">
                <Sidebar />
                <div className="flex flex-1 flex-col overflow-hidden min-w-0">
                  <Header />
                  <main className="flex-1 overflow-y-auto bg-slate-950 p-3.5 sm:p-6 lg:p-8">
                    {children}
                  </main>
                </div>
              </div>
            </MobileMenuProvider>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
