import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://aqtbmfgixlggbuwtorld.supabase.co'
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxdGJtZmdpeGxnZ2J1d3RvcmxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NjA0ODUsImV4cCI6MjEwNTMzNjQ4NX0.akgCQbOBm2asMjuLsEzFRBGV-0Yz0YMzAoaevJF_5GM'

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
