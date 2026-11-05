'use client'

import React, { useEffect, useState } from 'react'
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
  percentOfTotal: number
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState({
    todaySales: 0,
    monthSales: 0,
    estimatedProfit: 0,
    totalQtySold: 0,
    lowStockCount: 0,
    purchasesToday: 0,
  })
  const [salesByDay, setSalesByDay] = useState<{ date: string; total: number }[]>([])
  const [topProducts, setTopProducts] = useState<{ name: string; qty: number; total: number }[]>([])
  const [branchRanking, setBranchRanking] = useState<BranchRanking[]>([])
  const { profile } = useAuth()
  const { selectedBranchId, selectedNetworkId, branches, setSelectedBranchId } = useNetwork()
  const supabase = createClient()

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true)
        const now = new Date()
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0).toISOString()

        // 1. Vendas de Hoje
        let salesTodayQuery = supabase
          .from('sales')
          .select('id, total_amount, discount_amount')
          .neq('status', 'CANCELED')
          .gte('date', startOfDay)

        // 2. Vendas do Mês
        let salesMonthQuery = supabase
          .from('sales')
          .select('id, total_amount, branch_id')
          .neq('status', 'CANCELED')
          .gte('date', startOfMonth)

        // 3. Compras Hoje
        let purchasesTodayQuery = supabase
          .from('purchases')
          .select('total_amount')
          .gte('date', startOfDay)

        // 4. Produtos e Estoque Crítico
        let productsQuery = supabase
          .from('products')
          .select('*')
          .eq('is_active', true)

        if (selectedBranchId !== 'ALL') {
          salesTodayQuery = salesTodayQuery.eq('branch_id', selectedBranchId)
          salesMonthQuery = salesMonthQuery.eq('branch_id', selectedBranchId)
          purchasesTodayQuery = purchasesTodayQuery.eq('branch_id', selectedBranchId)
          const netId = selectedNetworkId !== 'ALL' ? selectedNetworkId : branches.find((b) => b.id === selectedBranchId)?.network_id
          if (netId) {
            productsQuery = productsQuery.eq('network_id', netId)
          }
        } else if (selectedNetworkId !== 'ALL') {
          salesTodayQuery = salesTodayQuery.eq('network_id', selectedNetworkId)
          salesMonthQuery = salesMonthQuery.eq('network_id', selectedNetworkId)
          purchasesTodayQuery = purchasesTodayQuery.eq('network_id', selectedNetworkId)
          productsQuery = productsQuery.eq('network_id', selectedNetworkId)
        }

        const [
          { data: salesTodayData },
          { data: salesMonthData },
          { data: purchasesTodayData },
          { data: productsData },
        ] = await Promise.all([
          salesTodayQuery,
          salesMonthQuery,
          purchasesTodayQuery,
          productsQuery,
        ])

        const todayTotal = (salesTodayData || []).reduce(
          (sum, s) => sum + Number(s.total_amount),
          0
        )

        const monthTotal = (salesMonthData || []).reduce(
          (sum, s) => sum + Number(s.total_amount),
          0
        )

        const purchasesTodayTotal = (purchasesTodayData || []).reduce(
          (sum, p) => sum + Number(p.total_amount),
          0
        )

        const lowStock = (productsData || []).filter(
          (p) => p.stock_quantity <= p.min_stock
        ).length

        // 5. Lucro Estimado Real & Itens Vendidos (Hoje)
        const todaySaleIds = (salesTodayData || []).map((s) => s.id)

        let totalCostToday = 0
        let totalItemsSold = 0

        if (todaySaleIds.length > 0) {
          const { data: saleItemsData } = await supabase
            .from('sale_items')
            .select('quantity, unit_price, unit_cost, product_id, sale_id, products(cost_price)')
            .in('sale_id', todaySaleIds)

          if (saleItemsData) {
            saleItemsData.forEach((item: any) => {
              const qty = Number(item.quantity) || 0
              const unitCost = Number(item.unit_cost) > 0 ? Number(item.unit_cost) : Number(item.products?.cost_price || 0)
              totalCostToday += qty * unitCost
              totalItemsSold += qty
            })
          }
        }

        const profit = todayTotal - totalCostToday

        setMetrics({
          todaySales: todayTotal,
          monthSales: monthTotal,
          estimatedProfit: profit,
          totalQtySold: totalItemsSold,
          lowStockCount: lowStock,
          purchasesToday: purchasesTodayTotal,
        })

        // 6. Dados dos últimos 7 dias para o gráfico
        const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0)

        let recentSalesQuery = supabase
          .from('sales')
          .select('date, total_amount')
          .neq('status', 'CANCELED')
          .gte('date', sevenDaysAgo.toISOString())
          .order('date', { ascending: true })

        if (selectedBranchId !== 'ALL') {
          recentSalesQuery = recentSalesQuery.eq('branch_id', selectedBranchId)
        } else if (selectedNetworkId !== 'ALL') {
          recentSalesQuery = recentSalesQuery.eq('network_id', selectedNetworkId)
        }

        const { data: recentSales } = await recentSalesQuery

        // Agrupar por dia
        const daysMap: Record<string, number> = {}
        for (let i = 0; i < 7; i++) {
          const d = new Date(sevenDaysAgo.getFullYear(), sevenDaysAgo.getMonth(), sevenDaysAgo.getDate() + i)
          const key = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
          daysMap[key] = 0
        }

        if (recentSales) {
          recentSales.forEach((s) => {
            const key = new Date(s.date).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
            })
            if (daysMap[key] !== undefined) {
              daysMap[key] += Number(s.total_amount)
            }
          })
        }

        setSalesByDay(
          Object.entries(daysMap).map(([date, total]) => ({ date, total }))
        )

        // 7. Top Produtos Vendidos (Apenas status = 'COMPLETED' e respeitando a rede/filial ativa)
        let topItemsQuery = supabase
          .from('sale_items')
          .select('quantity, unit_price, products(name), sales!inner(status, branch_id, network_id)')
          .eq('sales.status', 'COMPLETED')

        if (selectedBranchId !== 'ALL') {
          topItemsQuery = topItemsQuery.eq('sales.branch_id', selectedBranchId)
        } else if (selectedNetworkId !== 'ALL') {
          topItemsQuery = topItemsQuery.eq('sales.network_id', selectedNetworkId)
        }

        const { data: topData } = await topItemsQuery.limit(300)

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

        // 8. Ranking Comparativo de Filiais (Visão Rede)
        if (selectedBranchId === 'ALL' && branches.length > 0) {
          const bMap: Record<string, { name: string; salesCount: number; totalSales: number }> = {}

          branches.forEach((b) => {
            if (selectedNetworkId === 'ALL' || b.network_id === selectedNetworkId) {
              bMap[b.id] = { name: b.name, salesCount: 0, totalSales: 0 }
            }
          })

          ;(salesMonthData || []).forEach((s: any) => {
            const bId = s.branch_id
            if (bId && bMap[bId]) {
              bMap[bId].totalSales += Number(s.total_amount)
              bMap[bId].salesCount += 1
            }
          })

          const ranking = Object.entries(bMap)
            .map(([id, val]) => ({
              id,
              name: val.name,
              salesCount: val.salesCount,
              totalSales: val.totalSales,
              percentOfTotal: monthTotal > 0 ? (val.totalSales / monthTotal) * 100 : 0,
            }))
            .sort((a, b) => b.totalSales - a.totalSales)

          setBranchRanking(ranking)
        } else {
          setBranchRanking([])
        }
      } catch (err) {
        console.error('Erro ao buscar métricas do dashboard:', err)
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()
  }, [selectedBranchId, selectedNetworkId, branches])

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Grid de Métricas Principais */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Card 1: Faturamento Hoje */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Faturamento Hoje</span>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black tracking-tight text-emerald-400">
              {formatCurrency(metrics.todaySales)}
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">Total vendido hoje</p>
          </div>
        </div>

        {/* Card 2: Faturamento Mensal */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Faturamento Mês</span>
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black tracking-tight text-white">
              {formatCurrency(metrics.monthSales)}
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">Mês corrente</p>
          </div>
        </div>

        {/* Card 3: Lucro Estimado Real */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Lucro Real</span>
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
              <ArrowUpRight size={18} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black tracking-tight text-blue-400">
              {formatCurrency(metrics.estimatedProfit)}
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">Vendas - Custo CMV</p>
          </div>
        </div>

        {/* Card 4: Quantidade Vendida */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Itens Vendidos</span>
            <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-400">
              <ShoppingCart size={18} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black tracking-tight text-white">
              {metrics.totalQtySold} <span className="text-sm font-medium text-slate-400">un</span>
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">Volume total de saídas</p>
          </div>
        </div>

        {/* Card 5: Estoque Crítico */}
        <Link
          href="/estoque"
          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm hover:border-rose-500/30 transition group"
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
              {metrics.lowStockCount}
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">Produtos no limite mínimo</p>
          </div>
        </Link>

        {/* Card 6: Compras Hoje */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Entradas Hoje</span>
            <div className="rounded-lg bg-cyan-500/10 p-2 text-cyan-400">
              <Truck size={18} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black tracking-tight text-cyan-400">
              {formatCurrency(metrics.purchasesToday)}
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">Reposições hoje</p>
          </div>
        </div>
      </div>

      {/* Seção Central: Gráficos & Top Produtos */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Gráfico de Vendas 7 Dias */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h4 className="text-base font-bold text-white">Vendas dos Últimos 7 Dias</h4>
              <p className="text-xs text-slate-400">Evolução diária do faturamento</p>
            </div>
            <span className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-semibold text-amber-400">
              Diário
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
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-base font-bold text-white">Mais Vendidos</h4>
              <span className="text-xs font-medium text-slate-400">Ranking Qtd</span>
            </div>

            <div className="space-y-4">
              {topProducts.length > 0 ? (
                topProducts.map((p, idx) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between rounded-xl bg-slate-950/40 p-3 border border-slate-800/60"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 font-bold text-xs text-amber-400">
                        #{idx + 1}
                      </span>
                      <div className="overflow-hidden">
                        <p className="truncate text-xs font-semibold text-white max-w-[130px]">
                          {p.name}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {p.qty} unidades vendidas
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-emerald-400">
                      {formatCurrency(p.total)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-xs text-slate-500">
                  Nenhuma venda computada ainda.
                </div>
              )}
            </div>
          </div>

          {profile?.role === 'network_admin' ? (
            <Link
              href="/historico"
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 border border-slate-700 py-3 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition"
            >
              <History size={16} /> Ver Histórico de Vendas
            </Link>
          ) : (
            <Link
              href="/pdv"
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-xs font-bold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20 transition"
            >
              <ShoppingCart size={16} /> Abrir Frente de Caixa
            </Link>
          )}
        </div>
      </div>

      {/* Ranking & Performance de Filiais (Consolidado da Rede) */}
      {selectedBranchId === 'ALL' && branchRanking.length > 1 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                <Store size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-bold text-white">Ranking de Performance por Loja</h4>
                  <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20">
                    Visão Rede
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Comparativo de faturamento e participação percentual no mês
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

                  <div className="mt-4">
                    <div className="text-2xl font-black text-emerald-400">
                      {formatCurrency(branch.totalSales)}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Ticket Médio</span>
                      <span className="font-semibold text-slate-300">{formatCurrency(avgTicket)}</span>
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
                      onClick={() => setSelectedBranchId(branch.id)}
                      className="text-[11px] font-semibold text-slate-400 hover:text-amber-400 transition flex items-center gap-1 cursor-pointer"
                    >
                      Filtrar esta Loja <ChevronRight size={12} />
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
