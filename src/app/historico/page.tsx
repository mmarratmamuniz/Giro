'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { History, Eye, X, Receipt, Search, Filter } from 'lucide-react'

export default function HistoricoVendasPage() {
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSale, setSelectedSale] = useState<any | null>(null)
  const [search, setSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<string>('todos')

  const supabase = createClient()

  async function loadSales() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('sales')
        .select('*, sale_items(*, product:products(name, sku))')
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

  const filteredSales = sales.filter((s) => {
    const matchesFilter = paymentFilter === 'todos' ? true : s.payment_method === paymentFilter
    const matchesSearch = s.id.toString().includes(search)
    return matchesFilter && matchesSearch
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

        <div className="flex gap-2">
          {['todos', 'Pix', 'Crédito', 'Débito', 'Dinheiro'].map((m) => (
            <button
              key={m}
              onClick={() => setPaymentFilter(m)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition capitalize ${
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

      {/* Tabela de Vendas */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold uppercase">
              <tr>
                <th className="py-3.5 px-4">Cupom</th>
                <th className="py-3.5 px-4">Data e Hora</th>
                <th className="py-3.5 px-4">Forma de Pagamento</th>
                <th className="py-3.5 px-4">Itens</th>
                <th className="py-3.5 px-4 text-right">Total da Venda</th>
                <th className="py-3.5 px-4 text-right">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {filteredSales.map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/30 transition">
                  <td className="py-3 px-4 font-mono font-bold text-amber-400">#{s.id}</td>
                  <td className="py-3 px-4 font-mono text-slate-400">{formatDate(s.date)}</td>
                  <td className="py-3 px-4 font-semibold text-white">{s.payment_method}</td>
                  <td className="py-3 px-4 text-slate-400">
                    {s.sale_items?.length || 0} produto(s)
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                    {formatCurrency(s.total_amount)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => setSelectedSale(s)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
                      title="Ver Comprovante"
                    >
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE DETALHES / RECIBO */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Receipt className="text-amber-400" size={18} />
                <h3 className="text-base font-bold text-white">Comprovante de Venda #{selectedSale.id}</h3>
              </div>
              <button
                onClick={() => setSelectedSale(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="my-4 text-xs space-y-2 text-slate-400">
              <div className="flex justify-between">
                <span>Data/Hora:</span>
                <span className="font-mono text-slate-200">{formatDate(selectedSale.date)}</span>
              </div>
              <div className="flex justify-between">
                <span>Forma de Pagamento:</span>
                <span className="font-bold text-white">{selectedSale.payment_method}</span>
              </div>
            </div>

            {/* Itens */}
            <div className="border-t border-b border-slate-800 py-3 space-y-2 max-h-48 overflow-y-auto">
              {selectedSale.sale_items?.map((it: any) => (
                <div key={it.id} className="flex justify-between text-xs">
                  <div>
                    <p className="font-bold text-white">{it.product?.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {it.quantity} un x {formatCurrency(it.unit_price)}
                    </p>
                  </div>
                  <span className="font-mono text-slate-200 font-bold">
                    {formatCurrency(it.quantity * it.unit_price)}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-4 flex justify-between items-baseline font-bold text-sm">
              <span className="text-slate-400">Total Pago:</span>
              <span className="text-emerald-400 text-lg">{formatCurrency(selectedSale.total_amount)}</span>
            </div>

            <button
              onClick={() => setSelectedSale(null)}
              className="mt-6 w-full rounded-xl bg-slate-800 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
            >
              Fechar Comprovante
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
