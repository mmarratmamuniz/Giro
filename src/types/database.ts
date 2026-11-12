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
      networks: {
        Row: {
          id: string
          name: string
          description: string | null
          document_cnpj?: string | null
          logo_url?: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          document_cnpj?: string | null
          logo_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          document_cnpj?: string | null
          logo_url?: string | null
          created_at?: string
        }
      }
      units: {
        Row: {
          id: string
          network_id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          network_id: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          network_id?: string
          name?: string
          created_at?: string
        }
      }
      branches: {
        Row: {
          id: string
          network_id: string
          unit_id: string | null
          name: string
          location: string | null
          created_at: string
        }
        Insert: {
          id?: string
          network_id: string
          unit_id?: string | null
          name: string
          location?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          network_id?: string
          unit_id?: string | null
          name?: string
          location?: string | null
          created_at?: string
        }
      }
      cash_desks: {
        Row: {
          id: string
          branch_id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          branch_id: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          branch_id?: string
          name?: string
          created_at?: string
        }
      }
      categories: {
        Row: {
          tenant_id?: string
          id: number
          network_id?: string | null
          name: string
          description: string | null
          created_at: string
        }
        Insert: {
          tenant_id?: string
          id?: number
          network_id?: string | null
          name: string
          description?: string | null
          created_at?: string
        }
        Update: {
          tenant_id?: string
          id?: number
          network_id?: string | null
          name?: string
          description?: string | null
          created_at?: string
        }
      }
      products: {
        Row: {
          tenant_id?: string
          id: number
          network_id?: string | null
          branch_id?: string | null
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
          tenant_id?: string
          id?: number
          network_id?: string | null
          branch_id?: string | null
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
          tenant_id?: string
          id?: number
          network_id?: string | null
          branch_id?: string | null
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
          tenant_id?: string
          id: number
          network_id?: string | null
          branch_id?: string | null
          user_id?: string | null
          invoice_number?: string | null
          date: string
          total_amount: number
          supplier: string | null
          created_at: string
        }
        Insert: {
          tenant_id?: string
          id?: number
          network_id?: string | null
          branch_id?: string | null
          user_id?: string | null
          invoice_number?: string | null
          date?: string
          total_amount: number
          supplier?: string | null
          created_at?: string
        }
        Update: {
          tenant_id?: string
          id?: number
          network_id?: string | null
          branch_id?: string | null
          user_id?: string | null
          invoice_number?: string | null
          date?: string
          total_amount?: number
          supplier?: string | null
          created_at?: string
        }
      }
      purchase_items: {
        Row: {
          tenant_id?: string
          id: number
          purchase_id: number
          product_id: number
          quantity: number
          unit_cost: number
        }
        Insert: {
          tenant_id?: string
          id?: number
          purchase_id: number
          product_id: number
          quantity: number
          unit_cost: number
        }
        Update: {
          tenant_id?: string
          id?: number
          purchase_id?: number
          product_id?: number
          quantity?: number
          unit_cost?: number
        }
      }
      sales: {
        Row: {
          tenant_id?: string
          id: number
          network_id?: string | null
          branch_id?: string | null
          shift_id?: number | null
          cash_desk_id?: string | null
          date: string
          total_amount: number
          discount_amount?: number
          payment_method: string
          status: string
          cancel_reason?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          user_id: string | null
          created_at: string
        }
        Insert: {
          tenant_id?: string
          id?: number
          network_id?: string | null
          branch_id?: string | null
          shift_id?: number | null
          cash_desk_id?: string | null
          date?: string
          total_amount: number
          discount_amount?: number
          payment_method: string
          status?: string
          cancel_reason?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          user_id?: string | null
          created_at?: string
        }
        Update: {
          tenant_id?: string
          id?: number
          network_id?: string | null
          branch_id?: string | null
          shift_id?: number | null
          cash_desk_id?: string | null
          date?: string
          total_amount?: number
          discount_amount?: number
          payment_method?: string
          status?: string
          cancel_reason?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          user_id?: string | null
          created_at?: string
        }
      }
      sale_items: {
        Row: {
          tenant_id?: string
          id: number
          sale_id: number
          product_id: number
          quantity: number
          unit_price: number
          unit_cost: number
          product?: Database['public']['Tables']['products']['Row']
        }
        Insert: {
          tenant_id?: string
          id?: number
          sale_id: number
          product_id: number
          quantity: number
          unit_price: number
          unit_cost?: number
        }
        Update: {
          tenant_id?: string
          id?: number
          sale_id?: number
          product_id?: number
          quantity?: number
          unit_price?: number
          unit_cost?: number
        }
      }
      stock_movements: {
        Row: {
          tenant_id?: string
          id: number
          network_id?: string | null
          branch_id?: string | null
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
          tenant_id?: string
          id?: number
          network_id?: string | null
          branch_id?: string | null
          product_id: number
          movement_type: string
          quantity: number
          origin: string
          note?: string | null
          user_id?: string | null
          date?: string
        }
        Update: {
          tenant_id?: string
          id?: number
          network_id?: string | null
          branch_id?: string | null
          product_id?: number
          movement_type?: string
          quantity?: number
          origin?: string
          note?: string | null
          user_id?: string | null
          date?: string
        }
      }
      cash_shifts: {
        Row: {
          id: number
          network_id: string | null
          branch_id: string | null
          cash_desk_id: string | null
          user_id: string | null
          opened_at: string
          closed_at: string | null
          closed_by_user_id: string | null
          initial_amount: number
          final_amount: number | null
          system_amount: number | null
          difference: number | null
          status: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: number
          network_id?: string | null
          branch_id?: string | null
          cash_desk_id?: string | null
          user_id?: string | null
          opened_at?: string
          closed_at?: string | null
          closed_by_user_id?: string | null
          initial_amount: number
          final_amount?: number | null
          system_amount?: number | null
          difference?: number | null
          status?: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          network_id?: string | null
          branch_id?: string | null
          cash_desk_id?: string | null
          user_id?: string | null
          opened_at?: string
          closed_at?: string | null
          closed_by_user_id?: string | null
          initial_amount?: number
          final_amount?: number | null
          system_amount?: number | null
          difference?: number | null
          status?: string
          notes?: string | null
          created_at?: string
        }
      }
      cash_transactions: {
        Row: {
          id: number
          shift_id: number
          type: string
          amount: number
          reason: string
          user_id: string | null
          created_at: string
        }
        Insert: {
          id?: number
          shift_id: number
          type: string
          amount: number
          reason: string
          user_id?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          shift_id?: number
          type?: string
          amount?: number
          reason?: string
          user_id?: string | null
          created_at?: string
        }
      }
      profiles: {
        Row: {
          tenant_id?: string
          id: string
          email: string | null
          full_name: string | null
          role: string
          job_title?: string | null
          network_id: string | null
          unit_id: string | null
          branch_id: string | null
          created_at: string
        }
        Insert: {
          tenant_id?: string
          id: string
          email?: string | null
          full_name?: string | null
          role?: string
          job_title?: string | null
          network_id?: string | null
          unit_id?: string | null
          branch_id?: string | null
          created_at?: string
        }
        Update: {
          tenant_id?: string
          id?: string
          email?: string | null
          full_name?: string | null
          role?: string
          job_title?: string | null
          network_id?: string | null
          unit_id?: string | null
          branch_id?: string | null
          created_at?: string
        }
      }
    }
    Functions: {
      create_complete_sale: {
        Args: {
          p_payment_method: string
          p_items: Json
          p_user_id?: string | null
          p_discount_amount?: number
          p_shift_id?: number | null
          p_branch_id?: string | null
          p_cash_desk_id?: string | null
        }
        Returns: Json
      }
      cancel_sale: {
        Args: {
          p_sale_id: number
          p_reason: string
          p_user_id?: string | null
        }
        Returns: Json
      }
      create_complete_purchase: {
        Args: {
          p_branch_id: string
          p_supplier: string
          p_items: Json
          p_invoice_number?: string | null
        }
        Returns: Json
      }
      adjust_product_stock: {
        Args: {
          p_product_id: number
          p_new_quantity: number
          p_reason: string
        }
        Returns: Json
      }
      close_cash_shift: {
        Args: {
          p_shift_id: number
          p_final_amount: number
          p_notes?: string | null
        }
        Returns: Json
      }
      register_cash_transaction: {
        Args: {
          p_shift_id: number
          p_type: string
          p_amount: number
          p_reason: string
        }
        Returns: Json
      }
      admin_configure_new_user: {
        Args: {
          p_user_id: string
          p_full_name: string
          p_role: string
          p_network_id?: string | null
          p_unit_id?: string | null
          p_branch_id?: string | null
          p_job_title?: string | null
        }
        Returns: Json
      }
      admin_update_user: {
        Args: {
          p_user_id: string
          p_full_name: string
          p_role: string
          p_network_id?: string | null
          p_branch_id?: string | null
          p_job_title?: string | null
          p_new_password?: string | null
        }
        Returns: Json
      }
      admin_delete_user: {
        Args: {
          p_user_id: string
        }
        Returns: Json
      }
      admin_delete_product: {
        Args: {
          p_product_id: number
        }
        Returns: Json
      }
    }
  }
}
