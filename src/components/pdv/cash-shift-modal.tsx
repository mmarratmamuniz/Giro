'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { useFeedback } from '@/contexts/feedback-context'
import { formatCurrency } from '@/lib/utils'
import { CashShift } from '@/types/cash'
import { useNetwork } from '@/contexts/network-context'
import { DollarSign, ArrowDownRight, ArrowUpRight, Lock, Unlock, X, Store, Computer } from 'lucide-react'

interface CashShiftModalProps {
  currentShift: CashShift | null
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function CashShiftModal({
  currentShift,
  isOpen,
  onClose,
  onSuccess,
}: CashShiftModalProps) {
  const { user, profile } = useAuth()
  const { showSuccess, showError, showWarning, openDialog } = useFeedback()
  const { branches, networks, selectedBranchId, selectedNetworkId } = useNetwork()
  const [modalType, setModalType] = useState<'open' | 'close' | 'sangria' | 'suprimento'>('open')
  const [amount, setAmount] = useState<string>('')
  const [reason, setReason] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState(
    profile?.branch_id || (selectedBranchId !== 'ALL' ? selectedBranchId : branches[0]?.id || '')
  )
  const [cashDesks, setCashDesks] = useState<any[]>([])
  const [selectedDeskId, setSelectedDeskId] = useState<string>('')
  const [supabase] = useState(() => createClient())

  // Sincroniza modalType e limpa campos sempre que abrir ou mudar o turno atual
  useEffect(() => {
    if (isOpen) {
      setModalType(currentShift ? 'sangria' : 'open')
      setAmount('')
      setReason('')
    }
  }, [isOpen, currentShift])

  // Ajusta filial respeitando trava de operador
  useEffect(() => {
    if (profile?.branch_id) {
      setSelectedBranch(profile.branch_id)
    } else if (selectedBranchId !== 'ALL') {
      setSelectedBranch(selectedBranchId)
    } else if (branches.length > 0 && !selectedBranch) {
      setSelectedBranch(branches[0].id)
    }
  }, [profile?.branch_id, selectedBranchId, branches])

  // Busca terminais de caixa da filial selecionada
  useEffect(() => {
    async function fetchDesks() {
      if (!selectedBranch) return
      const { data } = await supabase
        .from('cash_desks')
        .select('*')
        .eq('branch_id', selectedBranch)
        .order('name')
      if (data && data.length > 0) {
        setCashDesks(data)
        setSelectedDeskId(data[0].id)
      } else {
        setCashDesks([])
        setSelectedDeskId('')
      }
    }
    fetchDesks()
  }, [selectedBranch, supabase])

  if (!isOpen) return null

  // Abertura de Caixa
  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setLoading(true)
      const initial = parseFloat(amount) || 0
      const targetBranchId =
        profile?.branch_id || selectedBranch || (selectedBranchId !== 'ALL' ? selectedBranchId : branches[0]?.id || null)

      if (!targetBranchId) {
        showWarning('Filial Obrigatória', 'Selecione uma filial para abrir o turno de caixa.')
        setLoading(false)
        return
      }

      if (!selectedDeskId) {
        showWarning('Terminal Obrigatório', 'Selecione um terminal de caixa (cash_desk) para abrir o turno.')
        setLoading(false)
        return
      }

      const branchObj = branches.find((b) => b.id === targetBranchId)
      const targetNetId =
        branchObj?.network_id ||
        profile?.network_id ||
        (selectedNetworkId !== 'ALL' ? selectedNetworkId : networks[0]?.id || null)

      const { error } = await supabase
        .from('cash_shifts')
        .insert([
          {
            user_id: user?.id || null,
            branch_id: targetBranchId,
            cash_desk_id: selectedDeskId,
            network_id: targetNetId,
            initial_amount: initial,
            status: 'OPEN',
            notes: reason || 'Abertura normal de turno',
          },
        ])
        .select()
        .single()

      if (error) {
        if (error.code === '23505' || error.message?.includes('cash_shifts_one_open_per_desk_idx')) {
          showError('Terminal Já Ocupado', 'Este terminal de caixa já possui um turno em aberto. Feche o turno ativo antes de iniciar outro.')
          return
        }
        throw error
      }

      showSuccess('Caixa Aberto!', `Turno liberado com fundo de troco de ${formatCurrency(initial)}`)
      onSuccess()
      onClose()
    } catch (err: any) {
      if (err.code === '23505' || err.message?.includes('cash_shifts_one_open_per_desk_idx')) {
        showError('Terminal Já Ocupado', 'Este terminal de caixa já possui um turno em aberto.')
      } else {
        showError('Erro ao abrir caixa', err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  // Sangria / Suprimento via RPC auditada
  const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentShift) return

    try {
      setLoading(true)
      const val = parseFloat(amount) || 0
      if (val <= 0) {
        showWarning('Valor Inválido', 'Informe um valor maior que zero.')
        setLoading(false)
        return
      }

      const txReason = reason.trim() || (modalType === 'sangria' ? 'Retirada de caixa' : 'Reforço de troco')
      if (txReason.length < 3) {
        showWarning('Motivo Obrigatório', 'Informe um motivo com pelo menos 3 caracteres.')
        setLoading(false)
        return
      }

      const txType = modalType === 'sangria' ? 'SANGRIA' : 'SUPRIMENTO'

      const { error } = await supabase.rpc('register_cash_transaction', {
        p_shift_id: currentShift.id,
        p_type: txType,
        p_amount: val,
        p_reason: txReason,
      })

      if (error) throw error

      showSuccess(
        `${txType === 'SANGRIA' ? 'Sangria' : 'Suprimento'} Registrado!`,
        `${formatCurrency(val)} movimentado com sucesso.`
      )
      onSuccess()
      onClose()
    } catch (err: any) {
      showError('Erro na movimentação', err.message)
    } finally {
      setLoading(false)
    }
  }

  // Fechamento de Caixa via RPC
  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentShift) return

