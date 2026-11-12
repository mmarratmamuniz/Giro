'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CashShift } from '@/types/cash'
import { CashShiftModal } from '@/components/pdv/cash-shift-modal'
import { useNetwork } from '@/contexts/network-context'
import { useAuth } from '@/contexts/auth-context'
import {
  DollarSign,
  Lock,
  Unlock,
  ArrowDownRight,
  ArrowUpRight,
  Printer,
  X,
} from 'lucide-react'

export default function CaixaPage() {
  const [shifts, setShifts] = useState<CashShift[]>([])
  const [currentShift, setCurrentShift] = useState<CashShift | null>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { networks, branches, selectedBranchId, selectedNetworkId } = useNetwork()
  const { profile } = useAuth()
  const [supabase] = useState(() => createClient())

  // Estado para o Modal de Comprovante Térmico 80mm
  const [selectedShiftForReceipt, setSelectedShiftForReceipt] = useState<any | null>(null)
  const [shiftReceiptData, setShiftReceiptData] = useState<{
    shift: any
    sales: any[]
    transactions: any[]
  } | null>(null)
  const [loadingShiftReceipt, setLoadingShiftReceipt] = useState(false)
  const [operatorName, setOperatorName] = useState<string>('Operador de Caixa')

  async function loadCaixaData() {
    try {
      setLoading(true)
      let shiftsQuery = supabase
        .from('cash_shifts')
        .select('*, branch:branches(name, network_id), cash_desk:cash_desks(name)')
        .order('opened_at', { ascending: false })
        .limit(30)

      let curQuery = supabase
        .from('cash_shifts')
        .select('*, branch:branches(name, network_id), cash_desk:cash_desks(name)')
        .eq('status', 'OPEN')
        .order('opened_at', { ascending: false })

      let transQuery = supabase
        .from('cash_transactions')
        .select('*, shift:cash_shifts!inner(id, branch_id, network_id, cash_desk:cash_desks(name))')
        .order('created_at', { ascending: false })
        .limit(50)

      if (selectedBranchId !== 'ALL') {
        shiftsQuery = shiftsQuery.eq('branch_id', selectedBranchId)
        curQuery = curQuery.eq('branch_id', selectedBranchId)
        transQuery = transQuery.eq('shift.branch_id', selectedBranchId)
      } else if (selectedNetworkId !== 'ALL') {
        shiftsQuery = shiftsQuery.eq('network_id', selectedNetworkId)
        curQuery = curQuery.eq('network_id', selectedNetworkId)
        transQuery = transQuery.eq('shift.network_id', selectedNetworkId)
      }

      const [shiftsRes, curRes, transRes] = await Promise.all([
        shiftsQuery,
        curQuery.limit(1).maybeSingle(),
        transQuery,
      ])

      if (shiftsRes.data) setShifts(shiftsRes.data as any)
      setCurrentShift((curRes.data as any) || null)
      if (transRes.data) setTransactions(transRes.data)
    } catch (err) {
      console.error('Erro ao carregar dados de caixa:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCaixaData()
  }, [selectedBranchId, selectedNetworkId])

  // Identificação Dinâmica da Rede Ativa para o Cabeçalho do Comprovante Térmico
  const activeNetwork = useMemo(() => {
    if (selectedShiftForReceipt?.network_id) {
      const net = networks.find((n) => n.id === selectedShiftForReceipt.network_id)
      if (net) return net
    }
    if (selectedShiftForReceipt?.branch?.network_id) {
      const net = networks.find((n) => n.id === selectedShiftForReceipt.branch.network_id)
      if (net) return net
    }
    if (selectedNetworkId !== 'ALL') {
      const net = networks.find((n) => n.id === selectedNetworkId)
      if (net) return net
    }
    if (selectedBranchId !== 'ALL') {
      const br = branches.find((b) => b.id === selectedBranchId)
      if (br?.network_id) {
        const net = networks.find((n) => n.id === br.network_id)
        if (net) return net
      }
    }
    if (profile?.network_id) {
      const net = networks.find((n) => n.id === profile.network_id)
      if (net) return net
    }
    return networks[0] || null
  }, [selectedShiftForReceipt, selectedNetworkId, selectedBranchId, networks, branches, profile])

  const receiptNetworkName = activeNetwork?.name || 'GIRO SISTEMA'
  const receiptLogoUrl = activeNetwork?.logo_url || '/logo-giro.png'

  // Abrir Modal e Carregar Vendas & Transações do Turno
  async function handleOpenShiftReceipt(shift: any) {
    setSelectedShiftForReceipt(shift)
    setLoadingShiftReceipt(true)
    try {
      const [{ data: shiftSales }, { data: txData }, opProfileRes] = await Promise.all([
        supabase
          .from('sales')
          .select('id, status, payment_method, discount_amount, total_amount, created_at')
          .eq('shift_id', shift.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('cash_transactions')
          .select('*')
          .eq('shift_id', shift.id)
          .order('created_at', { ascending: true }),
        shift.user_id
          ? supabase.from('profiles').select('id, full_name, email').eq('id', shift.user_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])

      const opProfile = (opProfileRes as any)?.data
      setOperatorName(opProfile?.full_name || profile?.full_name || 'Operador de Caixa')

      setShiftReceiptData({
        shift,
        sales: shiftSales || [],
        transactions: txData || [],
      })
    } catch (err: any) {
      console.error('Erro ao abrir comprovante do turno:', err)
    } finally {
      setLoadingShiftReceipt(false)
    }
  }

  // Cálculos Consolidados do Comprovante Térmico (80mm)
  const shiftReceiptCalculations = useMemo(() => {
    if (!shiftReceiptData) return null
    const { shift, sales: shiftSales, transactions: txData } = shiftReceiptData
    const completed = shiftSales.filter((s: any) => s.status === 'COMPLETED')
    const canceled = shiftSales.filter((s: any) => s.status === 'CANCELED')

    const getPaymentTotals = (methodNames: string[]) => {
      const matching = completed.filter((s: any) =>
        methodNames.some((m) => s.payment_method?.toLowerCase() === m.toLowerCase())
      )
      return {
        count: matching.length,
        total: matching.reduce((sum: number, s: any) => sum + Number(s.total_amount || 0), 0),
      }
    }

    const dinheiro = getPaymentTotals(['Dinheiro'])
    const pix = getPaymentTotals(['Pix'])
    const credito = getPaymentTotals(['Crédito', 'Cartão de Crédito'])
    const debito = getPaymentTotals(['Débito', 'Cartão de Débito'])

    const totalDescontos = completed.reduce((sum: number, s: any) => sum + Number(s.discount_amount || 0), 0)
    const faturamentoLiquido = completed.reduce((sum: number, s: any) => sum + Number(s.total_amount || 0), 0)
    const totalBruto = faturamentoLiquido + totalDescontos

    const initialAmount = Number(shift.initial_amount || 0)
    const suprimentos = txData.filter((t: any) => t.type === 'SUPRIMENTO')
    const totalSuprimentos = suprimentos.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0)
    const sangrias = txData.filter((t: any) => t.type === 'SANGRIA')
    const totalSangrias = sangrias.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0)

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
      canceladasTotal: canceled.reduce((sum: number, s: any) => sum + Number(s.total_amount || 0), 0),
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
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Card de Status do Turno Atual */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 no-print">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
              currentShift
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-lg shadow-emerald-500/10'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            {currentShift ? <Unlock size={28} /> : <Lock size={28} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  currentShift ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                }`}
              />
              <h3 className="text-lg font-bold text-white">
                {currentShift ? `Turno #${currentShift.id} em Andamento` : 'Caixa Fechado'}
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {currentShift
                ? `Aberto em ${formatDate(currentShift.opened_at)} com fundo de troco de ${formatCurrency(
                    currentShift.initial_amount
                  )}`
                : 'Abra um novo turno informando o fundo de troco para liberar o PDV.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {currentShift && (
            <button
              type="button"
              onClick={() => handleOpenShiftReceipt(currentShift)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 px-4 py-3 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition cursor-pointer shadow-sm"
              title="Prévia do Comprovante Térmico (80mm)"
            >
              <Printer size={15} className="text-amber-400" />
              Prévia do Comprovante
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className={`flex items-center gap-2 rounded-xl px-5 py-3 text-xs font-extrabold text-slate-950 transition cursor-pointer ${
              currentShift
                ? 'bg-amber-500 hover:bg-amber-400 shadow-md shadow-amber-500/20'
                : 'bg-emerald-500 hover:bg-emerald-400 shadow-md shadow-emerald-500/20'
            }`}
          >
            {currentShift ? <DollarSign size={16} /> : <Unlock size={16} />}
            {currentShift ? 'Sangria / Suprimento / Fechar' : 'Abrir Turno de Caixa'}
          </button>
        </div>
      </div>

      {/* Grade de Histórico de Fechamentos e Transações */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 no-print">
        {/* Histórico de Fechamentos (7 colunas + 1 Ações) */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-bold text-white">Histórico de Fechamentos de Caixa</h4>
            <span className="text-xs text-slate-400 font-medium">Últimos 30 turnos</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold uppercase">
                <tr>
                  <th className="py-2.5 px-3">Turno</th>
                  <th className="py-2.5 px-3">Unidade / Caixa</th>
                  <th className="py-2.5 px-3">Abertura</th>
                  <th className="py-2.5 px-3">Fundo Inicial</th>
                  <th className="py-2.5 px-3">Esperado</th>
                  <th className="py-2.5 px-3">Contado</th>
                  <th className="py-2.5 px-3 text-right">Diferença</th>
                  <th className="py-2.5 px-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {shifts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      Nenhum turno registrado para a seleção atual.
                    </td>
                  </tr>
                ) : (
                  shifts.map((s: any) => (
                    <tr key={s.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-mono font-bold text-amber-400">#{s.id}</td>
                      <td className="py-2.5 px-3 text-[11px] text-amber-300">
                        {s.branch?.name || 'Geral'} {s.cash_desk?.name ? `• ${s.cash_desk?.name}` : ''}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">{formatDate(s.opened_at)}</td>
                      <td className="py-2.5 px-3 font-mono">{formatCurrency(s.initial_amount)}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-300">
                        {s.system_amount !== null ? formatCurrency(s.system_amount) : '-'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-white">
                        {s.final_amount !== null ? formatCurrency(s.final_amount) : 'Em aberto'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">
                        {s.difference !== null ? (
                          <span className={s.difference >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {s.difference >= 0 ? '+' : ''}
                            {formatCurrency(s.difference)}
                          </span>
                        ) : (
                          <span className="text-amber-400 font-normal">Aberto</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenShiftReceipt(s)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/30 transition shadow-sm cursor-pointer whitespace-nowrap"
                          title="Imprimir Comprovante Térmico 80mm"
                        >
                          <Printer size={13} />
                          Comprovante
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Histórico de Sangrias e Suprimentos (5 colunas) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-bold text-white">Sangrias e Suprimentos</h4>
            <span className="text-xs text-slate-400 font-medium">Movimentações Avulsas</span>
          </div>

          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {transactions.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                Nenhuma sangria ou suprimento registrado para a unidade ativa.
              </div>
            ) : (
              transactions.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-xl bg-slate-950 p-3 border border-slate-800"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        t.type === 'SANGRIA'
                          ? 'bg-rose-500/10 text-rose-400'
                          : 'bg-emerald-500/10 text-emerald-400'
                      }`}
                    >
                      {t.type === 'SANGRIA' ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">
                        {t.type === 'SANGRIA' ? 'Sangria (Retirada)' : 'Suprimento (Entrada de Troco)'}
                      </p>
                      <p className="text-[10px] text-slate-400">{t.reason || 'Sem descrição'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`font-mono font-bold text-xs ${
                        t.type === 'SANGRIA' ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {t.type === 'SANGRIA' ? '-' : '+'}
                      {formatCurrency(t.amount)}
                    </span>
                    <p className="text-[10px] text-slate-500">{formatDate(t.created_at)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal de Operação de Turno (Abertura / Fechamento / Sangria / Suprimento) */}
      <CashShiftModal
        currentShift={currentShift}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => loadCaixaData()}
      />

      {/* ========================================================
          MODAL DE COMPROVANTE TÉRMICO DE FECHAMENTO (80mm)
          ======================================================== */}
      {selectedShiftForReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 no-print">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Printer className="text-amber-500" size={18} />
                Comprovante Térmico de Fechamento (80mm)
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
                    {/* Cabeçalho com Logo e Nome da Rede */}
                    <div className="text-center border-b border-dashed border-black pb-3 mb-2 flex flex-col items-center">
                      <img
                        src={receiptLogoUrl}
                        alt={receiptNetworkName}
                        className="h-11 w-11 object-contain mb-1.5 rounded-lg border border-neutral-300 print:border-none"
                      />
                      <h2 className="text-sm font-black tracking-tighter uppercase">{receiptNetworkName}</h2>
                      <p className="text-[10px] font-bold text-neutral-800">MAPA DE CAIXA / REDUÇÃO Z</p>
                      <div className="text-[10px] font-bold uppercase text-neutral-900 mt-1 space-y-0.5">
                        <p>UNIDADE: {selectedShiftForReceipt.branch?.name || 'Geral'}</p>
                        <p>TERMINAL: {selectedShiftForReceipt.cash_desk?.name || 'Caixa Padrão'}</p>
                        <p className="text-[9px] font-normal text-neutral-700">
                          OPERADOR: {operatorName || 'Operador de Caixa'}
                        </p>
                        <p className="text-[11px] font-black mt-1">
                          FECHAMENTO DE CAIXA - TURNO #{selectedShiftForReceipt.id}
                        </p>
                      </div>
                      <div className="mt-2 text-[9px] text-left border-t border-dashed border-black pt-1 space-y-0.5 w-full">
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

                    {/* Rodapé e Linha de Assinatura */}
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
                      className="flex-1 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20"
                    >
                      <Printer size={15} />
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
    </div>
  )
}
