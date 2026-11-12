'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'

export interface Profile {
  id: string
  tenant_id?: string | null
  network_id?: string | null
  unit_id?: string | null
  branch_id?: string | null
  email: string | null
  full_name: string | null
  role: 'super_admin' | 'network_admin' | 'unit_admin' | 'branch_admin' | 'cashier_operator' | 'admin' | 'operator'
  job_title?: string | null
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [supabase] = useState(() => createClient())

  useEffect(() => {
    async function loadUser() {
      try {
        const { data: { user: authUser }, error } = await supabase.auth.getUser()
        if (error || !authUser) {
          setUser(null)
          setProfile(null)
        } else {
          setUser(authUser)
          const { data: prof } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authUser.id)
            .single()

          setProfile(prof || null)
        }
      } catch (err) {
        console.error('Erro ao carregar usuário:', err)
        setUser(null)
        setProfile(null)
      } finally {
        setLoading(false)
      }
    }

    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const currentUser = session?.user ?? null
        setUser(currentUser)
        if (currentUser) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single()
          setProfile(prof || null)
        } else {
          setProfile(null)
        }
        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase])

  const signOut = async () => {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Erro ao encerrar sessão:', err)
    } finally {
      setUser(null)
      setProfile(null)
      if (typeof window !== 'undefined') {
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && (key.startsWith('giro_cart') || key.startsWith('finish_cart'))) {
            keysToRemove.push(key)
          }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key))
        window.location.href = '/login'
      }
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
