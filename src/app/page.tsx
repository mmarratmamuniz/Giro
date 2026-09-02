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
} from 'lucide-react'
import Link from 'next/link'
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
  const supabase = createClient()

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true)
        const today = new Date()
        const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString()
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()

        // 1. Vendas de Hoje
        const { data: salesTodayData } = await supabase
          .from('sales')
          .select('total_amount')
          .gte('date', startOfDay)

        const todayTotal = (salesTodayData || []).reduce(
          (sum, s) => sum + Number(s.total_amount),
          0
        )

        // 2. Vendas do Mês
        const { data: salesMonthData } = await supabase
          .from('sales')
          .select('total_amount')
          .gte('date', startOfMonth)

        const monthTotal = (salesMonthData || []).reduce(
          (sum, s) => sum + Number(s.total_amount),
          0
        )

        // 3. Compras Hoje
        const { data: purchasesTodayData } = await supabase
          .from('purchases')
          .select('total_amount')
          .gte('date', startOfDay)

        const purchasesTodayTotal = (purchasesTodayData || []).reduce(
          (sum, p) => sum + Number(p.total_amount),
          0
        )

        // 4. Produtos e Estoque Crítico
        const { data: productsData } = await supabase
          .from('products')
          .select('*')
          .eq('is_active', true)

        const lowStock = (productsData || []).filter(
          (p) => p.stock_quantity <= p.min_stock
        ).length

        // 5. Lucro Estimado Real & Itens Vendidos
        const { data: saleItemsData } = await supabase
          .from('sale_items')
          .select('quantity, unit_price, product_id, products(cost_price)')

        let profit = 0
        let totalItemsSold = 0

        if (saleItemsData) {
          saleItemsData.forEach((item: any) => {
            const qty = item.quantity || 0
            const saleP = Number(item.unit_price) || 0
            const costP = Number(item.products?.cost_price) || 0
            profit += qty * (saleP - costP)
            totalItemsSold += qty
          })
        }

        setMetrics({
          todaySales: todayTotal,
          monthSales: monthTotal,
          estimatedProfit: profit,
          totalQtySold: totalItemsSold,
          lowStockCount: lowStock,
          purchasesToday: purchasesTodayTotal,
        })

        // 6. Dados dos últimos 7 dias para o gráfico
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
        sevenDaysAgo.setHours(0, 0, 0, 0)

        const { data: recentSales } = await supabase
          .from('sales')
          .select('date, total_amount')
          .gte('date', sevenDaysAgo.toISOString())
          .order('date', { ascending: true })

        // Agrupar por dia
        const daysMap: Record<string, number> = {}
        for (let i = 0; i < 7; i++) {
          const d = new Date(sevenDaysAgo)
          d.setDate(d.getDate() + i)
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

        // 7. Top Produtos Vendidos
        const { data: topData } = await supabase
          .from('sale_items')
          .select('quantity, unit_price, products(name)')
          .limit(100)

        const prodMap: Record<string, { qty: number; total: number }> = {}
        if (topData) {
          topData.forEach((item: any) => {
            const name = item.products?.name || 'Desconhecido'
            if (!prodMap[name]) {
              prodMap[name] = { qty: 0, total: 0 }
            }
            prodMap[name].qty += item.quantity
            prodMap[name].total += item.quantity * Number(item.unit_price)
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
  }, [supabase])

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
            <p className="mt-1 text-[11px] text-slate-500">Vendas - Custo de Aquisição</p>
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

          <Link
            href="/pdv"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-xs font-bold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20 transition"
          >
            <ShoppingCart size={16} /> Abrir Frente de Caixa
          </Link>
        </div>
      </div>
    </div>
  )
}
