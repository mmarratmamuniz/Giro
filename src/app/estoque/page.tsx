'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useFeedback } from '@/contexts/feedback-context'
import { Database } from '@/types/database'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useNetwork } from '@/contexts/network-context'
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  ArrowUpDown,
  Edit2,
  X,
  Store,
  Building2,
} from 'lucide-react'

type Product = Database['public']['Tables']['products']['Row']
type Category = Database['public']['Tables']['categories']['Row']

export default function EstoquePage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [movements, setMovements] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'produtos' | 'movimentacoes' | 'alertas'>('produtos')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)

  const { showSuccess, showError, showWarning } = useFeedback()
  const { networks, branches, selectedNetworkId, selectedBranchId } = useNetwork()

  // Modal de Produto (Novo / Edição)
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

  const [supabase] = useState(() => createClient())

  async function loadData() {
    try {
      setLoading(true)

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

      const [prodRes, catRes, movRes] = await Promise.all([
        supabase
          .from('products')
          .select('*, category:categories(*), branch:branches(name), network:networks(name)')
          .order('name'),
        supabase.from('categories').select('*').order('name'),
        movQuery,
      ])

      if (prodRes.data) setProducts(prodRes.data as any)
      if (catRes.data) setCategories(catRes.data)
      if (movRes.data) setMovements(movRes.data)
    } catch (err) {
      console.error('Erro ao carregar estoque:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedBranchId, selectedNetworkId])

  // Filtragem
  const filteredProducts = products.filter((p: any) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
    const matchesCat = selectedCategory ? p.category_id === selectedCategory : true
    const matchesBranch =
      selectedBranchId === 'ALL'
        ? true
        : p.branch_id === selectedBranchId || !p.branch_id
    const matchesNetwork =
      selectedNetworkId === 'ALL'
        ? true
        : p.network_id === selectedNetworkId || !p.network_id

    if (activeTab === 'alertas') {
      return matchesSearch && matchesCat && matchesBranch && matchesNetwork && p.stock_quantity <= p.min_stock
    }
    return matchesSearch && matchesCat && matchesBranch && matchesNetwork
  })

  // Abrir Modal
  const handleOpenModal = (prod?: any) => {
    setStockReason('')
    if (prod) {
      setEditingProduct(prod)
      setFormData({
        sku: prod.sku,
        name: prod.name,
        description: prod.description || '',
        cost_price: prod.cost_price,
        sale_price: prod.sale_price,
        stock_quantity: prod.stock_quantity,
        min_stock: prod.min_stock,
        unit: prod.unit,
        category_id: prod.category_id,
        branch_id: prod.branch_id || '',
      })
    } else {
      setEditingProduct(null)
      const defaultBranch =
        selectedBranchId !== 'ALL' ? selectedBranchId : ''
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

  // Salvar Produto via RPC segura
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      // Quando vazio (""), grava null (Geral / Todas as Filiais)
      const targetBranchId = formData.branch_id ? formData.branch_id : null
      const branchObj = targetBranchId ? branches.find((b) => b.id === targetBranchId) : null
      const targetNetworkId =
        branchObj?.network_id ||
        (selectedNetworkId !== 'ALL' ? selectedNetworkId : networks[0]?.id || null)

      if (editingProduct) {
        const isStockChanged = Number(formData.stock_quantity) !== editingProduct.stock_quantity
        if (isStockChanged && stockReason.trim().length < 3) {
          showWarning('Motivo Obrigatório', 'Para ajustar a quantidade em estoque, informe uma justificativa com no mínimo 3 caracteres.')
          return
        }

        // Atualizar dados cadastrais (sem alterar stock_quantity diretamente)
        const { error: updateErr } = await supabase
          .from('products')
          .update({
            sku: formData.sku,
            name: formData.name,
            description: formData.description || null,
            cost_price: Number(formData.cost_price),
            sale_price: Number(formData.sale_price),
            min_stock: Number(formData.min_stock),
            unit: formData.unit,
            category_id: formData.category_id,
            branch_id: targetBranchId,
            network_id: targetNetworkId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingProduct.id)

        if (updateErr) throw updateErr

        // Se o estoque foi alterado, chama a RPC de ajuste auditado
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

        // Inserir Novo Produto com estoque 0
        const { data: newProd, error: insertErr } = await supabase
          .from('products')
          .insert([
            {
              sku: formData.sku,
              name: formData.name,
              description: formData.description || null,
              cost_price: Number(formData.cost_price),
              sale_price: Number(formData.sale_price),
              stock_quantity: 0,
              min_stock: Number(formData.min_stock),
              unit: formData.unit,
              category_id: formData.category_id,
              branch_id: targetBranchId,
              network_id: targetNetworkId,
            },
          ])
          .select('id')
          .single()

        if (insertErr) throw insertErr

        // Se houver estoque inicial > 0, lança via RPC auditada
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
        `${formData.name} foi salvo no catálogo.`
      )
      setIsModalOpen(false)
      loadData()
    } catch (err: any) {
      showError('Erro ao salvar produto', err.message)
    }
  }

  // Alternar Ativo/Inativo
  const handleToggleActive = async (product: Product) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: !product.is_active })
        .eq('id', product.id)
      if (error) throw error
      showSuccess(
        'Status Atualizado',
        `Produto ${product.name} agora está ${!product.is_active ? 'Ativo' : 'Inativo'}.`
      )
      loadData()
    } catch (err: any) {
      showError('Erro ao atualizar status', err.message)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Barra de Ações Superior */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Abas */}
        <div className="flex rounded-xl bg-slate-900 border border-slate-800 p-1">
          <button
            onClick={() => setActiveTab('produtos')}
            className={`rounded-lg px-4 py-2 text-xs font-bold transition cursor-pointer ${
              activeTab === 'produtos'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Todos os Produtos
          </button>
          <button
            onClick={() => setActiveTab('alertas')}
            className={`rounded-lg px-4 py-2 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'alertas'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <AlertTriangle size={13} /> Estoque Crítico
          </button>
          <button
            onClick={() => setActiveTab('movimentacoes')}
            className={`rounded-lg px-4 py-2 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'movimentacoes'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ArrowUpDown size={13} /> Movimentações
          </button>
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20 transition cursor-pointer"
        >
          <Plus size={16} /> Novo Produto
        </button>
      </div>

      {activeTab === 'movimentacoes' ? (
        /* Histórico de Movimentações */
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-bold text-white">Histórico de Movimentações de Estoque</h4>
            <span className="text-xs text-slate-400 font-medium">Últimas 100 movimentações auditadas</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold uppercase">
                <tr>
                  <th className="py-2.5 px-3">Data</th>
                  <th className="py-2.5 px-3">Produto</th>
                  <th className="py-2.5 px-3">Filial</th>
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
                    <tr key={m.id} className="hover:bg-slate-800/30">
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
      ) : (
        /* Catálogo de Produtos */
        <div className="space-y-4">
          {/* Filtros e Busca */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Buscar por nome ou SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900/60 py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div className="w-full sm:w-48">
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

          {/* Tabela de Produtos */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold uppercase">
                  <tr>
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4">Nome do Produto</th>
                    <th className="py-3 px-4">Filial / Rede</th>
                    <th className="py-3 px-4">Categoria</th>
                    <th className="py-3 px-4 text-right">Custo</th>
                    <th className="py-3 px-4 text-right">Venda</th>
                    <th className="py-3 px-4 text-center">Estoque</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        Carregando estoque...
                      </td>
                    </tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        Nenhum produto cadastrado ou correspondente à busca.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p: any) => {
                      const isLowStock = p.stock_quantity <= p.min_stock
                      return (
                        <tr key={p.id} className="hover:bg-slate-800/30 transition">
                          <td className="py-3 px-4 font-mono text-slate-400">{p.sku}</td>
                          <td className="py-3 px-4 font-bold text-white">{p.name}</td>
                          <td className="py-3 px-4 text-[11px] text-amber-300">
                            {p.branch?.name ? (
                              <span className="flex items-center gap-1">
                                <Store size={12} className="text-amber-400 shrink-0" />
                                {p.branch.name}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-slate-400">
                                <Building2 size={12} className="text-slate-500 shrink-0" />
                                Geral (Todas as Lojas)
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
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`font-mono font-bold px-2 py-0.5 rounded ${
                                isLowStock
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                  : 'text-white'
                              }`}
                            >
                              {p.stock_quantity} {p.unit}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleActive(p)}
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold cursor-pointer ${
                                p.is_active
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}
                            >
                              {p.is_active ? 'Ativo' : 'Inativo'}
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenModal(p)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
                              title="Editar Produto"
                            >
                              <Edit2 size={15} />
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

      {/* MODAL DE CADASTRO / EDIÇÃO */}
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
                  <label className="text-xs font-semibold text-slate-400">Código / SKU</label>
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
                  <label className="text-xs font-semibold text-slate-400">Filial de Destino</label>
                  <select
                    value={formData.branch_id}
                    onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                  >
                    <option value="">Geral (Todas as Filiais)</option>
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
                <label className="text-xs font-semibold text-slate-400">Nome do Produto</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  placeholder="Ex: Cerveja Heineken 350ml"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400">Preço de Custo (R$)</label>
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
                  <label className="text-xs font-semibold text-slate-400">Preço de Venda (R$)</label>
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
                  <label className="text-xs font-semibold text-slate-400">Estoque {editingProduct ? 'Desejado' : 'Inicial'}</label>
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
                  <label className="text-xs font-semibold text-slate-400">Unidade</label>
                  <input
                    type="text"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                    placeholder="un, kg, lt"
                  />
                </div>
              </div>

              {/* Campo de Justificativa se o estoque estiver sendo modificado na edição */}
              {editingProduct && Number(formData.stock_quantity) !== editingProduct.stock_quantity && (
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
                    A alteração de {editingProduct.stock_quantity} para {formData.stock_quantity} {formData.unit} será registrada no livro fiscal de estoque.
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
    </div>
  )
}
