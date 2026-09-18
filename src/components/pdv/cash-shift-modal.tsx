'use client'

import React, { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { useFeedback } from '@/contexts/feedback-context'
import { formatCurrency } from '@/lib/utils'
import { CashShift } from '@/types/cash'
import { DollarSign, ArrowDownRight, ArrowUpRight, Lock, Unlock, X } from 'lucide-react'

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
  const { user } = useAuth()
  const { showSuccess, showError, showWarning, openDialog } = useFeedback()
  const [modalType, setModalType] = useState<'open' | 'close' | 'sangria' | 'suprimento'>(
    currentShift ? 'sangria' : 'open'
  )
  const [amount, setAmount] = useState<string>('')
  const [reason, setReason] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  if (!isOpen) return null

  // Abertura de Caixa
  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setLoading(true)
      const initial = parseFloat(amount) || 0
      const { data, error } = await supabase
        .from('cash_shifts')
        .insert([
          {
            user_id: user?.id || null,
            initial_amount: initial,
            status: 'OPEN',
            notes: reason || 'Abertura normal de turno',
          },
        ])
        .select()
        .single()

      if (error) throw error
      showSuccess('Caixa Aberto!', `Turno liberado com fundo de troco de ${formatCurrency(initial)}`)
      onSuccess()
      onClose()
    } catch (err: any) {
      showError('Erro ao abrir caixa', err.message)
    } finally {
      setLoading(false)
    }
  }

  // Sangria / Suprimento
  const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentShift) return

    try {
      setLoading(true)
      const val = parseFloat(amount) || 0
      if (val <= 0) return showWarning('Valor Inválido', 'Informe um valor maior que zero.')

      const type = modalType === 'sangria' ? 'SANGRIA' : 'SUPRIMENTO'

      const { error } = await supabase.from('cash_transactions').insert([
        {
          shift_id: currentShift.id,
          user_id: user?.id || null,
          type,
          amount: val,
          reason: reason || (type === 'SANGRIA' ? 'Retirada de caixa' : 'Reforço de troco'),
        },
      ])

      if (error) throw error
      showSuccess(
        `${type === 'SANGRIA' ? 'Sangria' : 'Suprimento'} Registrado!`,
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

  // Fechamento de Caixa
  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentShift) return

    try {
      setLoading(true)
      const finalCounted = parseFloat(amount) || 0

      // Calcular total de vendas em dinheiro do turno
      const { data: cashSales } = await supabase
        .from('sales')
        .select('total_amount')
        .eq('shift_id', currentShift.id)
        .eq('payment_method', 'Dinheiro')
        .eq('status', 'COMPLETED')

      const totalCashSales = (cashSales || []).reduce((sum, s: any) => sum + Number(s.total_amount), 0)

      // Calcular sangrias e suprimentos
      const { data: trans } = await supabase
        .from('cash_transactions')
        .select('type, amount')
        .eq('shift_id', currentShift.id)

      let totalSuprimento = 0
      let totalSangria = 0
      ;(trans || []).forEach((t: any) => {
        if (t.type === 'SUPRIMENTO') totalSuprimento += Number(t.amount)
        if (t.type === 'SANGRIA') totalSangria += Number(t.amount)
      })

      // Saldo teórico da gaveta = Fundo Inicial + Vendas Dinheiro + Suprimentos - Sangrias
      const systemAmount = currentShift.initial_amount + totalCashSales + totalSuprimento - totalSangria
      const difference = finalCounted - systemAmount

      const { error } = await supabase
        .from('cash_shifts')
        .update({
          closed_at: new Date().toISOString(),
          final_amount: finalCounted,
          system_amount: systemAmount,
          difference: difference,
          status: 'CLOSED',
          notes: reason || 'Fechamento de turno',
        })
        .eq('id', currentShift.id)

      if (error) throw error

      // Modal de Resumo Elegante no Padrão do Sistema
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
              <span className="font-mono font-bold text-white">{formatCurrency(finalCounted)}</span>
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
              onClick={() => setModalType('sangria')}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                modalType === 'sangria' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'text-slate-400'
              }`}
            >
              Sangria (-)
            </button>
            <button
              onClick={() => setModalType('suprimento')}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                modalType === 'suprimento' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400'
              }`}
            >
              Suprimento (+)
            </button>
            <button
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
            <div>
              <label className="text-xs font-semibold text-slate-400">Valor do Fundo de Troco (R$)</label>
              <input
                type="number"
                step="0.01"
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
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-xs font-extrabold text-slate-950 hover:bg-emerald-400 transition"
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
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-xs font-extrabold text-slate-950 hover:bg-amber-400 transition"
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
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-extrabold text-slate-950 transition ${
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
