'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ModalDialogOptions {
  title: string
  message?: string
  content?: ReactNode
  type?: ToastType
  confirmText?: string
  cancelText?: string
  onConfirm?: () => void
  onCancel?: () => void
}

interface ToastMessage {
  id: string
  title: string
  message?: string
  type: ToastType
}

interface FeedbackContextType {
  showToast: (title: string, message?: string, type?: ToastType) => void
  showSuccess: (title: string, message?: string) => void
  showError: (title: string, message?: string) => void
  showWarning: (title: string, message?: string) => void
  showInfo: (title: string, message?: string) => void
  openDialog: (options: ModalDialogOptions) => void
  closeDialog: () => void
}

const FeedbackContext = createContext<FeedbackContextType>({
  showToast: () => {},
  showSuccess: () => {},
  showError: () => {},
  showWarning: () => {},
  showInfo: () => {},
  openDialog: () => {},
  closeDialog: () => {},
})

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [dialog, setDialog] = useState<ModalDialogOptions | null>(null)

  const showToast = (title: string, message?: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9)
    const newToast: ToastMessage = { id, title, message, type }
    setToasts((prev) => [...prev, newToast])

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }

  const showSuccess = (title: string, message?: string) => showToast(title, message, 'success')
  const showError = (title: string, message?: string) => showToast(title, message, 'error')
  const showWarning = (title: string, message?: string) => showToast(title, message, 'warning')
  const showInfo = (title: string, message?: string) => showToast(title, message, 'info')

  const openDialog = (options: ModalDialogOptions) => {
    setDialog(options)
  }

  const closeDialog = () => {
    setDialog(null)
  }

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <FeedbackContext.Provider
      value={{
        showToast,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        openDialog,
        closeDialog,
      }}
    >
      {children}

      {/* TOASTS FLUTUANTES (CANTO SUPERIOR DIREITO) */}
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success'
          const isError = toast.type === 'error'
          const isWarning = toast.type === 'warning'

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border backdrop-blur-xl shadow-2xl transition-all duration-300 animate-in slide-in-from-top-4 ${
                isSuccess
                  ? 'bg-slate-900/95 border-emerald-500/30 text-white'
                  : isError
                  ? 'bg-slate-900/95 border-rose-500/30 text-white'
                  : isWarning
                  ? 'bg-slate-900/95 border-amber-500/30 text-white'
                  : 'bg-slate-900/95 border-slate-700 text-white'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {isSuccess && <CheckCircle2 size={18} className="text-emerald-400" />}
                {isError && <XCircle size={18} className="text-rose-400" />}
                {isWarning && <AlertTriangle size={18} className="text-amber-400" />}
                {!isSuccess && !isError && !isWarning && <Info size={18} className="text-blue-400" />}
              </div>

              <div className="flex-1 overflow-hidden pr-1">
                <h5 className="text-xs font-bold text-white tracking-tight">{toast.title}</h5>
                {toast.message && (
                  <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">{toast.message}</p>
                )}
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 p-1 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>

      {/* MODAL DIALOG CUSTOMIZADO (SUBSTITUTO ELEGANTE DO ALERT/CONFIRM) */}
      {dialog && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/80 animate-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between pb-3 border-b border-slate-800/80 mb-4">
              <div className="flex items-center gap-2.5">
                {dialog.type === 'success' && (
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <CheckCircle2 size={20} />
                  </div>
                )}
                {dialog.type === 'error' && (
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                    <XCircle size={20} />
                  </div>
                )}
                {dialog.type === 'warning' && (
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <AlertTriangle size={20} />
                  </div>
                )}
                {(!dialog.type || dialog.type === 'info') && (
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    <Info size={20} />
                  </div>
                )}

                <h3 className="text-base font-extrabold text-white tracking-tight">
                  {dialog.title}
                </h3>
              </div>

              <button
                onClick={closeDialog}
                className="rounded-xl p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            {dialog.message && (
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line mb-4">
                {dialog.message}
              </p>
            )}

            {dialog.content && <div className="mb-5">{dialog.content}</div>}

            <div className="flex items-center justify-end gap-2.5 mt-5 pt-3 border-t border-slate-800/80">
              {dialog.cancelText && (
                <button
                  type="button"
                  onClick={() => {
                    dialog.onCancel?.()
                    closeDialog()
                  }}
                  className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-400 hover:bg-slate-800 hover:text-white transition"
                >
                  {dialog.cancelText}
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  dialog.onConfirm?.()
                  closeDialog()
                }}
                className={`rounded-xl px-5 py-2.5 text-xs font-extrabold shadow-md transition ${
                  dialog.type === 'success'
                    ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-emerald-500/20'
                    : dialog.type === 'error'
                    ? 'bg-rose-500 text-white hover:bg-rose-400 shadow-rose-500/20'
                    : dialog.type === 'warning'
                    ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-amber-500/20'
                    : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                }`}
              >
                {dialog.confirmText || 'Entendido'}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  )
}

export const useFeedback = () => useContext(FeedbackContext)
