'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import {
  DollarSign,
  TrendingUp,
  PieChart as PieIcon,
  BarChart3,
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

const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#ec4899', '#8b5cf6']

export default function RelatoriosPage() {
  const [loading, setLoading] = useState(true)
  const [totalSales, setTotalSales] = useState(0)
  const [totalCost, setTotalCost] = useState(0)
  const [grossProfit, setGrossProfit] = useState(0)
  const [salesByPayment, setSalesByPayment] = useState<any[]>([])
  const [salesByCategory, setSalesByCategory] = useState<any[]>([])

  const supabase = createClient()

  useEffect(() => {
    async function loadReports() {
      try {
        setLoading(true)
        const [salesRes, itemsRes] = await Promise.all([
          supabase
            .from('sales')
            .select('id, total_amount, payment_method')
            .neq('status', 'CANCELED'),
          supabase
            .from('sale_items')
            .select('sale_id, quantity, unit_price, product_id, products(name, cost_price, category_id, categories(name)), sales!inner(status)')
            .neq('sales.status', 'CANCELED'),
        ])

        // 1. Totais
        const salesSum = (salesRes.data || []).reduce((sum, s) => sum + Number(s.total_amount), 0)
        let costSum = 0

        // 2. Formas de Pagamento
        const payMap: Record<string, number> = {}
        ;(salesRes.data || []).forEach((s) => {
          payMap[s.payment_method] = (payMap[s.payment_method] || 0) + Number(s.total_amount)
        })

        // 3. Vendas por Categoria
        const catMap: Record<string, number> = {}

        if (itemsRes.data) {
          itemsRes.data.forEach((item: any) => {
            const qty = item.quantity || 0
            const cost = Number(item.products?.cost_price) || 0
            const price = Number(item.unit_price) || 0
            costSum += qty * cost

            const catName = item.products?.categories?.name || 'Sem Categoria'
            catMap[catName] = (catMap[catName] || 0) + qty * price
          })
        }

        setTotalSales(salesSum)
        setTotalCost(costSum)
        setGrossProfit(salesSum - costSum)

        setSalesByPayment(
          Object.entries(payMap).map(([name, value]) => ({ name, value }))
        )

        setSalesByCategory(
          Object.entries(catMap).map(([name, value]) => ({ name, value }))
        )
      } catch (err) {
        console.error('Erro ao gerar relatórios:', err)
      } finally {
        setLoading(false)
      }
    }

    loadReports()
  }, [supabase])

  const marginPercent = totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) : 0

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Cards de Métricas Financeiras / DRE Simplificado */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Receita Bruta */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-400 uppercase">Receita Bruta Total</span>
          <h3 className="text-2xl font-black text-white mt-3 font-mono">
            {formatCurrency(totalSales)}
          </h3>
          <p className="text-[11px] text-slate-500 mt-1">Soma de todas as vendas</p>
        </div>

        {/* CMV - Custo das Mercadorias */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-400 uppercase">CMV (Custo Mercadorias)</span>
          <h3 className="text-2xl font-black text-rose-400 mt-3 font-mono">
            {formatCurrency(totalCost)}
          </h3>
          <p className="text-[11px] text-slate-500 mt-1">Custo de reposição dos produtos</p>
        </div>

        {/* Lucro Bruto Real */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-400 uppercase">Lucro Bruto Real</span>
          <h3 className="text-2xl font-black text-emerald-400 mt-3 font-mono">
            {formatCurrency(grossProfit)}
          </h3>
          <p className="text-[11px] text-slate-500 mt-1">Receita (-) CMV</p>
        </div>

        {/* Margem Bruta */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-400 uppercase">Margem de Lucro Média</span>
          <h3 className="text-2xl font-black text-amber-400 mt-3 font-mono">
            {marginPercent}%
          </h3>
          <p className="text-[11px] text-slate-500 mt-1">Rentabilidade percentual</p>
        </div>
      </div>

      {/* Gráficos de Distribuição */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Vendas por Forma de Pagamento */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h4 className="text-base font-bold text-white mb-2">Vendas por Forma de Pagamento</h4>
          <p className="text-xs text-slate-400 mb-6">Volume financeiro por modalidade (Pix, Cartão, Dinheiro)</p>

          <div className="h-64 w-full">
            {salesByPayment.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={salesByPayment}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {salesByPayment.map((_, index) => (
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
                Sem dados de pagamento no momento.
              </div>
            )}
          </div>
        </div>

        {/* Vendas por Categoria */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h4 className="text-base font-bold text-white mb-2">Faturamento por Categoria</h4>
          <p className="text-xs text-slate-400 mb-6">Desempenho por linha de produtos</p>

          <div className="h-64 w-full">
            {salesByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesByCategory} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis type="number" stroke="#64748b" tickFormatter={(v) => `R$ ${v}`} />
                  <YAxis type="category" dataKey="name" stroke="#64748b" width={100} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '12px',
                    }}
                    formatter={(val: any) => [formatCurrency(Number(val)), 'Faturamento']}
                  />
                  <Bar dataKey="value" fill="#f59e0b" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                Sem dados de categorias no momento.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
