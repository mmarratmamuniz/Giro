'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { useNetwork } from '@/contexts/network-context'
import { useFeedback } from '@/contexts/feedback-context'
import {
  Building2,
  Store,
  Computer,
  Plus,
  ShieldCheck,
  Layers,
  Pencil,
  X,
  Upload,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react'
import { NetworkLogo, resizeImageFileToBase64 } from '@/components/ui/giro-logo'

export default function RedesPage() {
  const { profile } = useAuth()
  const { networks, branches, reloadStructure } = useNetwork()
  const { showSuccess, showError } = useFeedback()
  const supabase = createClient()

  // Estados de Criação (3 níveis: Rede -> Unidade -> Caixa)
  const [modalType, setModalType] = useState<'network' | 'unit' | 'cash_desk' | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Campos de Criação
  const [networkName, setNetworkName] = useState('')
  const [networkCnpj, setNetworkCnpj] = useState('')
  const [newNetworkLogo, setNewNetworkLogo] = useState<string | null>(null)

  const [unitNetworkId, setUnitNetworkId] = useState('')
  const [unitName, setUnitName] = useState('')
  const [unitLocation, setUnitLocation] = useState('')

  const [cashDeskBranchId, setCashDeskBranchId] = useState('')
  const [cashDeskName, setCashDeskName] = useState('')
  const [cashDeskCode, setCashDeskCode] = useState('')

  // Estados de Edição
  const [editingNetwork, setEditingNetwork] = useState<any | null>(null)
  const [editNetworkName, setEditNetworkName] = useState('')
  const [editNetworkLogo, setEditNetworkLogo] = useState<string | null>(null)
  const [uploadingLogoId, setUploadingLogoId] = useState<string | null>(null)

  const [editingUnit, setEditingUnit] = useState<any | null>(null)
  const [editUnitName, setEditUnitName] = useState('')
  const [editUnitLocation, setEditUnitLocation] = useState('')
  const [editUnitNetworkId, setEditUnitNetworkId] = useState('')

  const [editingCashDesk, setEditingCashDesk] = useState<any | null>(null)
  const [editCashDeskName, setEditCashDeskName] = useState('')
  const [editCashDeskCode, setEditCashDeskCode] = useState('')
  const [editCashDeskIsActive, setEditCashDeskIsActive] = useState(true)

  // Lista de caixas carregados
  const [cashDesks, setCashDesks] = useState<any[]>([])

  const isSuperAdmin = profile?.role === 'super_admin'
  const isNetworkAdmin = profile?.role === 'network_admin'

  const displayNetworks = isSuperAdmin
    ? networks
    : networks.filter((n) => n.id === profile?.network_id)

  const displayBranches = isSuperAdmin
    ? branches
    : branches.filter((b) => displayNetworks.some((n) => n.id === b.network_id))

  async function loadCashDesks() {
    if (!profile) return
    const branchIds = displayBranches.map((b) => b.id)
    if (branchIds.length === 0) {
      setCashDesks([])
      return
    }
    const { data } = await supabase
      .from('cash_desks')
      .select('*')
      .in('branch_id', branchIds)
      .order('name')
    if (data) setCashDesks(data)
  }

  useEffect(() => {
    if (profile) {
      loadCashDesks()
    }
  }, [profile, branches, networks])

  const openModal = (type: 'network' | 'unit' | 'cash_desk' | null) => {
    if (type === 'network') {
      setNetworkName('')
      setNetworkCnpj('')
      setNewNetworkLogo(null)
    } else if (type === 'unit') {
      const defaultNet = displayNetworks[0]?.id || ''
      setUnitNetworkId(defaultNet)
      setUnitName('')
      setUnitLocation('')
    } else if (type === 'cash_desk') {
      const defaultBranch = displayBranches[0]?.id || ''
      setCashDeskBranchId(defaultBranch)
      setCashDeskName('')
      setCashDeskCode('')
    }
    setModalType(type)
  }

  // Handlers para abrir modais de edição
  const handleOpenEditNetwork = (net: any) => {
    setEditingNetwork(net)
    setEditNetworkName(net.name || '')
    setEditNetworkLogo(net.logo_url || null)
  }

  const handleOpenEditUnit = (unit: any) => {
    setEditingUnit(unit)
    setEditUnitName(unit.name || '')
    setEditUnitLocation(unit.location || '')
    setEditUnitNetworkId(unit.network_id || '')
  }

  const handleOpenEditCashDesk = (desk: any) => {
    setEditingCashDesk(desk)
    setEditCashDeskName(desk.name || '')
    setEditCashDeskCode(desk.code || '')
    setEditCashDeskIsActive(desk.is_active !== false)
  }

  // Upload rápido de logo da rede (Restrito ao Super Admin)
  const handleLogoUpload = async (networkId: string, file: File) => {
    if (!isSuperAdmin) {
      showError('Acesso Restrito', 'Apenas o Super Admin possui permissão para cadastrar ou alterar a logo da rede.')
      return
    }
    try {
      setUploadingLogoId(networkId)
      const base64Url = await resizeImageFileToBase64(file, 256)
      const { error } = await supabase
        .from('networks')
        .update({ logo_url: base64Url })
        .eq('id', networkId)

      if (error) throw error

      showSuccess('Logo Atualizada!', 'A logo da rede foi alterada com sucesso.')
      reloadStructure()
    } catch (err: any) {
      showError('Erro no upload da logo', err.message || 'Falha ao processar arquivo.')
    } finally {
      setUploadingLogoId(null)
    }
  }

  // Se o usuário não for super_admin nem network_admin, bloqueia a visão
  if (profile && !isSuperAdmin && !isNetworkAdmin) {
    return (
      <div className="flex h-96 flex-col items-center justify-center text-center p-6">
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400 mb-3">
          <ShieldCheck size={28} />
        </div>
        <h3 className="text-base font-bold text-white">Acesso Restrito às Redes</h3>
        <p className="text-xs text-slate-400 max-w-sm mt-1">
          Apenas Administradores de Rede e Super Administradores possuem permissão para configurar a estrutura de redes e unidades.
        </p>
      </div>
    )
  }

  // Submissão: Criar Rede
  const handleCreateNetwork = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      const { error } = await supabase.from('networks').insert({
        name: networkName.trim(),
        document_cnpj: networkCnpj.trim() || null,
        logo_url: newNetworkLogo || null,
      })
      if (error) throw error

      showSuccess('Rede Criada!', `A rede "${networkName}" foi cadastrada com sucesso.`)
      setModalType(null)
      setNetworkName('')
      setNetworkCnpj('')
      setNewNetworkLogo(null)
      reloadStructure()
    } catch (err: any) {
      showError('Erro ao criar rede', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Submissão: Editar Rede
  const handleUpdateNetwork = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingNetwork) return
    try {
      setSubmitting(true)
      const { error } = await supabase
        .from('networks')
        .update({
          name: editNetworkName.trim(),
          logo_url: editNetworkLogo || null,
        })
        .eq('id', editingNetwork.id)

      if (error) throw error

      showSuccess('Rede Atualizada!', `A rede "${editNetworkName}" foi atualizada com sucesso.`)
      setEditingNetwork(null)
      reloadStructure()
    } catch (err: any) {
      showError('Erro ao atualizar rede', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Submissão: Criar Unidade (salvo em public.branches + Caixa 01 automático)
  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      if (!unitNetworkId) {
        throw new Error('Selecione uma rede válida.')
      }

      const { data: branchData, error } = await supabase
        .from('branches')
        .insert({
          network_id: unitNetworkId,
          unit_id: null,
          name: unitName.trim(),
          location: unitLocation.trim() || null,
        })
        .select()
        .single()

      if (error) throw error

      if (branchData) {
        const { error: deskErr } = await supabase.from('cash_desks').insert({
          branch_id: branchData.id,
          name: 'Caixa 01',
          code: 'CX-01',
          is_active: true,
        })
        if (deskErr) throw deskErr
      }

      showSuccess('Unidade Criada!', `A unidade "${unitName}" foi cadastrada com o Caixa 01 inicial.`)
      setModalType(null)
      setUnitName('')
      setUnitLocation('')
      reloadStructure()
      loadCashDesks()
    } catch (err: any) {
      showError('Erro ao criar unidade', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Submissão: Editar Unidade
  const handleUpdateUnit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUnit) return
    try {
      setSubmitting(true)
      const payload: any = {
        name: editUnitName.trim(),
        location: editUnitLocation.trim() || null,
      }
      if (isSuperAdmin && editUnitNetworkId) {
        payload.network_id = editUnitNetworkId
      }

      const { error } = await supabase
        .from('branches')
        .update(payload)
        .eq('id', editingUnit.id)

      if (error) throw error

      showSuccess('Unidade Atualizada!', `A unidade "${editUnitName}" foi atualizada com sucesso.`)
      setEditingUnit(null)
      reloadStructure()
      loadCashDesks()
    } catch (err: any) {
      showError('Erro ao atualizar unidade', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Submissão: Criar Terminal de Caixa
  const handleCreateCashDesk = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      if (!cashDeskBranchId) {
        throw new Error('Selecione uma unidade válida.')
      }

      const { error } = await supabase.from('cash_desks').insert({
        branch_id: cashDeskBranchId,
        name: cashDeskName.trim(),
        code: cashDeskCode.trim() || null,
        is_active: true,
      })
      if (error) throw error

      showSuccess('Caixa Criado!', `Terminal "${cashDeskName}" adicionado à unidade.`)
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

  // Submissão: Editar Terminal de Caixa
  const handleUpdateCashDesk = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCashDesk) return
    try {
      setSubmitting(true)
      const { error } = await supabase
        .from('cash_desks')
        .update({
          name: editCashDeskName.trim(),
          code: editCashDeskCode.trim() || null,
          is_active: editCashDeskIsActive,
        })
        .eq('id', editingCashDesk.id)

      if (error) throw error

      showSuccess('Caixa Atualizado!', `Terminal "${editCashDeskName}" atualizado.`)
      setEditingCashDesk(null)
      loadCashDesks()
    } catch (err: any) {
      showError('Erro ao atualizar caixa', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Banner de Informação */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="text-amber-400" size={20} />
            <h2 className="text-lg font-extrabold text-white tracking-tight">
              Estrutura Organizacional Giro
            </h2>
            <span className="rounded-md bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-extrabold text-amber-400 uppercase">
              Rede &bull; Unidade &bull; Caixa
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Gerencie e edite a árvore da sua organização com preservação contínua de histórico: Redes, Unidades operacionais e Terminais de Caixa.
          </p>
        </div>

        {/* 3 Botões de Criação no Topo */}
        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && (
            <button
              onClick={() => openModal('network')}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition shadow-md shadow-amber-500/10 cursor-pointer"
            >
              <Plus size={14} /> Nova Rede
            </button>
          )}
          <button
            onClick={() => openModal('unit')}
            disabled={displayNetworks.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50 transition cursor-pointer"
          >
            <Plus size={14} /> Nova Unidade
          </button>
          <button
            onClick={() => openModal('cash_desk')}
            disabled={displayBranches.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50 transition cursor-pointer"
          >
            <Plus size={14} /> Novo Caixa
          </button>
        </div>
      </div>

      {/* Árvore Hierárquica em Cards Interativos (Rede -> Unidade -> Caixa) */}
      {displayNetworks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
          <Building2 size={40} className="text-slate-600 mb-3" />
          <h3 className="text-sm font-bold text-white">Nenhuma Rede Encontrada</h3>
          <p className="text-xs text-slate-400 max-w-md mt-1 mb-4">
            {isSuperAdmin
              ? 'Como Super Admin, seu primeiro passo é cadastrar a sua primeira Rede para criar as unidades vinculadas.'
              : 'Nenhuma rede associada ao seu perfil de administrador.'}
          </p>
          {isSuperAdmin && (
            <button
              onClick={() => openModal('network')}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400 transition"
            >
              <Plus size={15} /> Cadastrar Primeira Rede
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {displayNetworks.map((net) => {
            const netBranches = displayBranches.filter((b) => b.network_id === net.id)

            return (
              <div
                key={net.id}
                className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm space-y-5"
              >
                {/* Cabeçalho da Rede com Botão de Editar e Upload de Logo */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-3.5">
                    <NetworkLogo
                      network={net}
                      size={48}
                      className="rounded-2xl border-slate-700 shrink-0"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-extrabold text-white">{net.name}</h3>
                        <button
                          type="button"
                          onClick={() => handleOpenEditNetwork(net)}
                          className="p-1 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition cursor-pointer"
                          title="Editar Nome da Rede"
                        >
                          <Pencil size={13} />
                        </button>
                        <span className="rounded-full bg-slate-800 border border-slate-700 px-2.5 py-0.5 text-[10px] font-semibold text-slate-300">
                          {net.document_cnpj ? `CNPJ: ${net.document_cnpj}` : 'Rede Principal'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {netBranches.length} {netBranches.length === 1 ? 'Unidade' : 'Unidades'} vinculadas
                      </p>
                    </div>
                  </div>

                  {/* Ação Exclusiva Super Admin: Alterar Logo */}
                  {isSuperAdmin && (
                    <div className="flex items-center gap-2">
                      <label
                        className={`inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-bold text-slate-200 hover:border-amber-500/50 hover:bg-amber-500 hover:text-slate-950 transition cursor-pointer shadow-sm ${
                          uploadingLogoId === net.id ? 'opacity-50 pointer-events-none' : ''
                        }`}
                        title="Fazer upload de logo para esta rede (exclusivo Super Admin)"
                      >
                        {uploadingLogoId === net.id ? (
                          <Loader2 size={13} className="animate-spin text-amber-400" />
                        ) : (
                          <Upload size={13} />
                        )}
                        <span>{uploadingLogoId === net.id ? 'Enviando...' : 'Alterar Logo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingLogoId === net.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleLogoUpload(net.id, file)
                            e.target.value = ''
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Lista de Unidades da Rede */}
                {netBranches.length === 0 ? (
                  <div className="rounded-2xl bg-slate-950/40 border border-slate-800/80 p-6 text-center text-xs text-slate-500">
                    Nenhuma unidade cadastrada nesta rede.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {netBranches.map((br) => {
                      const brCaixas = cashDesks.filter((c) => c.branch_id === br.id)

                      return (
                        <div
                          key={br.id}
                          className="rounded-2xl border border-slate-800/90 bg-slate-950/70 p-5 space-y-4"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <Store size={18} className="text-amber-400" />
                              <div>
                                <h4 className="text-sm font-bold text-white">{br.name}</h4>
                                <span className="text-[10px] text-slate-400">
                                  {(br as any).location || 'Endereço não informado'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-lg">
                                {brCaixas.length} {brCaixas.length === 1 ? 'caixa' : 'caixas'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenEditUnit(br)}
                                className="flex items-center gap-1 rounded-lg bg-slate-800/80 border border-slate-700/80 px-2 py-1 text-[10px] font-bold text-slate-300 hover:bg-amber-500 hover:text-slate-950 transition cursor-pointer"
                                title="Editar Unidade"
                              >
                                <Pencil size={11} />
                                <span>Editar</span>
                              </button>
                            </div>
                          </div>

                          {/* Caixas dentro da Unidade com Botões Interativos de Edição */}
                          <div className="space-y-2 border-t border-slate-800/60 pt-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] text-slate-500 mr-1 flex items-center gap-1">
                                <Computer size={11} /> Caixas:
                              </span>
                              {brCaixas.length === 0 ? (
                                <span className="text-[10px] text-slate-600">Nenhum</span>
                              ) : (
                                brCaixas.map((cx) => (
                                  <button
                                    key={cx.id}
                                    type="button"
                                    onClick={() => handleOpenEditCashDesk(cx)}
                                    className={`group inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[9px] font-mono font-bold transition cursor-pointer ${
                                      cx.is_active === false
                                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 line-through'
                                        : 'bg-slate-950 border-slate-800 text-amber-300 hover:border-amber-500/50 hover:bg-slate-900'
                                    }`}
                                    title="Clique para editar este terminal de caixa"
                                  >
                                    <span>{cx.name} {cx.code && `(${cx.code})`}</span>
                                    <Pencil size={9} className="opacity-40 group-hover:opacity-100 text-slate-400 group-hover:text-amber-400" />
                                  </button>
                                ))
                              )}
                            </div>
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

      {/* MODAL 1: NOVA REDE */}
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

              {isSuperAdmin && (
                <div>
                  <label className="font-semibold text-slate-300">Logo Oficial da Rede (Opcional)</label>
                  <div className="mt-1 flex items-center gap-3">
                    {newNetworkLogo && (
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
                        <img src={newNetworkLogo} alt="Preview" className="h-full w-full object-cover" />
                      </div>
                    )}
                    <label className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition cursor-pointer">
                      <Upload size={13} className="text-amber-400" />
                      <span>{newNetworkLogo ? 'Trocar Imagem' : 'Selecionar Imagem'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            try {
                              const b64 = await resizeImageFileToBase64(file, 256)
                              setNewNetworkLogo(b64)
                            } catch (err: any) {
                              showError('Erro ao carregar imagem', err.message)
                            }
                          }
                          e.target.value = ''
                        }}
                      />
                    </label>
                    {newNetworkLogo && (
                      <button
                        type="button"
                        onClick={() => setNewNetworkLogo(null)}
                        className="text-xs font-bold text-rose-400 hover:underline cursor-pointer"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="flex-1 rounded-xl bg-slate-800 py-2.5 text-slate-300 font-bold hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-amber-500 py-2.5 text-slate-950 font-extrabold hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Salvando...' : 'Criar Rede'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: NOVA UNIDADE */}
      {modalType === 'unit' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Store className="text-amber-400" size={18} /> Cadastrar Nova Unidade
            </h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Cada unidade possui seu próprio estoque, preços e terminais de caixa.
            </p>

            <form onSubmit={handleCreateUnit} className="space-y-4 text-xs">
              {displayNetworks.length > 1 && (
                <div>
                  <label className="font-semibold text-slate-300">Rede Pertencente *</label>
                  <select
                    value={unitNetworkId}
                    onChange={(e) => setUnitNetworkId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                  >
                    {displayNetworks.map((n) => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-300">Nome da Unidade *</label>
                <input
                  type="text"
                  required
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  placeholder="Ex: Unidade Centro ou Unidade Praia"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300">Endereço / Cidade</label>
                <input
                  type="text"
                  value={unitLocation}
                  onChange={(e) => setUnitLocation(e.target.value)}
                  placeholder="Ex: Av. Beira Mar, 500 - Salvador/BA"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="flex-1 rounded-xl bg-slate-800 py-2.5 text-slate-300 font-bold hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-amber-500 py-2.5 text-slate-950 font-extrabold hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Salvando...' : 'Criar Unidade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: NOVO CAIXA */}
      {modalType === 'cash_desk' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Computer className="text-amber-400" size={18} /> Adicionar Terminal de Caixa
            </h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Crie terminais adicionais de venda para uma unidade.
            </p>

            <form onSubmit={handleCreateCashDesk} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-300">Unidade Pertencente *</label>
                <select
                  value={cashDeskBranchId}
                  onChange={(e) => setCashDeskBranchId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                >
                  {displayBranches.map((b) => (
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
                  className="flex-1 rounded-xl bg-slate-800 py-2.5 text-slate-300 font-bold hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-amber-500 py-2.5 text-slate-950 font-extrabold hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Salvando...' : 'Adicionar Caixa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: EDITAR REDE */}
      {editingNetwork && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Pencil className="text-amber-400" size={16} /> Editar Rede
              </h3>
              <button
                type="button"
                onClick={() => setEditingNetwork(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateNetwork} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-300">Nome da Rede *</label>
                <input
                  type="text"
                  required
                  value={editNetworkName}
                  onChange={(e) => setEditNetworkName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              {isSuperAdmin && (
                <div>
                  <label className="font-semibold text-slate-300">Logo da Rede</label>
                  <div className="mt-1 flex items-center gap-3">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
                      {editNetworkLogo ? (
                        <img src={editNetworkLogo} alt="Logo" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-500 font-bold">
                          Sem Logo
                        </div>
                      )}
                    </div>
                    <label className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition cursor-pointer">
                      <Upload size={13} className="text-amber-400" />
                      <span>{editNetworkLogo ? 'Alterar Logo' : 'Enviar Logo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            try {
                              const b64 = await resizeImageFileToBase64(file, 256)
                              setEditNetworkLogo(b64)
                            } catch (err: any) {
                              showError('Erro ao carregar imagem', err.message)
                            }
                          }
                          e.target.value = ''
                        }}
                      />
                    </label>
                    {editNetworkLogo && (
                      <button
                        type="button"
                        onClick={() => setEditNetworkLogo(null)}
                        className="text-xs font-bold text-rose-400 hover:underline cursor-pointer"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingNetwork(null)}
                  className="flex-1 rounded-xl bg-slate-800 py-2.5 text-slate-300 font-bold hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-amber-500 py-2.5 text-slate-950 font-extrabold hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: EDITAR UNIDADE */}
      {editingUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Pencil className="text-amber-400" size={16} /> Editar Unidade
              </h3>
              <button
                type="button"
                onClick={() => setEditingUnit(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateUnit} className="space-y-4 text-xs">
              {isSuperAdmin && displayNetworks.length > 1 && (
                <div>
                  <label className="font-semibold text-slate-300">Rede Pertencente</label>
                  <select
                    value={editUnitNetworkId}
                    onChange={(e) => setEditUnitNetworkId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                  >
                    {displayNetworks.map((n) => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-300">Nome da Unidade *</label>
                <input
                  type="text"
                  required
                  value={editUnitName}
                  onChange={(e) => setEditUnitName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300">Endereço / Localização</label>
                <input
                  type="text"
                  value={editUnitLocation}
                  onChange={(e) => setEditUnitLocation(e.target.value)}
                  placeholder="Ex: Av. Beira Mar, 500 - Salvador/BA"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUnit(null)}
                  className="flex-1 rounded-xl bg-slate-800 py-2.5 text-slate-300 font-bold hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-amber-500 py-2.5 text-slate-950 font-extrabold hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Salvando...' : 'Salvar Unidade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: EDITAR CAIXA */}
      {editingCashDesk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Pencil className="text-amber-400" size={16} /> Editar Terminal de Caixa
              </h3>
              <button
                type="button"
                onClick={() => setEditingCashDesk(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateCashDesk} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-300">Identificação do Caixa *</label>
                <input
                  type="text"
                  required
                  value={editCashDeskName}
                  onChange={(e) => setEditCashDeskName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300">Código do Terminal (Opcional)</label>
                <input
                  type="text"
                  value={editCashDeskCode}
                  onChange={(e) => setEditCashDeskCode(e.target.value)}
                  placeholder="Ex: CX-01"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-white focus:border-amber-500 focus:outline-none uppercase font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="cashDeskActive"
                  checked={editCashDeskIsActive}
                  onChange={(e) => setEditCashDeskIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-800 bg-slate-950 text-amber-500 focus:ring-amber-400"
                />
                <label htmlFor="cashDeskActive" className="text-slate-300 font-semibold cursor-pointer">
                  Terminal Ativo (Disponível para abertura no PDV)
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCashDesk(null)}
                  className="flex-1 rounded-xl bg-slate-800 py-2.5 text-slate-300 font-bold hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-amber-500 py-2.5 text-slate-950 font-extrabold hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Salvando...' : 'Salvar Caixa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
