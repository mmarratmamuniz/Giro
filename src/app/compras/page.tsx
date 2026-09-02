'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Truck,
  Plus,
  Trash2,
  PackageCheck,
  CheckCircle2,
  Calendar,
  Layers,
  ChevronDown,
} from 'lucide-react'

type Product = Database['public']['Tables']['products']['Row']
type Purchase = Database['public']['Tables']['purchases']['Row']

interface PurchaseItemInput {
  product_id: number
  product_name: string
  quantity: number
  unit_cost: number
}

export default function ComprasPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [purchases, setPurchases] = useState<any[]>([])
  const [supplier, setSupplier] = useState('')
  const [items, setItems] = useState<PurchaseItemInput[]>([])
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const [itemQty, setItemQty] = useState<number>(1)
  const [itemCost, setItemCost] = useState<number>(0)
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<'nova' | 'historico'>('nova')

  const supabase = createClient()

  async function loadData() {
    const [prodRes, purRes] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase
        .from('purchases')
        .select('*, purchase_items(*, product:products(name, sku))')
        .order('date', { ascending: false })
        .limit(50),
    ])

    if (prodRes.data) setProducts(prodRes.data)
    if (purRes.data) setPurchases(purRes.data)
  }

  useEffect(() => {
    loadData()
  }, [])

  // Quando seleciona produto, preenche o custo atual dele
  const handleSelectProduct = (id: number) => {
    setSelectedProductId(id)
    const prod = products.find((p) => p.id === id)
    if (prod) {
      setItemCost(prod.cost_price || 0)
    }
  }

  // Adicionar item à lista da compra atual
  const handleAddItem = () => {
    if (!selectedProductId || itemQty <= 0 || itemCost < 0) return
    const prod = products.find((p) => p.id === selectedProductId)
    if (!prod) return

    setItems((prev) => [
      ...prev,
      {
        product_id: prod.id,
        product_name: prod.name,
        quantity: Number(itemQty),
        unit_cost: Number(itemCost),
      },
    ])

    // Resetar campos do formulário de item
    setSelectedProductId(null)
    setItemQty(1)
    setItemCost(0)
  }

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0)

  // Salvar Compra e Atualizar Estoque
  const handleSavePurchase = async () => {
    if (items.length === 0) return

    try {
      setSubmitting(true)

      // 1. Criar compra
      const { data: purchaseData, error: purError } = await supabase
        .from('purchases')
        .insert([
          {
            supplier: supplier || 'Fornecedor Diversos',
            total_amount: totalAmount,
          },
        ])
        .select()
        .single()

      if (purError) throw purError

      const purchaseId = purchaseData.id

      // 2. Criar itens e incrementar estoque
      for (const item of items) {
        // Inserir item da compra
        await supabase.from('purchase_items').insert([
          {
            purchase_id: purchaseId,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
          },
        ])

        // Buscar estoque atual
        const { data: currentProd } = await supabase
          .from('products')
          .select('stock_quantity')
          .eq('id', item.product_id)
          .single()

        const newStock = (currentProd?.stock_quantity || 0) + item.quantity

        // Atualizar estoque e preço de custo
        await supabase
          .from('products')
          .update({
            stock_quantity: newStock,
            cost_price: item.unit_cost,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.product_id)

        // Registrar movimentação de estoque
        await supabase.from('stock_movements').insert([
          {
            product_id: item.product_id,
            movement_type: 'IN',
            quantity: item.quantity,
            origin: 'PURCHASE',
            note: `Entrada Compra #${purchaseId} - Fornecedor: ${supplier || 'N/A'}`,
          },
        ])
      }

      alert('Compra registrada e estoque atualizado com sucesso!')
      setItems([])
      setSupplier('')
      setActiveTab('historico')
      loadData()
    } catch (err: any) {
      alert(`Erro ao registrar compra: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Abas */}
      <div className="flex rounded-xl bg-slate-900 border border-slate-800 p-1 w-fit">
        <button
          onClick={() => setActiveTab('nova')}
          className={`rounded-lg px-4 py-2 text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'nova' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Plus size={14} /> Nova Entrada de Mercadoria
        </button>
        <button
          onClick={() => setActiveTab('historico')}
          className={`rounded-lg px-4 py-2 text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'historico' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Truck size={14} /> Histórico de Compras
        </button>
      </div>

      {activeTab === 'nova' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Lançamento de Itens */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 lg:col-span-7 space-y-5">
            <h4 className="text-base font-bold text-white">1. Informações da Nota e Itens</h4>

            <div>
              <label className="text-xs font-semibold text-slate-400">Fornecedor / Distribuidora</label>
              <input
                type="text"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Ex: Ambev, Coca-Cola FEMSA, Atacadão..."
                className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* Adicionar Produto */}
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-4">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                Adicionar Produto à Nota
              </span>

              <div>
                <label className="text-xs font-semibold text-slate-400">Selecione o Produto</label>
                <select
                  value={selectedProductId || ''}
                  onChange={(e) => handleSelectProduct(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="">Selecione um produto cadastrado...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Atual: {p.stock_quantity} {p.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400">Quantidade Entrada</label>
                  <input
                    type="number"
                    min="1"
                    value={itemQty}
                    onChange={(e) => setItemQty(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400">Custo Unitário (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={itemCost}
                    onChange={(e) => setItemCost(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddItem}
                disabled={!selectedProductId}
                className="w-full rounded-xl bg-slate-800 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition"
              >
                + Incluir Item na Entrada
              </button>
            </div>
          </div>

          {/* Resumo da Compra */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 lg:col-span-5 flex flex-col justify-between">
            <div>
              <h4 className="text-base font-bold text-white mb-4">2. Itens Incluídos ({items.length})</h4>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {items.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-500">
                    Nenhum item incluído nesta compra.
                  </div>
                ) : (
                  items.map((it, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl bg-slate-950 p-3 border border-slate-800"
                    >
                      <div>
                        <p className="text-xs font-bold text-white truncate max-w-[150px]">
                          {it.product_name}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {it.quantity} un x {formatCurrency(it.unit_cost)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono font-bold text-white">
                          {formatCurrency(it.quantity * it.unit_cost)}
                        </span>
                        <button
                          onClick={() => handleRemoveItem(idx)}
                          className="text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="border-t border-slate-800 pt-4 mt-6 space-y-3">
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-bold text-slate-400 uppercase">Custo Total da Entrada</span>
                <span className="text-2xl font-black text-amber-400 font-mono">
                  {formatCurrency(totalAmount)}
                </span>
              </div>

              <button
                onClick={handleSavePurchase}
                disabled={items.length === 0 || submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400 shadow-lg shadow-amber-500/20 disabled:opacity-50 transition"
              >
                <PackageCheck size={16} />{' '}
                {submitting ? 'Salvando...' : 'Confirmar e Atualizar Estoque'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* HISTÓRICO DE COMPRAS */
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold uppercase">
                <tr>
                  <th className="py-3.5 px-4">Código</th>
                  <th className="py-3.5 px-4">Data</th>
                  <th className="py-3.5 px-4">Fornecedor</th>
                  <th className="py-3.5 px-4">Itens</th>
                  <th className="py-3.5 px-4 text-right">Valor Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {purchases.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/30">
                    <td className="py-3 px-4 font-mono text-slate-400">#{p.id}</td>
                    <td className="py-3 px-4 text-slate-400">{formatDate(p.date)}</td>
                    <td className="py-3 px-4 font-bold text-white">{p.supplier || '-'}</td>
                    <td className="py-3 px-4 text-slate-400">
                      {p.purchase_items?.map((it: any) => `${it.product?.name} (${it.quantity})`).join(', ') || '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-amber-400">
                      {formatCurrency(p.total_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
