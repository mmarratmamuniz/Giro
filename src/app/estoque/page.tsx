'use client'

import React, { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useFeedback } from '@/contexts/feedback-context'
import { useAuth } from '@/contexts/auth-context'
import { useNetwork } from '@/contexts/network-context'
import { Database } from '@/types/database'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  ArrowUpDown,
  Edit2,
  Trash2,
  X,
  Store,
  Building2,
  Truck,
  FileText,
  PackageCheck,
  TrendingUp,
  Boxes,
  DollarSign,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'

type Product = Database['public']['Tables']['products']['Row']
type Category = Database['public']['Tables']['categories']['Row']

interface PurchaseItemInput {
  product_id: number
  product_name: string
  quantity: number
  unit_cost: number
  unit: string
}

function EstoqueContent() {
  const searchParams = useSearchParams()
  const initialTab = searchParams.get('tab') === 'compras' ? 'compras' : 'produtos'

  const [activeTab, setActiveTab] = useState<'produtos' | 'compras' | 'alertas' | 'movimentacoes'>(initialTab)
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [movements, setMovements] = useState<any[]>([])
  const [purchases, setPurchases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)

  // Feedback e Contextos
  const { showSuccess, showError, showWarning } = useFeedback()
  const { profile } = useAuth()
  const { networks, branches, selectedNetworkId, selectedBranchId } = useNetwork()
  const [supabase] = useState(() => createClient())

  const isSuperAdmin = profile?.role === 'super_admin'
  const isNetworkAdmin = profile?.role === 'network_admin'
  const canManageProducts = isSuperAdmin || isNetworkAdmin

  // ========================================================
  // ESTADOS DA ENTRADA DE COMPRAS (ABA 2)
  // ========================================================
  const [receivingBranchId, setReceivingBranchId] = useState<string>('')
  const [supplier, setSupplier] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItemInput[]>([])
  const [selectedPurchaseProductId, setSelectedPurchaseProductId] = useState<number | null>(null)
  const [itemQty, setItemQty] = useState<number>(1)
  const [itemCost, setItemCost] = useState<number>(0)
  const [submittingPurchase, setSubmittingPurchase] = useState(false)

  // ========================================================
  // ESTADOS DO MODAL DE PRODUTO (NOVO / EDIÇÃO)
  // ========================================================
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [stockReason, setStockReason] = useState('')
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    description: '',
    cost_price: 0,
    sale_price: 0,
    stock_quantity: 0,
    min_stock: 5,
    unit: 'un',
    category_id: null as number | null,
    branch_id: '',
  })

  // Modal de Exclusão Definitiva de Produto
  const [deletingProduct, setDeletingProduct] = useState<any | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Sincronizar parâmetro tab da URL
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam === 'compras') {
      setActiveTab('compras')
    }
  }, [searchParams])

  // Filtrar unidades disponíveis para compras respeitando a rede ativa
  const availableBranchesForPurchase = useMemo(() => {
    if (selectedNetworkId !== 'ALL') {
      return branches.filter((b) => b.network_id === selectedNetworkId)
    }
    return branches
  }, [branches, selectedNetworkId])

  // Sincronizar unidade recebedora com os seletores superiores
  useEffect(() => {
    if (selectedBranchId !== 'ALL') {
      setReceivingBranchId(selectedBranchId)
    } else if (
      availableBranchesForPurchase.length > 0 &&
      (!receivingBranchId || !availableBranchesForPurchase.some((b) => b.id === receivingBranchId))
    ) {
      setReceivingBranchId(availableBranchesForPurchase[0].id)
    }
  }, [selectedBranchId, selectedNetworkId, availableBranchesForPurchase, receivingBranchId])

  // Carga Geral de Dados Unificados (Produtos, Categorias, Movimentações, Compras)
  async function loadData() {
    try {
      setLoading(true)

      // 1. Consulta de Movimentações
      let movQuery = supabase
        .from('stock_movements')
        .select('*, product:products(name, sku), branch:branches(name)')
        .order('date', { ascending: false })
        .limit(100)

      if (selectedBranchId !== 'ALL') {
        movQuery = movQuery.eq('branch_id', selectedBranchId)
      } else if (selectedNetworkId !== 'ALL') {
        movQuery = movQuery.eq('network_id', selectedNetworkId)
      }

      // 2. Consulta de Compras
      let purQuery = supabase
        .from('purchases')
        .select(`
          *,
          branch:branches(id, name),
          purchase_items(*, product:products(name, sku))
        `)
        .order('date', { ascending: false })
        .limit(50)

      if (selectedBranchId !== 'ALL') {
        purQuery = purQuery.eq('branch_id', selectedBranchId)
      } else if (selectedNetworkId !== 'ALL') {
        purQuery = purQuery.eq('network_id', selectedNetworkId)
      }

      // 3. Consulta de Produtos (somente ativos)
      let prodQuery = supabase
        .from('products')
        .select('*, category:categories(*), branch:branches(name), network:networks(name)')
        .eq('is_active', true)
        .order('name')

      if (selectedBranchId !== 'ALL') {
        const br = branches.find((b) => b.id === selectedBranchId)
        if (br?.network_id) {
          prodQuery = prodQuery.eq('network_id', br.network_id)
        }
      } else if (selectedNetworkId !== 'ALL') {
        prodQuery = prodQuery.eq('network_id', selectedNetworkId)
      }

      const [prodRes, catRes, movRes, purRes] = await Promise.all([
        prodQuery,
        supabase.from('categories').select('*').order('name'),
        movQuery,
        purQuery,
      ])

      if (prodRes.data) setProducts(prodRes.data as any)
      if (catRes.data) setCategories(catRes.data)
      if (movRes.data) setMovements(movRes.data)
      if (purRes.data) setPurchases(purRes.data)
    } catch (err) {
      console.error('Erro ao carregar estoque e compras:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedBranchId, selectedNetworkId])

  // Filtragem de Produtos
  const filteredProducts = useMemo(() => {
    return products.filter((p: any) => {
      const matchesSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase())
      const matchesCat = selectedCategory ? p.category_id === selectedCategory : true
      const matchesBranch =
        selectedBranchId === 'ALL'
          ? true
          : p.branch_id === selectedBranchId || !p.branch_id

      return matchesSearch && matchesCat && matchesBranch
    })
  }, [products, search, selectedCategory, selectedBranchId])

  // Produtos Críticos
  const criticalProducts = useMemo(() => {
    return products.filter((p: any) => Number(p.stock_quantity || 0) <= Number(p.min_stock || 0))
  }, [products])

  // Métricas Rápidas dos Cards
  const kpis = useMemo(() => {
    const totalCount = filteredProducts.length
    const totalUnits = filteredProducts.reduce((sum, p) => sum + Number(p.stock_quantity || 0), 0)
    const totalCostValue = filteredProducts.reduce(
      (sum, p) => sum + Number(p.stock_quantity || 0) * Number(p.cost_price || 0),
      0
    )
    const criticalCount = filteredProducts.filter(
      (p) => Number(p.stock_quantity || 0) <= Number(p.min_stock || 0)
    ).length

    return { totalCount, totalUnits, totalCostValue, criticalCount }
  }, [filteredProducts])

  // Ação de Repor Produto: Leva para Aba 2 com o produto selecionado
  const handleReporProduto = (productId: number) => {
    const prod = products.find((p) => p.id === productId)
    setSelectedPurchaseProductId(productId)
    if (prod) {
      setItemCost(Number(prod.cost_price || 0))
      setItemQty(1)
    }
    setActiveTab('compras')
  }

  // Abertura do Modal de Cadastro / Edição de Produto
  const handleOpenModal = (prod?: any) => {
    setStockReason('')
    if (prod) {
      setEditingProduct(prod)
      setFormData({
        sku: prod.sku,
        name: prod.name,
        description: prod.description || '',
        cost_price: Number(prod.cost_price || 0),
        sale_price: Number(prod.sale_price || 0),
        stock_quantity: Number(prod.stock_quantity || 0),
        min_stock: Number(prod.min_stock || 5),
        unit: prod.unit || 'un',
        category_id: prod.category_id,
        branch_id: prod.branch_id || '',
      })
    } else {
      setEditingProduct(null)
      const defaultBranch = selectedBranchId !== 'ALL' ? selectedBranchId : ''
      setFormData({
        sku: '',
        name: '',
        description: '',
        cost_price: 0,
        sale_price: 0,
        stock_quantity: 0,
        min_stock: 5,
        unit: 'un',
        category_id: categories[0]?.id || null,
        branch_id: defaultBranch,
      })
    }
    setIsModalOpen(true)
  }

  // Salvar Produto (Novo ou Edição)
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const targetBranchId = formData.branch_id ? formData.branch_id : null
      const branchObj = targetBranchId ? branches.find((b) => b.id === targetBranchId) : null
      const targetNetworkId =
        branchObj?.network_id ||
        (selectedNetworkId !== 'ALL' ? selectedNetworkId : networks[0]?.id || null)

      if (editingProduct) {
        const isStockChanged = Number(formData.stock_quantity) !== Number(editingProduct.stock_quantity)
        if (isStockChanged && stockReason.trim().length < 3) {
          showWarning(
            'Motivo Obrigatório',
            'Para ajustar manualmente o saldo em estoque, informe uma justificativa com no mínimo 3 caracteres.'
          )
          return
        }

        const { error: updateErr } = await supabase
          .from('products')
          .update({
            sku: formData.sku.trim(),
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            cost_price: Number(formData.cost_price),
            sale_price: Number(formData.sale_price),
            min_stock: Number(formData.min_stock),
            unit: formData.unit.trim() || 'un',
            category_id: formData.category_id,
            branch_id: targetBranchId,
            network_id: targetNetworkId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingProduct.id)

        if (updateErr) throw updateErr

        if (isStockChanged) {
          const { error: rpcErr } = await supabase.rpc('adjust_product_stock', {
            p_product_id: editingProduct.id,
            p_new_quantity: Number(formData.stock_quantity),
            p_reason: stockReason.trim(),
          })
          if (rpcErr) throw rpcErr
        }
      } else {
        const initialStock = Number(formData.stock_quantity) || 0

        const { data: newProd, error: insertErr } = await supabase
          .from('products')
          .insert([
            {
              sku: formData.sku.trim(),
              name: formData.name.trim(),
              description: formData.description.trim() || null,
              cost_price: Number(formData.cost_price),
              sale_price: Number(formData.sale_price),
              stock_quantity: 0,
              min_stock: Number(formData.min_stock),
              unit: formData.unit.trim() || 'un',
              category_id: formData.category_id,
              branch_id: targetBranchId,
              network_id: targetNetworkId,
              is_active: true,
            },
          ])
          .select('id')
          .single()

        if (insertErr) throw insertErr

        if (initialStock > 0 && newProd) {
          const { error: rpcErr } = await supabase.rpc('adjust_product_stock', {
            p_product_id: newProd.id,
            p_new_quantity: initialStock,
            p_reason: 'Estoque inicial de cadastro',
          })
          if (rpcErr) throw rpcErr
        }
      }

      showSuccess(
        editingProduct ? 'Produto Atualizado!' : 'Produto Cadastrado!',
        `"${formData.name}" foi salvo com sucesso no catálogo.`
      )
      setIsModalOpen(false)
      loadData()
    } catch (err: any) {
      showError('Erro ao salvar produto', err.message)
    }
  }

  // Exclusão Definitiva de Produto via RPC admin_delete_product
  const handleConfirmDeleteProduct = async () => {
    if (!deletingProduct) return
    try {
      setIsDeleting(true)

      const { data, error } = await supabase.rpc('admin_delete_product', {
        p_product_id: deletingProduct.id,
      })

      if (error) {
        // Fallback: se a RPC não existir ainda no banco, desativa o produto
        const { error: fallbackErr } = await supabase
          .from('products')
          .update({ is_active: false })
          .eq('id', deletingProduct.id)

        if (fallbackErr) throw fallbackErr
        showSuccess('Produto Inativado', `"${deletingProduct.name}" foi desativado do catálogo.`)
      } else {
        showSuccess('Produto Excluído Definitivamente!', `"${deletingProduct.name}" foi removido do banco.`)
      }

      setDeletingProduct(null)
      loadData()
    } catch (err: any) {
      showError('Erro ao excluir produto', err.message || 'Falha ao processar exclusão.')
    } finally {
      setIsDeleting(false)
    }
  }

  // Adicionar Item na Lista da Nota Fiscal
  const handleAddPurchaseItem = () => {
    if (!selectedPurchaseProductId) {
      showWarning('Selecione um Produto', 'Escolha o item a ser reposto.')
      return
    }
    if (itemQty <= 0) {
      showWarning('Quantidade Inválida', 'A quantidade reposta deve ser maior que zero.')
      return
    }
    if (itemCost < 0) {
      showWarning('Custo Inválido', 'O custo unitário não pode ser negativo.')
      return
    }

    const prod = products.find((p) => p.id === selectedPurchaseProductId)
    if (!prod) return

    const existingIndex = purchaseItems.findIndex((it) => it.product_id === prod.id)
    if (existingIndex >= 0) {
      const updated = [...purchaseItems]
      updated[existingIndex].quantity += itemQty
      updated[existingIndex].unit_cost = itemCost
      setPurchaseItems(updated)
    } else {
      setPurchaseItems([
        ...purchaseItems,
        {
          product_id: prod.id,
          product_name: prod.name,
          quantity: itemQty,
          unit_cost: itemCost,
          unit: prod.unit || 'un',
        },
      ])
    }

    setSelectedPurchaseProductId(null)
    setItemQty(1)
    setItemCost(0)
  }

  const handleRemovePurchaseItem = (index: number) => {
    setPurchaseItems(purchaseItems.filter((_, idx) => idx !== index))
  }

  const purchaseTotalValue = useMemo(() => {
    return purchaseItems.reduce((sum, it) => sum + it.quantity * it.unit_cost, 0)
  }, [purchaseItems])

  // Concluir Entrada de Compra (NF) via RPC create_complete_purchase
  const handleFinishPurchase = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supplier.trim()) {
      showWarning('Fornecedor Obrigatório', 'Informe o nome do fornecedor ou distribuidor.')
      return
    }
    if (!receivingBranchId) {
      showWarning('Unidade Obrigatória', 'Selecione a Unidade que está recebendo a mercadoria.')
      return
    }
    if (purchaseItems.length === 0) {
      showWarning('Nota Vazia', 'Adicione pelo menos um item à nota fiscal antes de confirmar.')
      return
    }

    try {
      setSubmittingPurchase(true)

      const payload = {
        p_branch_id: receivingBranchId,
        p_supplier: supplier.trim(),
        p_invoice_number: invoiceNumber.trim() || null,
        p_items: purchaseItems.map((it) => ({
          product_id: it.product_id,
          quantity: it.quantity,
          unit_cost: it.unit_cost,
        })),
      }

      const { error } = await supabase.rpc('create_complete_purchase', payload)
      if (error) throw error

      showSuccess(
        'Entrada de Nota Fiscal Registrada!',
        `Compra de ${formatCurrency(purchaseTotalValue)} confirmada e estoque atualizado.`
      )

      // Limpar formulário de compra
      setSupplier('')
      setInvoiceNumber('')
      setPurchaseItems([])
      setSelectedPurchaseProductId(null)

      // Recarregar dados para atualizar imediatamente os saldos na Aba 1
      loadData()
    } catch (err: any) {
      showError('Erro ao registrar entrada', err.message || 'Falha ao registrar compra.')
    } finally {
      setSubmittingPurchase(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ========================================================
          BARRA DE AÇÕES SUPERIOR & ABAS UNIFICADAS
          ======================================================== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* 4 Abas Principais */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/90 p-1.5 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab('produtos')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition cursor-pointer ${
              activeTab === 'produtos'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Package size={15} />
            <span>Produtos & Estoque</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('compras')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition cursor-pointer ${
              activeTab === 'compras'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Truck size={15} />
            <span>Entrada de Compras (NF)</span>
            {purchaseItems.length > 0 && (
              <span className="rounded-full bg-slate-950 text-amber-400 px-1.5 py-0.2 text-[10px] font-black">
                {purchaseItems.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('alertas')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition cursor-pointer ${
              activeTab === 'alertas'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                : 'text-slate-400 hover:text-rose-400 hover:bg-slate-800/60'
            }`}
          >
            <AlertTriangle size={15} />
            <span>Estoque Crítico</span>
            {criticalProducts.length > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                  activeTab === 'alertas' ? 'bg-slate-950 text-rose-300' : 'bg-rose-500/20 text-rose-400'
                }`}
              >
                {criticalProducts.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('movimentacoes')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition cursor-pointer ${
              activeTab === 'movimentacoes'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ArrowUpDown size={15} />
            <span>Movimentações</span>
          </button>
        </div>

        {/* 2 Botões de Ação Direta */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setActiveTab('compras')
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition shadow-sm cursor-pointer"
          >
            <Truck size={14} className="text-amber-400" />
            <span>+ Nova Entrada (NF)</span>
          </button>

          {canManageProducts && (
            <button
              type="button"
              onClick={() => handleOpenModal()}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20 transition cursor-pointer"
            >
              <Plus size={16} />
              <span>+ Novo Produto</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================
          ABA 1: 📦 PRODUTOS & ESTOQUE
          ======================================================== */}
      {activeTab === 'produtos' && (
        <div className="space-y-6">
          {/* 4 Cards Rápidos de Visão Executiva */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Total de Produtos</span>
              <h3 className="text-2xl font-black text-white mt-1.5">{kpis.totalCount}</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Itens cadastrados no catálogo</p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Itens em Estoque</span>
              <h3 className="text-2xl font-black text-emerald-400 mt-1.5">
                {kpis.totalUnits.toLocaleString('pt-BR')}{' '}
                <span className="text-xs font-normal text-slate-400">un</span>
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Saldo físico consolidado</p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Valor em Estoque (Custo)</span>
              <h3 className="text-2xl font-black text-amber-400 mt-1.5 font-mono">
                {formatCurrency(kpis.totalCostValue)}
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Capital investido em mercadoria</p>
            </div>

            <div
              onClick={() => setActiveTab('alertas')}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm hover:border-rose-500/40 transition cursor-pointer group"
            >
              <span className="text-[11px] font-semibold text-slate-400 uppercase group-hover:text-rose-400 transition">
                Produtos em Alerta Crítico
              </span>
              <h3 className="text-2xl font-black text-rose-400 mt-1.5">{kpis.criticalCount}</h3>
              <p className="text-[10px] text-slate-500 mt-0.5 group-hover:text-rose-300/80 transition">
                Estoque &le; mínimo &bull; Clique para ver
              </p>
            </div>
          </div>

          {/* Busca e Filtro de Categorias */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Buscar por nome ou SKU do produto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900/60 py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div className="w-full sm:w-56">
              <select
                value={selectedCategory || ''}
                onChange={(e) => setSelectedCategory(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-xs text-white focus:border-amber-500 focus:outline-none cursor-pointer"
              >
                <option value="">Todas as Categorias</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tabela de Produtos & Estoque */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-950/70 text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4">Nome do Produto</th>
                    <th className="py-3 px-4">Unidade</th>
                    <th className="py-3 px-4">Categoria</th>
                    <th className="py-3 px-4 text-right">Custo</th>
                    <th className="py-3 px-4 text-right">Venda</th>
                    <th className="py-3 px-4 text-right">Lucro / Margem</th>
                    <th className="py-3 px-4 text-center">Estoque</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500">
                        Carregando catálogo de produtos...
                      </td>
                    </tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500">
                        Nenhum produto encontrado com os filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p: any) => {
                      const isLowStock = Number(p.stock_quantity || 0) <= Number(p.min_stock || 0)
                      const profit = Number(p.sale_price || 0) - Number(p.cost_price || 0)
                      const marginPercent =
                        Number(p.sale_price) > 0 ? (profit / Number(p.sale_price)) * 100 : 0

                      return (
                        <tr key={p.id} className="hover:bg-slate-800/30 transition">
                          <td className="py-3 px-4 font-mono text-slate-400 font-semibold">{p.sku}</td>
                          <td className="py-3 px-4 font-bold text-white">
                            <span>{p.name}</span>
                            {isLowStock && (
                              <span className="ml-2 inline-flex items-center gap-1 rounded bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.2 text-[9px] font-bold text-rose-400 uppercase">
                                Baixo Estoque
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-[11px] text-amber-300">
                            {p.branch?.name ? (
                              <span className="inline-flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                                <Store size={11} className="text-amber-400 shrink-0" />
                                {p.branch.name}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                                <Building2 size={11} className="text-slate-500 shrink-0" />
                                Todas as Unidades
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-400">{p.category?.name || '-'}</td>
                          <td className="py-3 px-4 text-right font-mono text-slate-400">
                            {formatCurrency(p.cost_price)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                            {formatCurrency(p.sale_price)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            <span
                              className={`font-bold block ${
                                profit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {profit >= 0 ? '+' : ''}
                              {formatCurrency(profit)}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              {marginPercent.toFixed(1)}% margem
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`font-mono font-bold px-2 py-0.5 rounded ${
                                isLowStock
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                  : 'text-white bg-slate-950/60 border border-slate-800'
                              }`}
                            >
                              {p.stock_quantity} {p.unit}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* 1. Botão Repor (Leva para Aba 2) */}
                              <button
                                type="button"
                                onClick={() => handleReporProduto(p.id)}
                                className="flex items-center gap-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 text-[11px] font-bold text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 transition cursor-pointer"
                                title="Repor este produto via Entrada de Compras"
                              >
                                <Truck size={12} />
                                <span>Repor</span>
                              </button>

                              {/* 2. Botão Editar */}
                              <button
                                type="button"
                                onClick={() => handleOpenModal(p)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
                                title="Editar Cadastro / Ajustar Estoque"
                              >
                                <Edit2 size={14} />
                              </button>

                              {/* 3. Botão Excluir */}
                              {canManageProducts && (
                                <button
                                  type="button"
                                  onClick={() => setDeletingProduct(p)}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition cursor-pointer"
                                  title="Excluir Definitivamente este Produto"
                                >
                                  <Trash2 size={14} />
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
        </div>
      )}

      {/* ========================================================
          ABA 2: 🚚 ENTRADA DE COMPRAS (NF)
          ======================================================== */}
      {activeTab === 'compras' && (
        <div className="space-y-8 animate-in fade-in">
          {/* BLOCO SUPERIOR: FORMULÁRIO DE NOVA ENTRADA DE NOTA FISCAL */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-sm space-y-6">
            <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Truck className="text-amber-400" size={20} /> Lançamento de Entrada de Mercadorias (NF)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Registre compras de fornecedores para alimentar o estoque e atualizar o custo médio ponderado
                </p>
              </div>

              {purchaseItems.length > 0 && (
                <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl">
                  <span className="text-xs text-slate-400">Total da Nota:</span>
                  <span className="text-sm font-black text-emerald-400 font-mono">
                    {formatCurrency(purchaseTotalValue)}
                  </span>
                </div>
              )}
            </div>

            <form onSubmit={handleFinishPurchase} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* 1. Informações da Nota e Seleção de Itens (Esquerda) */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold text-slate-300">
                        Fornecedor / Razão Social *
                      </label>
                      <input
                        type="text"
                        required
                        value={supplier}
                        onChange={(e) => setSupplier(e.target.value)}
                        placeholder="Ex: Granja Avícola São José LTDA"
                        className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-300">Nº da NF / Fatura</label>
                      <input
                        type="text"
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        placeholder="Ex: NF-008472"
                        className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                      <span>Unidade Recebedora da Mercadoria *</span>
                      <span className="text-[10px] text-amber-400">Sincronizada com a Rede Ativa</span>
                    </label>
                    <select
                      value={receivingBranchId}
                      onChange={(e) => setReceivingBranchId(e.target.value)}
                      required
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                    >
                      {availableBranchesForPurchase.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Adição de Produto */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
                      Adicionar Item à Nota Fiscal
                    </span>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-400">Produto a Repor *</label>
                      <select
                        value={selectedPurchaseProductId || ''}
                        onChange={(e) => {
                          const pId = e.target.value ? Number(e.target.value) : null
                          setSelectedPurchaseProductId(pId)
                          const found = products.find((p) => p.id === pId)
                          if (found) {
                            setItemCost(Number(found.cost_price || 0))
                          }
                        }}
                        className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                      >
                        <option value="">Selecione um produto do catálogo...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Estoque: {p.stock_quantity} {p.unit} &bull; Custo Atual:{' '}
                            {formatCurrency(p.cost_price)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-400">
                          Quantidade a dar Entrada *
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={itemQty}
                          onChange={(e) => setItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                          className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-400">
                          Custo Unitário desta Nota (R$) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={itemCost}
                          onChange={(e) => setItemCost(parseFloat(e.target.value) || 0)}
                          className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none font-mono font-bold text-amber-300"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddPurchaseItem}
                      disabled={!selectedPurchaseProductId}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-800 border border-slate-700 py-2.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50 transition cursor-pointer"
                    >
                      <Plus size={15} className="text-amber-400" />
                      <span>Adicionar Item à Nota Fiscal</span>
                    </button>
                  </div>
                </div>

                {/* 2. Itens Incluídos na Nota Fiscal (Direita) */}
                <div className="lg:col-span-5 flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                      <h4 className="text-xs font-bold text-slate-300 uppercase">
                        Itens Incluídos ({purchaseItems.length})
                      </h4>
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        {formatCurrency(purchaseTotalValue)}
                      </span>
                    </div>

                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {purchaseItems.length === 0 ? (
                        <div className="py-12 text-center text-xs text-slate-500">
                          Nenhum item adicionado à nota ainda. Selecione um produto e adicione.
                        </div>
                      ) : (
                        purchaseItems.map((it, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-800 bg-slate-900/60"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-white truncate">{it.product_name}</p>
                              <p className="text-[10px] text-slate-400 font-mono">
                                {it.quantity} {it.unit} &times; {formatCurrency(it.unit_cost)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-bold text-emerald-400 font-mono">
                                {formatCurrency(it.quantity * it.unit_cost)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemovePurchaseItem(idx)}
                                className="text-slate-500 hover:text-rose-400 p-1"
                                title="Remover item"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-800 mt-4 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-400">Subtotal da Compra:</span>
                      <span className="text-base font-black text-emerald-400 font-mono">
                        {formatCurrency(purchaseTotalValue)}
                      </span>
                    </div>

                    <button
                      type="submit"
                      disabled={submittingPurchase || purchaseItems.length === 0}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-xs font-extrabold text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition shadow-md shadow-amber-500/20 cursor-pointer"
                    >
                      <PackageCheck size={16} />
                      <span>{submittingPurchase ? 'Lançando Nota...' : 'Confirmar Entrada de Nota Fiscal'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>

          {/* BLOCO INFERIOR: HISTÓRICO DE COMPRAS / NOTAS REGISTRADAS */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h4 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="text-amber-400" size={18} /> Histórico de Notas de Entrada Registradas
                </h4>
                <p className="text-xs text-slate-400">Últimas 50 entradas de mercadorias no estoque</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-950/70 text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3">Data</th>
                    <th className="py-2.5 px-3">NF / Fatura</th>
                    <th className="py-2.5 px-3">Unidade</th>
                    <th className="py-2.5 px-3">Fornecedor</th>
                    <th className="py-2.5 px-3">Itens Repostos</th>
                    <th className="py-2.5 px-3 text-right">Valor Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {purchases.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Nenhuma entrada de mercadoria registrada até o momento.
                      </td>
                    </tr>
                  ) : (
                    purchases.map((pur: any) => {
                      const totalItemsQty = (pur.purchase_items || []).reduce(
                        (sum: number, it: any) => sum + Number(it.quantity || 0),
                        0
                      )

                      return (
                        <tr key={pur.id} className="hover:bg-slate-800/30 transition">
                          <td className="py-2.5 px-3 font-mono font-bold text-amber-400">#{pur.id}</td>
                          <td className="py-2.5 px-3 text-slate-400">{formatDate(pur.date || pur.created_at)}</td>
                          <td className="py-2.5 px-3 font-mono text-white font-semibold">
                            {pur.invoice_number || 'Sem NF'}
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-amber-300">
                            {pur.branch?.name || 'Geral'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-200 font-medium">{pur.supplier}</td>
                          <td className="py-2.5 px-3 text-slate-400">
                            <span className="font-semibold text-slate-300">
                              {(pur.purchase_items || []).length} itens
                            </span>{' '}
                            <span className="text-[10px]">({totalItemsQty} un)</span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                            {formatCurrency(pur.total_amount)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          ABA 3: ⚠️ ESTOQUE CRÍTICO
          ======================================================== */}
      {activeTab === 'alertas' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Produtos em Alerta Crítico de Reposição</h4>
                <p className="text-xs text-slate-400">
                  Itens com saldo igual ou abaixo do estoque mínimo configurado para o ponto de venda
                </p>
              </div>
            </div>

            <span className="rounded-xl bg-rose-500/20 border border-rose-500/30 px-3 py-1 text-xs font-bold text-rose-300">
              {criticalProducts.length} {criticalProducts.length === 1 ? 'Produto' : 'Produtos'}
            </span>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-950/70 text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4">Nome do Produto</th>
                    <th className="py-3 px-4">Unidade</th>
                    <th className="py-3 px-4 text-center">Estoque Atual</th>
                    <th className="py-3 px-4 text-center">Estoque Mínimo</th>
                    <th className="py-3 px-4 text-center">Déficit / Falta</th>
                    <th className="py-3 px-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {criticalProducts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        Nenhum produto em estoque crítico no momento! Parabéns pelo controle de suprimentos.
                      </td>
                    </tr>
                  ) : (
                    criticalProducts.map((p: any) => {
                      const deficit = Math.max(0, Number(p.min_stock || 0) - Number(p.stock_quantity || 0))

                      return (
                        <tr key={p.id} className="hover:bg-slate-800/30 transition">
                          <td className="py-3 px-4 font-mono text-slate-400 font-semibold">{p.sku}</td>
                          <td className="py-3 px-4 font-bold text-white">{p.name}</td>
                          <td className="py-3 px-4 text-[11px] text-amber-300">
                            {p.branch?.name || 'Todas as Unidades'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="font-mono font-black text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded">
                              {p.stock_quantity} {p.unit}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-mono text-slate-400">
                            {p.min_stock} {p.unit}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="font-mono font-bold text-amber-400">
                              {deficit > 0 ? `-${deficit} ${p.unit}` : 'No Limite'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleReporProduto(p.id)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition shadow-sm cursor-pointer"
                            >
                              <Truck size={13} />
                              <span>Repor Este Produto</span>
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          ABA 4: ↕️ MOVIMENTAÇÕES
          ======================================================== */}
      {activeTab === 'movimentacoes' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4 shadow-sm animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              <ArrowUpDown className="text-amber-400" size={18} /> Histórico de Movimentações de Estoque
            </h4>
            <span className="text-xs text-slate-400 font-medium">Últimas 100 movimentações auditadas</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/70 text-slate-400 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Data</th>
                  <th className="py-2.5 px-3">Produto</th>
                  <th className="py-2.5 px-3">Unidade</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3">Qtd</th>
                  <th className="py-2.5 px-3">Origem</th>
                  <th className="py-2.5 px-3">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Nenhuma movimentação de estoque registrada.
                    </td>
                  </tr>
                ) : (
                  movements.map((m: any) => (
                    <tr key={m.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-2.5 px-3 text-slate-400">{formatDate(m.date || m.created_at)}</td>
                      <td className="py-2.5 px-3 font-semibold text-white">
                        {m.product?.name || `Produto #${m.product_id}`}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-amber-300">
                        {m.branch?.name || 'Geral'}
                      </td>
                      <td className="py-2.5 px-3 font-bold">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            m.movement_type === 'IN'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {m.movement_type === 'IN' ? '+ ENTRADA' : '- SAÍDA'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-white">{m.quantity}</td>
                      <td className="py-2.5 px-3 text-slate-400 uppercase text-[10px]">{m.origin}</td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">{m.note || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL DE CADASTRO / EDIÇÃO DE PRODUTO
          ======================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">
                {editingProduct ? 'Editar Produto' : 'Cadastrar Novo Produto'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400">Código / SKU *</label>
                  <input
                    type="text"
                    required
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none font-mono"
                    placeholder="Ex: BEB-001"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400">Unidade de Destino</label>
                  <select
                    value={formData.branch_id}
                    onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                  >
                    <option value="">Geral (Todas as Unidades)</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Categoria</label>
                <select
                  value={formData.category_id || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      category_id: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                >
                  <option value="">Selecione uma Categoria...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Nome do Produto *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  placeholder="Ex: Bandeja de Ovos Caipira 30 un"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400">Preço de Custo (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.cost_price}
                    onChange={(e) => setFormData({ ...formData, cost_price: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400">Preço de Venda (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.sale_price}
                    onChange={(e) => setFormData({ ...formData, sale_price: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none font-bold text-emerald-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400">
                    Estoque {editingProduct ? 'Desejado' : 'Inicial'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.stock_quantity}
                    onChange={(e) =>
                      setFormData({ ...formData, stock_quantity: Number(e.target.value) })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400">Estoque Mínimo</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.min_stock}
                    onChange={(e) => setFormData({ ...formData, min_stock: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400">Unid. de Medida</label>
                  <input
                    type="text"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                    placeholder="un, kg, lt, cx"
                  />
                </div>
              </div>

              {/* Justificativa Obrigatória em caso de alteração de estoque */}
              {editingProduct && Number(formData.stock_quantity) !== Number(editingProduct.stock_quantity) && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
                  <label className="text-xs font-bold text-amber-400">
                    Motivo do Ajuste de Estoque (Obrigatório) *
                  </label>
                  <input
                    type="text"
                    required
                    value={stockReason}
                    onChange={(e) => setStockReason(e.target.value)}
                    className="w-full rounded-lg border border-amber-500/40 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                    placeholder="Ex: Inventário de conferência / Quebra / Avaria"
                  />
                  <p className="text-[10px] text-slate-400">
                    A alteração de {editingProduct.stock_quantity} para {formData.stock_quantity} {formData.unit} será
                    auditada e registrada no livro fiscal de estoque.
                  </p>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-400 hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-500 px-6 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400 transition cursor-pointer"
                >
                  Salvar Produto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DEFINITIVA
          ======================================================== */}
      {deletingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400 pb-3 border-b border-slate-800">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/20">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Excluir Produto Definitivamente</h3>
                <p className="text-[11px] text-slate-400">Ação permanente no banco de dados</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Tem certeza que deseja excluir o produto{' '}
              <strong className="text-white font-bold">{deletingProduct.name}</strong> (SKU:{' '}
              <span className="font-mono text-amber-400">{deletingProduct.sku}</span>)?
            </p>

            <div className="rounded-xl bg-slate-950 p-3 border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <p className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <CheckCircle2 size={13} /> O histórico financeiro e relatórios de vendas/compras anteriores serão
                preservados.
              </p>
              <p>O produto será removido do catálogo e não aparecerá mais no PDV nem em estoque.</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingProduct(null)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-400 hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteProduct}
                disabled={isDeleting}
                className="rounded-xl bg-rose-500 px-5 py-2 text-xs font-extrabold text-white hover:bg-rose-600 disabled:opacity-50 transition cursor-pointer shadow-md shadow-rose-500/20"
              >
                {isDeleting ? 'Excluindo...' : 'Sim, Excluir Definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function EstoquePage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-xs text-slate-500">
          Carregando Central de Estoque & Compras...
        </div>
      }
    >
      <EstoqueContent />
    </Suspense>
  )
}
