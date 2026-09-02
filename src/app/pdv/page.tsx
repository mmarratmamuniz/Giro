'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database'
import { useCart } from '@/contexts/cart-context'
import { formatCurrency } from '@/lib/utils'
import {
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  QrCode,
  Banknote,
  CheckCircle2,
  AlertCircle,
  Package,
  Sparkles,
  Receipt,
  X,
} from 'lucide-react'
import confetti from 'canvas-confetti'

type Product = Database['public']['Tables']['products']['Row']
type Category = Database['public']['Tables']['categories']['Row']

export default function PDVPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Modal de Pagamento
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'Dinheiro' | 'Pix' | 'Crédito' | 'Débito'>('Pix')
  const [cashGiven, setCashGiven] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [saleSuccess, setSaleSuccess] = useState<any | null>(null)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const { items, addItem, removeItem, updateQuantity, clearCart, totalAmount, totalItems } = useCart()
  const supabase = createClient()

  // Buscar produtos e categorias
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const [prodRes, catRes] = await Promise.all([
          supabase.from('products').select('*, category:categories(*)').eq('is_active', true).order('name'),
          supabase.from('categories').select('*').order('name'),
        ])

        if (prodRes.data) setProducts(prodRes.data)
        if (catRes.data) setCategories(catRes.data)
      } catch (err) {
        console.error('Erro ao carregar dados do PDV:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [supabase])

  // Filtragem de Produtos
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = selectedCategory ? p.category_id === selectedCategory : true
    return matchesSearch && matchesCategory
  })

  // Atalho Enter para adicionar direto se houver correspondência exata de SKU (leitor de código de barras)
  const handleKeyDownSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const exactSku = products.find((p) => p.sku.toLowerCase() === search.trim().toLowerCase())
      if (exactSku) {
        addItem(exactSku, 1)
        setSearch('')
      } else if (filteredProducts.length === 1) {
        addItem(filteredProducts[0], 1)
        setSearch('')
      }
    }
  }

  // Finalizar Venda via RPC Atômica
  const handleFinishSale = async () => {
    if (items.length === 0) return

    try {
      setSubmitting(true)
      const payload = items.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
      }))

      const { data, error } = await supabase.rpc('create_complete_sale', {
        p_payment_method: paymentMethod,
        p_items: payload,
      })

      if (error) throw error

      // Efeito de Confete
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      })

      setSaleSuccess({
        id: (data as any)?.sale_id,
        total: totalAmount,
        method: paymentMethod,
        items: [...items],
      })

      clearCart()
      setIsPaymentModalOpen(false)
    } catch (err: any) {
      alert(`Erro ao finalizar venda: ${err.message || 'Verifique o estoque dos produtos.'}`)
    } finally {
      setSubmitting(false)
    }
  }

  const changeDue = Math.max(0, (parseFloat(cashGiven) || 0) - totalAmount)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 h-[calc(100vh-8.5rem)] animate-in fade-in duration-200">
      {/* Coluna Esquerda: Catálogo e Busca (8 colunas) */}
      <div className="flex flex-col gap-4 lg:col-span-7 xl:col-span-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        {/* Barra de Busca & Leitor */}
        <div className="relative">
          <Search className="absolute left-4 top-3.5 text-slate-400" size={18} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Buscar por nome ou bipar código de barras / SKU (Pressione Enter)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDownSearch}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 py-3 pl-11 pr-4 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        {/* Categorias (Filtros em Pílulas) */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`shrink-0 rounded-xl px-4 py-1.5 text-xs font-bold transition ${
              selectedCategory === null
                ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/20'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Todos
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`shrink-0 rounded-xl px-4 py-1.5 text-xs font-bold transition ${
                selectedCategory === cat.id
                  ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/20'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Grade de Produtos */}
        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Carregando catálogo de produtos...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center p-6 text-slate-500">
              <Package size={40} className="mb-2 text-slate-700" />
              <p className="text-sm font-semibold text-slate-400">Nenhum produto encontrado</p>
              <p className="text-xs">Tente ajustar os termos da busca ou a categoria selecionada.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((p) => {
                const isOutOfStock = p.stock_quantity <= 0
                return (
                  <button
                    key={p.id}
                    onClick={() => !isOutOfStock && addItem(p, 1)}
                    disabled={isOutOfStock}
                    className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all group ${
                      isOutOfStock
                        ? 'border-slate-800/60 bg-slate-950/40 opacity-50 cursor-not-allowed'
                        : 'border-slate-800 bg-slate-950/60 hover:border-amber-500/50 hover:bg-slate-900 shadow-sm'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                        <span className="font-mono">{p.sku}</span>
                        <span
                          className={`font-semibold ${
                            p.stock_quantity <= p.min_stock
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {p.stock_quantity} {p.unit}
                        </span>
                      </div>
                      <h5 className="font-bold text-xs text-white line-clamp-2 leading-snug group-hover:text-amber-400 transition">
                        {p.name}
                      </h5>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-sm font-extrabold text-emerald-400">
                        {formatCurrency(p.sale_price)}
                      </span>
                      <div className="rounded-lg bg-amber-500/10 p-1 text-amber-400 opacity-0 group-hover:opacity-100 transition">
                        <Plus size={14} />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Coluna Direita: Carrinho e Checkout (4 colunas) */}
      <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-5 xl:col-span-4 overflow-hidden shadow-xl">
        <div>
          {/* Cabeçalho do Carrinho */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <h4 className="text-base font-extrabold text-white">Frente de Caixa</h4>
              <p className="text-xs text-slate-400">{totalItems} itens no pedido</p>
            </div>
            {items.length > 0 && (
              <button
                onClick={clearCart}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition"
              >
                <Trash2 size={13} /> Limpar
              </button>
            )}
          </div>

          {/* Lista de Itens do Carrinho */}
          <div className="h-[calc(100vh-25rem)] overflow-y-auto py-3 space-y-2.5 pr-1">
            {items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center p-6 text-slate-500">
                <Receipt size={36} className="mb-2 text-slate-700" />
                <p className="text-xs font-semibold text-slate-400">Carrinho vazio</p>
                <p className="text-[11px]">Clique nos produtos ou use o leitor para adicionar.</p>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.product.id}
                  className="flex items-center justify-between rounded-xl bg-slate-950/50 p-3 border border-slate-800/80"
                >
                  <div className="overflow-hidden pr-2">
                    <h6 className="truncate text-xs font-bold text-white max-w-[140px]">
                      {item.product.name}
                    </h6>
                    <span className="text-[10px] text-emerald-400 font-semibold">
                      {formatCurrency(item.unit_price)} un
                    </span>
                  </div>

                  {/* Controles de Quantidade */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 rounded-lg bg-slate-900 border border-slate-800 p-1">
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-6 text-center font-mono text-xs font-bold text-white">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <span className="text-xs font-extrabold text-white w-16 text-right">
                      {formatCurrency(item.quantity * item.unit_price)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Resumo e Botão de Cobrança */}
        <div className="border-t border-slate-800 pt-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Total a Pagar
            </span>
            <span className="text-2xl font-black text-emerald-400 tracking-tight">
              {formatCurrency(totalAmount)}
            </span>
          </div>

          <button
            onClick={() => setIsPaymentModalOpen(true)}
            disabled={items.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 py-3.5 text-sm font-extrabold text-slate-950 shadow-lg shadow-amber-500/20 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Sparkles size={18} /> Finalizar Venda (Cobrar)
          </button>
        </div>
      </div>

      {/* MODAL DE PAGAMENTO */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white">Forma de Pagamento</h3>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="my-6 text-center">
              <span className="text-xs text-slate-400 uppercase font-semibold">Valor Total</span>
              <h2 className="text-3xl font-black text-emerald-400 mt-1">
                {formatCurrency(totalAmount)}
              </h2>
            </div>

            {/* Opções de Pagamento */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {[
                { id: 'Pix', label: 'Pix Instantâneo', icon: QrCode },
                { id: 'Crédito', label: 'Cartão Crédito', icon: CreditCard },
                { id: 'Débito', label: 'Cartão Débito', icon: CreditCard },
                { id: 'Dinheiro', label: 'Dinheiro', icon: Banknote },
              ].map((m) => {
                const Icon = m.icon
                const isSelected = paymentMethod === m.id
                return (
                  <button
                    key={m.id}
                    onClick={() => setPaymentMethod(m.id as any)}
                    className={`flex items-center gap-2.5 rounded-xl border p-3 text-xs font-bold transition ${
                      isSelected
                        ? 'border-amber-500 bg-amber-500/10 text-amber-400 ring-1 ring-amber-500'
                        : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <Icon size={16} />
                    <span>{m.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Campo de Troco para Dinheiro */}
            {paymentMethod === 'Dinheiro' && (
              <div className="space-y-3 rounded-xl bg-slate-950 p-4 border border-slate-800 mb-6">
                <div>
                  <label className="text-xs font-medium text-slate-400">Valor Recebido (R$):</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={cashGiven}
                    onChange={(e) => setCashGiven(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-sm text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="flex justify-between text-xs pt-1">
                  <span className="text-slate-400">Troco a devolver:</span>
                  <span className="font-bold text-amber-400">{formatCurrency(changeDue)}</span>
                </div>
              </div>
            )}

            <button
              onClick={handleFinishSale}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-sm font-extrabold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition"
            >
              {submitting ? 'Processando...' : 'Confirmar e Emitir Venda'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE SUCESSO / COMPROVANTE */}
      {saleSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 mb-4">
              <CheckCircle2 size={32} />
            </div>

            <h3 className="text-lg font-bold text-white">Venda Concluída!</h3>
            <p className="text-xs text-slate-400 mt-1">Venda #{saleSuccess.id} registrada com sucesso.</p>

            <div className="my-5 rounded-xl bg-slate-950 p-4 border border-slate-800 text-left space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Forma:</span>
                <span className="font-semibold text-white">{saleSuccess.method}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Itens:</span>
                <span className="font-semibold text-white">{saleSuccess.items.length} produto(s)</span>
              </div>
              <div className="flex justify-between border-t border-slate-800 pt-2 font-bold">
                <span className="text-slate-300">Total Pago:</span>
                <span className="text-emerald-400 text-sm">{formatCurrency(saleSuccess.total)}</span>
              </div>
            </div>

            <button
              onClick={() => setSaleSuccess(null)}
              className="w-full rounded-xl bg-amber-500 py-3 text-xs font-extrabold text-slate-950 hover:bg-amber-400 transition"
            >
              Próxima Venda
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
