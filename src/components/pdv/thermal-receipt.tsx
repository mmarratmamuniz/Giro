'use client'

import React from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Printer } from 'lucide-react'

interface ReceiptItem {
  product_name: string
  quantity: number
  unit_price: number
}

interface ThermalReceiptProps {
  saleId: number | string
  date: string
  paymentMethod: string
  items: ReceiptItem[]
  grossAmount?: number
  discountAmount?: number
  totalAmount: number
  cashGiven?: number
  changeDue?: number
  onClose?: () => void
}

export function ThermalReceipt({
  saleId,
  date,
  paymentMethod,
  items,
  grossAmount,
  discountAmount = 0,
  totalAmount,
  cashGiven,
  changeDue = 0,
  onClose,
}: ThermalReceiptProps) {
  const handlePrint = () => {
    window.print()
  }

  const subtotal = grossAmount || items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0)

  return (
    <div className="flex flex-col items-center">
      {/* Container de Impressão (estilizado para papel térmico 80mm / 58mm) */}
      <div id="thermal-receipt" className="w-[300px] bg-white text-black p-4 font-mono text-xs shadow-2xl rounded-sm print:m-0 print:p-2 print:w-full print:shadow-none">
        {/* Cabeçalho */}
        <div className="text-center border-b border-dashed border-black pb-3 mb-2">
          <h2 className="text-sm font-black tracking-tighter uppercase">FINISH BEBIDAS</h2>
          <p className="text-[10px]">Conveniência e Distribuidora</p>
          <p className="text-[10px]">CUPOM NÃO FISCAL</p>
          <div className="mt-2 text-[10px] flex justify-between">
            <span>VENDA: #{saleId}</span>
            <span>{formatDate(date)}</span>
          </div>
        </div>

        {/* Itens */}
        <div className="border-b border-dashed border-black pb-2 mb-2">
          <div className="flex justify-between text-[10px] font-bold border-b border-black pb-1 mb-1">
            <span>ITEM / QTD x UN</span>
            <span>TOTAL</span>
          </div>
          <div className="space-y-1">
            {items.map((it, idx) => (
              <div key={idx}>
                <div className="truncate font-bold">{it.product_name}</div>
                <div className="flex justify-between text-[10px] text-neutral-700">
                  <span>{it.quantity} un x {formatCurrency(it.unit_price)}</span>
                  <span className="font-bold text-black">{formatCurrency(it.quantity * it.unit_price)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totais */}
        <div className="space-y-1 border-b border-dashed border-black pb-2 mb-2 text-xs">
          <div className="flex justify-between">
            <span>SUBTOTAL:</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-neutral-700 font-bold">
              <span>DESCONTO:</span>
              <span>- {formatCurrency(discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-black pt-1 border-t border-black">
            <span>TOTAL PAGO:</span>
            <span>{formatCurrency(totalAmount)}</span>
          </div>
          <div className="flex justify-between text-[10px] pt-1">
            <span>FORMA PAGTO:</span>
            <span className="font-bold uppercase">{paymentMethod}</span>
          </div>
          {paymentMethod === 'Dinheiro' && cashGiven && (
            <>
              <div className="flex justify-between text-[10px]">
                <span>VALOR RECEBIDO:</span>
                <span>{formatCurrency(cashGiven)}</span>
              </div>
              <div className="flex justify-between text-[10px] font-bold">
                <span>TROCO:</span>
                <span>{formatCurrency(changeDue)}</span>
              </div>
            </>
          )}
        </div>

        {/* Rodapé */}
        <div className="text-center text-[10px] pt-2 space-y-1">
          <p className="font-bold">OBRIGADO PELA PREFERÊNCIA!</p>
          <p className="text-[8px] text-neutral-600">Volte Sempre • Finish Bebidas</p>
        </div>
      </div>

      {/* Botões de Ação na Tela (ocultos na impressão via print:hidden) */}
      <div className="flex gap-2 w-full mt-4 print:hidden">
        <button
          onClick={handlePrint}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-3 text-xs font-extrabold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20 transition"
        >
          <Printer size={15} /> Imprimir Cupom Térmico
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-4 py-3 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
          >
            Fechar
          </button>
        )}
      </div>
    </div>
  )
}
