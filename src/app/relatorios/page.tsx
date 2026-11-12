'use client'

import React, { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useNetwork } from '@/contexts/network-context'
import { useAuth } from '@/contexts/auth-context'
import { useFeedback } from '@/contexts/feedback-context'
import { ThermalReceipt } from '@/components/pdv/thermal-receipt'
import {
  Printer,
  Store,
  Building2,
  DollarSign,
  TrendingUp,
  BarChart3,
  PieChart as PieIcon,
  Package,
  CreditCard,
  Truck,
  Lock,
  Search,
  X,
  Ban,
  Tag,
  XCircle,
  Award,
  FileText,
  Filter,
  CheckCircle,
  AlertTriangle,
  Receipt,
  FileBarChart,
  Calendar,
  Layers,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316']

type PeriodType = 'dia' | 'semana' | 'mes' | 'ano' | 'tudo'
type TabType = 'dre' | 'vendas' | 'caixa' | 'produtos' | 'pagamentos' | 'compras'

const periodLabels: Record<PeriodType, string> = {
  dia: 'Hoje (Dia)',
  semana: 'Últimos 7 Dias (Semana)',
  mes: 'Mês Atual',
  ano: 'Ano Corrente',
  tudo: 'Todo o Período',
}

const tabLabels: Record<TabType, string> = {
  dre: 'DRE & Visão Geral',
  vendas: 'Cupons de Venda',
  caixa: 'Fechamentos de Caixa',
  produtos: 'Produtos Mais Vendidos',
  pagamentos: 'Formas de Pagamento',
  compras: 'Compras & Entradas',
}

function getPeriodStartDate(p: PeriodType): Date | null {
  const now = new Date()
  if (p === 'dia') return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  if (p === 'semana') {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    d.setHours(0, 0, 0, 0)
    return d
  }
  if (p === 'mes') return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
  if (p === 'ano') return new Date(now.getFullYear(), 0, 1, 0, 0, 0)
  return null
}

const formatShiftId = (id: any) => {
  if (id === null || id === undefined) return ''
  const str = String(id)
  return str.length > 8 ? str.slice(0, 8) : str
}

function RelatoriosContent() {
  const searchParams = useSearchParams()
  const { user, profile } = useAuth()
  const { showSuccess, showError, showWarning } = useFeedback()
  const { branches, networks, selectedBranchId, selectedNetworkId } = useNetwork()
  const supabase = useMemo(() => createClient(), [])

  // Abas e Filtros Globais
  const initialTab = (searchParams.get('tab') as TabType) || 'dre'
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)
  const [period, setPeriod] = useState<PeriodType>('mes')
  const [networkFilter, setNetworkFilter] = useState<string>(
    selectedNetworkId !== 'ALL' ? selectedNetworkId : 'todos'
  )
  const [branchFilter, setBranchFilter] = useState<string>(
    selectedBranchId !== 'ALL' ? selectedBranchId : 'todos'
  )
  const [deskFilter, setDeskFilter] = useState<string>('todos')
  const [cashDesks, setCashDesks] = useState<any[]>([])

  // Estados de Dados Principais
  const [loading, setLoading] = useState(true)
  const [salesList, setSalesList] = useState<any[]>([])
  const [shiftsList, setShiftsList] = useState<any[]>([])
  const [purchasesList, setPurchasesList] = useState<any[]>([])
  const [transactionsList, setTransactionsList] = useState<any[]>([])
  const [profilesMap, setProfilesMap] = useState<Record<string, any>>({})

  // Filtro de Vendas (Aba 2)
  const [saleSearch, setSaleSearch] = useState('')
  const [saleStatusFilter, setSaleStatusFilter] = useState('todos')
  const [salePaymentFilter, setSalePaymentFilter] = useState('todos')
  const [shiftFilter, setShiftFilter] = useState<string | null>(searchParams.get('shift') || null)

  // Modais de Impressão e Estorno
  const [selectedSaleForReceipt, setSelectedSaleForReceipt] = useState<any | null>(null)
  const [selectedShiftForReceipt, setSelectedShiftForReceipt] = useState<any | null>(null)
  const [shiftReceiptData, setShiftReceiptData] = useState<{
    shift: any
    sales: any[]
    transactions: any[]
  } | null>(null)
  const [loadingShiftReceipt, setLoadingShiftReceipt] = useState(false)

  const [cancelingSale, setCancelingSale] = useState<any | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [canceling, setCanceling] = useState(false)

  const canCancel = profile?.role === 'super_admin' || profile?.role === 'network_admin'

  // Sincroniza branchFilter e networkFilter com o header global
  useEffect(() => {
    if (selectedNetworkId !== 'ALL') {
      setNetworkFilter(selectedNetworkId)
    }
  }, [selectedNetworkId])

  useEffect(() => {
    if (selectedBranchId !== 'ALL') {
      setBranchFilter(selectedBranchId)
    }
  }, [selectedBranchId])

  // Identificação Dinâmica da Rede Ativa
  const activeNetworkName = useMemo(() => {
    // 1. Filtro local de rede selecionado
    if (networkFilter !== 'todos') {
      const found = networks.find((n) => n.id === networkFilter)
      if (found) return found.name
    }
    // 2. Rede global selecionada
    if (selectedNetworkId !== 'ALL') {
      const found = networks.find((n) => n.id === selectedNetworkId)
      if (found) return found.name
    }
    // 3. Rede da Unidade selecionada
    if (branchFilter !== 'todos') {
      const br = branches.find((b) => b.id === branchFilter)
      if (br) {
        const found = networks.find((n) => n.id === br.network_id)
        if (found) return found.name
      }
    }
    if (selectedBranchId !== 'ALL') {
      const br = branches.find((b) => b.id === selectedBranchId)
      if (br) {
        const found = networks.find((n) => n.id === br.network_id)
        if (found) return found.name
      }
    }
    // 4. Rede do perfil do usuário
    if (profile?.network_id) {
      const found = networks.find((n) => n.id === profile.network_id)
      if (found) return found.name
    }
    // 5. Se os dados carregados pertencem a uma única rede
    const netIds = Array.from(new Set(salesList.map((s) => s.branch?.network_id).filter(Boolean)))
    if (netIds.length === 1) {
      const found = networks.find((n) => n.id === netIds[0])
      if (found) return found.name
    }
    // 6. Rede padrão cadastrada
    if (networks.length === 1) return networks[0].name
    if (networks.length > 0) return networks[0].name
    return 'Rede Comercial'
  }, [networkFilter, selectedNetworkId, branchFilter, selectedBranchId, profile, networks, branches, salesList])

  // Identificação Dinâmica da Logo da Rede Ativa
  const activeNetworkLogoUrl = useMemo(() => {
    let net = null
    if (networkFilter !== 'todos') {
      net = networks.find((n) => n.id === networkFilter)
    } else if (selectedNetworkId !== 'ALL') {
      net = networks.find((n) => n.id === selectedNetworkId)
    } else if (branchFilter !== 'todos') {
      const br = branches.find((b) => b.id === branchFilter)
      if (br) net = networks.find((n) => n.id === br.network_id)
    } else if (selectedBranchId !== 'ALL') {
      const br = branches.find((b) => b.id === selectedBranchId)
      if (br) net = networks.find((n) => n.id === br.network_id)
    } else if (profile?.network_id) {
      net = networks.find((n) => n.id === profile.network_id)
    }

    if (net?.logo_url) return net.logo_url
    const netName = net?.name || activeNetworkName
    if (netName) {
      const lower = netName.toLowerCase()
      if (lower.includes('ovo')) return '/logo-grupo-ovo.png'
      if (lower.includes('bebidas')) return '/logo-m-bebidas.png'
    }

    return '/logo-giro.png'
  }, [networkFilter, selectedNetworkId, branchFilter, selectedBranchId, profile, networks, branches, activeNetworkName])

  // Atualização dinâmica do document.title (aparece na aba do navegador e no cabeçalho do PDF)
  useEffect(() => {
    document.title = `${activeNetworkName} | ${tabLabels[activeTab]} (${periodLabels[period]})`
  }, [activeNetworkName, activeTab, period])

  // Busca Caixas da Unidade/Rede
  useEffect(() => {
    async function loadCashDesks() {
      let q = supabase.from('cash_desks').select('id, name, branch_id').order('name')
      if (branchFilter !== 'todos') {
        q = q.eq('branch_id', branchFilter)
      } else if (networkFilter !== 'todos') {
        const branchIds = branches.filter((b) => b.network_id === networkFilter).map((b) => b.id)
        if (branchIds.length > 0) q = q.in('branch_id', branchIds)
      } else if (selectedNetworkId !== 'ALL') {
        const branchIds = branches.filter((b) => b.network_id === selectedNetworkId).map((b) => b.id)
        if (branchIds.length > 0) q = q.in('branch_id', branchIds)
      }
      const { data } = await q
      if (data) setCashDesks(data)
    }
    loadCashDesks()
  }, [branchFilter, networkFilter, selectedNetworkId, branches, supabase])

  // Carga Geral de Dados Unificados
  async function loadData() {
    try {
      setLoading(true)
      const startDate = getPeriodStartDate(period)

      // 1. Query de Vendas
      let sQuery = supabase
        .from('sales')
        .select(`
          id,
          user_id,
          total_amount,
          discount_amount,
          payment_method,
          status,
          date,
          created_at,
          shift_id,
          branch_id,
          cash_desk_id,
          cancel_reason,
          canceled_at,
          branch:branches(id, name, network_id),
          cash_desk:cash_desks(id, name),
          sale_items (
            id,
            quantity,
            unit_price,
            unit_cost,
            product_id,
            products (
              id,
              name,
              sku,
              cost_price,
              category_id,
              categories (id, name)
            )
          )
        `)
        .order('created_at', { ascending: false })

      // 2. Query de Turnos de Caixa
      let shQuery = supabase
        .from('cash_shifts')
        .select(`
          id,
          user_id,
          branch_id,
          cash_desk_id,
          opened_at,
          closed_at,
          initial_amount,
          final_amount,
          system_amount,
          difference,
          status,
          notes,
          created_at,
          branch:branches(id, name, network_id),
          cash_desk:cash_desks(id, name)
        `)
        .order('opened_at', { ascending: false })

      // 3. Query de Compras
      let pQuery = supabase
        .from('purchases')
        .select(`
          id,
          user_id,
          invoice_number,
          supplier,
          total_amount,
          date,
          created_at,
          branch_id,
          network_id,
          branch:branches(id, name),
          purchase_items (
            id,
            quantity,
            unit_cost,
            product_id,
            products (id, name, sku)
          )
        `)
        .order('date', { ascending: false })

      // 4. Query de Transações Avulsas de Caixa
      let tQuery = supabase
        .from('cash_transactions')
        .select('*')
        .order('created_at', { ascending: false })

      // 5. Query de Perfis de Usuários
      const profQuery = supabase
        .from('profiles')
        .select('id, full_name, email')

      // Filtros de Período Temporal
      if (startDate) {
        sQuery = sQuery.gte('created_at', startDate.toISOString())
        shQuery = shQuery.gte('opened_at', startDate.toISOString())
        pQuery = pQuery.gte('date', startDate.toISOString())
        tQuery = tQuery.gte('created_at', startDate.toISOString())
      }

      // Filtro de Unidade
      if (branchFilter !== 'todos') {
        sQuery = sQuery.eq('branch_id', branchFilter)
        shQuery = shQuery.eq('branch_id', branchFilter)
        pQuery = pQuery.eq('branch_id', branchFilter)
      } else if (selectedBranchId !== 'ALL') {
        sQuery = sQuery.eq('branch_id', selectedBranchId)
        shQuery = shQuery.eq('branch_id', selectedBranchId)
        pQuery = pQuery.eq('branch_id', selectedBranchId)
      } else if (networkFilter !== 'todos') {
        sQuery = sQuery.eq('network_id', networkFilter)
        shQuery = shQuery.eq('network_id', networkFilter)
        pQuery = pQuery.eq('network_id', networkFilter)
      } else if (selectedNetworkId !== 'ALL') {
        sQuery = sQuery.eq('network_id', selectedNetworkId)
        shQuery = shQuery.eq('network_id', selectedNetworkId)
        pQuery = pQuery.eq('network_id', selectedNetworkId)
      }

      // Filtro de Caixa
      if (deskFilter !== 'todos') {
        sQuery = sQuery.eq('cash_desk_id', deskFilter)
        shQuery = shQuery.eq('cash_desk_id', deskFilter)
      }

      const [sRes, shRes, pRes, tRes, profRes] = await Promise.all([
        sQuery,
        shQuery,
        pQuery,
        tQuery,
        profQuery,
      ])

      if (sRes.error) console.error('Aviso ao carregar vendas:', sRes.error)
      if (shRes.error) console.error('Aviso ao carregar turnos:', shRes.error)
      if (pRes.error) console.error('Aviso ao carregar compras:', pRes.error)
      if (tRes.error) console.error('Aviso ao carregar transações:', tRes.error)
      if (profRes.error) console.error('Aviso ao carregar perfis:', profRes.error)

      const pMap: Record<string, any> = {}
      if (profRes.data) {
        profRes.data.forEach((p: any) => {
          if (p && p.id) pMap[p.id] = p
        })
      }
      setProfilesMap(pMap)

      setSalesList(sRes.data || [])
      setShiftsList(shRes.data || [])
      setPurchasesList(pRes.data || [])
      setTransactionsList(tRes.data || [])
    } catch (err: any) {
      console.error('Erro ao carregar dados unificados:', err)
      showError('Erro ao carregar relatórios', err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [period, networkFilter, branchFilter, deskFilter, selectedBranchId, selectedNetworkId])

  // Abrir Comprovante Térmico Consolidado do Turno (80mm)
  async function handleOpenShiftReceipt(shift: any) {
    setSelectedShiftForReceipt(shift)
    setLoadingShiftReceipt(true)
    try {
      const [{ data: shiftSales }, { data: txData }] = await Promise.all([
        supabase
          .from('sales')
          .select('id, status, payment_method, discount_amount, total_amount, created_at')
          .eq('shift_id', shift.id),
        supabase
          .from('cash_transactions')
          .select('*')
          .eq('shift_id', shift.id)
          .order('created_at', { ascending: true }),
      ])

      setShiftReceiptData({
        shift,
        sales: shiftSales || [],
        transactions: txData || [],
      })
    } catch (err: any) {
      console.error('Erro ao abrir comprovante do turno:', err)
      showError('Erro', 'Não foi possível carregar os dados consolidados do turno.')
    } finally {
      setLoadingShiftReceipt(false)
    }
  }

  // Estornar / Cancelar Venda via RPC
  const handleCancelSale = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cancelingSale) return

    if (!canCancel) {
      showError('Permissão Negada', 'Apenas administradores podem estornar vendas.')
      return
    }

    try {
      setCanceling(true)
      const { error } = await supabase.rpc('cancel_sale', {
        p_sale_id: cancelingSale.id,
        p_reason: cancelReason.trim() || 'Cancelamento solicitado pelo gestor',
        p_user_id: user?.id || null,
      })

      if (error) throw error

      showSuccess('Venda Estornada!', `Cupom #${cancelingSale.id} cancelado com sucesso.`)
      setCancelingSale(null)
      setCancelReason('')
      loadData()
    } catch (err: any) {
      showError('Erro ao cancelar venda', err.message)
    } finally {
      setCanceling(false)
    }
  }

  // Cálculos DRE e Visão Geral
  const dreCalculations = useMemo(() => {
    const completedSales = salesList.filter((s) => s.status !== 'CANCELED')
    const canceledSales = salesList.filter((s) => s.status === 'CANCELED')

    const receitaLiquida = completedSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)
    let cmvTotal = 0

    completedSales.forEach((s) => {
      ;(s.sale_items || []).forEach((item: any) => {
        const qty = Number(item.quantity) || 0
        const unitCost = Number(item.unit_cost) > 0 ? Number(item.unit_cost) : Number(item.products?.cost_price || 0)
        cmvTotal += qty * unitCost
      })
    })

    const lucroBruto = receitaLiquida - cmvTotal
    const margemPercent = receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0
    const totalCompras = purchasesList.reduce((sum, p) => sum + Number(p.total_amount || 0), 0)
    const totalDescontos = completedSales.reduce((sum, s) => sum + Number(s.discount_amount || 0), 0)
    const canceladasCount = canceledSales.length
    const canceladasTotal = canceledSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)
    const totalSalesCount = completedSales.length
    const ticketMedioTotal = totalSalesCount > 0 ? receitaLiquida / totalSalesCount : 0

    // DRE por Unidade
    const unitMap: Record<
      string,
      { branchName: string; salesCount: number; totalSales: number; totalCost: number }
    > = {}

    branches.forEach((b) => {
      if (
        (networkFilter === 'todos' || b.network_id === networkFilter) &&
        (selectedNetworkId === 'ALL' || b.network_id === selectedNetworkId)
      ) {
        unitMap[b.id] = { branchName: b.name, salesCount: 0, totalSales: 0, totalCost: 0 }
      }
    })

    completedSales.forEach((s) => {
      const bId = s.branch_id || 'sem_unidade'
      const bName = s.branch_id ? s.branch?.name || unitMap[s.branch_id]?.branchName || 'Unidade' : 'Rede Geral'
      if (!unitMap[bId]) {
        unitMap[bId] = { branchName: bName, salesCount: 0, totalSales: 0, totalCost: 0 }
      }
      unitMap[bId].totalSales += Number(s.total_amount || 0)
      unitMap[bId].salesCount += 1
      ;(s.sale_items || []).forEach((item: any) => {
        const qty = Number(item.quantity) || 0
        const unitCost = Number(item.unit_cost) > 0 ? Number(item.unit_cost) : Number(item.products?.cost_price || 0)
        unitMap[bId].totalCost += qty * unitCost
      })
    })

    const unitList = Object.entries(unitMap)
      .map(([id, val]) => {
        const profit = val.totalSales - val.totalCost
        return {
          id,
          name: val.branchName,
          salesCount: val.salesCount,
          totalSales: val.totalSales,
          totalCost: val.totalCost,
          grossProfit: profit,
          marginPercent: val.totalSales > 0 ? (profit / val.totalSales) * 100 : 0,
          ticketMedio: val.salesCount > 0 ? val.totalSales / val.salesCount : 0,
          participation: receitaLiquida > 0 ? (val.totalSales / receitaLiquida) * 100 : 0,
        }
      })
      .sort((a, b) => b.totalSales - a.totalSales)

    return {
      receitaLiquida,
      cmvTotal,
      lucroBruto,
      margemPercent,
      totalCompras,
      totalDescontos,
      canceladasCount,
      canceladasTotal,
      totalSalesCount,
      ticketMedioTotal,
      unitList,
    }
  }, [salesList, purchasesList, branches, networkFilter, selectedNetworkId])

  // Ranking de Produtos Mais Vendidos (Aba 4)
  const productRanking = useMemo(() => {
    const map: Record<
      string,
      {
        id: number
        name: string
        sku: string
        category: string
        quantity: number
        totalRevenue: number
        totalCost: number
      }
    > = {}

    salesList
      .filter((s) => s.status !== 'CANCELED')
      .forEach((s) => {
        ;(s.sale_items || []).forEach((item: any) => {
          const prodId = item.product_id || item.products?.id || 'unknown'
          const name = item.products?.name || 'Produto Sem Nome'
          const sku = item.products?.sku || '-'
          const category = item.products?.categories?.name || 'Geral'
          const qty = Number(item.quantity) || 0
          const unitPrice = Number(item.unit_price) || 0
          const unitCost = Number(item.unit_cost) > 0 ? Number(item.unit_cost) : Number(item.products?.cost_price || 0)

          if (!map[prodId]) {
            map[prodId] = {
              id: prodId,
              name,
              sku,
              category,
              quantity: 0,
              totalRevenue: 0,
              totalCost: 0,
            }
          }

          map[prodId].quantity += qty
          map[prodId].totalRevenue += qty * unitPrice
          map[prodId].totalCost += qty * unitCost
        })
      })

    return Object.values(map)
      .map((p) => {
        const profit = p.totalRevenue - p.totalCost
        const margin = p.totalRevenue > 0 ? (profit / p.totalRevenue) * 100 : 0
        const avgPrice = p.quantity > 0 ? p.totalRevenue / p.quantity : 0
        return {
          ...p,
          avgPrice,
          profit,
          margin,
        }
      })
      .sort((a, b) => b.quantity - a.quantity)
  }, [salesList])

  // Faturamento por Categoria (Gráfico Aba 4)
  const categorySalesData = useMemo(() => {
    const catMap: Record<string, number> = {}
    productRanking.forEach((p) => {
      catMap[p.category] = (catMap[p.category] || 0) + p.totalRevenue
    })
    return Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [productRanking])

  // Desempenho por Formas de Pagamento (Aba 5)
  const paymentMethodReport = useMemo(() => {
    const completedSales = salesList.filter((s) => s.status !== 'CANCELED')
    const totalReceita = completedSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)

    const map: Record<string, { count: number; total: number }> = {}

    completedSales.forEach((s) => {
      const pm = s.payment_method || 'Outros'
      if (!map[pm]) map[pm] = { count: 0, total: 0 }
      map[pm].count += 1
      map[pm].total += Number(s.total_amount || 0)
    })

    return Object.entries(map)
      .map(([name, val]) => ({
        name,
        count: val.count,
        total: val.total,
        ticketMedio: val.count > 0 ? val.total / val.count : 0,
        participation: totalReceita > 0 ? (val.total / totalReceita) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [salesList])

  // Desempenho por Terminal de Caixa (Aba 3)
  const cashDeskPerformance = useMemo(() => {
    const map: Record<
      string,
      { deskName: string; branchName: string; salesCount: number; totalSales: number; totalCost: number }
    > = {}

    salesList
      .filter((s) => s.status !== 'CANCELED')
      .forEach((s) => {
        const dId = s.cash_desk_id || 'sem_terminal'
        const dName = s.cash_desk?.name || 'Terminal Padrão'
        const bName = s.branch?.name || 'Unidade'

        if (!map[dId]) {
          map[dId] = { deskName: dName, branchName: bName, salesCount: 0, totalSales: 0, totalCost: 0 }
        }

        map[dId].totalSales += Number(s.total_amount || 0)
        map[dId].salesCount += 1

        ;(s.sale_items || []).forEach((item: any) => {
          const qty = Number(item.quantity) || 0
          const unitCost = Number(item.unit_cost) > 0 ? Number(item.unit_cost) : Number(item.products?.cost_price || 0)
          map[dId].totalCost += qty * unitCost
        })
      })

    return Object.values(map)
      .map((d) => {
        const profit = d.totalSales - d.totalCost
        return {
          ...d,
          profit,
          margin: d.totalSales > 0 ? (profit / d.totalSales) * 100 : 0,
          ticketMedio: d.salesCount > 0 ? d.totalSales / d.salesCount : 0,
        }
      })
      .sort((a, b) => b.totalSales - a.totalSales)
  }, [salesList])

  // Resumo de Fechamentos de Caixa (Aba 3)
  const cashSummary = useMemo(() => {
    const suprimentos = transactionsList.filter((t) => t.type === 'SUPRIMENTO')
    const sangrias = transactionsList.filter((t) => t.type === 'SANGRIA')

    const totalSuprimentos = suprimentos.reduce((sum, t) => sum + Number(t.amount || 0), 0)
    const totalSangrias = sangrias.reduce((sum, t) => sum + Number(t.amount || 0), 0)
    const totalQuebraSobra = shiftsList.reduce((sum, sh) => sum + Number(sh.difference || 0), 0)
    const totalFundoInicial = shiftsList.reduce((sum, sh) => sum + Number(sh.initial_amount || 0), 0)
    const totalEsperado = shiftsList.reduce((sum, sh) => sum + Number(sh.system_amount || 0), 0)
    const totalContado = shiftsList.reduce((sum, sh) => sum + Number(sh.final_amount || 0), 0)

    return {
      shiftsCount: shiftsList.length,
      totalSuprimentos,
      totalSangrias,
      totalQuebraSobra,
      totalFundoInicial,
      totalEsperado,
      totalContado,
    }
  }, [shiftsList, transactionsList])

  // Ranking de Compras por Produto (Aba 6)
  const purchasedProductsRanking = useMemo(() => {
    const map: Record<string, { id: number; name: string; sku: string; quantity: number; totalCost: number }> = {}

    purchasesList.forEach((pur) => {
      ;(pur.purchase_items || []).forEach((it: any) => {
        const prodId = it.product_id || it.products?.id || 'unknown'
        const name = it.products?.name || 'Produto'
        const sku = it.products?.sku || '-'
        const qty = Number(it.quantity) || 0
        const total = qty * Number(it.unit_cost || 0)

        if (!map[prodId]) {
          map[prodId] = { id: prodId, name, sku, quantity: 0, totalCost: 0 }
        }
        map[prodId].quantity += qty
        map[prodId].totalCost += total
      })
    })

    return Object.values(map)
      .map((p) => ({
        ...p,
        avgCost: p.quantity > 0 ? p.totalCost / p.quantity : 0,
      }))
      .sort((a, b) => b.quantity - a.quantity)
  }, [purchasesList])

  // Filtro de Cupons da Aba 2
  const filteredSalesList = useMemo(() => {
    return salesList.filter((s) => {
      const opName = profilesMap[s.user_id]?.full_name || ''
      const matchesSearch = saleSearch.trim()
        ? String(s.id).includes(saleSearch.trim()) ||
          opName.toLowerCase().includes(saleSearch.trim().toLowerCase())
        : true
      const matchesStatus = saleStatusFilter === 'todos' ? true : s.status === saleStatusFilter
      const matchesPayment =
        salePaymentFilter === 'todos' ? true : s.payment_method?.toLowerCase() === salePaymentFilter.toLowerCase()
      const matchesShift = shiftFilter ? String(s.shift_id) === String(shiftFilter) : true
      return matchesSearch && matchesStatus && matchesPayment && matchesShift
    })
  }, [salesList, saleSearch, saleStatusFilter, salePaymentFilter, shiftFilter, profilesMap])

  // Totais das Vendas Filtradas (Aba 2)
  const salesTabSummary = useMemo(() => {
    const completed = filteredSalesList.filter((s) => s.status !== 'CANCELED')
    const canceled = filteredSalesList.filter((s) => s.status === 'CANCELED')

    const totalLiquido = completed.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)
    const totalDescontos = completed.reduce((sum, s) => sum + Number(s.discount_amount || 0), 0)
    const totalItens = completed.reduce(
      (sum, s) =>
        sum +
        (s.sale_items || []).reduce((acc: number, it: any) => acc + Number(it.quantity || 0), 0),
      0
    )
    const canceledTotal = canceled.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)

    return {
      completedCount: completed.length,
      canceledCount: canceled.length,
      canceledTotal,
      totalLiquido,
      totalDescontos,
      totalItens,
    }
  }, [filteredSalesList])

  // Cálculos do Comprovante Térmico Consolidado de Turno
  const shiftReceiptCalculations = useMemo(() => {
    if (!shiftReceiptData) return null
    const { shift, sales: shiftSales, transactions } = shiftReceiptData
    const completed = shiftSales.filter((s) => s.status === 'COMPLETED')
    const canceled = shiftSales.filter((s) => s.status === 'CANCELED')

    const getPaymentTotals = (methodNames: string[]) => {
      const matching = completed.filter((s) =>
        methodNames.some((m) => s.payment_method?.toLowerCase() === m.toLowerCase())
      )
      return {
        count: matching.length,
        total: matching.reduce((sum, s) => sum + Number(s.total_amount || 0), 0),
      }
    }

    const dinheiro = getPaymentTotals(['Dinheiro'])
    const pix = getPaymentTotals(['Pix'])
    const credito = getPaymentTotals(['Crédito', 'Cartão de Crédito'])
    const debito = getPaymentTotals(['Débito', 'Cartão de Débito'])

    const totalDescontos = completed.reduce((sum, s) => sum + Number(s.discount_amount || 0), 0)
    const faturamentoLiquido = completed.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)
    const totalBruto = faturamentoLiquido + totalDescontos

    const initialAmount = Number(shift.initial_amount || 0)
    const suprimentos = transactions.filter((t) => t.type === 'SUPRIMENTO')
    const totalSuprimentos = suprimentos.reduce((sum, t) => sum + Number(t.amount || 0), 0)
    const sangrias = transactions.filter((t) => t.type === 'SANGRIA')
    const totalSangrias = sangrias.reduce((sum, t) => sum + Number(t.amount || 0), 0)

    const systemExpected =
      shift.system_amount !== null && shift.system_amount !== undefined
        ? Number(shift.system_amount)
        : initialAmount + dinheiro.total + totalSuprimentos - totalSangrias

    const finalCounted =
      shift.final_amount !== null && shift.final_amount !== undefined ? Number(shift.final_amount) : null

    const difference =
      shift.difference !== null && shift.difference !== undefined
        ? Number(shift.difference)
        : finalCounted !== null
        ? finalCounted - systemExpected
        : null

    return {
      dinheiro,
      pix,
      credito,
      debito,
      totalBruto,
      totalDescontos,
      faturamentoLiquido,
      canceladasCount: canceled.length,
      canceladasTotal: canceled.reduce((sum, s) => sum + Number(s.total_amount || 0), 0),
      initialAmount,
      totalSuprimentos,
      suprimentos,
      totalSangrias,
      sangrias,
      systemExpected,
      finalCounted,
      difference,
    }
  }, [shiftReceiptData])

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ========================================================
          BARRA DE TOPO: TÍTULO, SUBTÍTULO E BOTÃO IMPRIMIR A4
          ======================================================== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between no-print">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <FileBarChart className="text-amber-500" size={26} />
            Relatórios & Histórico
          </h2>
          <p className="text-xs text-slate-400">
            DRE, auditoria de vendas, fechamentos de caixa, compras e conciliação financeira •{' '}
            <span className="text-amber-400 font-semibold">{activeNetworkName}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="allow-print flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20 transition cursor-pointer self-start sm:self-auto"
        >
          <Printer size={16} />
          Imprimir Relatório (A4 / PDF)
        </button>
      </div>

      {/* ========================================================
          BARRA GLOBAL DE FILTROS: PERÍODO, REDE, UNIDADE E CAIXA
          ======================================================== */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm no-print space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Seletor de Período Temporal */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto max-w-full">
            {(['dia', 'semana', 'mes', 'ano', 'tudo'] as PeriodType[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  period === p
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                {periodLabels[p]}
              </button>
            ))}
          </div>

          {/* Seletores de Rede, Unidade e Caixa */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Seletor de Rede */}
            {networks.length > 0 && (
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
                <Building2 size={14} className="text-amber-400 shrink-0" />
                <select
                  value={networkFilter}
                  onChange={(e) => {
                    setNetworkFilter(e.target.value)
                    setBranchFilter('todos')
                    setDeskFilter('todos')
                  }}
                  className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer font-medium"
                >
                  <option value="todos" className="bg-slate-900">
                    Todas as Redes
                  </option>
                  {networks.map((n) => (
                    <option key={n.id} value={n.id} className="bg-slate-900">
                      {n.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Unidade */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
              <Store size={14} className="text-amber-400 shrink-0" />
              <select
                value={branchFilter}
                onChange={(e) => {
                  setBranchFilter(e.target.value)
                  setDeskFilter('todos')
                }}
                className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="todos" className="bg-slate-900">
                  Todas as Unidades
                </option>
                {branches
                  .filter((b) => networkFilter === 'todos' || b.network_id === networkFilter)
                  .map((b) => (
                    <option key={b.id} value={b.id} className="bg-slate-900">
                      {b.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Caixa */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
              <Layers size={14} className="text-amber-400 shrink-0" />
              <select
                value={deskFilter}
                onChange={(e) => setDeskFilter(e.target.value)}
                className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="todos" className="bg-slate-900">
                  Todos os Caixas
                </option>
                {cashDesks.map((d) => (
                  <option key={d.id} value={d.id} className="bg-slate-900">
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          BARRA DE NAVEGAÇÃO NAS 6 ABAS UNIFICADAS
          ======================================================== */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto no-print">
        {[
          { id: 'dre', label: '📊 DRE & Visão Geral' },
          { id: 'vendas', label: `🧾 Cupons de Venda (${salesList.length})` },
          { id: 'caixa', label: `🔐 Fechamentos de Caixa (${shiftsList.length})` },
          { id: 'produtos', label: '🏆 Produtos Mais Vendidos' },
          { id: 'pagamentos', label: '💳 Formas de Pagamento' },
          { id: 'compras', label: `🚚 Compras & Entradas (${purchasesList.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`rounded-xl px-4 py-2.5 text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ========================================================
          ÁREA DE RELATÓRIO EXECUTIVO (IMPRESSA EM A4 E VISÍVEL NA TELA)
          ======================================================== */}
      <div id="print-report-area" className="space-y-6">
        {/* Cabeçalho Timbrado Dinâmico de Impressão A4 */}
        <div className="hidden print-header-report">
          <div className="flex items-center justify-between pb-3 border-b-2 border-slate-900 gap-4">
            <div className="flex items-center gap-3.5">
              <img
                src={activeNetworkLogoUrl}
                alt={activeNetworkName}
                className="print-logo h-14 w-14 rounded-xl object-contain border border-slate-300"
              />
              <div>
                <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                  {activeNetworkName.toUpperCase()} — RELATÓRIO DE {tabLabels[activeTab].toUpperCase()}
                </h1>
                <p className="text-xs font-bold text-slate-700 uppercase mt-0.5">
                  Período: {periodLabels[period]} • {activeNetworkName}
                </p>
              </div>
            </div>
            <div className="text-right text-[11px] text-slate-600 space-y-0.5 shrink-0">
              <p className="font-semibold">Emissão: {new Date().toLocaleString('pt-BR')}</p>
              <p>
                Unidade:{' '}
                {branchFilter !== 'todos'
                  ? branches.find((b) => b.id === branchFilter)?.name
                  : 'Todas as Unidades'}
                {deskFilter !== 'todos' ? ` • ${cashDesks.find((d) => d.id === deskFilter)?.name}` : ''}
              </p>
            </div>
          </div>
        </div>

        {/* --------------------------------------------------------
            ABA 1: 📊 DRE & VISÃO GERAL
            -------------------------------------------------------- */}
        {activeTab === 'dre' && (
          <div className="space-y-6">
            {/* 6 Cards Executivos de Resumo */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Receita Líquida</span>
                <h3 className="text-xl font-black text-emerald-400 mt-2 font-mono">
                  {formatCurrency(dreCalculations.receitaLiquida)}
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">Vendas Concluídas</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">CMV Histórico</span>
                <h3 className="text-xl font-black text-rose-400 mt-2 font-mono">
                  {formatCurrency(dreCalculations.cmvTotal)}
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">Custo dos Produtos</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Lucro Bruto</span>
                <h3 className="text-xl font-black text-amber-400 mt-2 font-mono">
                  {formatCurrency(dreCalculations.lucroBruto)}
                </h3>
                <p className="text-[10px] text-amber-400/80 font-bold mt-1">
                  Margem: {dreCalculations.margemPercent.toFixed(1)}%
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Compras (NF)</span>
                <h3 className="text-xl font-black text-sky-400 mt-2 font-mono">
                  {formatCurrency(dreCalculations.totalCompras)}
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">Entradas de Fornecedor</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase flex items-center gap-1">
                  <Tag size={12} className="text-indigo-400" /> Descontos
                </span>
                <h3 className="text-xl font-black text-indigo-400 mt-2 font-mono">
                  {formatCurrency(dreCalculations.totalDescontos)}
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">Total abatido no PDV</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase flex items-center gap-1">
                  <XCircle size={12} className="text-rose-500" /> Cancelamentos
                </span>
                <h3 className="text-xl font-black text-rose-500 mt-2 font-mono">
                  {dreCalculations.canceladasCount}{' '}
                  <span className="text-xs font-normal text-slate-400">
                    ({formatCurrency(dreCalculations.canceladasTotal)})
                  </span>
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">Estornos auditados</p>
              </div>
            </div>

            {/* Gráficos Comparativos DRE por Unidade */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 no-print">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-7">
                <h4 className="text-xs font-bold text-slate-300 uppercase mb-4">
                  Faturamento x Lucro Bruto por Unidade
                </h4>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dreCalculations.unitList}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} tickFormatter={(val) => `R$ ${val}`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '12px',
                          color: '#fff',
                        }}
                        formatter={(val: any) => formatCurrency(Number(val))}
                      />
                      <Legend />
                      <Bar dataKey="totalSales" name="Faturamento Líquido" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="grossProfit" name="Lucro Bruto" fill="#10b981" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-5 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-300 uppercase mb-2">
                    Participação no Faturamento da Rede
                  </h4>
                  <p className="text-[11px] text-slate-500 mb-4">
                    Contribuição de cada unidade ({periodLabels[period]})
                  </p>
                  <div className="space-y-4">
                    {dreCalculations.unitList.map((unit) => (
                      <div key={unit.id} className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-200">{unit.name}</span>
                          <span className="font-mono text-amber-400 font-bold">{unit.participation.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full"
                            style={{ width: `${Math.min(100, Math.max(0, unit.participation))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Tabela Comparativa de DRE por Unidade com Linha de Total */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm print-card-clean">
              <div className="p-4 border-b border-slate-800 bg-slate-950/60">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  DRE & Performance Detalhada por Unidade
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Fórmula Didática: <span className="text-emerald-400 font-semibold">Faturamento Líquido</span> (-) <span className="text-rose-400 font-semibold">Custo CMV</span> = <span className="text-amber-400 font-semibold">Lucro Bruto</span>
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400 font-bold uppercase">
                    <tr>
                      <th className="py-3 px-4">Unidade</th>
                      <th className="py-3 px-4 text-center">Vendas</th>
                      <th className="py-3 px-4 text-right">Faturamento Líquido</th>
                      <th className="py-3 px-4 text-right">CMV Total</th>
                      <th className="py-3 px-4 text-right">Lucro Bruto</th>
                      <th className="py-3 px-4 text-right">Margem %</th>
                      <th className="py-3 px-4 text-right">Ticket Médio</th>
                      <th className="py-3 px-4 text-right">Participação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-200">
                    {dreCalculations.unitList.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-slate-500">
                          Nenhuma unidade com vendas registradas no período.
                        </td>
                      </tr>
                    ) : (
                      dreCalculations.unitList.map((unit) => (
                        <tr key={unit.id} className="hover:bg-slate-800/30 transition">
                          <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                            <Store size={14} className="text-amber-400" />
                            {unit.name}
                          </td>
                          <td className="py-3 px-4 text-center font-mono">{unit.salesCount}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                            {formatCurrency(unit.totalSales)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-rose-400">
                            {formatCurrency(unit.totalCost)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-amber-400">
                            {formatCurrency(unit.grossProfit)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold">
                            {unit.marginPercent.toFixed(1)}%
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-300">
                            {formatCurrency(unit.ticketMedio)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-amber-300">
                            {unit.participation.toFixed(1)}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {dreCalculations.unitList.length > 0 && (
                    <tfoot className="border-t-2 border-slate-700 bg-slate-950/80 font-bold text-white">
                      <tr>
                        <td className="py-3 px-4 uppercase text-amber-400">Total Consolidado da Rede</td>
                        <td className="py-3 px-4 text-center font-mono">{dreCalculations.totalSalesCount}</td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-400">
                          {formatCurrency(dreCalculations.receitaLiquida)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-rose-400">
                          {formatCurrency(dreCalculations.cmvTotal)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-amber-400">
                          {formatCurrency(dreCalculations.lucroBruto)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {dreCalculations.margemPercent.toFixed(1)}%
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-300">
                          {formatCurrency(dreCalculations.ticketMedioTotal)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-amber-300">100.0%</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --------------------------------------------------------
            ABA 2: 🧾 CUPONS DE VENDA (HISTÓRICO INDIVIDUAL E ESTORNO)
            -------------------------------------------------------- */}
        {activeTab === 'vendas' && (
          <div className="space-y-4">
            {/* 4 Cards de Resumo da Aba Vendas */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Cupons Concluídos</span>
                <h3 className="text-xl font-black text-emerald-400 mt-2 font-mono">
                  {salesTabSummary.completedCount} <span className="text-xs font-normal text-slate-400">({salesTabSummary.totalItens} un)</span>
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">Vendas finalizadas</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Faturamento Líquido</span>
                <h3 className="text-xl font-black text-emerald-400 mt-2 font-mono">
                  {formatCurrency(salesTabSummary.totalLiquido)}
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">Total recebido no período</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Total Descontos</span>
                <h3 className="text-xl font-black text-indigo-400 mt-2 font-mono">
                  {formatCurrency(salesTabSummary.totalDescontos)}
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">Descontos aplicados no PDV</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Cupons Cancelados</span>
                <h3 className="text-xl font-black text-rose-500 mt-2 font-mono">
                  {salesTabSummary.canceledCount}{' '}
                  <span className="text-xs font-normal text-slate-400">
                    ({formatCurrency(salesTabSummary.canceledTotal)})
                  </span>
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">Vendas estornadas</p>
              </div>
            </div>

            {/* Barra de Filtros Internos da Aba Vendas */}
            <div className="flex flex-wrap items-center justify-between gap-3 no-print">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative min-w-[220px] flex-1 max-w-sm">
                  <Search size={14} className="absolute left-3 top-3 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Buscar cupom (#ID) ou operador..."
                    value={saleSearch}
                    onChange={(e) => setSaleSearch(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/60 pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                {/* Filtro Status */}
                <div className="flex items-center gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-800 text-xs">
                  {['todos', 'COMPLETED', 'CANCELED'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setSaleStatusFilter(st)}
                      className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${
                        saleStatusFilter === st
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {st === 'todos' ? 'Todos' : st === 'COMPLETED' ? 'Concluídas' : 'Canceladas'}
                    </button>
                  ))}
                </div>

                {/* Filtro Pagamento */}
                <div className="flex items-center gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-800 text-xs">
                  {['todos', 'Pix', 'Crédito', 'Débito', 'Dinheiro'].map((pm) => (
                    <button
                      key={pm}
                      type="button"
                      onClick={() => setSalePaymentFilter(pm)}
                      className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${
                        salePaymentFilter === pm
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {pm}
                    </button>
                  ))}
                </div>

                {/* Badge de Filtro de Turno */}
                {shiftFilter && (
                  <div className="flex items-center gap-1 rounded-lg bg-amber-500/10 border border-amber-500/40 px-2.5 py-1 text-xs text-amber-300 font-bold">
                    <span>Turno #{shiftFilter}</span>
                    <button
                      type="button"
                      onClick={() => setShiftFilter(null)}
                      className="hover:text-white cursor-pointer ml-1"
                      title="Limpar filtro de turno"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-400 font-mono">
                Exibindo <span className="text-white font-bold">{filteredSalesList.length}</span> venda(s)
              </div>
            </div>

            {/* Tabela de Cupons sem cortes na impressão */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm print-card-clean">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold uppercase">
                    <tr>
                      <th className="py-3 px-3">Cupom</th>
                      <th className="py-3 px-3">Unidade / Caixa</th>
                      <th className="py-3 px-3">Data e Hora</th>
                      <th className="py-3 px-3">Pagamento</th>
                      <th className="py-3 px-3 text-right">Desconto</th>
                      <th className="py-3 px-3 text-center">Itens</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right">Total Líquido</th>
                      <th className="py-3 px-3 text-right no-print">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-200">
                    {filteredSalesList.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-500">
                          Nenhuma venda encontrada com os filtros selecionados.
                        </td>
                      </tr>
                    ) : (
                      filteredSalesList.map((s) => {
                        const isCanceled = s.status === 'CANCELED'
                        const itemsCount = (s.sale_items || []).reduce(
                          (acc: number, item: any) => acc + Number(item.quantity || 0),
                          0
                        )
                        const opName = profilesMap[s.user_id]?.full_name

                        return (
                          <tr key={s.id} className="hover:bg-slate-800/30 transition">
                            <td className="py-2.5 px-3 font-mono font-bold text-amber-400">#{s.id}</td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-slate-200">
                                {s.branch?.name || 'Unidade Geral'}{s.cash_desk?.name ? ` • ${s.cash_desk.name}` : ''}
                              </div>
                              {opName && <div className="text-[10px] text-slate-500">Op: {opName}</div>}
                            </td>
                            <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                              {formatDate(s.date || s.created_at)}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-300">{s.payment_method}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                              {Number(s.discount_amount || 0) > 0 ? formatCurrency(s.discount_amount) : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono">{itemsCount} un</td>
                            <td className="py-2.5 px-3">
                              {isCanceled ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                                  <Ban size={10} /> Cancelada
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                                  <CheckCircle size={10} /> Concluída
                                </span>
                              )}
                            </td>
                            <td
                              className={`py-2.5 px-3 text-right font-mono font-black ${
                                isCanceled ? 'text-slate-500 line-through' : 'text-emerald-400'
                              }`}
                            >
                              {formatCurrency(s.total_amount)}
                            </td>
                            <td className="py-2.5 px-3 text-right no-print">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setSelectedSaleForReceipt(s)}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
                                  title="Ver Cupom Térmico (80mm)"
                                >
                                  <Printer size={15} />
                                </button>
                                {!isCanceled && canCancel && (
                                  <button
                                    type="button"
                                    onClick={() => setCancelingSale(s)}
                                    className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition cursor-pointer"
                                    title="Estornar / Cancelar Venda"
                                  >
                                    <Ban size={15} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                  {filteredSalesList.length > 0 && (
                    <tfoot className="border-t-2 border-slate-700 bg-slate-950/80 font-bold text-white">
                      <tr>
                        <td colSpan={4} className="py-3 px-3 uppercase text-amber-400">
                          Total das Vendas Concluídas ({salesTabSummary.completedCount} cupons)
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-indigo-400">
                          {salesTabSummary.totalDescontos > 0 ? formatCurrency(salesTabSummary.totalDescontos) : '-'}
                        </td>
                        <td className="py-3 px-3 text-center font-mono">{salesTabSummary.totalItens} un</td>
                        <td className="py-3 px-3 text-slate-400 text-center">-</td>
                        <td className="py-3 px-3 text-right font-mono font-black text-emerald-400 text-sm">
                          {formatCurrency(salesTabSummary.totalLiquido)}
                        </td>
                        <td className="no-print"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --------------------------------------------------------
            ABA 3: 🔐 FECHAMENTOS DE CAIXA (TURNOS E TERMINAIS)
            -------------------------------------------------------- */}
        {activeTab === 'caixa' && (
          <div className="space-y-6">
            {/* 4 Cards de Resumo de Caixa */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Turnos no Período</span>
                <h3 className="text-xl font-black text-amber-400 mt-2 font-mono">{cashSummary.shiftsCount}</h3>
                <p className="text-[10px] text-slate-500 mt-1">Aberturas & Fechamentos</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Total Suprimentos</span>
                <h3 className="text-xl font-black text-emerald-400 mt-2 font-mono">
                  {formatCurrency(cashSummary.totalSuprimentos)}
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">Reforços de troco</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Total Sangrias</span>
                <h3 className="text-xl font-black text-rose-400 mt-2 font-mono">
                  {formatCurrency(cashSummary.totalSangrias)}
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">Retiradas de cofre</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Quebra / Sobra Total</span>
                <h3
                  className={`text-xl font-black mt-2 font-mono ${
                    cashSummary.totalQuebraSobra >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {cashSummary.totalQuebraSobra >= 0 ? '+' : ''}
                  {formatCurrency(cashSummary.totalQuebraSobra)}
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">Diferença acumulada</p>
              </div>
            </div>

            {/* Tabela de Turnos de Caixa com Linha de Total */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm print-card-clean">
              <div className="p-4 border-b border-slate-800 bg-slate-950/60">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Histórico Consolidado de Turnos de Caixa
                </h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400 font-bold uppercase">
                    <tr>
                      <th className="py-3 px-3">Turno</th>
                      <th className="py-3 px-3">Unidade / Caixa</th>
                      <th className="py-3 px-3">Abertura / Fechamento</th>
                      <th className="py-3 px-3 text-right">Fundo Inicial</th>
                      <th className="py-3 px-3 text-right">Esperado (Gaveta)</th>
                      <th className="py-3 px-3 text-right">Contado (Gaveta)</th>
                      <th className="py-3 px-3 text-right">Diferença</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right no-print">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-200">
                    {shiftsList.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-500">
                          Nenhum turno de caixa encontrado no período selecionado.
                        </td>
                      </tr>
                    ) : (
                      shiftsList.map((shift) => {
                        const isOpen = shift.status === 'OPEN'
                        const diff =
                          shift.difference !== null && shift.difference !== undefined
                            ? Number(shift.difference)
                            : null
                        const opName = profilesMap[shift.user_id]?.full_name

                        return (
                          <tr key={shift.id} className="hover:bg-slate-800/30 transition">
                            <td className="py-2.5 px-3 font-mono font-bold text-amber-400">
                              #{formatShiftId(shift.id)}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-slate-200">
                                {shift.branch?.name || 'Unidade'}{shift.cash_desk?.name ? ` • ${shift.cash_desk.name}` : ''}
                              </div>
                              {opName && <div className="text-[10px] text-slate-500">Op: {opName}</div>}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                              <div>
                                <span className="text-slate-500 font-bold">AB:</span> {formatDate(shift.opened_at)}
                              </div>
                              {shift.closed_at && (
                                <div>
                                  <span className="text-slate-500 font-bold">FC:</span> {formatDate(shift.closed_at)}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                              {formatCurrency(shift.initial_amount)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                              {shift.system_amount !== null ? formatCurrency(shift.system_amount) : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                              {shift.final_amount !== null ? formatCurrency(shift.final_amount) : 'Em aberto'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold">
                              {diff !== null ? (
                                <span
                                  className={
                                    diff === 0
                                      ? 'text-emerald-400'
                                      : diff > 0
                                      ? 'text-amber-400'
                                      : 'text-rose-400'
                                  }
                                >
                                  {diff > 0 ? '+' : ''}
                                  {formatCurrency(diff)}
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              {isOpen ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                                  Aberto
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                                  Fechado
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right no-print">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenShiftReceipt(shift)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500 hover:text-slate-950 transition cursor-pointer"
                                  title="Ver Comprovante Térmico Consolidado (80mm)"
                                >
                                  <Printer size={13} /> Comprovante
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShiftFilter(String(shift.id))
                                    setActiveTab('vendas')
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition cursor-pointer"
                                  title="Ver Cupons de Venda deste Turno"
                                >
                                  <Search size={13} /> Ver Cupons
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                  {shiftsList.length > 0 && (
                    <tfoot className="border-t-2 border-slate-700 bg-slate-950/80 font-bold text-white">
                      <tr>
                        <td colSpan={3} className="py-3 px-3 uppercase text-amber-400">
                          Total Geral dos Turnos ({cashSummary.shiftsCount} turnos)
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-300">
                          {formatCurrency(cashSummary.totalFundoInicial)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-300">
                          {formatCurrency(cashSummary.totalEsperado)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-white">
                          {formatCurrency(cashSummary.totalContado)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-amber-400">
                          {cashSummary.totalQuebraSobra >= 0 ? '+' : ''}
                          {formatCurrency(cashSummary.totalQuebraSobra)}
                        </td>
                        <td colSpan={2} className="no-print"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Tabela de Desempenho Acumulado por Terminal de Caixa */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm print-card-clean">
              <div className="p-4 border-b border-slate-800 bg-slate-950/60">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Desempenho Acumulado por Terminal de Caixa
                </h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400 font-bold uppercase">
                    <tr>
                      <th className="py-3 px-4">Terminal</th>
                      <th className="py-3 px-4">Unidade</th>
                      <th className="py-3 px-4 text-center">Vendas Concluídas</th>
                      <th className="py-3 px-4 text-right">Faturamento Líquido</th>
                      <th className="py-3 px-4 text-right">CMV Total</th>
                      <th className="py-3 px-4 text-right">Lucro Bruto</th>
                      <th className="py-3 px-4 text-right">Margem %</th>
                      <th className="py-3 px-4 text-right">Ticket Médio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-200">
                    {cashDeskPerformance.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-slate-500">
                          Nenhum terminal com vendas no período.
                        </td>
                      </tr>
                    ) : (
                      cashDeskPerformance.map((desk, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30 transition">
                          <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                            <Layers size={14} className="text-amber-400" />
                            {desk.deskName}
                          </td>
                          <td className="py-3 px-4 text-slate-300">{desk.branchName}</td>
                          <td className="py-3 px-4 text-center font-mono">{desk.salesCount}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                            {formatCurrency(desk.totalSales)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-rose-400">
                            {formatCurrency(desk.totalCost)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-amber-400">
                            {formatCurrency(desk.profit)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold">{desk.margin.toFixed(1)}%</td>
                          <td className="py-3 px-4 text-right font-mono text-slate-300">
                            {formatCurrency(desk.ticketMedio)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {cashDeskPerformance.length > 0 && (
                    <tfoot className="border-t-2 border-slate-700 bg-slate-950/80 font-bold text-white">
                      <tr>
                        <td colSpan={2} className="py-3 px-4 uppercase text-amber-400">
                          Total Geral dos Terminais
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          {cashDeskPerformance.reduce((sum, d) => sum + d.salesCount, 0)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-400">
                          {formatCurrency(cashDeskPerformance.reduce((sum, d) => sum + d.totalSales, 0))}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-rose-400">
                          {formatCurrency(cashDeskPerformance.reduce((sum, d) => sum + d.totalCost, 0))}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-amber-400">
                          {formatCurrency(cashDeskPerformance.reduce((sum, d) => sum + d.profit, 0))}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {(
                            (cashDeskPerformance.reduce((sum, d) => sum + d.profit, 0) /
                              Math.max(1, cashDeskPerformance.reduce((sum, d) => sum + d.totalSales, 0))) *
                            100
                          ).toFixed(1)}%
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-300">
                          {formatCurrency(
                            cashDeskPerformance.reduce((sum, d) => sum + d.totalSales, 0) /
                              Math.max(1, cashDeskPerformance.reduce((sum, d) => sum + d.salesCount, 0))
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --------------------------------------------------------
            ABA 4: 🏆 PRODUTOS MAIS VENDIDOS
            -------------------------------------------------------- */}
        {activeTab === 'produtos' && (
          <div className="space-y-6">
            {/* 4 Cards Didáticos da Aba Produtos */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase flex items-center gap-1">
                  <Award size={12} className="text-amber-400" /> Produto Campeão (#1)
                </span>
                <h3 className="text-base font-black text-amber-400 mt-2 truncate">
                  {productRanking[0]?.name || 'Nenhum'}
                </h3>
                <p className="text-[10px] text-slate-400 font-mono mt-1">
                  {productRanking[0] ? `${productRanking[0].quantity} un vendidas` : '0 vendas'}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Unidades Vendidas</span>
                <h3 className="text-xl font-black text-white mt-2 font-mono">
                  {productRanking.reduce((sum, p) => sum + p.quantity, 0)} un
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">Volume total expedido</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Faturamento Produtos</span>
                <h3 className="text-xl font-black text-emerald-400 mt-2 font-mono">
                  {formatCurrency(productRanking.reduce((sum, p) => sum + p.totalRevenue, 0))}
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">Receita bruta do catálogo</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Lucro Bruto Gerado</span>
                <h3 className="text-xl font-black text-amber-400 mt-2 font-mono">
                  {formatCurrency(productRanking.reduce((sum, p) => sum + p.profit, 0))}
                </h3>
                <p className="text-[10px] text-amber-400/80 font-bold mt-1">
                  Margem:{' '}
                  {(
                    (productRanking.reduce((sum, p) => sum + p.profit, 0) /
                      Math.max(1, productRanking.reduce((sum, p) => sum + p.totalRevenue, 0))) *
                    100
                  ).toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Gráfico de Vendas por Categoria */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 no-print">
              <h4 className="text-xs font-bold text-slate-300 uppercase mb-4">
                Faturamento por Categoria de Produtos
              </h4>
              <div className="h-64 w-full">
                {categorySalesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categorySalesData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} tickFormatter={(val) => `R$ ${val}`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '12px',
                          color: '#fff',
                        }}
                        formatter={(val: any) => formatCurrency(Number(val))}
                      />
                      <Bar dataKey="value" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-500">
                    Sem dados de vendas por categoria no período.
                  </div>
                )}
              </div>
            </div>

            {/* Tabela Ranking de Produtos Mais Vendidos com Linha de Total */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm print-card-clean">
              <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Ranking Geral de Produtos Vendidos
                </h4>
                <span className="text-xs text-slate-400 font-mono">
                  {productRanking.length} produto(s) movimentado(s)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400 font-bold uppercase">
                    <tr>
                      <th className="py-3 px-3 text-center">Pos.</th>
                      <th className="py-3 px-3">SKU</th>
                      <th className="py-3 px-3">Produto</th>
                      <th className="py-3 px-3">Categoria</th>
                      <th className="py-3 px-3 text-center">Qtd. Vendida</th>
                      <th className="py-3 px-3 text-right">Preço Médio</th>
                      <th className="py-3 px-3 text-right">Faturamento</th>
                      <th className="py-3 px-3 text-right">CMV Total</th>
                      <th className="py-3 px-3 text-right">Lucro Bruto</th>
                      <th className="py-3 px-3 text-right">Margem %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-200">
                    {productRanking.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-500">
                          Nenhum produto vendido no período selecionado.
                        </td>
                      </tr>
                    ) : (
                      productRanking.map((p, idx) => (
                        <tr key={p.id} className="hover:bg-slate-800/30 transition">
                          <td className="py-2.5 px-3 text-center font-bold text-amber-400">#{idx + 1}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-400">{p.sku}</td>
                          <td className="py-2.5 px-3 font-bold text-white">{p.name}</td>
                          <td className="py-2.5 px-3 text-slate-300">{p.category}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-white">{p.quantity} un</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                            {formatCurrency(p.avgPrice)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                            {formatCurrency(p.totalRevenue)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-rose-400">
                            {formatCurrency(p.totalCost)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-400">
                            {formatCurrency(p.profit)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold">{p.margin.toFixed(1)}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {productRanking.length > 0 && (
                    <tfoot className="border-t-2 border-slate-700 bg-slate-950/80 font-bold text-white">
                      <tr>
                        <td colSpan={4} className="py-3 px-3 uppercase text-amber-400">
                          Total Geral do Catálogo ({productRanking.length} itens)
                        </td>
                        <td className="py-3 px-3 text-center font-mono">
                          {productRanking.reduce((sum, p) => sum + p.quantity, 0)} un
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-300">
                          {formatCurrency(
                            productRanking.reduce((sum, p) => sum + p.totalRevenue, 0) /
                              Math.max(1, productRanking.reduce((sum, p) => sum + p.quantity, 0))
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-400">
                          {formatCurrency(productRanking.reduce((sum, p) => sum + p.totalRevenue, 0))}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-rose-400">
                          {formatCurrency(productRanking.reduce((sum, p) => sum + p.totalCost, 0))}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-amber-400">
                          {formatCurrency(productRanking.reduce((sum, p) => sum + p.profit, 0))}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {(
                            (productRanking.reduce((sum, p) => sum + p.profit, 0) /
                              Math.max(1, productRanking.reduce((sum, p) => sum + p.totalRevenue, 0))) *
                            100
                          ).toFixed(1)}%
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --------------------------------------------------------
            ABA 5: 💳 FORMAS DE PAGAMENTO
            -------------------------------------------------------- */}
        {activeTab === 'pagamentos' && (
          <div className="space-y-6">
            {/* 3 Cards Didáticos da Aba Pagamentos */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase flex items-center gap-1">
                  <CreditCard size={12} className="text-amber-400" /> Modalidade Principal
                </span>
                <h3 className="text-xl font-black text-amber-400 mt-2">
                  {paymentMethodReport[0]?.name || 'Nenhuma'}
                </h3>
                <p className="text-[10px] text-slate-400 font-mono mt-1">
                  {paymentMethodReport[0]
                    ? `${formatCurrency(paymentMethodReport[0].total)} (${paymentMethodReport[0].participation.toFixed(1)}%)`
                    : 'R$ 0,00'}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Total de Transações</span>
                <h3 className="text-xl font-black text-white mt-2 font-mono">
                  {paymentMethodReport.reduce((sum, p) => sum + p.count, 0)} vendas
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">Cupons concluídos no período</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Valor Total Recebido</span>
                <h3 className="text-xl font-black text-emerald-400 mt-2 font-mono">
                  {formatCurrency(paymentMethodReport.reduce((sum, p) => sum + p.total, 0))}
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">Faturamento líquido auditado</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Tabela de Pagamentos com Linha de Total */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm lg:col-span-7 print-card-clean">
                <div className="p-4 border-b border-slate-800 bg-slate-950/60">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Volume por Modalidade de Pagamento
                  </h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400 font-bold uppercase">
                      <tr>
                        <th className="py-3 px-4">Modalidade</th>
                        <th className="py-3 px-4 text-center">Qtd. Vendas</th>
                        <th className="py-3 px-4 text-right">Faturamento Total</th>
                        <th className="py-3 px-4 text-right">Ticket Médio</th>
                        <th className="py-3 px-4 text-right">Participação %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-200">
                      {paymentMethodReport.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-500">
                            Nenhuma venda registrada no período selecionado.
                          </td>
                        </tr>
                      ) : (
                        paymentMethodReport.map((pm, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/30 transition">
                            <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                              <CreditCard size={14} className="text-amber-400" />
                              {pm.name}
                            </td>
                            <td className="py-3 px-4 text-center font-mono font-semibold">{pm.count}</td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                              {formatCurrency(pm.total)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-300">
                              {formatCurrency(pm.ticketMedio)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-amber-400">
                              {pm.participation.toFixed(1)}%
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {paymentMethodReport.length > 0 && (
                      <tfoot className="border-t-2 border-slate-700 bg-slate-950/80 font-bold text-white">
                        <tr>
                          <td className="py-3 px-4 uppercase text-amber-400">Total Geral (100%)</td>
                          <td className="py-3 px-4 text-center font-mono">
                            {paymentMethodReport.reduce((sum, p) => sum + p.count, 0)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-emerald-400">
                            {formatCurrency(paymentMethodReport.reduce((sum, p) => sum + p.total, 0))}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-300">
                            {formatCurrency(
                              paymentMethodReport.reduce((sum, p) => sum + p.total, 0) /
                                Math.max(1, paymentMethodReport.reduce((sum, p) => sum + p.count, 0))
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-amber-300">100.0%</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* Gráfico de Pizza de Pagamentos */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-5 flex flex-col justify-between no-print">
                <h4 className="text-xs font-bold text-slate-300 uppercase mb-2">
                  Distribuição Percentual de Pagamentos
                </h4>
                <div className="h-64 w-full">
                  {paymentMethodReport.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paymentMethodReport.map((p) => ({ name: p.name, value: p.total }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {paymentMethodReport.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            borderRadius: '12px',
                          }}
                          formatter={(val: any) => formatCurrency(Number(val))}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-500">
                      Sem dados de pagamento no período.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --------------------------------------------------------
            ABA 6: 🚚 COMPRAS & ENTRADAS DE NOTAS
            -------------------------------------------------------- */}
        {activeTab === 'compras' && (
          <div className="space-y-6">
            {/* 3 Cards de Resumo de Compras */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Notas Fiscais de Entrada</span>
                <h3 className="text-xl font-black text-amber-400 mt-2 font-mono">{purchasesList.length}</h3>
                <p className="text-[10px] text-slate-500 mt-1">Lançadas no período</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Unidades Repostas</span>
                <h3 className="text-xl font-black text-sky-400 mt-2 font-mono">
                  {purchasedProductsRanking.reduce((sum, p) => sum + p.quantity, 0)} un
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">Estoque reposto no período</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm print-card-clean">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Total Investido (R$)</span>
                <h3 className="text-xl font-black text-emerald-400 mt-2 font-mono">
                  {formatCurrency(purchasesList.reduce((sum, p) => sum + Number(p.total_amount || 0), 0))}
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">Custo total das NFs lançadas</p>
              </div>
            </div>

            {/* Tabela de Notas Fiscais de Entrada com Linha de Total */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm print-card-clean">
              <div className="p-4 border-b border-slate-800 bg-slate-950/60">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Notas Fiscais de Entrada Lançadas
                </h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400 font-bold uppercase">
                    <tr>
                      <th className="py-3 px-4">Data</th>
                      <th className="py-3 px-4">Número da NF</th>
                      <th className="py-3 px-4">Fornecedor</th>
                      <th className="py-3 px-4">Unidade</th>
                      <th className="py-3 px-4 text-center">Itens</th>
                      <th className="py-3 px-4 text-right">Valor Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-200">
                    {purchasesList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          Nenhuma compra lançada no período selecionado.
                        </td>
                      </tr>
                    ) : (
                      purchasesList.map((pur) => {
                        const itemsQty = (pur.purchase_items || []).reduce(
                          (sum: number, it: any) => sum + Number(it.quantity || 0),
                          0
                        )
                        return (
                          <tr key={pur.id} className="hover:bg-slate-800/30 transition">
                            <td className="py-2.5 px-4 font-mono text-slate-400">
                              {formatDate(pur.date || pur.created_at)}
                            </td>
                            <td className="py-2.5 px-4 font-mono font-bold text-amber-400">
                              {pur.invoice_number || `NF #${pur.id}`}
                            </td>
                            <td className="py-2.5 px-4 font-semibold text-white">{pur.supplier || 'Fornecedor'}</td>
                            <td className="py-2.5 px-4 text-slate-200 font-medium">
                              {pur.branch?.name || 'Unidade Geral'}
                            </td>
                            <td className="py-2.5 px-4 text-center font-mono">{itemsQty} un</td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-400">
                              {formatCurrency(pur.total_amount)}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                  {purchasesList.length > 0 && (
                    <tfoot className="border-t-2 border-slate-700 bg-slate-950/80 font-bold text-white">
                      <tr>
                        <td colSpan={4} className="py-3 px-4 uppercase text-amber-400">
                          Total das Notas Fiscais ({purchasesList.length} NFs)
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          {purchasesList.reduce(
                            (sum, pur) =>
                              sum +
                              (pur.purchase_items || []).reduce(
                                (acc: number, it: any) => acc + Number(it.quantity || 0),
                                0
                              ),
                            0
                          )} un
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-emerald-400 text-sm">
                          {formatCurrency(
                            purchasesList.reduce((sum, pur) => sum + Number(pur.total_amount || 0), 0)
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Ranking de Produtos Comprados com Linha de Total */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm print-card-clean">
              <div className="p-4 border-b border-slate-800 bg-slate-950/60">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Ranking de Produtos Repostos (Compras)
                </h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400 font-bold uppercase">
                    <tr>
                      <th className="py-3 px-4 text-center">Pos.</th>
                      <th className="py-3 px-4">SKU</th>
                      <th className="py-3 px-4">Produto</th>
                      <th className="py-3 px-4 text-center">Qtd. Comprada</th>
                      <th className="py-3 px-4 text-right">Custo Médio</th>
                      <th className="py-3 px-4 text-right">Total Investido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-200">
                    {purchasedProductsRanking.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          Nenhum produto com entrada de compra no período.
                        </td>
                      </tr>
                    ) : (
                      purchasedProductsRanking.map((p, idx) => (
                        <tr key={p.id} className="hover:bg-slate-800/30 transition">
                          <td className="py-2.5 px-4 text-center font-bold text-amber-400">#{idx + 1}</td>
                          <td className="py-2.5 px-4 font-mono text-slate-400">{p.sku}</td>
                          <td className="py-2.5 px-4 font-bold text-white">{p.name}</td>
                          <td className="py-2.5 px-4 text-center font-mono font-bold text-white">{p.quantity} un</td>
                          <td className="py-2.5 px-4 text-right font-mono text-slate-300">
                            {formatCurrency(p.avgCost)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-400">
                            {formatCurrency(p.totalCost)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {purchasedProductsRanking.length > 0 && (
                    <tfoot className="border-t-2 border-slate-700 bg-slate-950/80 font-bold text-white">
                      <tr>
                        <td colSpan={3} className="py-3 px-4 uppercase text-amber-400">
                          Total Reposto em Estoque ({purchasedProductsRanking.length} produtos)
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          {purchasedProductsRanking.reduce((sum, p) => sum + p.quantity, 0)} un
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-300">
                          {formatCurrency(
                            purchasedProductsRanking.reduce((sum, p) => sum + p.totalCost, 0) /
                              Math.max(1, purchasedProductsRanking.reduce((sum, p) => sum + p.quantity, 0))
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-emerald-400 text-sm">
                          {formatCurrency(purchasedProductsRanking.reduce((sum, p) => sum + p.totalCost, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================
          MODAL 1: CUPOM TÉRMICO DE VENDA INDIVIDUAL (80mm)
          ======================================================== */}
      {selectedSaleForReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setSelectedSaleForReceipt(null)}
              className="no-print absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
            >
              <X size={18} />
            </button>

            <ThermalReceipt
              saleId={selectedSaleForReceipt.id}
              date={selectedSaleForReceipt.date || selectedSaleForReceipt.created_at}
              paymentMethod={selectedSaleForReceipt.payment_method}
              items={(selectedSaleForReceipt.sale_items || []).map((it: any) => ({
                product_name: it.products?.name || 'Item',
                quantity: Number(it.quantity || 1),
                unit_price: Number(it.unit_price || 0),
              }))}
              discountAmount={Number(selectedSaleForReceipt.discount_amount || 0)}
              totalAmount={Number(selectedSaleForReceipt.total_amount || 0)}
              branchName={selectedSaleForReceipt.branch?.name}
              cashDeskName={selectedSaleForReceipt.cash_desk?.name}
              operatorName={
                profilesMap[selectedSaleForReceipt.user_id]?.full_name || 'Operador de Caixa'
              }
              networkName={activeNetworkName}
              networkLogoUrl={activeNetworkLogoUrl}
              onClose={() => setSelectedSaleForReceipt(null)}
            />
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 2: COMPROVANTE TÉRMICO DE FECHAMENTO DE TURNO (80mm)
          ======================================================== */}
      {selectedShiftForReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <div className="no-print flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Receipt className="text-amber-400" size={18} />
                Fechamento #{formatShiftId(selectedShiftForReceipt.id)}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setSelectedShiftForReceipt(null)
                  setShiftReceiptData(null)
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto pr-1 flex flex-col items-center">
              {loadingShiftReceipt || !shiftReceiptCalculations ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Carregando comprovante consolidado do turno...
                </div>
              ) : (
                <div className="w-full flex flex-col items-center">
                  {/* Container Térmico 80mm */}
                  <div
                    id="shift-thermal-receipt"
                    className="w-[300px] bg-white text-black p-4 font-mono text-xs shadow-2xl rounded-sm print:m-0 print:p-2 print:w-full print:shadow-none"
                  >
                    {/* Cabeçalho */}
                    <div className="text-center border-b border-dashed border-black pb-3 mb-2 flex flex-col items-center">
                      <img
                        src={activeNetworkLogoUrl}
                        alt={activeNetworkName}
                        className="h-11 w-11 object-contain mb-1.5 rounded-lg border border-neutral-300 print:border-none"
                      />
                      <h2 className="text-sm font-black tracking-tighter uppercase">{activeNetworkName}</h2>
                      <p className="text-[10px] font-bold text-neutral-800">MAPA DE CAIXA / REDUÇÃO Z</p>
                      <div className="text-[10px] font-bold uppercase text-neutral-900 mt-1 space-y-0.5">
                        <p>UNIDADE: {selectedShiftForReceipt.branch?.name || 'Geral'}</p>
                        <p>TERMINAL: {selectedShiftForReceipt.cash_desk?.name || 'Caixa Padrão'}</p>
                        {selectedShiftForReceipt.user_id && (
                          <p className="text-[9px] font-normal text-neutral-700">
                            OPERADOR: {profilesMap[selectedShiftForReceipt.user_id]?.full_name || 'Operador de Caixa'}
                          </p>
                        )}
                        <p className="text-[11px] font-black mt-1">
                          FECHAMENTO DE CAIXA - TURNO #{formatShiftId(selectedShiftForReceipt.id)}
                        </p>
                      </div>
                      <div className="mt-2 text-[9px] text-left border-t border-dashed border-black pt-1 space-y-0.5">
                        <div className="flex justify-between">
                          <span>ABERTURA:</span>
                          <span>{formatDate(selectedShiftForReceipt.opened_at)}</span>
                        </div>
                        {selectedShiftForReceipt.closed_at && (
                          <div className="flex justify-between">
                            <span>FECHAMENTO:</span>
                            <span>{formatDate(selectedShiftForReceipt.closed_at)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold">
                          <span>STATUS:</span>
                          <span>{selectedShiftForReceipt.status === 'OPEN' ? 'EM ABERTO' : 'FECHADO'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Resumo de Vendas por Modalidade */}
                    <div className="border-b border-dashed border-black pb-2 mb-2">
                      <p className="text-[10px] font-bold text-center border-b border-black pb-1 mb-1.5 uppercase">
                        RESUMO DE VENDAS
                      </p>
                      <div className="space-y-1 text-[10px]">
                        <div className="flex justify-between">
                          <span>Dinheiro ({shiftReceiptCalculations.dinheiro.count}x):</span>
                          <span className="font-bold">{formatCurrency(shiftReceiptCalculations.dinheiro.total)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Pix ({shiftReceiptCalculations.pix.count}x):</span>
                          <span className="font-bold">{formatCurrency(shiftReceiptCalculations.pix.total)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Cartão Crédito ({shiftReceiptCalculations.credito.count}x):</span>
                          <span className="font-bold">{formatCurrency(shiftReceiptCalculations.credito.total)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Cartão Débito ({shiftReceiptCalculations.debito.count}x):</span>
                          <span className="font-bold">{formatCurrency(shiftReceiptCalculations.debito.total)}</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-dotted border-black/40">
                          <span>TOTAL BRUTO:</span>
                          <span>{formatCurrency(shiftReceiptCalculations.totalBruto)}</span>
                        </div>
                        {shiftReceiptCalculations.totalDescontos > 0 && (
                          <div className="flex justify-between text-neutral-600">
                            <span>(-) DESCONTOS:</span>
                            <span>-{formatCurrency(shiftReceiptCalculations.totalDescontos)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold text-[11px] pt-1 border-t border-black">
                          <span>FATURAMENTO LÍQUIDO:</span>
                          <span>{formatCurrency(shiftReceiptCalculations.faturamentoLiquido)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Conciliação da Gaveta (Dinheiro) */}
                    <div className="border-b border-dashed border-black pb-2 mb-2">
                      <p className="text-[10px] font-bold text-center border-b border-black pb-1 mb-1.5 uppercase">
                        CONCILIAÇÃO DA GAVETA (DINHEIRO)
                      </p>
                      <div className="space-y-1 text-[10px]">
                        <div className="flex justify-between">
                          <span>(+) Fundo Inicial:</span>
                          <span>{formatCurrency(shiftReceiptCalculations.initialAmount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>(+) Vendas em Dinheiro:</span>
                          <span>{formatCurrency(shiftReceiptCalculations.dinheiro.total)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>(+) Suprimentos ({shiftReceiptCalculations.suprimentos.length}x):</span>
                          <span>{formatCurrency(shiftReceiptCalculations.totalSuprimentos)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>(-) Sangrias ({shiftReceiptCalculations.sangrias.length}x):</span>
                          <span>-{formatCurrency(shiftReceiptCalculations.totalSangrias)}</span>
                        </div>
                        <div className="flex justify-between font-bold border-t border-dashed border-black pt-1 text-[10px]">
                          <span>(=) SALDO ESPERADO:</span>
                          <span>{formatCurrency(shiftReceiptCalculations.systemExpected)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-[10px]">
                          <span>(=) VALOR INFORMADO:</span>
                          <span>
                            {shiftReceiptCalculations.finalCounted !== null
                              ? formatCurrency(shiftReceiptCalculations.finalCounted)
                              : 'Não informado'}
                          </span>
                        </div>
                        {shiftReceiptCalculations.difference !== null && (
                          <div className="flex justify-between font-black text-[11px] pt-1 border-t border-black">
                            <span>DIFERENÇA:</span>
                            <span>
                              {formatCurrency(shiftReceiptCalculations.difference)}{' '}
                              {shiftReceiptCalculations.difference === 0
                                ? '(CONFERIDO)'
                                : shiftReceiptCalculations.difference > 0
                                ? '(SOBRA)'
                                : '(FALTA)'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Rodapé */}
                    <div className="text-center text-[8px] text-neutral-600 space-y-1 pt-1">
                      <p>EMITIDO EM: {new Date().toLocaleString('pt-BR')}</p>
                      <p className="pt-3 border-t border-dashed border-black/40">
                        ASSINATURA DO OPERADOR / CONFERENTE
                      </p>
                    </div>
                  </div>

                  {/* Botões de Ação */}
                  <div className="no-print mt-4 flex w-[300px] gap-2">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="allow-print flex-1 flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition cursor-pointer"
                    >
                      <Printer size={16} />
                      Imprimir Fechamento
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedShiftForReceipt(null)
                        setShiftReceiptData(null)
                      }}
                      className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 3: ESTORNAR / CANCELAR VENDA (RPC cancel_sale)
          ======================================================== */}
      {cancelingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto no-print">
          <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Ban className="text-rose-400" size={18} />
                Estornar Cupom #{cancelingSale.id}
              </h3>
              <button
                type="button"
                onClick={() => setCancelingSale(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCancelSale} className="space-y-4">
              <div className="rounded-xl bg-slate-950 p-3.5 border border-slate-800 text-xs space-y-1.5 text-slate-400">
                <div className="flex justify-between">
                  <span>Valor Total da Venda:</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {formatCurrency(cancelingSale.total_amount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Forma de Pagamento:</span>
                  <span className="text-white font-semibold">{cancelingSale.payment_method}</span>
                </div>
                <div className="flex justify-between">
                  <span>Data da Venda:</span>
                  <span className="text-slate-300 font-mono">
                    {formatDate(cancelingSale.date || cancelingSale.created_at)}
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-300">
                ⚠️ O cancelamento estornará os itens de volta ao estoque e registrará a auditoria de cancelamento no
                banco de dados.
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Motivo / Justificativa do Estorno *</label>
                <textarea
                  required
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Ex: Cliente desistiu da compra / Produto com defeito"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancelingSale(null)}
                  className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={canceling || !cancelReason.trim()}
                  className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50 transition cursor-pointer"
                >
                  <Ban size={14} />
                  {canceling ? 'Estornando...' : 'Confirmar Estorno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function RelatoriosPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-xs text-slate-500">
          Carregando Relatórios & Histórico...
        </div>
      }
    >
      <RelatoriosContent />
    </Suspense>
  )
}
