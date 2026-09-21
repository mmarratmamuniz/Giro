'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { useNetwork } from '@/contexts/network-context'
import { useFeedback } from '@/contexts/feedback-context'
import {
  Building2,
  MapPin,
  Store,
  Computer,
  Plus,
  Trash2,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Layers,
} from 'lucide-react'

export default function RedesPage() {
  const { profile } = useAuth()
  const { networks, units, branches, reloadStructure, loadingStructure } = useNetwork()
  const { showSuccess, showError } = useFeedback()
  const supabase = createClient()

  // Estados de Criação
  const [modalType, setModalType] = useState<'network' | 'unit' | 'branch' | 'cash_desk' | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Campos do formulário
  const [networkName, setNetworkName] = useState('')
  const [networkCnpj, setNetworkCnpj] = useState('')

  const [unitNetworkId, setUnitNetworkId] = useState('')
  const [unitName, setUnitName] = useState('')
  const [unitCity, setUnitCity] = useState('')
  const [unitState, setUnitState] = useState('')

  const [branchNetworkId, setBranchNetworkId] = useState('')
  const [branchUnitId, setBranchUnitId] = useState('')
  const [branchName, setBranchName] = useState('')
  const [branchAddress, setBranchAddress] = useState('')
  const [branchPhone, setBranchPhone] = useState('')

  const [cashDeskBranchId, setCashDeskBranchId] = useState('')
  const [cashDeskName, setCashDeskName] = useState('')
  const [cashDeskCode, setCashDeskCode] = useState('')

  // Lista de caixas carregados
  const [cashDesks, setCashDesks] = useState<any[]>([])

  const isSuperAdmin = profile?.role === 'super_admin'

  async function loadCashDesks() {
    const { data } = await supabase.from('cash_desks').select('*').order('name')
    if (data) setCashDesks(data)
  }

  useEffect(() => {
    loadCashDesks()
  }, [branches])

  // Submissão: Criar Rede
  const handleCreateNetwork = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      const { error } = await supabase.from('networks').insert({
        name: networkName.trim(),
        document_cnpj: networkCnpj.trim() || null,
      })
      if (error) throw error

      showSuccess('Rede Criada!', `A rede "${networkName}" foi cadastrada com sucesso.`)
      setModalType(null)
      setNetworkName('')
      setNetworkCnpj('')
      reloadStructure()
    } catch (err: any) {
      showError('Erro ao criar rede', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Submissão: Criar Unidade / Regional
  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      const targetNet = unitNetworkId || networks[0]?.id
      if (!targetNet) throw new Error('Selecione uma rede.')

      const { error } = await supabase.from('units').insert({
        network_id: targetNet,
        name: unitName.trim(),
        city: unitCity.trim() || null,
        state: unitState.trim() || null,
      })
      if (error) throw error

      showSuccess('Unidade Criada!', `Unidade "${unitName}" cadastrada.`)
      setModalType(null)
      setUnitName('')
      setUnitCity('')
      setUnitState('')
      reloadStructure()
    } catch (err: any) {
      showError('Erro ao criar unidade', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Submissão: Criar Filial
  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      const targetUnit = branchUnitId || units[0]?.id
      const unitObj = units.find((u) => u.id === targetUnit)
      const targetNet = unitObj?.network_id || branchNetworkId || networks[0]?.id

      if (!targetUnit || !targetNet) throw new Error('Selecione a unidade e a rede.')

      const { data: branchData, error } = await supabase.from('branches').insert({
        network_id: targetNet,
        unit_id: targetUnit,
        name: branchName.trim(),
        address: branchAddress.trim() || null,
        phone: branchPhone.trim() || null,
      }).select().single()

      if (error) throw error

      // Criar automaticamente o primeiro caixa padrão ("Caixa 01") para a nova filial
      if (branchData) {
        await supabase.from('cash_desks').insert({
          branch_id: branchData.id,
          name: 'Caixa 01',
          code: 'CX-01',
          is_active: true,
        })
      }

      showSuccess('Filial Criada!', `A filial "${branchName}" foi cadastrada com o Caixa 01 inicial.`)
      setModalType(null)
      setBranchName('')
      setBranchAddress('')
      setBranchPhone('')
      reloadStructure()
      loadCashDesks()
    } catch (err: any) {
      showError('Erro ao criar filial', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Submissão: Adicionar Terminal de Caixa à Filial
  const handleCreateCashDesk = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      const targetBranch = cashDeskBranchId || branches[0]?.id
      if (!targetBranch) throw new Error('Selecione uma filial.')

      const { error } = await supabase.from('cash_desks').insert({
        branch_id: targetBranch,
        name: cashDeskName.trim(),
        code: cashDeskCode.trim() || null,
        is_active: true,
      })
      if (error) throw error

      showSuccess('Caixa Criado!', `Terminal "${cashDeskName}" adicionado à filial.`)
      setModalType(null)
      setCashDeskName('')
      setCashDeskCode('')
      loadCashDesks()
    } catch (err: any) {
      showError('Erro ao criar caixa', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Banner de Informação do Super Admin */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="text-amber-400" size={20} />
            <h2 className="text-lg font-extrabold text-white tracking-tight">
              Estrutura Organizacional Giro
            </h2>
            <span className="rounded-md bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-extrabold text-amber-400 uppercase">
              Hierarquia Multi-Rede
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Gerencie toda a árvore da sua plataforma: Redes globais, Polos/Unidades regionais, Filiais autônomas e seus respectivos terminais de caixas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && (
            <button
              onClick={() => setModalType('network')}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition shadow-md shadow-amber-500/10 cursor-pointer"
            >
              <Plus size={14} /> Nova Rede
            </button>
          )}
          <button
            onClick={() => setModalType('unit')}
            disabled={networks.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50 transition cursor-pointer"
          >
            <Plus size={14} /> Nova Unidade
          </button>
          <button
            onClick={() => setModalType('branch')}
            disabled={units.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50 transition cursor-pointer"
          >
            <Plus size={14} /> Nova Filial
          </button>
          <button
            onClick={() => setModalType('cash_desk')}
            disabled={branches.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50 transition cursor-pointer"
          >
            <Plus size={14} /> Novo Caixa
          </button>
        </div>
      </div>

      {/* Árvore Hierárquica em Cards Interativos */}
      {networks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
          <Building2 size={40} className="text-slate-600 mb-3" />
          <h3 className="text-sm font-bold text-white">Nenhuma Rede Cadastrada</h3>
          <p className="text-xs text-slate-400 max-w-md mt-1 mb-4">
            Como Super Admin, seu primeiro passo é cadastrar a sua primeira Rede para criar as unidades e filiais vinculadas.
          </p>
          <button
            onClick={() => setModalType('network')}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400 transition"
          >
            <Plus size={15} /> Cadastrar Primeira Rede
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {networks.map((net) => {
            const netUnits = units.filter((u) => u.network_id === net.id)

            return (
              <div
                key={net.id}
                className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm space-y-5"
              >
                {/* Cabeçalho da Rede */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                      <Building2 size={22} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-extrabold text-white">{net.name}</h3>
                        <span className="rounded-full bg-slate-800 border border-slate-700 px-2.5 py-0.5 text-[10px] font-semibold text-slate-300">
                          {net.document_cnpj ? `CNPJ: ${net.document_cnpj}` : 'Rede Principal'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {netUnits.length} {netUnits.length === 1 ? 'Unidade' : 'Unidades'} vinculadas
                      </p>
                    </div>
                  </div>
                </div>

                {/* Lista de Unidades da Rede */}
                {netUnits.length === 0 ? (
                  <div className="rounded-2xl bg-slate-950/40 border border-slate-800/80 p-6 text-center text-xs text-slate-500">
                    Nenhuma unidade regional cadastrada nesta rede.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {netUnits.map((unit) => {
                      const unitBranches = branches.filter((b) => b.unit_id === unit.id)

                      return (
                        <div
                          key={unit.id}
                          className="rounded-2xl border border-slate-800/90 bg-slate-950/70 p-5 space-y-4"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <MapPin size={18} className="text-amber-400" />
                              <div>
                                <h4 className="text-sm font-bold text-white">{unit.name}</h4>
                                <span className="text-[10px] text-slate-400">
                                  {unit.city && unit.state ? `${unit.city} - ${unit.state}` : 'Regional Geral'}
                                </span>
                              </div>
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-lg">
                              {unitBranches.length} {unitBranches.length === 1 ? 'filial' : 'filiais'}
                            </span>
                          </div>

                          {/* Filiais dentro da Unidade */}
                          <div className="space-y-2 border-t border-slate-800/60 pt-3">
                            {unitBranches.length === 0 ? (
                              <p className="text-[11px] text-slate-500 italic">Sem filiais nesta unidade.</p>
                            ) : (
                              unitBranches.map((br) => {
                                const brCaixas = cashDesks.filter((c) => c.branch_id === br.id)

                                return (
                                  <div
                                    key={br.id}
                                    className="rounded-xl border border-slate-800/80 bg-slate-900/80 p-3 flex flex-col gap-2"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <Store size={15} className="text-amber-400" />
                                        <span className="text-xs font-bold text-white">{br.name}</span>
                                      </div>
                                      <span className="text-[9px] font-medium text-slate-400">
                                        {br.address || 'Endereço não informado'}
                                      </span>
                                    </div>

                                    {/* Caixas da Filial */}
                                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/40">
                                      <span className="text-[10px] text-slate-500 mr-1 flex items-center gap-1">
                                        <Computer size={11} /> Caixas:
                                      </span>
                                      {brCaixas.length === 0 ? (
                                        <span className="text-[10px] text-slate-600">Nenhum</span>
                                      ) : (
                                        brCaixas.map((cx) => (
                                          <span
                                            key={cx.id}
                                            className="rounded-md bg-slate-950 border border-slate-800 px-2 py-0.5 text-[9px] font-mono text-amber-300 font-bold"
                                          >
                                            {cx.name} {cx.code && `(${cx.code})`}
                                          </span>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL: NOVA REDE */}
      {modalType === 'network' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Building2 className="text-amber-400" size={18} /> Cadastrar Nova Rede
            </h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Crie uma rede controladora (grupo econômico / franquia).
            </p>

            <form onSubmit={handleCreateNetwork} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-300">Nome da Rede *</label>
                <input
                  type="text"
                  required
                  value={networkName}
                  onChange={(e) => setNetworkName(e.target.value)}
                  placeholder="Ex: Grupo Giro Bebidas"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300">CNPJ (Opcional)</label>
                <input
                  type="text"
                  value={networkCnpj}
                  onChange={(e) => setNetworkCnpj(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="flex-1 rounded-xl bg-slate-800 py-2.5 text-slate-300 font-bold hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-amber-500 py-2.5 text-slate-950 font-extrabold hover:bg-amber-400 disabled:opacity-50"
                >
                  {submitting ? 'Salvando...' : 'Criar Rede'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NOVA UNIDADE / REGIONAL */}
      {modalType === 'unit' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <MapPin className="text-amber-400" size={18} /> Cadastrar Nova Unidade / Polo
            </h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Agrupe filiais sob uma regional ou polo geográfico.
            </p>

            <form onSubmit={handleCreateUnit} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-300">Rede Pertencente *</label>
                <select
                  value={unitNetworkId}
                  onChange={(e) => setUnitNetworkId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                >
                  {networks.map((n) => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-300">Nome da Unidade / Regional *</label>
                <input
                  type="text"
                  required
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  placeholder="Ex: Polo Salvador / Polo Interior"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-300">Cidade</label>
                  <input
                    type="text"
                    value={unitCity}
                    onChange={(e) => setUnitCity(e.target.value)}
                    placeholder="Salvador"
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-300">Estado (UF)</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={unitState}
                    onChange={(e) => setUnitState(e.target.value)}
                    placeholder="BA"
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none uppercase"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="flex-1 rounded-xl bg-slate-800 py-2.5 text-slate-300 font-bold hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-amber-500 py-2.5 text-slate-950 font-extrabold hover:bg-amber-400 disabled:opacity-50"
                >
                  {submitting ? 'Salvando...' : 'Criar Unidade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NOVA FILIAL */}
      {modalType === 'branch' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Store className="text-amber-400" size={18} /> Cadastrar Nova Filial
            </h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Cada filial possui seu próprio estoque, preços e equipe de caixas.
            </p>

            <form onSubmit={handleCreateBranch} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-300">Unidade / Regional Pertencente *</label>
                <select
                  value={branchUnitId}
                  onChange={(e) => setBranchUnitId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-300">Nome da Loja / Filial *</label>
                <input
                  type="text"
                  required
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="Ex: Filial Centro 01"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300">Endereço Completo</label>
                <input
                  type="text"
                  value={branchAddress}
                  onChange={(e) => setBranchAddress(e.target.value)}
                  placeholder="Av. Principal, 123 - Centro"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300">Telefone / Contato</label>
                <input
                  type="text"
                  value={branchPhone}
                  onChange={(e) => setBranchPhone(e.target.value)}
                  placeholder="(71) 99999-9999"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="flex-1 rounded-xl bg-slate-800 py-2.5 text-slate-300 font-bold hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-amber-500 py-2.5 text-slate-950 font-extrabold hover:bg-amber-400 disabled:opacity-50"
                >
                  {submitting ? 'Salvando...' : 'Criar Filial'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NOVO CAIXA */}
      {modalType === 'cash_desk' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Computer className="text-amber-400" size={18} /> Adicionar Terminal de Caixa
            </h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Crie múltiplos terminais de venda para a mesma filial.
            </p>

            <form onSubmit={handleCreateCashDesk} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-300">Filial Pertencente *</label>
                <select
                  value={cashDeskBranchId}
                  onChange={(e) => setCashDeskBranchId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-300">Identificação do Caixa *</label>
                <input
                  type="text"
                  required
                  value={cashDeskName}
                  onChange={(e) => setCashDeskName(e.target.value)}
                  placeholder="Ex: Caixa 02 ou Caixa Balcão"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300">Código do Terminal (Opcional)</label>
                <input
                  type="text"
                  value={cashDeskCode}
                  onChange={(e) => setCashDeskCode(e.target.value)}
                  placeholder="Ex: CX-02"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none uppercase font-mono"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="flex-1 rounded-xl bg-slate-800 py-2.5 text-slate-300 font-bold hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-amber-500 py-2.5 text-slate-950 font-extrabold hover:bg-amber-400 disabled:opacity-50"
                >
                  {submitting ? 'Salvando...' : 'Adicionar Caixa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
