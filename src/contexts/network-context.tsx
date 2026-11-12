'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'

export interface Network {
  id: string
  name: string
  document_cnpj: string | null
  logo_url?: string | null
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
  const [supabase] = useState(() => createClient())

  const [networks, setNetworks] = useState<Network[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [branches, setBranches] = useState<Branch[]>([])

  const [selectedNetworkId, setSelectedNetworkIdState] = useState<string | 'ALL'>('ALL')
  const [selectedUnitId, setSelectedUnitIdState] = useState<string | 'ALL'>('ALL')
  const [selectedBranchId, setSelectedBranchIdState] = useState<string | 'ALL'>('ALL')
  const [loadingStructure, setLoadingStructure] = useState(true)

  async function reloadStructure() {
    try {
      setLoadingStructure(true)
      const [netRes, unitRes, branchRes] = await Promise.all([
        supabase.from('networks').select('*').order('name'),
        supabase.from('units').select('*').order('name'),
        supabase.from('branches').select('*').order('name'),
      ])

      if (netRes.data) {
        const mapped = netRes.data.map((net: any) => ({
          ...net,
          logo_url:
            net.logo_url ||
            (net.name?.toLowerCase().includes('ovo')
              ? '/logo-grupo-ovo.png'
              : net.name?.toLowerCase().includes('bebidas')
              ? '/logo-m-bebidas.png'
              : null),
        }))
        setNetworks(mapped)
      }
      if (unitRes.data) setUnits(unitRes.data)
      if (branchRes.data) setBranches(branchRes.data)
    } catch (err) {
      console.error('Erro ao carregar estrutura de redes:', err)
    } finally {
      setLoadingStructure(false)
    }
  }

  // Dispara reloadStructure reagindo a profile?.id e reseta quando !profile
  useEffect(() => {
    if (!profile) {
      setNetworks([])
      setUnits([])
      setBranches([])
      setSelectedNetworkIdState('ALL')
      setSelectedUnitIdState('ALL')
      setSelectedBranchIdState('ALL')
      setLoadingStructure(false)
      return
    }

    reloadStructure()

    // Configuração dos escopos obrigatórios de acordo com o cargo
    if (profile.role !== 'super_admin' && profile.network_id) {
      setSelectedNetworkIdState(profile.network_id)
    } else if (profile.role === 'super_admin') {
      setSelectedNetworkIdState('ALL')
    }

    if (profile.role === 'unit_admin' && profile.unit_id) {
      setSelectedUnitIdState(profile.unit_id)
    } else if ((profile.role === 'branch_admin' || profile.role === 'cashier_operator' || profile.role === 'operator') && profile.unit_id) {
      setSelectedUnitIdState(profile.unit_id)
    } else {
      setSelectedUnitIdState('ALL')
    }

    if ((profile.role === 'branch_admin' || profile.role === 'cashier_operator' || profile.role === 'operator') && profile.branch_id) {
      setSelectedBranchIdState(profile.branch_id)
    } else {
      setSelectedBranchIdState('ALL')
    }
  }, [profile?.id, profile?.role, profile?.network_id, profile?.unit_id, profile?.branch_id])

  // Setters protegidos contra quebra de escopo
  const setSelectedNetworkId = (id: string | 'ALL') => {
    if (profile && profile.role !== 'super_admin') {
      if (profile.network_id) {
        setSelectedNetworkIdState(profile.network_id)
        return
      }
    }
    setSelectedNetworkIdState(id)
  }

  const setSelectedUnitId = (id: string | 'ALL') => {
    if (profile && profile.role === 'unit_admin' && profile.unit_id) {
      setSelectedUnitIdState(profile.unit_id)
      return
    }
    if (profile && (profile.role === 'branch_admin' || profile.role === 'cashier_operator' || profile.role === 'operator') && profile.unit_id) {
      setSelectedUnitIdState(profile.unit_id)
      return
    }
    setSelectedUnitIdState(id)
  }

  const setSelectedBranchId = (id: string | 'ALL') => {
    if (
      profile &&
      profile.branch_id &&
      (profile.role === 'branch_admin' || profile.role === 'cashier_operator' || profile.role === 'operator')
    ) {
      setSelectedBranchIdState(profile.branch_id)
      return
    }
    setSelectedBranchIdState(id)
  }

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
