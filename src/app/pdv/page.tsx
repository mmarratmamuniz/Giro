'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database'
import { useCart } from '@/contexts/cart-context'
import { useAuth } from '@/contexts/auth-context'
import { formatCurrency } from '@/lib/utils'
import { CashShift } from '@/types/cash'
import { CashShiftModal } from '@/components/pdv/cash-shift-modal'
import { ThermalReceipt } from '@/components/pdv/thermal-receipt'
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
  Percent,
  DollarSign,
  Lock,
  Unlock,
  Keyboard,
  ShoppingBag,
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

  // Carrinho no Celular (Gaveta / Bottom sheet)
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false)

  // Turno de Caixa
  const [currentShift, setCurrentShift] = useState<CashShift | null>(null)
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false)

  // Descontos
  const [discountType, setDiscountType] = useState<'percent' | 'value'>('value')
  const [discountInput, setDiscountInput] = useState<string>('')

  // Modal de Pagamento
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'Dinheiro' | 'Pix' | 'Crédito' | 'Débito'>('Pix')
  const [cashGiven, setCashGiven] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [saleSuccess, setSaleSuccess] = useState<any | null>(null)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const { items, addItem, removeItem, updateQuantity, clearCart, totalAmount, totalItems } = useCart()
  const { user } = useAuth()
  const supabase = createClient()

  // Buscar Caixa Aberto Atual
  async function loadShift() {
    try {
      const { data } = await supabase
        .from('cash_shifts')
        .select('*')
        .eq('status', 'OPEN')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      setCurrentShift(data || null)
    } catch (err) {
      console.error('Erro ao verificar turno de caixa:', err)
    }
  }

  // Buscar produtos e categorias
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

  useEffect(() => {
    loadData()
    loadShift()
  }, [])

  // Disparar abertura de pagamento (com validação de caixa)
  const handleOpenPayment = () => {
    if (items.length === 0) return
    if (!currentShift) {
      alert('ATENÇÃO: O caixa está FECHADO. Abra o turno de caixa antes de registrar vendas!')
      setIsShiftModalOpen(true)
      return
    }
    setIsPaymentModalOpen(true)
  }

  // ATALHOS DE TECLADO: F2 (Nova Venda), F4 (Buscar), F8 (Cobrar), ESC (Fechar Modais)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault()
        clearCart()
        setDiscountInput('')
        searchInputRef.current?.focus()
      } else if (e.key === 'F4') {
        e.preventDefault()
        searchInputRef.current?.focus()
      } else if (e.key === 'F8') {
        e.preventDefault()
        if (items.length > 0 && !isPaymentModalOpen && !saleSuccess) {
          handleOpenPayment()
        }
      } else if (e.key === 'Escape') {
        if (isPaymentModalOpen) setIsPaymentModalOpen(false)
        if (isShiftModalOpen) setIsShiftModalOpen(false)
        if (saleSuccess) setSaleSuccess(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [items.length, isPaymentModalOpen, isShiftModalOpen, saleSuccess, currentShift])

  // Cálculo do Desconto
  const rawDiscount = parseFloat(discountInput) || 0
  const discountAmount =
    discountType === 'percent'
      ? (totalAmount * Math.min(100, rawDiscount)) / 100
      : Math.min(totalAmount, rawDiscount)

  const finalTotalToPay = Math.max(0, totalAmount - discountAmount)
  const changeDue = Math.max(0, (parseFloat(cashGiven) || 0) - finalTotalToPay)

  // Filtragem de Produtos
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = selectedCategory ? p.category_id === selectedCategory : true
    return matchesSearch && matchesCategory
  })

  // Atalho Enter para leitor de código de barras
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

  // Finalizar Venda via RPC
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
        p_user_id: user?.id || null,
        p_discount_amount: discountAmount,
        p_shift_id: currentShift?.id || null,
      })

      if (error) throw error

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      })

      setSaleSuccess({
        id: (data as any)?.sale_id,
        grossAmount: totalAmount,
        discountAmount: discountAmount,
        total: finalTotalToPay,
        method: paymentMethod,
        cashGiven: paymentMethod === 'Dinheiro' ? parseFloat(cashGiven) || finalTotalToPay : undefined,
        changeDue: changeDue,
        items: items.map((it) => ({
          product_name: it.product.name,
          quantity: it.quantity,
          unit_price: it.unit_price,
        })),
        date: new Date().toISOString(),
      })

      clearCart()
      setDiscountInput('')
      setCashGiven('')
      setIsPaymentModalOpen(false)
    } catch (err: any) {
      alert(`Erro ao finalizar venda: ${err.message || 'Verifique o estoque dos produtos.'}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex flex-col lg:grid lg:grid-cols-12 gap-5 min-h-[calc(100vh-6rem)] lg:h-[calc(100vh-8.5rem)] animate-in fade-in duration-200 pb-20 lg:pb-0">
      {/* Coluna Esquerda: Catálogo, Busca e Status de Caixa (8 colunas) */}
      <div className="flex flex-col gap-3.5 lg:col-span-7 xl:col-span-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5 sm:p-4">
        {/* Barra de Status do Caixa & Atalhos */}
        <div className="flex items-center justify-between bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                currentShift ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
              }`}
            />
            <span className="text-xs font-semibold text-slate-300">
              {currentShift
                ? `Caixa #${currentShift.id} Aberto (Fundo: ${formatCurrency(currentShift.initial_amount)})`
                : 'Caixa Fechado'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsShiftModalOpen(true)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition ${
                currentShift
                  ? 'bg-slate-800 text-amber-400 hover:bg-slate-700'
                  : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
              }`}
            >
              {currentShift ? <Lock size={12} /> : <Unlock size={12} />}
              {currentShift ? 'Gerenciar Caixa' : 'Abrir Caixa'}
            </button>
          </div>
        </div>

        {/* Barra de Busca & Leitor */}
        <div className="relative">
          <Search className="absolute left-3.5 top-3 text-slate-400" size={17} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Buscar por nome ou bipar código de barras [F4]..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDownSearch}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
          />
        </div>

        {/* Categorias (Filtros em Pílulas) */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
              selectedCategory === null
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Todos
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                selectedCategory === cat.id
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
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
              Carregando catálogo...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center p-6 text-slate-500">
              <Package size={36} className="mb-2 text-slate-700" />
              <p className="text-xs font-semibold text-slate-400">Nenhum produto encontrado</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((p) => {
                const isOutOfStock = p.stock_quantity <= 0
                return (
                  <button
                    key={p.id}
                    onClick={() => !isOutOfStock && addItem(p, 1)}
                    disabled={isOutOfStock}
                    className={`flex flex-col justify-between rounded-xl border p-3 text-left transition-all group ${
                      isOutOfStock
                        ? 'border-slate-800/60 bg-slate-950/40 opacity-50 cursor-not-allowed'
                        : 'border-slate-800 bg-slate-950/60 hover:border-amber-500/50 hover:bg-slate-900 shadow-sm'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                        <span className="font-mono">{p.sku}</span>
                        <span className={`font-semibold ${p.stock_quantity <= p.min_stock ? 'text-rose-400' : 'text-slate-400'}`}>
                          {p.stock_quantity} {p.unit}
                        </span>
                      </div>
                      <h5 className="font-bold text-xs text-white line-clamp-2 leading-snug group-hover:text-amber-400 transition">
                        {p.name}
                      </h5>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="text-xs font-extrabold text-emerald-400">
                        {formatCurrency(p.sale_price)}
                      </span>
                      <div className="rounded-lg bg-amber-500/10 p-1 text-amber-400 opacity-0 group-hover:opacity-100 transition">
                        <Plus size={13} />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Guia de Atalhos Rápido no Rodapé */}
        <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><kbd className="rounded bg-slate-800 px-1 py-0.5 text-slate-300 font-mono">F2</kbd> Nova Venda</span>
          <span className="flex items-center gap-1"><kbd className="rounded bg-slate-800 px-1 py-0.5 text-slate-300 font-mono">F4</kbd> Buscar Produto</span>
          <span className="flex items-center gap-1"><kbd className="rounded bg-slate-800 px-1 py-0.5 text-slate-300 font-mono">F8</kbd> Cobrar</span>
          <span className="flex items-center gap-1"><kbd className="rounded bg-slate-800 px-1 py-0.5 text-slate-300 font-mono">ESC</kbd> Fechar</span>
        </div>
      </div>

      {/* Coluna Direita: Carrinho, Descontos e Cobrança */}
      {/* Backdrop no Celular quando o carrinho estiver aberto */}
      {isMobileCartOpen && (
        <div
          onClick={() => setIsMobileCartOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm lg:hidden"
        />
      )}

      <div
        className={`fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-slate-700 bg-slate-900 p-4 shadow-2xl transition-transform duration-300 lg:static lg:z-auto lg:flex lg:flex-col lg:justify-between lg:rounded-2xl lg:border lg:border-slate-800 lg:bg-slate-900/60 lg:shadow-xl lg:col-span-5 xl:col-span-4 lg:translate-y-0 ${
          isMobileCartOpen ? 'translate-y-0 max-h-[85vh] overflow-y-auto' : 'translate-y-full lg:translate-y-0'
        }`}
      >
        <div>
          {/* Cabeçalho do Carrinho */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMobileCartOpen(false)}
                className="lg:hidden rounded-lg p-1 text-slate-400 hover:bg-slate-800"
              >
                <X size={18} />
              </button>
              <div>
                <h4 className="text-sm font-extrabold text-white">Pedido Atual</h4>
                <p className="text-[11px] text-slate-400">{totalItems} item(ns)</p>
              </div>
            </div>
            {items.length > 0 && (
              <button
                onClick={clearCart}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition"
              >
                <Trash2 size={12} /> Limpar
              </button>
            )}
          </div>

          {/* Lista de Itens do Carrinho */}
          <div className="max-h-56 lg:h-[calc(100vh-27.5rem)] overflow-y-auto py-2.5 space-y-2 pr-1">
            {items.length === 0 ? (
              <div className="flex h-36 lg:h-full flex-col items-center justify-center text-center p-4 text-slate-500">
                <Receipt size={32} className="mb-2 text-slate-700" />
                <p className="text-xs font-semibold text-slate-400">Carrinho Vazio</p>
                <p className="text-[10px]">Toque nos produtos para adicionar ao pedido.</p>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.product.id}
                  className="flex items-center justify-between rounded-xl bg-slate-950/50 p-2.5 border border-slate-800/80"
                >
                  <div className="overflow-hidden pr-2">
                    <h6 className="truncate text-xs font-bold text-white max-w-[130px]">
                      {item.product.name}
                    </h6>
                    <span className="text-[10px] text-emerald-400 font-semibold">
                      {formatCurrency(item.unit_price)}
                    </span>
                  </div>

                  {/* Controles de Quantidade */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 rounded-lg bg-slate-900 border border-slate-800 p-0.5">
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                      >
                        <Minus size={10} />
                      </button>
                      <span className="w-5 text-center font-mono text-xs font-bold text-white">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                      >
                        <Plus size={10} />
                      </button>
                    </div>
                    <span className="text-xs font-extrabold text-white w-14 text-right">
                      {formatCurrency(item.quantity * item.unit_price)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Seção de Descontos e Totalizador */}
        <div className="border-t border-slate-800 pt-3 space-y-2.5">
          {/* Campo de Desconto */}
          <div className="flex items-center gap-2 rounded-xl bg-slate-950 p-2 border border-slate-800">
            <span className="text-xs font-bold text-slate-400 uppercase text-[10px]">Desconto:</span>
            <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
              <button
                type="button"
                onClick={() => setDiscountType('value')}
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  discountType === 'value' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                }`}
              >
                R$
              </button>
              <button
                type="button"
                onClick={() => setDiscountType('percent')}
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  discountType === 'percent' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                }`}
              >
                %
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              className="w-20 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-right text-xs font-bold text-amber-400 focus:border-amber-500 focus:outline-none"
            />
            {discountAmount > 0 && (
              <span className="text-[11px] font-bold text-rose-400 ml-auto">
                -{formatCurrency(discountAmount)}
              </span>
            )}
          </div>

          {/* Subtotal e Total Líquido */}
          <div className="space-y-1 text-xs">
            {discountAmount > 0 && (
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Subtotal Bruto:</span>
                <span className="font-mono">{formatCurrency(totalAmount)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Total a Cobrar
              </span>
              <span className="text-2xl font-black text-emerald-400 tracking-tight font-mono">
                {formatCurrency(finalTotalToPay)}
              </span>
            </div>
          </div>

          <button
            onClick={handleOpenPayment}
            disabled={items.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 py-3 text-xs font-extrabold text-slate-950 shadow-lg shadow-amber-500/20 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Sparkles size={16} /> Finalizar Venda [F8]
          </button>
        </div>
      </div>

      {/* Barra / Botão Flutuante de Carrinho no Celular */}
      <div className="fixed inset-x-3 bottom-3 z-30 lg:hidden">
        <button
          onClick={() => setIsMobileCartOpen(true)}
          className="flex w-full items-center justify-between rounded-2xl bg-amber-500 px-5 py-3.5 text-slate-950 shadow-2xl shadow-amber-500/30 font-bold active:scale-[0.98] transition"
        >
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <ShoppingBag size={20} />
              {totalItems > 0 && (
                <span className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-slate-950 text-[9px] font-black text-amber-400">
                  {totalItems}
                </span>
              )}
            </div>
            <span className="text-xs uppercase tracking-wider">Ver Carrinho</span>
          </div>

          <span className="font-mono text-base font-black">
            {formatCurrency(finalTotalToPay)}
          </span>
        </button>
      </div>

      {/* MODAL DE PAGAMENTO */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Forma de Pagamento</h3>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="my-5 text-center">
              <span className="text-xs text-slate-400 uppercase font-semibold">Valor Total Líquido</span>
              <h2 className="text-3xl font-black text-emerald-400 mt-1 font-mono">
                {formatCurrency(finalTotalToPay)}
              </h2>
            </div>

            {/* Opções de Pagamento */}
            <div className="grid grid-cols-2 gap-3 mb-5">
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
                    className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-bold transition ${
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
              <div className="space-y-2.5 rounded-xl bg-slate-950 p-3.5 border border-slate-800 mb-5">
                <div>
                  <label className="text-xs font-medium text-slate-400">Valor Recebido do Cliente (R$):</label>
                  <input
                    type="number"
                    step="0.01"
                    autoFocus
                    placeholder="0,00"
                    value={cashGiven}
                    onChange={(e) => setCashGiven(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-sm text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="flex justify-between text-xs pt-1">
                  <span className="text-slate-400">Troco a Devolver:</span>
                  <span className="font-bold text-amber-400 font-mono">{formatCurrency(changeDue)}</span>
                </div>
              </div>
            )}

            <button
              onClick={handleFinishSale}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-xs font-extrabold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition"
            >
              {submitting ? 'Emitindo Venda...' : 'Confirmar e Concluir Venda [Enter]'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE SUCESSO COM CUPOM TÉRMICO NÃO FISCAL (58mm / 80mm) */}
      {saleSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in overflow-y-auto">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 size={18} />
                <h3 className="text-sm font-bold text-white">Venda Realizada com Sucesso!</h3>
              </div>
              <button
                onClick={() => setSaleSuccess(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Componente de Impressão Térmica */}
            <ThermalReceipt
              saleId={saleSuccess.id}
              date={saleSuccess.date}
              paymentMethod={saleSuccess.method}
              items={saleSuccess.items}
              grossAmount={saleSuccess.grossAmount}
              discountAmount={saleSuccess.discountAmount}
              totalAmount={saleSuccess.total}
              cashGiven={saleSuccess.cashGiven}
              changeDue={saleSuccess.changeDue}
              onClose={() => setSaleSuccess(null)}
            />
          </div>
        </div>
      )}

      {/* MODAL DE TURNO DE CAIXA */}
      <CashShiftModal
        currentShift={currentShift}
        isOpen={isShiftModalOpen}
        onClose={() => setIsShiftModalOpen(false)}
        onSuccess={() => loadShift()}
      />
    </div>
  )
}
