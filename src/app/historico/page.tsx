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
} from 'lucide-react'

export default function HistoricoVendasPage() {
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSale, setSelectedSale] = useState<any | null>(null)
  const [search, setSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<string>('todos')
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const [branchFilter, setBranchFilter] = useState<string>('todos')
  const [deskFilter, setDeskFilter] = useState<string>('todos')
  const [cashDesks, setCashDesks] = useState<any[]>([])

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

  useEffect(() => {
    loadSales()
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
    } catch (err: any) {
      showError('Erro ao cancelar venda', err.message)
    } finally {
      setCanceling(false)
    }
  }

  const filteredSales = sales.filter((s) => {
    const matchesPayment = paymentFilter === 'todos' ? true : s.payment_method === paymentFilter
    const matchesStatus = statusFilter === 'todos' ? true : s.status === statusFilter
    const matchesSearch = s.id.toString().includes(search.trim())
    const matchesBranch = branchFilter === 'todos' ? true : s.branch_id === branchFilter
    const matchesDesk = deskFilter === 'todos' ? true : s.cash_desk_id === deskFilter
    return matchesPayment && matchesStatus && matchesSearch && matchesBranch && matchesDesk
  })

  const totalFilteredAmount = filteredSales
    .filter((s) => s.status !== 'CANCELED')
    .reduce((sum, s) => sum + Number(s.total_amount), 0)

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Barra de Filtros Completa */}
      <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3 justify-between items-stretch lg:items-center">
          {/* Busca por cupom */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3.5 top-3 text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Buscar por número do cupom (#ID)..."
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
                  <option value="todos" className="bg-slate-900 text-white">Todas as Lojas</option>
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
                <option value="todos" className="bg-slate-900 text-white">Todos os Caixas</option>
                {cashDesks.map((d) => (
                  <option key={d.id} value={d.id} className="bg-slate-900 text-white">
                    {d.name} {branchFilter === 'todos' && d.branch?.name ? `(${d.branch.name})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Linha 2: Status, Pagamento e Resumo */}
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

          {/* Resumo Dinâmico do Filtro */}
          <div className="text-xs text-slate-400 font-medium">
            <span className="font-bold text-white">{filteredSales.length}</span> {filteredSales.length === 1 ? 'venda' : 'vendas'} • Total: <span className="font-bold text-emerald-400">{formatCurrency(totalFilteredAmount)}</span>
          </div>
        </div>
      </div>

      {/* Tabela de Vendas */}
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
              {filteredSales.length === 0 ? (
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
                          <Store size={10} /> {s.branch?.name || 'Geral'} {s.cash_desk?.name ? `• ${s.cash_desk?.name}` : ''}
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
                      <td className="py-3 px-4 text-slate-400">
                        {s.sale_items?.length || 0} produto(s)
                      </td>
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
                                <p className="italic text-slate-400 line-clamp-1 max-w-[180px]" title={s.cancel_reason}>
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

      {/* MODAL DE COMPROVANTE TÉRMICO / REIMPRESSÃO */}
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
              items={selectedSale.sale_items?.map((it: any) => ({
                product_name: it.product?.name || it.products?.name || `Produto #${it.product_id}`,
                quantity: it.quantity,
                unit_price: it.unit_price,
              })) || []}
              discountAmount={selectedSale.discount_amount}
              totalAmount={selectedSale.total_amount}
              branchName={selectedSale.branch?.name}
              cashDeskName={selectedSale.cash_desk?.name}
              onClose={() => setSelectedSale(null)}
            />
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE CANCELAMENTO / ESTORNO */}
      {cancelingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 pb-3 border-b border-slate-800">
              <Ban size={22} />
              <h3 className="text-base font-bold text-white">Cancelar Venda #{cancelingSale.id}</h3>
            </div>

            <p className="text-xs text-slate-400 mt-3">
              Ao confirmar o cancelamento, todos os produtos desta venda serão <strong>automaticamente devolvidos ao estoque</strong>.
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
