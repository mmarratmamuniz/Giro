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
  Store,
  ArrowUpRight,
  Award,
  Printer,
  Computer,
  FileBarChart,
  Clock,
  Tag,
  XCircle,
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
import { useNetwork } from '@/contexts/network-context'

const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#ec4899', '#8b5cf6']

type PeriodType = 'dia' | 'semana' | 'mes' | 'ano' | 'tudo'

interface BranchDRE {
  branchId: string
  branchName: string
  salesCount: number
  totalSales: number
  totalCost: number
  grossProfit: number
  marginPercent: number
  ticketMedio: number
  participationPercent: number
}

interface CashDeskReport {
  deskId: string
  deskName: string
  branchName: string
  salesCount: number
  totalSales: number
  totalCost: number
  grossProfit: number
  marginPercent: number
  ticketMedio: number
  participationPercent: number
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

const periodLabels: Record<PeriodType, string> = {
  dia: 'Hoje (Dia)',
  semana: 'Últimos 7 Dias (Semana)',
  mes: 'Mês Atual',
  ano: 'Ano Corrente',
  tudo: 'Todo o Histórico',
}

export default function RelatoriosPage() {
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<PeriodType>('mes')
  const [totalSales, setTotalSales] = useState(0)
  const [totalCost, setTotalCost] = useState(0)
  const [grossProfit, setGrossProfit] = useState(0)
  const [totalDiscounts, setTotalDiscounts] = useState(0)
  const [canceledCount, setCanceledCount] = useState(0)
  const [canceledTotal, setCanceledTotal] = useState(0)
  const [salesByPayment, setSalesByPayment] = useState<any[]>([])
  const [salesByCategory, setSalesByCategory] = useState<any[]>([])
  const [branchDREList, setBranchDREList] = useState<BranchDRE[]>([])
  const [deskReportList, setDeskReportList] = useState<CashDeskReport[]>([])
  const { branches, networks, selectedBranchId, selectedNetworkId } = useNetwork()

  const supabase = createClient()

  useEffect(() => {
    async function loadReports() {
      try {
        setLoading(true)
        let salesQuery = supabase
          .from('sales')
          .select(`
            id,
            total_amount,
            discount_amount,
            status,
            payment_method,
            branch_id,
            cash_desk_id,
            date,
            branch:branches(id, name),
            cash_desk:cash_desks(id, name),
            sale_items (
              id,
              quantity,
              unit_price,
              unit_cost,
              product_id,
              products (
                name,
                cost_price,
                category_id,
                categories (name)
              )
            )
          `)

        // Filtro de Filial / Rede
        if (selectedBranchId !== 'ALL') {
          salesQuery = salesQuery.eq('branch_id', selectedBranchId)
        } else if (selectedNetworkId !== 'ALL') {
          salesQuery = salesQuery.eq('network_id', selectedNetworkId)
        }

        // Filtro de Período Temporal
        const startDate = getPeriodStartDate(period)
        if (startDate) {
          salesQuery = salesQuery.gte('date', startDate.toISOString())
        }

        const { data: allSales, error: salesError } = await salesQuery
        if (salesError) throw salesError

        const salesList = (allSales || []) as any[]

        // Vendas canceladas e concluídas
        const canceledSales = salesList.filter((s) => s.status === 'CANCELED')
        const completedSales = salesList.filter((s) => s.status !== 'CANCELED')

        const cancCount = canceledSales.length
        const cancTotal = canceledSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)
        const discTotal = completedSales.reduce((sum, s) => sum + Number(s.discount_amount || 0), 0)

        setCanceledCount(cancCount)
        setCanceledTotal(cancTotal)
        setTotalDiscounts(discTotal)

        // 1. Totais Gerais
        const salesSum = completedSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)
        let costSum = 0

        // 2. Formas de Pagamento
        const payMap: Record<string, number> = {}
        completedSales.forEach((s) => {
          payMap[s.payment_method] = (payMap[s.payment_method] || 0) + Number(s.total_amount || 0)
        })

        // 3. Vendas por Categoria e CMV Histórico
        const catMap: Record<string, number> = {}

        completedSales.forEach((s) => {
          ;(s.sale_items || []).forEach((item: any) => {
            const qty = Number(item.quantity) || 0
            const unitCost = Number(item.unit_cost) > 0 ? Number(item.unit_cost) : Number(item.products?.cost_price || 0)
            const price = Number(item.unit_price) || 0
            costSum += qty * unitCost

            const catName = item.products?.categories?.name || 'Sem Categoria'
            catMap[catName] = (catMap[catName] || 0) + qty * price
          })
        })

        setTotalSales(salesSum)
        setTotalCost(costSum)
        setGrossProfit(salesSum - costSum)

        setSalesByPayment(
          Object.entries(payMap).map(([name, value]) => ({ name, value }))
        )

        setSalesByCategory(
          Object.entries(catMap).map(([name, value]) => ({ name, value }))
        )

        // 4. DRE e Performance Comparativa por Filial (BI Multi-Lojas)
        const dreMap: Record<
          string,
          { branchName: string; salesCount: number; totalSales: number; totalCost: number }
        > = {}

        branches.forEach((b) => {
          if (selectedNetworkId === 'ALL' || b.network_id === selectedNetworkId) {
            dreMap[b.id] = { branchName: b.name, salesCount: 0, totalSales: 0, totalCost: 0 }
          }
        })

        completedSales.forEach((s) => {
          const bId = s.branch_id || 'sem_filial'
          const bName = s.branch_id ? (s.branch?.name || dreMap[s.branch_id]?.branchName || 'Filial') : 'Sem Filial / Geral'

          if (!dreMap[bId]) {
            dreMap[bId] = { branchName: bName, salesCount: 0, totalSales: 0, totalCost: 0 }
          }
          dreMap[bId].totalSales += Number(s.total_amount || 0)
          dreMap[bId].salesCount += 1

          ;(s.sale_items || []).forEach((item: any) => {
            const qty = Number(item.quantity) || 0
            const unitCost = Number(item.unit_cost) > 0 ? Number(item.unit_cost) : Number(item.products?.cost_price || 0)
            dreMap[bId].totalCost += qty * unitCost
          })
        })

        const dreList: BranchDRE[] = Object.entries(dreMap)
          .map(([bId, val]) => {
            const profit = val.totalSales - val.totalCost
            return {
              branchId: bId,
              branchName: val.branchName,
              salesCount: val.salesCount,
              totalSales: val.totalSales,
              totalCost: val.totalCost,
              grossProfit: profit,
              marginPercent: val.totalSales > 0 ? (profit / val.totalSales) * 100 : 0,
              ticketMedio: val.salesCount > 0 ? val.totalSales / val.salesCount : 0,
              participationPercent: salesSum > 0 ? (val.totalSales / salesSum) * 100 : 0,
            }
          })
          .sort((a, b) => b.totalSales - a.totalSales)

        setBranchDREList(dreList)

        // 5. Histórico e Desempenho por Caixa / Terminal
        const deskMap: Record<
          string,
          { deskName: string; branchName: string; salesCount: number; totalSales: number; totalCost: number }
        > = {}

        completedSales.forEach((s) => {
          const dId = s.cash_desk_id || 'sem_caixa'
          const dName = s.cash_desk?.name || (s.cash_desk_id ? 'Caixa' : 'Sem Caixa / Geral')
          const bName = s.branch?.name || (s.branch_id ? 'Filial' : 'Sem Filial')

          if (!deskMap[dId]) {
            deskMap[dId] = { deskName: dName, branchName: bName, salesCount: 0, totalSales: 0, totalCost: 0 }
          }
          deskMap[dId].totalSales += Number(s.total_amount || 0)
          deskMap[dId].salesCount += 1

          ;(s.sale_items || []).forEach((item: any) => {
            const qty = Number(item.quantity) || 0
            const unitCost = Number(item.unit_cost) > 0 ? Number(item.unit_cost) : Number(item.products?.cost_price || 0)
            deskMap[dId].totalCost += qty * unitCost
          })
        })

        const deskList: CashDeskReport[] = Object.entries(deskMap)
          .map(([dId, val]) => {
            const profit = val.totalSales - val.totalCost
            return {
              deskId: dId,
              deskName: val.deskName,
              branchName: val.branchName,
              salesCount: val.salesCount,
              totalSales: val.totalSales,
              totalCost: val.totalCost,
              grossProfit: profit,
              marginPercent: val.totalSales > 0 ? (profit / val.totalSales) * 100 : 0,
              ticketMedio: val.salesCount > 0 ? val.totalSales / val.salesCount : 0,
              participationPercent: salesSum > 0 ? (val.totalSales / salesSum) * 100 : 0,
            }
          })
          .sort((a, b) => b.totalSales - a.totalSales)

        setDeskReportList(deskList)
      } catch (err) {
        console.error('Erro ao gerar relatórios:', err)
      } finally {
        setLoading(false)
      }
    }

    loadReports()
  }, [branches, selectedBranchId, selectedNetworkId, period])

  const marginPercent = totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) : '0'
  const isConsolidated = selectedBranchId === 'ALL'
  const activeNetworkName = networks.find((n) => n.id === selectedNetworkId)?.name || 'Relatório Consolidado Giro'
  const activeBranchName = branches.find((b) => b.id === selectedBranchId)?.name || 'Todas as Lojas'

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Cabeçalho da Página com Ação de Impressão */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <FileBarChart className="text-amber-400" size={24} />
            Relatórios & DRE / CMV
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Demonstrativo de Resultado do Exercício e rentabilidade financeira consolidada
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2.5 text-xs font-black text-slate-950 transition shadow-md shadow-amber-500/20 cursor-pointer"
          >
            <Printer size={16} />
            Imprimir Relatório (PDF)
          </button>
        </div>
      </div>

      {/* Barra de Seleção de Período Temporal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 shadow-sm no-print">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
          <Clock size={15} className="text-amber-400" />
          <span>Período Selecionado:</span>
          <span className="text-white font-bold">{periodLabels[period]}</span>
        </div>

        <div className="flex flex-wrap rounded-xl bg-slate-950/80 border border-slate-800 p-1 gap-1">
          {[
            { id: 'dia', label: 'Hoje (Dia)' },
            { id: 'semana', label: '7 Dias (Semana)' },
            { id: 'mes', label: 'Mês Atual' },
            { id: 'ano', label: 'Ano Corrente' },
            { id: 'tudo', label: 'Todo o Histórico' },
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id as PeriodType)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                period === p.id
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cabeçalho Exclusivo para Impressão Timbrada (A4 / PDF) */}
      <div className="hidden print:block mb-6 p-4 border-b-2 border-slate-900">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black text-slate-900">GIRO SISTEMA • RELATÓRIO FINANCEIRO & DRE</h1>
            <p className="text-sm font-semibold text-slate-700 mt-1">
              Rede: {activeNetworkName} • Escopo: {activeBranchName}
            </p>
          </div>
          <div className="text-right text-xs text-slate-600">
            <p>Emitido em: {new Date().toLocaleString('pt-BR')}</p>
            <p className="font-bold text-slate-900 uppercase mt-0.5">Período: {periodLabels[period]}</p>
          </div>
        </div>
      </div>

      {/* Cards de Métricas Financeiras / DRE Simplificado + Auditoria */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Receita Bruta */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Receita Bruta</span>
          <h3 className="text-xl font-black text-white mt-2 font-mono">
            {formatCurrency(totalSales)}
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">Vendas no período</p>
        </div>

        {/* CMV - Custo das Mercadorias */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">CMV Histórico</span>
          <h3 className="text-xl font-black text-rose-400 mt-2 font-mono">
            {formatCurrency(totalCost)}
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">Custo dos itens vendidos</p>
        </div>

        {/* Lucro Bruto Real */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Lucro Bruto</span>
          <h3 className="text-xl font-black text-emerald-400 mt-2 font-mono">
            {formatCurrency(grossProfit)}
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">Receita (-) CMV</p>
        </div>

        {/* Margem Bruta */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Margem Média</span>
          <h3 className="text-xl font-black text-amber-400 mt-2 font-mono">
            {marginPercent}%
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">Lucro / Receita</p>
        </div>

        {/* Auditoria: Descontos Concedidos */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 uppercase flex items-center gap-1">
            <Tag size={12} className="text-indigo-400" /> Descontos
          </span>
          <h3 className="text-xl font-black text-indigo-400 mt-2 font-mono">
            {formatCurrency(totalDiscounts)}
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">Descontos concedidos</p>
        </div>

        {/* Auditoria: Cancelamentos */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 uppercase flex items-center gap-1">
            <XCircle size={12} className="text-rose-500" /> Cancelamentos
          </span>
          <h3 className="text-xl font-black text-rose-500 mt-2 font-mono">
            {canceledCount} <span className="text-xs font-normal text-slate-400">({formatCurrency(canceledTotal)})</span>
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">Vendas canceladas</p>
        </div>
      </div>

      {/* PAINEL BI EXECUTIVO: DRE E PERFORMANCE POR FILIAL (Exibido no modo consolidado) */}
      {isConsolidated && branchDREList.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Store size={18} className="text-amber-400" />
                DRE & Desempenho Comparativo por Filial
              </h3>
              <p className="text-xs text-slate-400">
                Auditoria de faturamento, margem e lucratividade entre as lojas ({periodLabels[period]})
              </p>
            </div>
          </div>

          {/* Gráficos Comparativos das Lojas (oculta em impressões simples se necessário) */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 no-print">
            {/* Gráfico 1: Barras Faturamento x Lucro */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-7">
              <h4 className="text-xs font-bold text-slate-300 uppercase mb-4">
                Faturamento x Lucro Bruto por Loja
              </h4>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={branchDREList}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="branchName" stroke="#64748b" fontSize={11} />
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
                    <Bar dataKey="totalSales" name="Faturamento Bruto" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="grossProfit" name="Lucro Bruto" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfico 2: Participação de Mercado */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-5 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-300 uppercase mb-2">
                  Participação no Faturamento da Rede
                </h4>
                <p className="text-[11px] text-slate-500 mb-4">
                  Fatia de contribuição de cada loja no período
                </p>

                <div className="space-y-4">
                  {branchDREList.map((branch, idx) => (
                    <div key={branch.branchId} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-white flex items-center gap-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-400 font-bold">
                            #{idx + 1}
                          </span>
                          {branch.branchName}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-300">{formatCurrency(branch.totalSales)}</span>
                          <span className="font-bold text-amber-400">{branch.participationPercent.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-amber-500 transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(0, branch.participationPercent))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Tabela Detalhada de DRE por Loja */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Filial / Loja</th>
                    <th className="py-3 px-4 text-center">Vendas</th>
                    <th className="py-3 px-4 text-right">Faturamento</th>
                    <th className="py-3 px-4 text-right">CMV (Custo)</th>
                    <th className="py-3 px-4 text-right">Lucro Bruto</th>
                    <th className="py-3 px-4 text-right">Margem</th>
                    <th className="py-3 px-4 text-right">Ticket Médio</th>
                    <th className="py-3 px-4 text-right">Part. Rede</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {branchDREList.map((branch) => (
                    <tr key={branch.branchId} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                        <Store size={15} className="text-amber-400" />
                        {branch.branchName}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono">{branch.salesCount}</td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                        {formatCurrency(branch.totalSales)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-rose-400">
                        {formatCurrency(branch.totalCost)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-emerald-400 font-bold">
                        {formatCurrency(branch.grossProfit)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-amber-400 font-bold">
                        {branch.marginPercent.toFixed(1)}%
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                        {formatCurrency(branch.ticketMedio)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-200">
                        {branch.participationPercent.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                  {/* Linha Consolidada de Totais da Rede */}
                  <tr className="bg-slate-950 font-bold border-t-2 border-slate-700 text-amber-400">
                    <td className="py-3.5 px-4 uppercase tracking-wider text-xs">Total Consolidado (Rede)</td>
                    <td className="py-3.5 px-4 text-center font-mono">
                      {branchDREList.reduce((acc, b) => acc + b.salesCount, 0)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-white text-sm">
                      {formatCurrency(totalSales)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-rose-400 text-sm">
                      {formatCurrency(totalCost)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-emerald-400 text-sm">
                      {formatCurrency(grossProfit)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-amber-400 text-sm">
                      {marginPercent}%
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                      {formatCurrency(
                        branchDREList.reduce((acc, b) => acc + b.salesCount, 0) > 0
                          ? totalSales / branchDREList.reduce((acc, b) => acc + b.salesCount, 0)
                          : 0
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* NOVA SEÇÃO: HISTÓRICO E DESEMPENHO POR CAIXA / TERMINAL */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Computer size={18} className="text-blue-400" />
              Histórico & Desempenho por Caixa / Terminal
            </h3>
            <p className="text-xs text-slate-400">
              Auditoria de vendas, CMV e rentabilidade individualizada por ponto de venda ({periodLabels[period]})
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Caixa / Terminal</th>
                  <th className="py-3 px-4">Filial</th>
                  <th className="py-3 px-4 text-center">Qtd Vendas</th>
                  <th className="py-3 px-4 text-right">Faturamento Bruto</th>
                  <th className="py-3 px-4 text-right">CMV</th>
                  <th className="py-3 px-4 text-right">Lucro Bruto</th>
                  <th className="py-3 px-4 text-right">Margem %</th>
                  <th className="py-3 px-4 text-right">Ticket Médio</th>
                  <th className="py-3 px-4 text-right">Part. %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {deskReportList.length > 0 ? (
                  deskReportList.map((desk) => (
                    <tr key={desk.deskId} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                        <Computer size={15} className="text-blue-400" />
                        {desk.deskName}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">{desk.branchName}</td>
                      <td className="py-3.5 px-4 text-center font-mono">{desk.salesCount}</td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                        {formatCurrency(desk.totalSales)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-rose-400">
                        {formatCurrency(desk.totalCost)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-emerald-400 font-bold">
                        {formatCurrency(desk.grossProfit)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-amber-400 font-bold">
                        {desk.marginPercent.toFixed(1)}%
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                        {formatCurrency(desk.ticketMedio)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-200">
                        {desk.participationPercent.toFixed(1)}%
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      Nenhuma venda registrada nos caixas para este período.
                    </td>
                  </tr>
                )}
                {/* Linha Consolidada de Caixas */}
                {deskReportList.length > 0 && (
                  <tr className="bg-slate-950 font-bold border-t-2 border-slate-700 text-blue-400">
                    <td className="py-3.5 px-4 uppercase tracking-wider text-xs" colSpan={2}>Total Consolidado dos Caixas</td>
                    <td className="py-3.5 px-4 text-center font-mono">
                      {deskReportList.reduce((acc, d) => acc + d.salesCount, 0)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-white text-sm">
                      {formatCurrency(totalSales)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-rose-400 text-sm">
                      {formatCurrency(totalCost)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-emerald-400 text-sm">
                      {formatCurrency(grossProfit)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-amber-400 text-sm">
                      {marginPercent}%
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                      {formatCurrency(
                        deskReportList.reduce((acc, d) => acc + d.salesCount, 0) > 0
                          ? totalSales / deskReportList.reduce((acc, d) => acc + d.salesCount, 0)
                          : 0
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono">100%</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Gráficos de Distribuição por Pagamento e Categoria */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 no-print">
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
                Sem dados de pagamento no período selecionado.
              </div>
            )}
          </div>
        </div>

        {/* Vendas por Categoria */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h4 className="text-base font-bold text-white mb-2">Faturamento por Categoria</h4>
          <p className="text-xs text-slate-400 mb-6">Mix de produtos mais rentáveis</p>

          <div className="h-64 w-full">
            {salesByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesByCategory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} tickFormatter={(val) => `R$ ${val}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '12px',
                    }}
                    formatter={(val: any) => formatCurrency(Number(val))}
                  />
                  <Bar dataKey="value" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                Sem dados de vendas por categoria no período selecionado.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Regras CSS de Impressão Global */}
      <style jsx global>{`
        @media print {
          body {
            background-color: #ffffff !important;
            color: #0f172a !important;
          }
          aside, header, nav, .no-print, button {
            display: none !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
          }
          .rounded-2xl {
            border: 1px solid #cbd5e1 !important;
            background: #ffffff !important;
            box-shadow: none !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          thead {
            background: #f1f5f9 !important;
          }
          th, td {
            color: #0f172a !important;
            border-bottom: 1px solid #e2e8f0 !important;
          }
          .text-white {
            color: #0f172a !important;
          }
          .text-slate-300, .text-slate-400, .text-slate-500 {
            color: #475569 !important;
          }
        }
      `}</style>
    </div>
  )
}
