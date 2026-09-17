'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ThermalReceipt } from '@/components/pdv/thermal-receipt'
import { History, Eye, X, Receipt, Search, Filter, Ban, Printer, CheckCircle2 } from 'lucide-react'

export default function HistoricoVendasPage() {
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSale, setSelectedSale] = useState<any | null>(null)
  const [search, setSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<string>('todos')
  const [statusFilter, setStatusFilter] = useState<string>('todos')

  // Cancelamento
  const [cancelingSale, setCancelingSale] = useState<any | null>(null)
  const [cancelReason, setCancelReason] = useState<string>('')
  const [canceling, setCanceling] = useState(false)

  const { user } = useAuth()
  const supabase = createClient()

  async function loadSales() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('sales')
        .select('*, sale_items(*, products(name, sku))')
        .order('date', { ascending: false })
        .limit(100)

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
  }, [])

  // Estornar / Cancelar Venda
  const handleCancelSale = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cancelingSale) return

    try {
      setCanceling(true)
      const { error } = await supabase.rpc('cancel_sale', {
        p_sale_id: cancelingSale.id,
        p_reason: cancelReason || 'Cancelamento solicitado pelo operador/gerente',
        p_user_id: user?.id || null,
      })

      if (error) throw error

      alert(`Venda #${cancelingSale.id} estornada e itens devolvidos ao estoque com sucesso!`)
      setCancelingSale(null)
      setCancelReason('')
      loadSales()
    } catch (err: any) {
      alert(`Erro ao cancelar venda: ${err.message}`)
    } finally {
      setCanceling(false)
    }
  }

  const filteredSales = sales.filter((s) => {
    const matchesPayment = paymentFilter === 'todos' ? true : s.payment_method === paymentFilter
    const matchesStatus = statusFilter === 'todos' ? true : s.status === statusFilter
    const matchesSearch = s.id.toString().includes(search)
    return matchesPayment && matchesStatus && matchesSearch
  })

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
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

        <div className="flex gap-2 flex-wrap">
          {/* Status */}
          <div className="flex rounded-xl bg-slate-900 border border-slate-800 p-0.5">
            <button
              onClick={() => setStatusFilter('todos')}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                statusFilter === 'todos' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setStatusFilter('COMPLETED')}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                statusFilter === 'COMPLETED' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400'
              }`}
            >
              Concluídas
            </button>
            <button
              onClick={() => setStatusFilter('CANCELED')}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                statusFilter === 'CANCELED' ? 'bg-rose-500 text-white' : 'text-slate-400'
              }`}
            >
              Canceladas
            </button>
          </div>

          {/* Formas de Pagamento */}
          <div className="flex gap-1.5 overflow-x-auto">
            {['todos', 'Pix', 'Crédito', 'Débito', 'Dinheiro'].map((m) => (
              <button
                key={m}
                onClick={() => setPaymentFilter(m)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition capitalize ${
                  paymentFilter === m
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {m}
              </button>
            ))}
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
              {filteredSales.map((s) => {
                const isCanceled = s.status === 'CANCELED'
                return (
                  <tr key={s.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-4 font-mono font-bold text-amber-400">#{s.id}</td>
                    <td className="py-3 px-4 font-mono text-slate-400">{formatDate(s.date)}</td>
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
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          isCanceled
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {isCanceled ? 'Cancelada / Estornada' : 'Concluída'}
                      </span>
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
                          onClick={() => setSelectedSale(s)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
                          title="Ver Comprovante Térmico"
                        >
                          <Printer size={15} />
                        </button>
                        {!isCanceled && (
                          <button
                            onClick={() => setCancelingSale(s)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition"
                            title="Estornar / Cancelar Venda"
                          >
                            <Ban size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
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
                onClick={() => setSelectedSale(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <ThermalReceipt
              saleId={selectedSale.id}
              date={selectedSale.date}
              paymentMethod={selectedSale.payment_method}
              items={selectedSale.sale_items?.map((it: any) => ({
                product_name: it.products?.name || it.product?.name || `Produto #${it.product_id}`,
                quantity: it.quantity,
                unit_price: it.unit_price,
              })) || []}
              discountAmount={selectedSale.discount_amount}
              totalAmount={selectedSale.total_amount}
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
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-400 hover:bg-slate-800"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={canceling}
                  className="rounded-xl bg-rose-500 px-5 py-2 text-xs font-extrabold text-white hover:bg-rose-600 transition"
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