    try {
      setLoading(true)
      const finalVal = parseFloat(amount) || 0

      const { data, error } = await supabase.rpc('close_cash_shift', {
        p_shift_id: currentShift.id,
        p_final_amount: finalVal,
        p_notes: reason.trim() || null,
      })

      if (error) throw error

      const res = data as any
      const systemAmount = res?.system_amount ?? 0
      const difference = res?.difference ?? (finalVal - systemAmount)

      // Modal de Resumo Elegante
      openDialog({
        title: 'Caixa Fechado com Sucesso!',
        type: difference < 0 ? 'warning' : 'success',
        confirmText: 'Concluir Fechamento',
        content: (
          <div className="space-y-3 rounded-2xl bg-slate-950/80 border border-slate-800 p-4">
            <div className="flex justify-between text-xs text-slate-300">
              <span>Esperado no Sistema:</span>
              <span className="font-mono font-bold text-white">{formatCurrency(systemAmount)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-300">
              <span>Contado na Gaveta:</span>
              <span className="font-mono font-bold text-white">{formatCurrency(finalVal)}</span>
            </div>
            <div className="flex justify-between text-xs pt-2 border-t border-slate-800 font-bold">
              <span>Diferença ({difference >= 0 ? 'Sobra / Bateu' : 'Falta'}):</span>
              <span className={`font-mono ${difference >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {difference >= 0 ? '+' : ''}{formatCurrency(difference)}
              </span>
            </div>
          </div>
        ),
      })

      onSuccess()
      onClose()
    } catch (err: any) {
      showError('Erro ao fechar caixa', err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <DollarSign className="text-amber-400" size={20} />
            <h3 className="text-base font-bold text-white">
              {!currentShift
                ? 'Abertura de Caixa'
                : modalType === 'close'
                ? 'Fechamento de Caixa'
                : modalType === 'sangria'
                ? 'Registrar Sangria (Retirada)'
                : 'Registrar Suprimento (Entrada)'}
            </h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Abas se o caixa estiver aberto */}
        {currentShift && (
          <div className="flex rounded-xl bg-slate-950 p-1 my-4 border border-slate-800">
            <button
              type="button"
              onClick={() => setModalType('sangria')}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                modalType === 'sangria' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'text-slate-400'
              }`}
            >
              Sangria (-)
            </button>
            <button
              type="button"
              onClick={() => setModalType('suprimento')}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                modalType === 'suprimento' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400'
              }`}
            >
              Suprimento (+)
            </button>
            <button
              type="button"
              onClick={() => setModalType('close')}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                modalType === 'close' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
              }`}
            >
              Fechar Caixa
            </button>
          </div>
        )}

        {/* Formulário de Abertura */}
        {!currentShift ? (
          <form onSubmit={handleOpenShift} className="mt-4 space-y-4">
            {branches.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                    <Store size={12} className="text-amber-400" /> Filial / Loja
                  </label>
                  <select
                    disabled={!!profile?.branch_id}
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none disabled:opacity-60 cursor-pointer"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                    <Computer size={12} className="text-amber-400" /> Terminal / Caixa <span className="text-rose-400">*</span>
                  </label>
                  <select
                    required
                    value={selectedDeskId}
                    onChange={(e) => setSelectedDeskId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                  >
                    {cashDesks.length === 0 ? (
                      <option value="">Nenhum Caixa Ativo</option>
                    ) : (
                      cashDesks.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-slate-400">Valor do Fundo de Troco (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="Ex: 100,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 font-mono text-base font-bold text-emerald-400 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400">Observações (Opcional)</label>
              <input
                type="text"
                placeholder="Ex: Turno da Manhã"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !selectedDeskId}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-xs font-extrabold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition cursor-pointer"
            >
              <Unlock size={16} /> {loading ? 'Abrindo...' : 'Abrir Caixa Agora'}
            </button>
          </form>
        ) : modalType === 'close' ? (
          /* Formulário de Fechamento */
          <form onSubmit={handleCloseShift} className="space-y-4">
            <div className="rounded-xl bg-slate-950 p-3.5 border border-slate-800 text-xs space-y-1 text-slate-400">
              <div className="flex justify-between">
                <span>Fundo Inicial:</span>
                <span className="font-mono text-white font-bold">{formatCurrency(currentShift.initial_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Caixa Aberto em:</span>
                <span className="text-slate-300">{new Date(currentShift.opened_at).toLocaleTimeString('pt-BR')}</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400">Valor Contado na Gaveta em Dinheiro (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 font-mono text-base font-bold text-amber-400 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400">Observações do Fechamento</label>
              <input
                type="text"
                placeholder="Ex: Turno encerrado sem pendências"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-xs font-extrabold text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition cursor-pointer"
            >
              <Lock size={16} /> {loading ? 'Fechando...' : 'Finalizar e Fechar Turno'}
            </button>
          </form>
        ) : (
          /* Formulário de Sangria / Suprimento */
          <form onSubmit={handleTransaction} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-400">
                Valor da {modalType === 'sangria' ? 'Retirada (R$)' : 'Entrada de Troco (R$)'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 font-mono text-base font-bold text-white focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400">Motivo / Justificativa</label>
              <input
                type="text"
                required
                placeholder={modalType === 'sangria' ? 'Ex: Pagamento fornecedor pão' : 'Ex: Troco de R$ 50 em moedas'}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-extrabold text-slate-950 transition cursor-pointer disabled:opacity-50 ${
                modalType === 'sangria' ? 'bg-rose-400 hover:bg-rose-300' : 'bg-emerald-400 hover:bg-emerald-300'
              }`}
            >
              {modalType === 'sangria' ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
              {loading ? 'Salvando...' : modalType === 'sangria' ? 'Confirmar Sangria' : 'Confirmar Suprimento'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
