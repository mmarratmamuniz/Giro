'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CashShift } from '@/types/cash'
import { CashShiftModal } from '@/components/pdv/cash-shift-modal'
import {
  DollarSign,
  Lock,
  Unlock,
  ArrowDownRight,
  ArrowUpRight,
  History,
  Calendar,
  Layers,
  AlertCircle,
} from 'lucide-react'

export default function CaixaPage() {
  const [shifts, setShifts] = useState<CashShift[]>([])
  const [currentShift, setCurrentShift] = useState<CashShift | null>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const supabase = createClient()

  async function loadCaixaData() {
    try {
      setLoading(true)
      const [shiftsRes, curRes, transRes] = await Promise.all([
        supabase.from('cash_shifts').select('*').order('opened_at', { ascending: false }).limit(30),
        supabase
          .from('cash_shifts')
          .select('*')
          .eq('status', 'OPEN')
          .order('opened_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('cash_transactions')
          .select('*, shift:cash_shifts(id)')
          .order('created_at', { ascending: false })
          .limit(50),
      ])

      if (shiftsRes.data) setShifts(shiftsRes.data)
      setCurrentShift(curRes.data || null)
      if (transRes.data) setTransactions(transRes.data)
    } catch (err) {
      console.error('Erro ao carregar dados de caixa:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCaixaData()
  }, [])

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Card de Status do Turno Atual */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
              currentShift
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-lg shadow-emerald-500/10'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            {currentShift ? <Unlock size={28} /> : <Lock size={28} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  currentShift ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                }`}
              />
              <h3 className="text-lg font-bold text-white">
                {currentShift ? `Turno #${currentShift.id} em Andamento` : 'Caixa Fechado'}
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {currentShift
                ? `Aberto em ${formatDate(currentShift.opened_at)} com fundo de troco de ${formatCurrency(
                    currentShift.initial_amount
                  )}`
                : 'Abra um novo turno informando o fundo de troco para liberar o PDV.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className={`flex items-center gap-2 rounded-xl px-5 py-3 text-xs font-extrabold text-slate-950 transition ${
              currentShift
                ? 'bg-amber-500 hover:bg-amber-400 shadow-md shadow-amber-500/20'
                : 'bg-emerald-500 hover:bg-emerald-400 shadow-md shadow-emerald-500/20'
            }`}
          >
            {currentShift ? <DollarSign size={16} /> : <Unlock size={16} />}
            {currentShift ? 'Sangria / Suprimento / Fechar' : 'Abrir Turno de Caixa'}
          </button>
        </div>
      </div>

      {/* Grade de Histórico de Fechamentos e Transações */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Histórico de Fechamentos */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-bold text-white">Histórico de Fechamentos de Caixa</h4>
            <span className="text-xs text-slate-400 font-medium">Últimos 30 turnos</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold uppercase">
                <tr>
                  <th className="py-2.5 px-3">Turno</th>
                  <th className="py-2.5 px-3">Abertura</th>
                  <th className="py-2.5 px-3">Fundo Inicial</th>
                  <th className="py-2.5 px-3">Contado na Gaveta</th>
                  <th className="py-2.5 px-3 text-right">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {shifts.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-mono font-bold text-amber-400">#{s.id}</td>
                    <td className="py-2.5 px-3 text-slate-400">{formatDate(s.opened_at)}</td>
                    <td className="py-2.5 px-3 font-mono">{formatCurrency(s.initial_amount)}</td>
                    <td className="py-2.5 px-3 font-mono text-white">
                      {s.final_amount !== null ? formatCurrency(s.final_amount) : 'Em aberto'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold">
                      {s.difference !== null ? (
                        <span className={s.difference >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {s.difference >= 0 ? '+' : ''}
                          {formatCurrency(s.difference)}
                        </span>
                      ) : (
                        <span className="text-amber-400 font-normal">Aberto</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Histórico de Sangrias e Suprimentos */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-bold text-white">Sangrias e Suprimentos</h4>
            <span className="text-xs text-slate-400 font-medium">Movimentações Avulsas</span>
          </div>

          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {transactions.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                Nenhuma sangria ou suprimento registrado.
              </div>
            ) : (
              transactions.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-xl bg-slate-950 p-3 border border-slate-800"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        t.type === 'SANGRIA'
                          ? 'bg-rose-500/10 text-rose-400'
                          : 'bg-emerald-500/10 text-emerald-400'
                      }`}
                    >
                      {t.type === 'SANGRIA' ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">
                        {t.type === 'SANGRIA' ? 'Sangria (Retirada)' : 'Suprimento (Entrada de Troco)'}
                      </p>
                      <p className="text-[10px] text-slate-400">{t.reason || 'Sem descrição'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`font-mono font-bold text-xs ${
                        t.type === 'SANGRIA' ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {t.type === 'SANGRIA' ? '-' : '+'}
                      {formatCurrency(t.amount)}
                    </span>
                    <p className="text-[10px] text-slate-500">{formatDate(t.created_at)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal de Turno */}
      <CashShiftModal
        currentShift={currentShift}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => loadCaixaData()}
      />
    </div>
  )
}
