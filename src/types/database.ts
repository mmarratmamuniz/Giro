export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          id: number
          name: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: number
          name: string
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          name?: string
          description?: string | null
          created_at?: string
        }
      }
      products: {
        Row: {
          id: number
          sku: string
          name: string
          description: string | null
          cost_price: number
          sale_price: number
          stock_quantity: number
          min_stock: number
          unit: string
          is_active: boolean
          category_id: number | null
          created_at: string
          updated_at: string
          category?: Database['public']['Tables']['categories']['Row']
        }
        Insert: {
          id?: number
          sku: string
          name: string
          description?: string | null
          cost_price?: number
          sale_price: number
          stock_quantity?: number
          min_stock?: number
          unit?: string
          is_active?: boolean
          category_id?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          sku?: string
          name?: string
          description?: string | null
          cost_price?: number
          sale_price?: number
          stock_quantity?: number
          min_stock?: number
          unit?: string
          is_active?: boolean
          category_id?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      purchases: {
        Row: {
          id: number
          date: string
          total_amount: number
          supplier: string | null
          created_at: string
        }
        Insert: {
          id?: number
          date?: string
          total_amount: number
          supplier?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          date?: string
          total_amount?: number
          supplier?: string | null
          created_at?: string
        }
      }
      purchase_items: {
        Row: {
          id: number
          purchase_id: number
          product_id: number
          quantity: number
          unit_cost: number
        }
        Insert: {
          id?: number
          purchase_id: number
          product_id: number
          quantity: number
          unit_cost: number
        }
        Update: {
          id?: number
          purchase_id?: number
          product_id?: number
          quantity?: number
          unit_cost?: number
        }
      }
      sales: {
        Row: {
          id: number
          date: string
          total_amount: number
          payment_method: string
          user_id: string | null
          created_at: string
        }
        Insert: {
          id?: number
          date?: string
          total_amount: number
          payment_method: string
          user_id?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          date?: string
          total_amount?: number
          payment_method?: string
          user_id?: string | null
          created_at?: string
        }
      }
      sale_items: {
        Row: {
          id: number
          sale_id: number
          product_id: number
          quantity: number
          unit_price: number
          product?: Database['public']['Tables']['products']['Row']
        }
        Insert: {
          id?: number
          sale_id: number
          product_id: number
          quantity: number
          unit_price: number
        }
        Update: {
          id?: number
          sale_id?: number
          product_id?: number
          quantity?: number
          unit_price?: number
        }
      }
      stock_movements: {
        Row: {
          id: number
          product_id: number
          movement_type: string
          quantity: number
          origin: string
          note: string | null
          user_id: string | null
          date: string
          product?: Database['public']['Tables']['products']['Row']
        }
        Insert: {
          id?: number
          product_id: number
          movement_type: string
          quantity: number
          origin: string
          note?: string | null
          user_id?: string | null
          date?: string
        }
        Update: {
          id?: number
          product_id?: number
          movement_type?: string
          quantity?: number
          origin?: string
          note?: string | null
          user_id?: string | null
          date?: string
        }
      }
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          role: string
          created_at: string
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          role?: string
          created_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          role?: string
          created_at?: string
        }
      }
    }
    Functions: {
      create_complete_sale: {
        Args: {
          p_payment_method: string
          p_items: Json
          p_user_id?: string
        }
        Returns: Json
      }
    }
  }
}
