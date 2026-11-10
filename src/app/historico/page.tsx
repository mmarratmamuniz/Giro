'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { useFeedback } from '@/contexts/feedback-context'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ThermalReceipt } from '@/components/pdv/thermal-receipt'
import { useNetwork } from '@/contexts/network-context'
import {
  History,
  X,
  Receipt,
  Search,
  Ban,
  Printer,
  Store,
  Computer,
  Layers,
  ArrowRight,
  Clock,
  DollarSign,
  FileText,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'

export default function HistoricoVendasPage() {
  const [activeTab, setActiveTab] = useState<'vendas' | 'fechamentos'>('vendas')
  const [sales, setSales] = useState<any[]>([])
  const [shifts, setShifts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingShifts, setLoadingShifts] = useState(true)

  // Filtro específico de turno para cupons de venda
  const [shiftFilter, setShiftFilter] = useState<string | null>(null)

  // Filtros gerais
  const [selectedSale, setSelectedSale] = useState<any | null>(null)
  const [search, setSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<string>('todos')
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const [branchFilter, setBranchFilter] = useState<string>('todos')
  const [deskFilter, setDeskFilter] = useState<string>('todos')
  const [cashDesks, setCashDesks] = useState<any[]>([])

  // Modal Comprovante Térmico de Fechamento de Caixa
  const [selectedShiftReceipt, setSelectedShiftReceipt] = useState<any | null>(null)
  const [loadingShiftReceipt, setLoadingShiftReceipt] = useState(false)
  const [shiftReceiptData, setShiftReceiptData] = useState<{
    shift: any
    sales: any[]
    transactions: any[]
  } | null>(null)

  // Cancelamento
  const [cancelingSale, setCancelingSale] = useState<any | null>(null)
  const [cancelReason, setCancelReason] = useState<string>('')
  const [canceling, setCanceling] = useState(false)

  const { user, profile } = useAuth()
  const { showSuccess, showError } = useFeedback()
  const { selectedBranchId, selectedNetworkId, branches } = useNetwork()
  const [supabase] = useState(() => createClient())

  const canCancel =
    profile?.role === 'super_admin' ||
    profile?.role === 'network_admin' ||
    profile?.role === 'unit_admin' ||
    profile?.role === 'branch_admin'

  async function loadSales() {
    try {
      setLoading(true)
      let query = supabase
        .from('sales')
        .select('*, branch:branches(name), cash_desk:cash_desks(name), sale_items(*, product:products(name, sku))')
        .order('created_at', { ascending: false })
        .limit(100)

      if (selectedBranchId !== 'ALL') {
        query = query.eq('branch_id', selectedBranchId)
      } else if (selectedNetworkId !== 'ALL') {
        query = query.eq('network_id', selectedNetworkId)
      }

      const { data, error } = await query

      if (error) throw error
      if (data) setSales(data)
    } catch (err) {
      console.error('Erro ao carregar histórico de vendas:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadShifts() {
    try {
      setLoadingShifts(true)
      let query = supabase
        .from('cash_shifts')
        .select('*, branch:branches(name), cash_desk:cash_desks(name)')
        .order('opened_at', { ascending: false })
        .limit(100)

      if (selectedBranchId !== 'ALL') {
        query = query.eq('branch_id', selectedBranchId)
      } else if (selectedNetworkId !== 'ALL') {
        query = query.eq('network_id', selectedNetworkId)
      }

      const { data, error } = await query

      if (error) throw error
      if (data) setShifts(data)
    } catch (err) {
      console.error('Erro ao carregar histórico de fechamentos de caixa:', err)
    } finally {
      setLoadingShifts(false)
    }
  }

  useEffect(() => {
    loadSales()
    loadShifts()
  }, [selectedBranchId, selectedNetworkId])

  // Reseta filtros de filial e caixa quando a filial/rede do cabeçalho mudar
  useEffect(() => {
    setBranchFilter('todos')
    setDeskFilter('todos')
  }, [selectedBranchId, selectedNetworkId])

  // Carregar lista de caixas para o filtro dinâmico
  useEffect(() => {
    async function loadCashDesks() {
      let query = supabase
        .from('cash_desks')
        .select('id, name, branch_id, branch:branches(name, network_id)')
        .order('name')

      if (branchFilter !== 'todos') {
        query = query.eq('branch_id', branchFilter)
      } else if (selectedBranchId !== 'ALL') {
        query = query.eq('branch_id', selectedBranchId)
      } else if (selectedNetworkId !== 'ALL') {
        const branchIdsInNet = branches.filter((b) => b.network_id === selectedNetworkId).map((b) => b.id)
        if (branchIdsInNet.length > 0) {
          query = query.in('branch_id', branchIdsInNet)
        }
      }

      const { data } = await query
      if (data) setCashDesks(data)
    }
    loadCashDesks()
  }, [branchFilter, selectedBranchId, selectedNetworkId, branches, supabase])

  // Abrir Comprovante Térmico Consolidado do Turno
  async function handleOpenShiftReceipt(shift: any) {
    setSelectedShiftReceipt(shift)
    setLoadingShiftReceipt(true)
    try {
      const [{ data: salesData }, { data: txData }] = await Promise.all([
        supabase
          .from('sales')
          .select('id, status, payment_method, gross_amount, discount_amount, total_amount, created_at')
          .eq('shift_id', shift.id),
        supabase
          .from('cash_transactions')
          .select('*')
          .eq('shift_id', shift.id)
          .order('created_at', { ascending: true }),
      ])

      setShiftReceiptData({
        shift,
        sales: salesData || [],
        transactions: txData || [],
      })
    } catch (err) {
      console.error('Erro ao carregar dados do fechamento do turno:', err)
      showError('Erro ao abrir comprovante', 'Não foi possível carregar os dados consolidados do turno.')
    } finally {
      setLoadingShiftReceipt(false)
    }
  }

  // Estornar / Cancelar Venda via RPC
  const handleCancelSale = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cancelingSale) return

    if (!canCancel) {
      showError('Permissão Negada', 'Operadores de caixa não possuem autorização para estornar vendas. Solicite a um gerente/administrador.')
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

      showSuccess(
        'Venda Estornada!',
        `Cupom #${cancelingSale.id} cancelado e estoque estornado com sucesso.`
      )
      setCancelingSale(null)
      setCancelReason('')
      loadSales()
      loadShifts()
    } catch (err: any) {
      showError('Erro ao cancelar venda', err.message)
    } finally {
      setCanceling(false)
    }
  }

  // Helper seguro para formatar ID de Turno (seja número inteiro ou UUID)
  const formatShiftId = (id: any) => {
    if (id === null || id === undefined) return ''
    const str = String(id)
    return str.length > 8 ? str.slice(0, 8) : str
  }

  // Filtro de Vendas
  const filteredSales = sales.filter((s) => {
    const matchesPayment = paymentFilter === 'todos' ? true : s.payment_method === paymentFilter
    const matchesStatus = statusFilter === 'todos' ? true : s.status === statusFilter
    const matchesSearch = search.trim() ? String(s.id).includes(search.trim()) : true
    const matchesBranch = branchFilter === 'todos' ? true : s.branch_id === branchFilter
    const matchesDesk = deskFilter === 'todos' ? true : s.cash_desk_id === deskFilter
    const matchesShift = shiftFilter ? String(s.shift_id) === String(shiftFilter) : true
    return matchesPayment && matchesStatus && matchesSearch && matchesBranch && matchesDesk && matchesShift
  })

  // Filtro de Fechamentos de Caixa
  const filteredShifts = shifts.filter((s) => {
    const matchesBranch = branchFilter === 'todos' ? true : s.branch_id === branchFilter
    const matchesDesk = deskFilter === 'todos' ? true : s.cash_desk_id === deskFilter
    const matchesSearch = search.trim()
      ? s.id.toString().toLowerCase().includes(search.trim().toLowerCase()) ||
        (s.cash_desk?.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (s.branch?.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (s.notes || '').toLowerCase().includes(search.toLowerCase())
      : true
    return matchesBranch && matchesDesk && matchesSearch
  })

  const totalFilteredSalesAmount = filteredSales
    .filter((s) => s.status !== 'CANCELED')
    .reduce((sum, s) => sum + Number(s.total_amount), 0)

  // Cálculos do Comprovante Consolidado de Fechamento de Caixa
  const shiftReceiptCalculations = React.useMemo(() => {
    if (!shiftReceiptData) return null

    const { shift, sales: shiftSales, transactions } = shiftReceiptData
    const completedSales = shiftSales.filter((s) => s.status === 'COMPLETED')
    const canceledSales = shiftSales.filter((s) => s.status === 'CANCELED')

    const getPaymentTotals = (methodNames: string[]) => {
      const matching = completedSales.filter((s) =>
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

    const totalBruto = completedSales.reduce((sum, s) => {
      const gross = Number(s.gross_amount)
      if (!isNaN(gross) && gross > 0) return sum + gross
      return sum + Number(s.total_amount || 0) + Number(s.discount_amount || 0)
    }, 0)

    const totalDescontos = completedSales.reduce((sum, s) => sum + Number(s.discount_amount || 0), 0)
    const faturamentoLiquido = completedSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)

    const canceladasCount = canceledSales.length
    const canceladasTotal = canceledSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)

    // Conciliação de Gaveta (Dinheiro)
    const initialAmount = Number(shift.initial_amount || 0)
    const cashSalesAmount = dinheiro.total

    const suprimentos = transactions.filter((t) => t.type === 'SUPRIMENTO')
    const totalSuprimentos = suprimentos.reduce((sum, t) => sum + Number(t.amount || 0), 0)

    const sangrias = transactions.filter((t) => t.type === 'SANGRIA')
    const totalSangrias = sangrias.reduce((sum, t) => sum + Number(t.amount || 0), 0)

    const systemExpected =
      shift.system_amount !== null && shift.system_amount !== undefined
        ? Number(shift.system_amount)
        : initialAmount + cashSalesAmount + totalSuprimentos - totalSangrias

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
      canceladasCount,
      canceladasTotal,
      initialAmount,
      cashSalesAmount,
      suprimentos,
      totalSuprimentos,
      sangrias,
      totalSangrias,
      systemExpected,
      finalCounted,
      difference,
    }
  }, [shiftReceiptData])

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Estilos Globais de Impressão Térmica 80mm */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body * {
                visibility: hidden;
              }
              #thermal-receipt, #thermal-receipt *,
              #shift-thermal-receipt, #shift-thermal-receipt * {
                visibility: visible;
              }
              #thermal-receipt, #shift-thermal-receipt {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                margin: 0;
                padding: 10px;
                box-shadow: none !important;
                border: none !important;
              }
            }
          `,
        }}
      />

      {/* SELETOR DE ABAS NO TOPO */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('vendas')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition cursor-pointer ${
              activeTab === 'vendas'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800/80 border border-slate-800'
            }`}
          >
            <Receipt size={16} />
            <span>Cupons de Venda</span>
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                activeTab === 'vendas' ? 'bg-slate-950/30 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {filteredSales.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('fechamentos')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition cursor-pointer ${
              activeTab === 'fechamentos'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800/80 border border-slate-800'
            }`}
          >
            <Layers size={16} />
            <span>Fechamentos de Caixa</span>
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                activeTab === 'fechamentos' ? 'bg-slate-950/30 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {filteredShifts.length}
            </span>
          </button>
        </div>

        {/* Chip de Filtro por Turno na aba de vendas */}
        {activeTab === 'vendas' && shiftFilter && (
          <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 text-xs text-amber-300 animate-in fade-in">
            <span>
              Filtrando Vendas do <strong>Turno #{formatShiftId(shiftFilter)}</strong>
            </span>
            <button
              type="button"
              onClick={() => setShiftFilter(null)}
              className="rounded-md p-1 hover:bg-amber-500/20 text-amber-400 hover:text-white transition cursor-pointer"
              title="Limpar filtro de turno"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Barra de Filtros Completa */}
      <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3 justify-between items-stretch lg:items-center">
          {/* Busca por cupom ou identificador */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3.5 top-3 text-slate-500" size={16} />
            <input
              type="text"
              placeholder={
                activeTab === 'vendas'
                  ? 'Buscar por número do cupom (#ID)...'
                  : 'Buscar por turno (#ID), terminal ou motivo...'
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* Filtros de Filial e Caixa */}
          <div className="flex flex-wrap items-center gap-2">
            {branches.length > 0 && selectedBranchId === 'ALL' && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs">
                <Store size={15} className="text-amber-400 shrink-0" />
                <span className="text-slate-400 font-medium">Filial:</span>
                <select
                  value={branchFilter}
                  onChange={(e) => {
                    setBranchFilter(e.target.value)
                    setDeskFilter('todos')
                  }}
                  className="bg-transparent font-bold text-white focus:outline-none cursor-pointer"
                >
                  <option value="todos" className="bg-slate-900 text-white">
                    Todas as Lojas
                  </option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id} className="bg-slate-900 text-white">
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Seletor de Caixa / Terminal */}
            <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs">
              <Computer size={15} className="text-blue-400 shrink-0" />
              <span className="text-slate-400 font-medium">Caixa:</span>
              <select
                value={deskFilter}
                onChange={(e) => setDeskFilter(e.target.value)}
                className="bg-transparent font-bold text-white focus:outline-none cursor-pointer"
              >
                <option value="todos" className="bg-slate-900 text-white">
                  Todos os Caixas
                </option>
                {cashDesks.map((d) => (
                  <option key={d.id} value={d.id} className="bg-slate-900 text-white">
                    {d.name} {branchFilter === 'todos' && d.branch?.name ? `(${d.branch.name})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Linha 2 de Filtros (Apenas para aba de Vendas) */}
        {activeTab === 'vendas' ? (
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center pt-3 border-t border-slate-800/80">
            <div className="flex flex-wrap items-center gap-2">
              {/* Status */}
              <div className="flex rounded-xl bg-slate-950/60 border border-slate-800 p-0.5">
                <button
                  type="button"
                  onClick={() => setStatusFilter('todos')}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                    statusFilter === 'todos' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('COMPLETED')}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                    statusFilter === 'COMPLETED' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Concluídas
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('CANCELED')}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                    statusFilter === 'CANCELED' ? 'bg-rose-500 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Canceladas
                </button>
              </div>

              {/* Formas de Pagamento */}
              <div className="flex gap-1.5 overflow-x-auto">
                {['todos', 'Pix', 'Crédito', 'Débito', 'Dinheiro'].map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setPaymentFilter(m)}
                    className={`rounded-xl px-2.5 py-1.5 text-xs font-bold transition capitalize cursor-pointer ${
                      paymentFilter === m
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'bg-slate-950/60 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Resumo Dinâmico de Vendas */}
            <div className="text-xs text-slate-400 font-medium">
              <span className="font-bold text-white">{filteredSales.length}</span>{' '}
              {filteredSales.length === 1 ? 'venda' : 'vendas'} • Total:{' '}
              <span className="font-bold text-emerald-400">{formatCurrency(totalFilteredSalesAmount)}</span>
            </div>
          </div>
        ) : (
          /* Resumo Dinâmico de Fechamentos */
          <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs text-slate-400 font-medium">
            <div>
              Exibindo <span className="font-bold text-white">{filteredShifts.length}</span> turno(s) de caixa.
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Sem Diferença
              </span>
              <span className="inline-flex items-center gap-1.5 text-rose-400 font-semibold">
                <span className="h-2 w-2 rounded-full bg-rose-400" /> Falta
              </span>
              <span className="inline-flex items-center gap-1.5 text-amber-400 font-semibold">
                <span className="h-2 w-2 rounded-full bg-amber-400" /> Sobra
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ABA 1: TABELA DE CUPONS DE VENDA */}
      {activeTab === 'vendas' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold uppercase">
                <tr>
                  <th className="py-3.5 px-4">Cupom</th>
                  <th className="py-3.5 px-4">Filial / Caixa</th>
                  <th className="py-3.5 px-4">Data e Hora</th>
                  <th className="py-3.5 px-4">Forma de Pagamento</th>
                  <th className="py-3.5 px-4">Desconto</th>
                  <th className="py-3.5 px-4">Itens</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Total Líquido</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      Carregando cupons de venda...
                    </td>
                  </tr>
                ) : filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      Nenhuma venda encontrada com os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((s) => {
                    const isCanceled = s.status === 'CANCELED'
                    return (
                      <tr key={s.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-4 font-mono font-bold text-amber-400">#{s.id}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-950 border border-slate-800 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                            <Store size={10} /> {s.branch?.name || 'Geral'}{' '}
                            {s.cash_desk?.name ? `• ${s.cash_desk?.name}` : ''}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400">{formatDate(s.date || s.created_at)}</td>
                        <td className="py-3 px-4 font-semibold text-white">{s.payment_method}</td>
                        <td className="py-3 px-4 text-slate-400 font-mono">
                          {s.discount_amount > 0 ? (
                            <span className="text-rose-400 font-bold">-{formatCurrency(s.discount_amount)}</span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-400">{s.sale_items?.length || 0} produto(s)</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-0.5">
                            <span
                              className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                isCanceled
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              }`}
                            >
                              {isCanceled ? 'Cancelada / Estornada' : 'Concluída'}
                            </span>
                            {isCanceled && (
                              <div className="text-[10px] text-rose-400/90 mt-0.5 space-y-0.5">
                                {s.canceled_at && <span>Em {formatDate(s.canceled_at)}</span>}
                                {s.cancel_reason && (
                                  <p
                                    className="italic text-slate-400 line-clamp-1 max-w-[180px]"
                                    title={s.cancel_reason}
                                  >
                                    Motivo: {s.cancel_reason}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-bold ${
                            isCanceled ? 'text-slate-500 line-through' : 'text-emerald-400'
                          }`}
                        >
                          {formatCurrency(s.total_amount)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setSelectedSale(s)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
                              title="Ver Comprovante Térmico"
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
            </table>
          </div>
        </div>
      )}

      {/* ABA 2: TABELA DE FECHAMENTOS DE CAIXA (HISTÓRICO CONSOLIDADO POR TURNO) */}
      {activeTab === 'fechamentos' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold uppercase">
                <tr>
                  <th className="py-3.5 px-4">Turno</th>
                  <th className="py-3.5 px-4">Filial / Caixa</th>
                  <th className="py-3.5 px-4">Abertura / Fechamento</th>
                  <th className="py-3.5 px-4 text-right">Fundo Inicial</th>
                  <th className="py-3.5 px-4 text-right">Esperado (Gaveta)</th>
                  <th className="py-3.5 px-4 text-right">Contado (Gaveta)</th>
                  <th className="py-3.5 px-4 text-right">Diferença</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {loadingShifts ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      Carregando histórico de fechamentos de caixa...
                    </td>
                  </tr>
                ) : filteredShifts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      Nenhum turno de caixa encontrado com os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredShifts.map((shift) => {
                    const isOpen = shift.status === 'OPEN'
                    const diff = shift.difference !== null && shift.difference !== undefined ? Number(shift.difference) : null

                    return (
                      <tr key={shift.id} className="hover:bg-slate-800/30 transition">
                        {/* TURNO */}
                        <td className="py-3 px-4 font-mono font-bold text-amber-400" title={String(shift.id)}>
                          #{formatShiftId(shift.id)}
                        </td>

                        {/* FILIAL / CAIXA */}
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-950 border border-slate-800 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                            <Store size={10} /> {shift.branch?.name || 'Geral'}{' '}
                            {shift.cash_desk?.name ? `• ${shift.cash_desk?.name}` : ''}
                          </span>
                        </td>

                        {/* ABERTURA / FECHAMENTO */}
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-400 space-y-0.5">
                          <div className="flex items-center gap-1 text-slate-300">
                            <span className="text-[10px] uppercase font-bold text-slate-500">Ab:</span>
                            <span>{formatDate(shift.opened_at)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] uppercase font-bold text-slate-500">Fc:</span>
                            {shift.closed_at ? (
                              <span>{formatDate(shift.closed_at)}</span>
                            ) : (
                              <span className="text-emerald-400 font-bold">Em Aberto</span>
                            )}
                          </div>
                        </td>

                        {/* FUNDO INICIAL */}
                        <td className="py-3 px-4 text-right font-mono font-medium text-slate-300">
                          {formatCurrency(shift.initial_amount || 0)}
                        </td>

                        {/* ESPERADO (GAVETA) */}
                        <td className="py-3 px-4 text-right font-mono font-semibold text-white">
                          {shift.system_amount !== null && shift.system_amount !== undefined
                            ? formatCurrency(shift.system_amount)
                            : '-'}
                        </td>

                        {/* CONTADO (GAVETA) */}
                        <td className="py-3 px-4 text-right font-mono font-semibold text-white">
                          {shift.final_amount !== null && shift.final_amount !== undefined
                            ? formatCurrency(shift.final_amount)
                            : '-'}
                        </td>

                        {/* DIFERENÇA */}
                        <td className="py-3 px-4 text-right font-mono font-bold">
                          {diff === null ? (
                            <span className="text-slate-500">-</span>
                          ) : diff === 0 ? (
                            <span className="text-emerald-400 font-bold">R$ 0,00</span>
                          ) : diff < 0 ? (
                            <span className="text-rose-400 font-bold">{formatCurrency(diff)}</span>
                          ) : (
                            <span className="text-amber-400 font-bold">+{formatCurrency(diff)}</span>
                          )}
                        </td>

                        {/* STATUS */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-0.5">
                            <span
                              className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                isOpen
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {isOpen ? 'Aberto' : 'Fechado'}
                            </span>
                            {shift.notes && (
                              <p
                                className="text-[10px] text-slate-400 italic line-clamp-1 max-w-[150px]"
                                title={shift.notes}
                              >
                                {shift.notes}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* AÇÕES */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenShiftReceipt(shift)}
                              className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20 hover:text-white transition cursor-pointer"
                              title="Comprovante Térmico Consolidado do Turno"
                            >
                              <Printer size={13} />
                              <span>Comprovante</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShiftFilter(shift.id)
                                setActiveTab('vendas')
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition cursor-pointer"
                              title="Ver Cupons de Venda deste Turno"
                            >
                              <Search size={13} />
                              <span>Ver Cupons</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: COMPROVANTE TÉRMICO INDIVIDUAL DE VENDA (REIMPRESSÃO) */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in overflow-y-auto">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Receipt className="text-amber-400" size={18} />
                <h3 className="text-sm font-bold text-white">Comprovante #{selectedSale.id}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <ThermalReceipt
              saleId={selectedSale.id}
              date={selectedSale.date || selectedSale.created_at}
              paymentMethod={selectedSale.payment_method}
              items={
                selectedSale.sale_items?.map((it: any) => ({
                  product_name: it.product?.name || it.products?.name || `Produto #${it.product_id}`,
                  quantity: it.quantity,
                  unit_price: it.unit_price,
                })) || []
              }
              discountAmount={selectedSale.discount_amount}
              totalAmount={selectedSale.total_amount}
              branchName={selectedSale.branch?.name}
              cashDeskName={selectedSale.cash_desk?.name}
              onClose={() => setSelectedSale(null)}
            />
          </div>
        </div>
      )}

      {/* MODAL 2: COMPROVANTE TÉRMICO CONSOLIDADO DE FECHAMENTO DE CAIXA (80mm) */}
      {selectedShiftReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in overflow-y-auto">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl flex flex-col max-h-[92vh]">
            {/* Cabeçalho do Modal na tela */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3 shrink-0 print:hidden">
              <div className="flex items-center gap-2">
                <Layers className="text-amber-400" size={18} />
                <h3 className="text-sm font-bold text-white">
                  Fechamento #{formatShiftId(selectedShiftReceipt.id)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedShiftReceipt(null)
                  setShiftReceiptData(null)
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Conteúdo do Cupom com Rolagem se necessário */}
            <div className="overflow-y-auto pr-1 flex flex-col items-center">
              {loadingShiftReceipt || !shiftReceiptCalculations ? (
                <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                  <span>Carregando dados consolidados do turno...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center w-full">
                  {/* Container de Impressão 80mm */}
                  <div
                    id="shift-thermal-receipt"
                    className="w-[300px] bg-white text-black p-4 font-mono text-xs shadow-2xl rounded-sm print:m-0 print:p-2 print:w-full print:shadow-none"
                  >
                    {/* Cabeçalho */}
                    <div className="text-center border-b border-dashed border-black pb-3 mb-2">
                      <h2 className="text-sm font-black tracking-tighter uppercase">GIRO SISTEMA</h2>
                      <p className="text-[10px] font-bold uppercase tracking-wider">MAPA DE CAIXA / REDUÇÃO Z</p>
                      <div className="text-[10px] font-bold uppercase text-neutral-900 mt-1.5 space-y-0.5">
                        <p>LOJA: {selectedShiftReceipt.branch?.name || 'Matriz / Loja Padrão'}</p>
                        {selectedShiftReceipt.cash_desk?.name && (
                          <p>TERMINAL: {selectedShiftReceipt.cash_desk?.name}</p>
                        )}
                        <p className="text-black font-extrabold">
                          TURNO: #{formatShiftId(selectedShiftReceipt.id).toUpperCase()}
                        </p>
                      </div>
                      <div className="mt-2 text-[9px] text-neutral-800 space-y-0.5 text-left border-t border-dashed border-neutral-400 pt-1.5">
                        <div className="flex justify-between">
                          <span>ABERTURA:</span>
                          <span className="font-bold">{formatDate(selectedShiftReceipt.opened_at)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>FECHAMENTO:</span>
                          <span className="font-bold">
                            {selectedShiftReceipt.closed_at
                              ? formatDate(selectedShiftReceipt.closed_at)
                              : 'EM ANDAMENTO'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>STATUS:</span>
                          <span className="font-black uppercase">
                            {selectedShiftReceipt.status === 'OPEN' ? 'ABERTO' : 'FECHADO'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* BLOCO 1: RESUMO DE VENDAS POR FORMA DE PAGAMENTO (CONCLUÍDAS) */}
                    <div className="border-b border-dashed border-black pb-2 mb-2">
                      <div className="text-center text-[10px] font-black uppercase tracking-wider border-b border-black pb-1 mb-1">
                        RESUMO DE VENDAS
                      </div>
                      <div className="space-y-1 text-[10px]">
                        <div className="flex justify-between">
                          <span>Dinheiro ({shiftReceiptCalculations.dinheiro.count}x):</span>
                          <span className="font-bold">
                            {formatCurrency(shiftReceiptCalculations.dinheiro.total)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Pix ({shiftReceiptCalculations.pix.count}x):</span>
                          <span className="font-bold">{formatCurrency(shiftReceiptCalculations.pix.total)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Cartão Crédito ({shiftReceiptCalculations.credito.count}x):</span>
                          <span className="font-bold">
                            {formatCurrency(shiftReceiptCalculations.credito.total)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Cartão Débito ({shiftReceiptCalculations.debito.count}x):</span>
                          <span className="font-bold">{formatCurrency(shiftReceiptCalculations.debito.total)}</span>
                        </div>
                      </div>

                      <div className="mt-2 pt-1 border-t border-dashed border-neutral-400 space-y-1 text-xs">
                        <div className="flex justify-between text-[10px]">
                          <span>TOTAL BRUTO:</span>
                          <span>{formatCurrency(shiftReceiptCalculations.totalBruto)}</span>
                        </div>
                        {shiftReceiptCalculations.totalDescontos > 0 && (
                          <div className="flex justify-between text-[10px] text-neutral-800">
                            <span>(-) DESCONTOS:</span>
                            <span className="font-bold">
                              -{formatCurrency(shiftReceiptCalculations.totalDescontos)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between text-xs font-black border-t border-black pt-1">
                          <span>FATURAMENTO LÍQUIDO:</span>
                          <span>{formatCurrency(shiftReceiptCalculations.faturamentoLiquido)}</span>
                        </div>
                      </div>

                      {/* Cancelamentos / Estornos */}
                      {shiftReceiptCalculations.canceladasCount > 0 && (
                        <div className="mt-2 pt-1 border-t border-dashed border-neutral-300 text-[9px] text-neutral-700 flex justify-between">
                          <span>VENDAS CANCELADAS ({shiftReceiptCalculations.canceladasCount}x):</span>
                          <span className="font-bold">
                            {formatCurrency(shiftReceiptCalculations.canceladasTotal)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* BLOCO 2: CONCILIAÇÃO DA GAVETA (DINHEIRO) */}
                    <div className="border-b border-dashed border-black pb-2 mb-2">
                      <div className="text-center text-[10px] font-black uppercase tracking-wider border-b border-black pb-1 mb-1">
                        CONCILIAÇÃO DA GAVETA (DINHEIRO)
                      </div>
                      <div className="space-y-1 text-[10px]">
                        <div className="flex justify-between">
                          <span>(+) Fundo Inicial:</span>
                          <span className="font-bold">
                            {formatCurrency(shiftReceiptCalculations.initialAmount)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>(+) Vendas em Dinheiro:</span>
                          <span className="font-bold">
                            {formatCurrency(shiftReceiptCalculations.cashSalesAmount)}
                          </span>
                        </div>

                        {/* Suprimentos */}
                        <div className="flex justify-between">
                          <span>(+) Suprimentos ({shiftReceiptCalculations.suprimentos.length}x):</span>
                          <span className="font-bold">
                            {formatCurrency(shiftReceiptCalculations.totalSuprimentos)}
                          </span>
                        </div>
                        {shiftReceiptCalculations.suprimentos.length > 0 && (
                          <div className="pl-2 space-y-0.5 text-[8px] text-neutral-600">
                            {shiftReceiptCalculations.suprimentos.map((sup: any, i: number) => (
                              <div key={i} className="flex justify-between">
                                <span className="truncate max-w-[170px]">• {sup.reason || 'Suprimento'}</span>
                                <span>{formatCurrency(sup.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Sangrias */}
                        <div className="flex justify-between text-neutral-900">
                          <span>(-) Sangrias ({shiftReceiptCalculations.sangrias.length}x):</span>
                          <span className="font-bold">
                            -{formatCurrency(shiftReceiptCalculations.totalSangrias)}
                          </span>
                        </div>
                        {shiftReceiptCalculations.sangrias.length > 0 && (
                          <div className="pl-2 space-y-0.5 text-[8px] text-neutral-600">
                            {shiftReceiptCalculations.sangrias.map((san: any, i: number) => (
                              <div key={i} className="flex justify-between">
                                <span className="truncate max-w-[170px]">• {san.reason || 'Sangria'}</span>
                                <span>-{formatCurrency(san.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="mt-2 pt-1 border-t border-black space-y-1 text-xs">
                        <div className="flex justify-between font-bold">
                          <span>(=) SALDO ESPERADO:</span>
                          <span>{formatCurrency(shiftReceiptCalculations.systemExpected)}</span>
                        </div>
                        <div className="flex justify-between font-bold">
                          <span>(=) VALOR INFORMADO:</span>
                          <span>
                            {shiftReceiptCalculations.finalCounted !== null
                              ? formatCurrency(shiftReceiptCalculations.finalCounted)
                              : '---'}
                          </span>
                        </div>
                        <div className="flex justify-between font-black pt-1 border-t border-dashed border-black">
                          <span>DIFERENÇA:</span>
                          <span>
                            {shiftReceiptCalculations.difference === null ? (
                              'EM ABERTO'
                            ) : shiftReceiptCalculations.difference === 0 ? (
                              'R$ 0,00 (CONFERIDO)'
                            ) : shiftReceiptCalculations.difference < 0 ? (
                              `${formatCurrency(shiftReceiptCalculations.difference)} (FALTA)`
                            ) : (
                              `+${formatCurrency(shiftReceiptCalculations.difference)} (SOBRA)`
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Observações */}
                    {selectedShiftReceipt.notes && (
                      <div className="border-b border-dashed border-black pb-2 mb-2 text-[9px]">
                        <span className="font-bold">OBSERVAÇÕES:</span>
                        <p className="italic text-neutral-700 mt-0.5">{selectedShiftReceipt.notes}</p>
                      </div>
                    )}

                    {/* Rodapé e Linha de Assinatura */}
                    <div className="text-center text-[9px] pt-2 space-y-3">
                      <p className="text-[8px] text-neutral-600">
                        EMITIDO EM: {formatDate(new Date().toISOString())}
                      </p>
                      <div className="pt-5 border-t border-dashed border-black">
                        <p className="font-bold uppercase tracking-wider text-[8px]">
                          Assinatura do Operador / Conferente
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Botões de Ação na Tela (ocultos na impressão) */}
                  <div className="flex gap-2 w-full mt-4 print:hidden">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20 transition cursor-pointer"
                    >
                      <Printer size={15} /> Imprimir Fechamento
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedShiftReceipt(null)
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

      {/* MODAL 3: CONFIRMAÇÃO DE CANCELAMENTO / ESTORNO */}
      {cancelingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 pb-3 border-b border-slate-800">
              <Ban size={22} />
              <h3 className="text-base font-bold text-white">Cancelar Venda #{cancelingSale.id}</h3>
            </div>

            <p className="text-xs text-slate-400 mt-3">
              Ao confirmar o cancelamento, todos os produtos desta venda serão{' '}
              <strong>automaticamente devolvidos ao estoque</strong>.
            </p>

            <form onSubmit={handleCancelSale} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300">Motivo do Estorno</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Produto registrado incorretamente / Desistência do cliente"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancelingSale(null)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-400 hover:bg-slate-800 cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={canceling}
                  className="rounded-xl bg-rose-500 px-5 py-2 text-xs font-extrabold text-white hover:bg-rose-600 disabled:opacity-50 transition cursor-pointer"
                >
                  {canceling ? 'Estornando...' : 'Confirmar Cancelamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
