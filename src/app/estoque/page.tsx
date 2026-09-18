'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useFeedback } from '@/contexts/feedback-context'
import { Database } from '@/types/database'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Package,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  ArrowUpDown,
  Edit2,
  Trash2,
  History,
  X,
  Check,
} from 'lucide-react'

type Product = Database['public']['Tables']['products']['Row']
type Category = Database['public']['Tables']['categories']['Row']
type StockMovement = Database['public']['Tables']['stock_movements']['Row']

export default function EstoquePage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [movements, setMovements] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'produtos' | 'movimentacoes' | 'alertas'>('produtos')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)

  const { showSuccess, showError } = useFeedback()

  // Modal de Produto (Novo / Edição)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
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
  })

  const supabase = createClient()

  async function loadData() {
    try {
      setLoading(true)
      const [prodRes, catRes, movRes] = await Promise.all([
        supabase.from('products').select('*, category:categories(*)').order('name'),
        supabase.from('categories').select('*').order('name'),
        supabase
          .from('stock_movements')
          .select('*, product:products(name, sku)')
          .order('date', { ascending: false })
          .limit(100),
      ])

      if (prodRes.data) setProducts(prodRes.data)
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
  }, [])

  // Filtragem
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
    const matchesCat = selectedCategory ? p.category_id === selectedCategory : true
    if (activeTab === 'alertas') {
      return matchesSearch && matchesCat && p.stock_quantity <= p.min_stock
    }
    return matchesSearch && matchesCat
  })

  // Abrir Modal
  const handleOpenModal = (prod?: Product) => {
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
      })
    } else {
      setEditingProduct(null)
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
      })
    }
    setIsModalOpen(true)
  }

  // Salvar Produto
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingProduct) {
        // Atualizar
        const { error } = await supabase
          .from('products')
          .update({
            sku: formData.sku,
            name: formData.name,
            description: formData.description,
            cost_price: Number(formData.cost_price),
            sale_price: Number(formData.sale_price),
            stock_quantity: Number(formData.stock_quantity),
            min_stock: Number(formData.min_stock),
            unit: formData.unit,
            category_id: formData.category_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingProduct.id)

        if (error) throw error
      } else {
        // Inserir Novo
        const { error } = await supabase.from('products').insert([
          {
            sku: formData.sku,
            name: formData.name,
            description: formData.description,
            cost_price: Number(formData.cost_price),
            sale_price: Number(formData.sale_price),
            stock_quantity: Number(formData.stock_quantity),
            min_stock: Number(formData.min_stock),
            unit: formData.unit,
            category_id: formData.category_id,
          },
        ])

        if (error) throw error
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
            className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
              activeTab === 'produtos'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Todos os Produtos
          </button>
          <button
            onClick={() => setActiveTab('alertas')}
            className={`rounded-lg px-4 py-2 text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'alertas'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <AlertTriangle size={13} /> Estoque Crítico
          </button>
          <button
            onClick={() => setActiveTab('movimentacoes')}
            className={`rounded-lg px-4 py-2 text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'movimentacoes'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <History size={13} /> Movimentações
          </button>
        </div>

        {/* Botão Novo Produto */}
        {activeTab !== 'movimentacoes' && (
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20 transition"
          >
            <Plus size={16} /> Cadastrar Produto
          </button>
        )}
      </div>

      {/* Conteúdo das Abas */}
      {activeTab === 'movimentacoes' ? (
        /* TABELA DE MOVIMENTAÇÕES */
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold uppercase">
                <tr>
                  <th className="py-3.5 px-4">Data/Hora</th>
                  <th className="py-3.5 px-4">Produto</th>
                  <th className="py-3.5 px-4">Tipo</th>
                  <th className="py-3.5 px-4">Quantidade</th>
                  <th className="py-3.5 px-4">Origem</th>
                  <th className="py-3.5 px-4">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {movements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-800/30">
                    <td className="py-3 px-4 font-mono text-slate-400">{formatDate(m.date)}</td>
                    <td className="py-3 px-4 font-semibold text-white">
                      {m.product?.name || `Produto #${m.product_id}`}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-extrabold ${
                          m.movement_type === 'IN'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {m.movement_type === 'IN' ? 'ENTRADA (+)' : 'SAÍDA (-)'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-white">{m.quantity}</td>
                    <td className="py-3 px-4 text-slate-400">{m.origin}</td>
                    <td className="py-3 px-4 text-slate-400">{m.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* TABELA DE PRODUTOS & ALERTAS */
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3 text-slate-500" size={16} />
              <input
                type="text"
                placeholder="Filtrar por nome ou SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <select
              value={selectedCategory || ''}
              onChange={(e) => setSelectedCategory(e.target.value ? Number(e.target.value) : null)}
              className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="">Todas as Categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tabela de Produtos */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold uppercase">
                  <tr>
                    <th className="py-3.5 px-4">SKU</th>
                    <th className="py-3.5 px-4">Nome do Produto</th>
                    <th className="py-3.5 px-4">Categoria</th>
                    <th className="py-3.5 px-4">Preço Custo</th>
                    <th className="py-3.5 px-4">Preço Venda</th>
                    <th className="py-3.5 px-4">Estoque</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {filteredProducts.map((p) => {
                    const isLow = p.stock_quantity <= p.min_stock
                    return (
                      <tr key={p.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-4 font-mono text-slate-400">{p.sku}</td>
                        <td className="py-3 px-4 font-bold text-white">{p.name}</td>
                        <td className="py-3 px-4 text-slate-400">{p.category?.name || '-'}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">
                          {formatCurrency(p.cost_price)}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                          {formatCurrency(p.sale_price)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 font-mono font-extrabold ${
                              isLow ? 'text-rose-400' : 'text-slate-200'
                            }`}
                          >
                            {p.stock_quantity} {p.unit}
                            {isLow && <AlertTriangle size={12} className="text-rose-400" />}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => handleToggleActive(p)}
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              p.is_active
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-slate-800 text-slate-500'
                            }`}
                          >
                            {p.is_active ? 'Ativo' : 'Inativo'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleOpenModal(p)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
                            title="Editar"
                          >
                            <Edit2 size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CADASTRO / EDIÇÃO DE PRODUTO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">
                {editingProduct ? 'Editar Produto' : 'Cadastrar Novo Produto'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400">Código SKU / Barras</label>
                  <input
                    type="text"
                    required
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                    placeholder="Ex: 789123456"
                  />
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
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">Selecione...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
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
                    required
                    value={formData.sale_price}
                    onChange={(e) => setFormData({ ...formData, sale_price: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none font-bold text-emerald-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400">Estoque Atual</label>
                  <input
                    type="number"
                    value={formData.stock_quantity}
                    onChange={(e) =>
                      setFormData({ ...formData, stock_quantity: Number(e.target.value) })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400">Estoque Mínimo</label>
                  <input
                    type="number"
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

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-400 hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-500 px-6 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400 transition"
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
