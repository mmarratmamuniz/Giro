export interface CashShift {
  id: number
  user_id: string | null
  opened_at: string
  closed_at: string | null
  initial_amount: number
  final_amount: number | null
  system_amount: number | null
  difference: number | null
  status: 'OPEN' | 'CLOSED'
  notes: string | null
  created_at: string
}

export interface CashTransaction {
  id: number
  shift_id: number
  type: 'SANGRIA' | 'SUPRIMENTO'
  amount: number
  reason: string
  user_id: string | null
  created_at: string
}
