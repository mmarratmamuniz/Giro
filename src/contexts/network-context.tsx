'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'

export interface Network {
  id: string
  name: string
  document_cnpj: string | null
  created_at: string
}

export interface Unit {
  id: string
  network_id: string
  name: string
  city: string | null
  state: string | null
  created_at: string
}

export interface Branch {
  id: string
  network_id: string
  unit_id: string
  name: string
  address: string | null
  phone: string | null
  created_at: string
}

interface NetworkContextType {
  networks: Network[]
  units: Unit[]
  branches: Branch[]
  selectedNetworkId: string | 'ALL'
  selectedUnitId: string | 'ALL'
  selectedBranchId: string | 'ALL'
  setSelectedNetworkId: (id: string | 'ALL') => void
  setSelectedUnitId: (id: string | 'ALL') => void
  setSelectedBranchId: (id: string | 'ALL') => void
  reloadStructure: () => Promise<void>
  loadingStructure: boolean
}

const NetworkContext = createContext<NetworkContextType>({
  networks: [],
  units: [],
  branches: [],
  selectedNetworkId: 'ALL',
  selectedUnitId: 'ALL',
  selectedBranchId: 'ALL',
  setSelectedNetworkId: () => {},
  setSelectedUnitId: () => {},
  setSelectedBranchId: () => {},
  reloadStructure: async () => {},
  loadingStructure: true,
})

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth()
  const supabase = createClient()

  const [networks, setNetworks] = useState<Network[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [branches, setBranches] = useState<Branch[]>([])

  const [selectedNetworkId, setSelectedNetworkId] = useState<string | 'ALL'>('ALL')
  const [selectedUnitId, setSelectedUnitId] = useState<string | 'ALL'>('ALL')
  const [selectedBranchId, setSelectedBranchId] = useState<string | 'ALL'>('ALL')
  const [loadingStructure, setLoadingStructure] = useState(true)

  async function reloadStructure() {
    try {
      setLoadingStructure(true)
      const [netRes, unitRes, branchRes] = await Promise.all([
        supabase.from('networks').select('*').order('name'),
        supabase.from('units').select('*').order('name'),
        supabase.from('branches').select('*').order('name'),
      ])

      if (netRes.data) setNetworks(netRes.data)
      if (unitRes.data) setUnits(unitRes.data)
      if (branchRes.data) setBranches(branchRes.data)
    } catch (err) {
      console.error('Erro ao carregar estrutura de redes:', err)
    } finally {
      setLoadingStructure(false)
    }
  }

  useEffect(() => {
    reloadStructure()
  }, [])

  // Definir contexto inicial com base no papel do usuário
  useEffect(() => {
    if (!profile) return

    if (profile.role === 'network_admin' && profile.network_id) {
      setSelectedNetworkId(profile.network_id)
    } else if (profile.role === 'unit_admin' && profile.unit_id) {
      setSelectedUnitId(profile.unit_id)
      if (profile.network_id) setSelectedNetworkId(profile.network_id)
    } else if ((profile.role === 'branch_admin' || profile.role === 'cashier_operator') && profile.branch_id) {
      setSelectedBranchId(profile.branch_id)
      if (profile.unit_id) setSelectedUnitId(profile.unit_id)
      if (profile.network_id) setSelectedNetworkId(profile.network_id)
    }
  }, [profile])

  return (
    <NetworkContext.Provider
      value={{
        networks,
        units,
        branches,
        selectedNetworkId,
        selectedUnitId,
        selectedBranchId,
        setSelectedNetworkId,
        setSelectedUnitId,
        setSelectedBranchId,
        reloadStructure,
        loadingStructure,
      }}
    >
      {children}
    </NetworkContext.Provider>
  )
}

export const useNetwork = () => useContext(NetworkContext)
