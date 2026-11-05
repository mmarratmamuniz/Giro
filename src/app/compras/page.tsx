'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { useNetwork } from '@/contexts/network-context'
import { useFeedback } from '@/contexts/feedback-context'
import { Database } from '@/types/database'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Truck,
  Plus,
  Trash2,
  PackageCheck,
  FileText,
  Store,
} from 'lucide-react'

type Product = Database['public']['Tables']['products']['Row']

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
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [items, setItems] = useState<PurchaseItemInput[]>([])
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const [itemQty, setItemQty] = useState<number>(1)
  const [itemCost, setItemCost] = useState<number>(0)
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<'nova' | 'historico'>('nova')

  // Filial que está recebendo a mercadoria
  const [receivingBranchId, setReceivingBranchId] = useState<string>('')

  const { profile } = useAuth()
  const { branches, selectedBranchId, selectedNetworkId } = useNetwork()
  const { showSuccess, showError } = useFeedback()
  const [supabase] = useState(() => createClient())

  const isBranchAdmin = profile?.role === 'branch_admin'

  // Definir filial recebedora padrão com base no perfil logado
  useEffect(() => {
    if (isBranchAdmin && profile?.branch_id) {
      setReceivingBranchId(profile.branch_id)
    } else if (!receivingBranchId && branches.length > 0) {
      if (selectedBranchId !== 'ALL') {
        setReceivingBranchId(selectedBranchId)
      } else {
        setReceivingBranchId(branches[0].id)
      }
    }
  }, [profile, branches, selectedBranchId, isBranchAdmin, receivingBranchId])

  // Carregar produtos da filial recebedora e histórico de compras
  async function loadData() {
    try {
      const activeBranch = isBranchAdmin ? profile?.branch_id : receivingBranchId

      // 1. Carregar produtos filtrados por rede ativa e is_active = true
      let prodQuery = supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name')

      if (selectedNetworkId !== 'ALL') {
        prodQuery = prodQuery.eq('network_id', selectedNetworkId)
      }

      if (activeBranch) {
        prodQuery = prodQuery.or(`branch_id.eq.${activeBranch},branch_id.is.null`)
      }

      // 2. Carregar compras com filial vinculada
      let purQuery = supabase
        .from('purchases')
        .select(`
          *,
          branch:branches(id, name),
          purchase_items(*, product:products(name, sku))
        `)
        .order('date', { ascending: false })
        .limit(50)

      if (isBranchAdmin && profile?.branch_id) {
        purQuery = purQuery.eq('branch_id', profile.branch_id)
      } else {
        if (selectedBranchId !== 'ALL') {
          purQuery = purQuery.eq('branch_id', selectedBranchId)
        } else if (selectedNetworkId !== 'ALL') {
          purQuery = purQuery.eq('network_id', selectedNetworkId)
        }
      }

      const [prodRes, purRes] = await Promise.all([prodQuery, purQuery])

      if (prodRes.data) setProducts(prodRes.data)
      if (purRes.data) setPurchases(purRes.data)
    } catch (err) {
      console.error('Erro ao carregar dados de compras:', err)
    }
  }

  useEffect(() => {
    loadData()
  }, [receivingBranchId, selectedBranchId, selectedNetworkId, activeTab])

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

  // Salvar Compra via RPC Atômica (create_complete_purchase)
  const handleSavePurchase = async () => {
    if (items.length === 0) return

    const targetBranchId = isBranchAdmin ? profile?.branch_id : receivingBranchId
    if (!targetBranchId) {
      showError('Selecione a Filial', 'É necessário definir para qual filial esta mercadoria está entrando.')
      return
    }

    const branchObj = branches.find((b) => b.id === targetBranchId)

    try {
      setSubmitting(true)

      const itemsPayload = items.map((it) => ({
        product_id: it.product_id,
        quantity: it.quantity,
        unit_cost: it.unit_cost,
      }))

      const { error } = await supabase.rpc('create_complete_purchase', {
        p_branch_id: targetBranchId,
        p_supplier: supplier.trim() || 'Fornecedor Diversos',
        p_items: itemsPayload,
        p_invoice_number: invoiceNumber.trim() || null,
      })

      if (error) throw error

      showSuccess(
        'Entrada Registrada com Sucesso!',
        `Estoque atualizado e CMV ajustado para a filial ${branchObj?.name || 'selecionada'}.`
      )
      setItems([])
      setSupplier('')
      setInvoiceNumber('')
      setActiveTab('historico')
      loadData()
    } catch (err: any) {
      showError('Erro ao registrar compra', err.message)
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
          className={`rounded-lg px-4 py-2 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'nova' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Plus size={14} /> Nova Entrada de Mercadoria
        </button>
        <button
          onClick={() => setActiveTab('historico')}
          className={`rounded-lg px-4 py-2 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
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

            {/* Identificação da Filial Recebedora */}
            {isBranchAdmin ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Store className="text-emerald-400 shrink-0" size={18} />
                  <div>
                    <p className="text-xs font-bold text-white">
                      Filial Recebedora: {branches.find((b) => b.id === profile?.branch_id)?.name || 'Sua Filial'}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      O estoque e os custos serão creditados exclusivamente na sua loja
                    </p>
                  </div>
                </div>
                <span className="rounded-md bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[9px] font-extrabold text-emerald-300 uppercase">
                  Loja Ativa
                </span>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Store size={14} className="text-amber-400" /> Filial Recebedora da Mercadoria *
                </label>
                <select
                  value={receivingBranchId}
                  onChange={(e) => setReceivingBranchId(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500">
                  Selecione para qual unidade esta entrada de mercadoria será destinada
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-400">Fornecedor / Distribuidora</label>
                <input
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Ex: Ambev, Atacadão..."
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                  <FileText size={12} className="text-amber-400" /> Número da NF / Fatura (Opcional)
                </label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="Ex: NF-e 124589"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:border-amber-500 focus:outline-none font-mono"
                />
              </div>
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
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none cursor-pointer"
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
                    min="0"
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
                className="w-full rounded-xl bg-slate-800 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition cursor-pointer"
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
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-slate-500 hover:text-rose-400 cursor-pointer"
                          title="Remover Item"
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
                type="button"
                onClick={handleSavePurchase}
                disabled={items.length === 0 || submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400 shadow-lg shadow-amber-500/20 disabled:opacity-50 transition cursor-pointer"
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
                  <th className="py-3.5 px-4">NF / Fatura</th>
                  <th className="py-3.5 px-4">Filial</th>
                  <th className="py-3.5 px-4">Fornecedor</th>
                  <th className="py-3.5 px-4">Itens</th>
                  <th className="py-3.5 px-4 text-right">Valor Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {purchases.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Nenhuma compra ou entrada registrada no momento.
                    </td>
                  </tr>
                ) : (
                  purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 font-mono text-slate-400">#{p.id}</td>
                      <td className="py-3 px-4 text-slate-400">{formatDate(p.date || p.created_at)}</td>
                      <td className="py-3 px-4 font-mono text-amber-300 font-semibold">
                        {p.invoice_number ? (
                          <span className="flex items-center gap-1">
                            <FileText size={12} className="text-amber-400 shrink-0" />
                            {p.invoice_number}
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                          <Store size={10} className="text-amber-400" />
                          {p.branch?.name || 'Geral'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-white">{p.supplier || '-'}</td>
                      <td className="py-3 px-4 text-slate-400">
                        {p.purchase_items?.map((it: any) => `${it.product?.name} (${it.quantity})`).join(', ') || '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-400">
                        {formatCurrency(p.total_amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
