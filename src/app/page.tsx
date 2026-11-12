'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import {
  DollarSign,
  TrendingUp,
  Package,
  AlertTriangle,
  ShoppingCart,
  Calendar,
  Layers,
  ArrowUpRight,
  Truck,
  Store,
  Award,
  ChevronRight,
  History,
  Computer,
} from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/contexts/auth-context'
import { useNetwork } from '@/contexts/network-context'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts'

interface BranchRanking {
  id: string
  name: string
  salesCount: number
  totalSales: number
  totalCost: number
  profit: number
  marginPercent: number
  percentOfTotal: number
}

type DashboardPeriod = 'hoje' | '7dias' | 'mes'

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [dashPeriod, setDashPeriod] = useState<DashboardPeriod>('mes')

  // Dados brutos carregados
  const [rawSales, setRawSales] = useState<any[]>([])
  const [rawPurchases, setRawPurchases] = useState<any[]>([])
  const [rawProducts, setRawProducts] = useState<any[]>([])
  const [openShifts, setOpenShifts] = useState<any[]>([])
  const [topProducts, setTopProducts] = useState<{ name: string; qty: number; total: number }[]>([])

  const { profile } = useAuth()
  const { selectedBranchId, selectedNetworkId, branches, setSelectedBranchId } = useNetwork()
  const supabase = createClient()

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true)
        const now = new Date()
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
        const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0)
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)

        // Ponto de início mais antigo necessário para cobrir Hoje, 7 Dias e Mês
        const earliestDate = sevenDaysAgo < startOfMonth ? sevenDaysAgo : startOfMonth

        // 1. Consulta Geral de Vendas do Período com Custo Histórico dos Itens
        let salesQuery = supabase
          .from('sales')
          .select(`
            id,
            total_amount,
            discount_amount,
            date,
            branch_id,
            network_id,
            status,
            sale_items (
              quantity,
              unit_price,
              unit_cost,
              products (
                cost_price
              )
            )
          `)
          .neq('status', 'CANCELED')
          .gte('date', earliestDate.toISOString())
          .order('date', { ascending: true })

        // 2. Consulta de Compras
        let purchasesQuery = supabase
          .from('purchases')
          .select('id, total_amount, date, branch_id, network_id')
          .gte('date', earliestDate.toISOString())

        // 3. Produtos e Estoque Crítico (somente ativos da rede/filial)
        let productsQuery = supabase
          .from('products')
          .select('id, name, sku, stock_quantity, min_stock, network_id, branch_id, is_active')
          .eq('is_active', true)

        // 4. Caixas em Operação (Turnos Abertos Agora em Tempo Real)
        let shiftsQuery = supabase
          .from('cash_shifts')
          .select('id, cash_desk_id, branch_id, status, cash_desk:cash_desks(name)')
          .eq('status', 'OPEN')

        // 5. Top 5 Produtos Mais Vendidos (filtrando obrigatoriamente produtos ativos da rede)
        let topItemsQuery = supabase
          .from('sale_items')
          .select('quantity, unit_price, products!inner(id, name, sku, is_active, network_id), sales!inner(status, branch_id, network_id)')
          .eq('sales.status', 'COMPLETED')
          .eq('products.is_active', true)

        // Aplicação de Escopo por Unidade ou Rede
        if (selectedBranchId !== 'ALL') {
          salesQuery = salesQuery.eq('branch_id', selectedBranchId)
          purchasesQuery = purchasesQuery.eq('branch_id', selectedBranchId)
          shiftsQuery = shiftsQuery.eq('branch_id', selectedBranchId)
          topItemsQuery = topItemsQuery.eq('sales.branch_id', selectedBranchId)

          const br = branches.find((b) => b.id === selectedBranchId)
          const netId = selectedNetworkId !== 'ALL' ? selectedNetworkId : br?.network_id
          if (netId) {
            productsQuery = productsQuery.eq('network_id', netId)
            topItemsQuery = topItemsQuery.eq('products.network_id', netId)
          }
        } else if (selectedNetworkId !== 'ALL') {
          salesQuery = salesQuery.eq('network_id', selectedNetworkId)
          purchasesQuery = purchasesQuery.eq('network_id', selectedNetworkId)
          productsQuery = productsQuery.eq('network_id', selectedNetworkId)
          topItemsQuery = topItemsQuery
            .eq('sales.network_id', selectedNetworkId)
            .eq('products.network_id', selectedNetworkId)

          const branchIds = branches.filter((b) => b.network_id === selectedNetworkId).map((b) => b.id)
          if (branchIds.length > 0) {
            shiftsQuery = shiftsQuery.in('branch_id', branchIds)
          }
        }

        const [
          { data: salesData },
          { data: purchasesData },
          { data: productsData },
          { data: shiftsData },
          { data: topData },
        ] = await Promise.all([
          salesQuery,
          purchasesQuery,
          productsQuery,
          shiftsQuery,
          topItemsQuery.limit(300),
        ])

        setRawSales(salesData || [])
        setRawPurchases(purchasesData || [])
        setRawProducts(productsData || [])
        setOpenShifts(shiftsData || [])

        // Agrupamento do Top 5 Produtos Mais Vendidos
        const prodMap: Record<string, { qty: number; total: number }> = {}
        if (topData) {
          topData.forEach((item: any) => {
            const name = item.products?.name || 'Desconhecido'
            if (!prodMap[name]) {
              prodMap[name] = { qty: 0, total: 0 }
            }
            const qty = Number(item.quantity) || 0
            prodMap[name].qty += qty
            prodMap[name].total += qty * Number(item.unit_price || 0)
          })
        }

        const sortedProds = Object.entries(prodMap)
          .map(([name, data]) => ({ name, qty: data.qty, total: data.total }))
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 5)

        setTopProducts(sortedProds)
      } catch (err) {
        console.error('Erro ao buscar métricas do dashboard:', err)
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()
  }, [selectedBranchId, selectedNetworkId, branches])

  // Recálculo Instantâneo de Métricas por Período Selecionado
  const metrics = useMemo(() => {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)

    let periodStart = startOfMonth
    if (dashPeriod === 'hoje') periodStart = startOfDay
    else if (dashPeriod === '7dias') periodStart = sevenDaysAgo

    let periodSales = 0
    let periodCost = 0
    let periodSalesCount = 0
    let periodQtySold = 0

    let todaySales = 0
    let todaySalesCount = 0
    let todayQtySold = 0

    rawSales.forEach((s) => {
      const sDate = new Date(s.date)
      const sAmount = Number(s.total_amount || 0)

      let sCost = 0
      let sQty = 0
      ;(s.sale_items || []).forEach((item: any) => {
        const qty = Number(item.quantity) || 0
        const unitCost =
          Number(item.unit_cost) > 0 ? Number(item.unit_cost) : Number(item.products?.cost_price || 0)
        sCost += qty * unitCost
        sQty += qty
      })

      // Métricas de Hoje (para rodapés informativos)
      if (sDate >= startOfDay) {
        todaySales += sAmount
        todaySalesCount += 1
        todayQtySold += sQty
      }

      // Métricas do Período Selecionado
      if (sDate >= periodStart) {
        periodSales += sAmount
        periodCost += sCost
        periodSalesCount += 1
        periodQtySold += sQty
      }
    })

    const periodProfit = periodSales - periodCost
    const periodMargin = periodSales > 0 ? (periodProfit / periodSales) * 100 : 0
    const periodAvgTicket = periodSalesCount > 0 ? periodSales / periodSalesCount : 0

    // Compras
    let periodPurchases = 0
    let todayPurchases = 0
    rawPurchases.forEach((p) => {
      const pDate = new Date(p.date)
      const pAmount = Number(p.total_amount || 0)
      if (pDate >= startOfDay) todayPurchases += pAmount
      if (pDate >= periodStart) periodPurchases += pAmount
    })

    // Estoque Crítico
    const lowStockCount = rawProducts.filter((p) => p.stock_quantity <= p.min_stock).length

    // Caixas Abertos
    const openShiftsCount = openShifts.length
    const openShiftDeskName = openShifts[0]?.cash_desk?.name || ''

    return {
      periodSales,
      periodProfit,
      periodMargin,
      periodSalesCount,
      periodAvgTicket,
      periodQtySold,
      periodPurchases,
      todaySales,
      todaySalesCount,
      todayQtySold,
      todayPurchases,
      lowStockCount,
      openShiftsCount,
      openShiftDeskName,
    }
  }, [rawSales, rawPurchases, rawProducts, openShifts, dashPeriod])

  // Dados dos Últimos 7 Dias para o Gráfico de Área
  const salesByDay = useMemo(() => {
    const now = new Date()
    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0)

    const daysMap: Record<string, number> = {}
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo.getFullYear(), sevenDaysAgo.getMonth(), sevenDaysAgo.getDate() + i)
      const key = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      daysMap[key] = 0
    }

    rawSales.forEach((s) => {
      const sDate = new Date(s.date)
      if (sDate >= sevenDaysAgo) {
        const key = sDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        if (daysMap[key] !== undefined) {
          daysMap[key] += Number(s.total_amount || 0)
        }
      }
    })

    return Object.entries(daysMap).map(([date, total]) => ({ date, total }))
  }, [rawSales])

  const sevenDaysTotal = useMemo(() => {
    return salesByDay.reduce((sum, d) => sum + d.total, 0)
  }, [salesByDay])

  // Ranking de Performance por Unidade (Mês Corrente com Lucro Real e Margem %)
  const branchRanking = useMemo(() => {
    if (selectedBranchId !== 'ALL' || branches.length === 0) return []

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
    const monthSales = rawSales.filter((s) => new Date(s.date) >= startOfMonth)
    const monthTotal = monthSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)

    const bMap: Record<
      string,
      { name: string; salesCount: number; totalSales: number; totalCost: number }
    > = {}

    branches.forEach((b) => {
      if (selectedNetworkId === 'ALL' || b.network_id === selectedNetworkId) {
        bMap[b.id] = { name: b.name, salesCount: 0, totalSales: 0, totalCost: 0 }
      }
    })

    monthSales.forEach((s: any) => {
      const bId = s.branch_id
      if (bId && bMap[bId]) {
        bMap[bId].totalSales += Number(s.total_amount || 0)
        bMap[bId].salesCount += 1
        ;(s.sale_items || []).forEach((item: any) => {
          const qty = Number(item.quantity) || 0
          const unitCost =
            Number(item.unit_cost) > 0 ? Number(item.unit_cost) : Number(item.products?.cost_price || 0)
          bMap[bId].totalCost += qty * unitCost
        })
      }
    })

    return Object.entries(bMap)
      .map(([id, val]) => {
        const profit = val.totalSales - val.totalCost
        const marginPercent = val.totalSales > 0 ? (profit / val.totalSales) * 100 : 0
        return {
          id,
          name: val.name,
          salesCount: val.salesCount,
          totalSales: val.totalSales,
          totalCost: val.totalCost,
          profit,
          marginPercent,
          percentOfTotal: monthTotal > 0 ? (val.totalSales / monthTotal) * 100 : 0,
        }
      })
      .sort((a, b) => b.totalSales - a.totalSales)
  }, [rawSales, branches, selectedBranchId, selectedNetworkId])

  const maxTopQty = useMemo(() => {
    return topProducts.length > 0 ? Math.max(...topProducts.map((p) => p.qty)) : 1
  }, [topProducts])

  const periodLabel = dashPeriod === 'hoje' ? 'Hoje' : dashPeriod === '7dias' ? '7 Dias' : 'Mês Atual'

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Barra de Topo do Dashboard: Título e Seletor Compacto de Período */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            Visão Geral do Negócio
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Métricas em tempo real, rentabilidade e movimentações operacionais
          </p>
        </div>

        {/* Seletor Rápido: Hoje | 7 Dias | Mês Atual */}
        <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/90 p-1 shadow-sm self-start sm:self-auto">
          {(
            [
              { id: 'hoje', label: 'Hoje' },
              { id: '7dias', label: '7 Dias' },
              { id: 'mes', label: 'Mês Atual' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDashPeriod(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                dashPeriod === tab.id
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de Métricas Principais (6 Cards Executivos) */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Card 1: Faturamento */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Faturamento ({periodLabel})
            </span>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black tracking-tight text-emerald-400">
              {formatCurrency(metrics.periodSales)}
            </h3>
            <p className="mt-1.5 text-[11px] text-slate-400 font-medium truncate">
              Hoje: <span className="text-slate-200 font-bold">{formatCurrency(metrics.todaySales)}</span>{' '}
              <span className="text-slate-500">
                ({metrics.todaySalesCount} {metrics.todaySalesCount === 1 ? 'venda' : 'vendas'})
              </span>
            </p>
          </div>
        </div>

        {/* Card 2: Lucro Real & Margem % */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Lucro Real ({periodLabel})
            </span>
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
              <ArrowUpRight size={18} />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-1">
              <h3 className="text-2xl font-black tracking-tight text-blue-400">
                {formatCurrency(metrics.periodProfit)}
              </h3>
              <span className="rounded-md bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 text-[10px] font-extrabold text-blue-400">
                {metrics.periodMargin.toFixed(1)}%
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400 font-medium">
              Vendas &minus; CMV Histórico
            </p>
          </div>
        </div>

        {/* Card 3: Ticket Médio & Cupons */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Ticket Médio ({periodLabel})
            </span>
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black tracking-tight text-white">
              {formatCurrency(metrics.periodAvgTicket)}
            </h3>
            <p className="mt-1.5 text-[11px] text-slate-400 font-medium">
              <span className="text-slate-200 font-bold">{metrics.periodSalesCount}</span>{' '}
              {metrics.periodSalesCount === 1 ? 'cupom concluído' : 'cupons concluídos'}
            </p>
          </div>
        </div>

        {/* Card 4: Quantidade Vendida */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Itens Vendidos ({periodLabel})
            </span>
            <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-400">
              <ShoppingCart size={18} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black tracking-tight text-white">
              {metrics.periodQtySold} <span className="text-sm font-medium text-slate-400">un</span>
            </h3>
            <p className="mt-1.5 text-[11px] text-slate-400 font-medium">
              Hoje: <span className="text-slate-200 font-bold">{metrics.todayQtySold} un</span> vendidas
            </p>
          </div>
        </div>

        {/* Card 5: Caixas em Operação (Tempo Real) */}
        <Link
          href="/caixa"
          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm hover:border-emerald-500/30 transition group cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider group-hover:text-emerald-400 transition">
              Caixas em Operação
            </span>
            <div
              className={`rounded-lg p-2 ${
                metrics.openShiftsCount > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400'
              }`}
            >
              <Computer size={18} />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center gap-2">
              {metrics.openShiftsCount > 0 && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
              )}
              <h3
                className={`text-2xl font-black tracking-tight ${
                  metrics.openShiftsCount > 0 ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                {metrics.openShiftsCount > 0
                  ? `${metrics.openShiftsCount} Aberto${metrics.openShiftsCount > 1 ? 's' : ''}`
                  : 'Todos Fechados'}
              </h3>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500 group-hover:text-amber-400 transition flex items-center gap-1 font-medium truncate">
              <span>
                {metrics.openShiftsCount > 0
                  ? metrics.openShiftDeskName || 'Terminal ativo agora'
                  : 'Gerenciar turnos'}
              </span>
              <ChevronRight size={12} />
            </p>
          </div>
        </Link>

        {/* Card 6: Estoque Crítico & Compras */}
        <Link
          href="/estoque"
          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm hover:border-rose-500/30 transition group cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider group-hover:text-rose-400 transition">
              Estoque Crítico
            </span>
            <div className="rounded-lg bg-rose-500/10 p-2 text-rose-400">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black tracking-tight text-rose-400">
              {metrics.lowStockCount} <span className="text-sm font-medium text-slate-400">itens</span>
            </h3>
            <p className="mt-1.5 text-[11px] text-slate-400 font-medium truncate">
              Compras ({periodLabel}):{' '}
              <span className="text-slate-200 font-bold">{formatCurrency(metrics.periodPurchases)}</span>
            </p>
          </div>
        </Link>
      </div>

      {/* Seção Central: Gráficos & Top Produtos */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Gráfico de Vendas 7 Dias */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 lg:col-span-2 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <div className="flex items-center gap-2.5">
                <h4 className="text-base font-bold text-white">Vendas dos Últimos 7 Dias</h4>
                <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                  Total: {formatCurrency(sevenDaysTotal)}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Evolução diária do faturamento acumulado</p>
            </div>
            <span className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-300 self-start sm:self-auto">
              Últimos 7 Dias
            </span>
          </div>

          <div className="h-72 w-full">
            {salesByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesByDay}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                  <YAxis
                    stroke="#64748b"
                    fontSize={12}
                    tickFormatter={(val) => `R$ ${val}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#fff',
                    }}
                    formatter={(value: any) => [formatCurrency(Number(value)), 'Vendas']}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#f59e0b', strokeWidth: 2, stroke: '#0f172a' }}
                    activeDot={{ r: 6 }}
                    fillOpacity={1}
                    fill="url(#colorSales)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Nenhum dado registrado ainda.
              </div>
            )}
          </div>
        </div>

        {/* Top 5 Produtos Mais Vendidos */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-base font-bold text-white">Mais Vendidos</h4>
              <span className="text-xs font-semibold text-slate-400">Ranking Qtd</span>
            </div>

            <div className="space-y-3.5">
              {topProducts.length > 0 ? (
                topProducts.map((p, idx) => (
                  <div
                    key={p.name}
                    className="flex flex-col gap-1.5 rounded-xl bg-slate-950/40 p-3 border border-slate-800/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-800 font-bold text-xs text-amber-400">
                          #{idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-xs font-semibold text-white" title={p.name}>
                            {p.name}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {p.qty} unidades vendidas
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-emerald-400 shrink-0">
                        {formatCurrency(p.total)}
                      </span>
                    </div>

                    {/* Barra de Proporção Relativa */}
                    <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(8, (p.qty / maxTopQty) * 100))}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-xs text-slate-500">
                  Nenhuma venda computada ainda para esta rede/unidade.
                </div>
              )}
            </div>
          </div>

          {profile?.role === 'super_admin' || profile?.role === 'network_admin' ? (
            <Link
              href="/relatorios"
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 border border-slate-700 py-3 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition cursor-pointer"
            >
              <History size={16} /> Ver Relatórios & Histórico Completo
            </Link>
          ) : (
            <Link
              href="/pdv"
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-xs font-bold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20 transition cursor-pointer"
            >
              <ShoppingCart size={16} /> Abrir Frente de Caixa
            </Link>
          )}
        </div>
      </div>

      {/* Ranking & Performance de Unidades (Visão Rede / Todas as Unidades) */}
      {selectedBranchId === 'ALL' && branchRanking.length >= 1 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                <Store size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-bold text-white">Ranking de Performance por Unidade</h4>
                  <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20">
                    Visão Rede
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Comparativo de faturamento, margem e participação no mês corrente
                </p>
              </div>
            </div>

            <Link
              href="/relatorios"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 transition"
            >
              Relatório DRE Completo <ChevronRight size={14} />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {branchRanking.map((branch, idx) => {
              const isFirst = idx === 0
              const isSecond = idx === 1
              const medal = isFirst ? '🥇' : isSecond ? '🥈' : '🥉'
              const avgTicket = branch.salesCount > 0 ? branch.totalSales / branch.salesCount : 0

              return (
                <div
                  key={branch.id}
                  className={`relative overflow-hidden rounded-xl border p-5 transition ${
                    isFirst
                      ? 'border-amber-500/30 bg-gradient-to-b from-amber-500/5 to-transparent'
                      : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{medal}</span>
                      <div>
                        <h5 className="text-sm font-bold text-white">{branch.name}</h5>
                        <p className="text-[11px] text-slate-400">
                          {branch.salesCount} {branch.salesCount === 1 ? 'venda' : 'vendas'}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-black text-amber-400">
                      {branch.percentOfTotal.toFixed(1)}%
                    </span>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-black text-emerald-400">
                        {formatCurrency(branch.totalSales)}
                      </span>
                      <span className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                        Margem: {branch.marginPercent.toFixed(1)}%
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/60 text-[11px]">
                      <div>
                        <span className="text-slate-500">Ticket Médio:</span>
                        <p className="font-semibold text-slate-300">{formatCurrency(avgTicket)}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500">Lucro Bruto:</span>
                        <p className="font-semibold text-blue-400">{formatCurrency(branch.profit)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Barra de Progresso de Participação */}
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full ${
                        isFirst ? 'bg-amber-400' : isSecond ? 'bg-blue-400' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, branch.percentOfTotal))}%` }}
                    />
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedBranchId(branch.id)}
                      className="text-[11px] font-semibold text-slate-400 hover:text-amber-400 transition flex items-center gap-1 cursor-pointer"
                    >
                      Filtrar esta Unidade <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
