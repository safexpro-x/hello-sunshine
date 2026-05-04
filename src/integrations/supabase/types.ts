export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      blocked_ips: {
        Row: {
          blocked_by: string | null
          company_id: string
          created_at: string
          id: string
          ip_address: string
          reason: string | null
        }
        Insert: {
          blocked_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          ip_address: string
          reason?: string | null
        }
        Update: {
          blocked_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          ip_address?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocked_ips_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_settings: {
        Row: {
          accent_hsl: string
          brand_name: string
          favicon_url: string | null
          footer_text: string | null
          id: number
          logo_url: string | null
          primary_hsl: string
          support_email: string | null
          updated_at: string
        }
        Insert: {
          accent_hsl?: string
          brand_name?: string
          favicon_url?: string | null
          footer_text?: string | null
          id?: number
          logo_url?: string | null
          primary_hsl?: string
          support_email?: string | null
          updated_at?: string
        }
        Update: {
          accent_hsl?: string
          brand_name?: string
          favicon_url?: string | null
          footer_text?: string | null
          id?: number
          logo_url?: string | null
          primary_hsl?: string
          support_email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      call_sessions: {
        Row: {
          agent_token: string
          call_id: string
          consumed_at: string | null
          created_at: string
          customer_token: string
          expires_at: string
          id: string
        }
        Insert: {
          agent_token: string
          call_id: string
          consumed_at?: string | null
          created_at?: string
          customer_token: string
          expires_at?: string
          id?: string
        }
        Update: {
          agent_token?: string
          call_id?: string
          consumed_at?: string | null
          created_at?: string
          customer_token?: string
          expires_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_sessions_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          ai_handled: boolean
          company_id: string
          created_at: string
          customer_email: string | null
          customer_info: string | null
          customer_ip: string | null
          customer_issue: string | null
          customer_name: string | null
          customer_phone: string | null
          duration_seconds: number | null
          employee_id: string | null
          ended_at: string | null
          id: string
          language: string | null
          notes: string | null
          picked_at: string | null
          room_id: string
          started_at: string
          status: Database["public"]["Enums"]["call_status"]
          updated_at: string
        }
        Insert: {
          ai_handled?: boolean
          company_id: string
          created_at?: string
          customer_email?: string | null
          customer_info?: string | null
          customer_ip?: string | null
          customer_issue?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          duration_seconds?: number | null
          employee_id?: string | null
          ended_at?: string | null
          id?: string
          language?: string | null
          notes?: string | null
          picked_at?: string | null
          room_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["call_status"]
          updated_at?: string
        }
        Update: {
          ai_handled?: boolean
          company_id?: string
          created_at?: string
          customer_email?: string | null
          customer_info?: string | null
          customer_ip?: string | null
          customer_issue?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          duration_seconds?: number | null
          employee_id?: string | null
          ended_at?: string | null
          id?: string
          language?: string | null
          notes?: string | null
          picked_at?: string | null
          room_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["call_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          api_key: string
          business_description: string
          contact_email: string
          created_at: string
          id: string
          mobile: string | null
          name: string
          owner_id: string
          rejection_reason: string | null
          status: Database["public"]["Enums"]["company_status"]
          updated_at: string
          website: string | null
        }
        Insert: {
          api_key?: string
          business_description: string
          contact_email: string
          created_at?: string
          id?: string
          mobile?: string | null
          name: string
          owner_id: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          api_key?: string
          business_description?: string
          contact_email?: string
          created_at?: string
          id?: string
          mobile?: string | null
          name?: string
          owner_id?: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      company_app_keys: {
        Row: {
          app_key: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          label: string
          last_used_at: string | null
        }
        Insert: {
          app_key?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string
          last_used_at?: string | null
        }
        Update: {
          app_key?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string
          last_used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_app_keys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_domain_whitelist: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          domain: string
          id: string
          label: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          domain: string
          id?: string
          label?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          domain?: string
          id?: string
          label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_domain_whitelist_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_ip_whitelist: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          ip_address: string
          label: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          ip_address: string
          label?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          ip_address?: string
          label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_ip_whitelist_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          company_id: string
          created_at: string
          fcm_token: string
          id: string
          is_active: boolean
          last_seen_at: string
          platform: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          fcm_token: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          platform?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          fcm_token?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          platform?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          attempts: number
          body: string
          created_at: string
          id: string
          last_error: string | null
          sent_at: string | null
          status: string
          subject: string
          to_email: string
        }
        Insert: {
          attempts?: number
          body: string
          created_at?: string
          id?: string
          last_error?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          to_email: string
        }
        Update: {
          attempts?: number
          body?: string
          created_at?: string
          id?: string
          last_error?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          to_email?: string
        }
        Relationships: []
      }
      email_verifications: {
        Row: {
          consumed_at: string | null
          created_at: string
          display_name: string
          email: string
          expires_at: string
          id: string
          password_hash: string
          phone: string | null
          token: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          display_name: string
          email: string
          expires_at: string
          id?: string
          password_hash: string
          phone?: string | null
          token: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          display_name?: string
          email?: string
          expires_at?: string
          id?: string
          password_hash?: string
          phone?: string | null
          token?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          company_id: string
          created_at: string
          display_name: string
          email: string
          id: string
          is_active: boolean
          role: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          display_name: string
          email: string
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      firebase_settings: {
        Row: {
          app_id: string | null
          auth_domain: string | null
          id: number
          is_enabled: boolean
          project_id: string | null
          updated_at: string
          web_api_key: string | null
        }
        Insert: {
          app_id?: string | null
          auth_domain?: string | null
          id?: number
          is_enabled?: boolean
          project_id?: string | null
          updated_at?: string
          web_api_key?: string | null
        }
        Update: {
          app_id?: string | null
          auth_domain?: string | null
          id?: number
          is_enabled?: boolean
          project_id?: string | null
          updated_at?: string
          web_api_key?: string | null
        }
        Relationships: []
      }
      firebase_user_map: {
        Row: {
          created_at: string
          email: string
          firebase_uid: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          firebase_uid: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          firebase_uid?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      gemini_settings: {
        Row: {
          api_key: string | null
          extract_model: string
          id: number
          reply_model: string
          updated_at: string
          use_env_fallback: boolean
        }
        Insert: {
          api_key?: string | null
          extract_model?: string
          id?: number
          reply_model?: string
          updated_at?: string
          use_env_fallback?: boolean
        }
        Update: {
          api_key?: string | null
          extract_model?: string
          id?: number
          reply_model?: string
          updated_at?: string
          use_env_fallback?: boolean
        }
        Relationships: []
      }
      openai_settings: {
        Row: {
          api_key: string | null
          extract_model: string
          id: number
          lovable_extract_model: string
          lovable_reply_model: string
          provider: string
          reply_model: string
          updated_at: string
          use_env_fallback: boolean
        }
        Insert: {
          api_key?: string | null
          extract_model?: string
          id?: number
          lovable_extract_model?: string
          lovable_reply_model?: string
          provider?: string
          reply_model?: string
          updated_at?: string
          use_env_fallback?: boolean
        }
        Update: {
          api_key?: string | null
          extract_model?: string
          id?: number
          lovable_extract_model?: string
          lovable_reply_model?: string
          provider?: string
          reply_model?: string
          updated_at?: string
          use_env_fallback?: boolean
        }
        Relationships: []
      }
      password_reset_tokens: {
        Row: {
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          token: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          token: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          token?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_paise: number
          company_id: string
          created_at: string
          currency: string
          id: string
          is_test: boolean
          paid_at: string | null
          plan_id: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          status: string
        }
        Insert: {
          amount_paise: number
          company_id: string
          created_at?: string
          currency?: string
          id?: string
          is_test?: boolean
          paid_at?: string | null
          plan_id: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          status?: string
        }
        Update: {
          amount_paise?: number
          company_id?: string
          created_at?: string
          currency?: string
          id?: string
          is_test?: boolean
          paid_at?: string | null
          plan_id?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          agent_quota: number | null
          call_quota: number | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          price_paise: number
          sort_order: number
          updated_at: string
          validity_days: number
        }
        Insert: {
          agent_quota?: number | null
          call_quota?: number | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price_paise: number
          sort_order?: number
          updated_at?: string
          validity_days?: number
        }
        Update: {
          agent_quota?: number | null
          call_quota?: number | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price_paise?: number
          sort_order?: number
          updated_at?: string
          validity_days?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          email_verified_at: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          email_verified_at?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          email_verified_at?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      razorpay_settings: {
        Row: {
          id: number
          key_id: string | null
          key_secret: string | null
          test_key_id: string | null
          test_key_secret: string | null
          test_mode: boolean
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          id?: number
          key_id?: string | null
          key_secret?: string | null
          test_key_id?: string | null
          test_key_secret?: string | null
          test_mode?: boolean
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          id?: number
          key_id?: string | null
          key_secret?: string | null
          test_key_id?: string | null
          test_key_secret?: string | null
          test_mode?: boolean
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: []
      }
      site_content: {
        Row: {
          contact_us: string
          footer_text: string
          hero_badge: string
          hero_headline: string
          hero_subheadline: string
          id: number
          meta_description: string
          pricing_tagline: string
          privacy_policy: string
          site_title: string
          terms_of_service: string
          updated_at: string
        }
        Insert: {
          contact_us?: string
          footer_text?: string
          hero_badge?: string
          hero_headline?: string
          hero_subheadline?: string
          id?: number
          meta_description?: string
          pricing_tagline?: string
          privacy_policy?: string
          site_title?: string
          terms_of_service?: string
          updated_at?: string
        }
        Update: {
          contact_us?: string
          footer_text?: string
          hero_badge?: string
          hero_headline?: string
          hero_subheadline?: string
          id?: number
          meta_description?: string
          pricing_tagline?: string
          privacy_policy?: string
          site_title?: string
          terms_of_service?: string
          updated_at?: string
        }
        Relationships: []
      }
      smtp_settings: {
        Row: {
          from_email: string | null
          from_name: string | null
          host: string | null
          id: number
          password: string | null
          port: number | null
          updated_at: string
          use_ssl: boolean
          use_supabase_fallback: boolean
          use_tls: boolean
          username: string | null
        }
        Insert: {
          from_email?: string | null
          from_name?: string | null
          host?: string | null
          id?: number
          password?: string | null
          port?: number | null
          updated_at?: string
          use_ssl?: boolean
          use_supabase_fallback?: boolean
          use_tls?: boolean
          username?: string | null
        }
        Update: {
          from_email?: string | null
          from_name?: string | null
          host?: string | null
          id?: number
          password?: string | null
          port?: number | null
          updated_at?: string
          use_ssl?: boolean
          use_supabase_fallback?: boolean
          use_tls?: boolean
          username?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          company_id: string
          created_at: string
          expires_at: string
          id: string
          plan_id: string
          starts_at: string
          status: string
          updated_at: string
          used_calls: number
        }
        Insert: {
          company_id: string
          created_at?: string
          expires_at: string
          id?: string
          plan_id: string
          starts_at?: string
          status?: string
          updated_at?: string
          used_calls?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          plan_id?: string
          starts_at?: string
          status?: string
          updated_at?: string
          used_calls?: number
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      widget_slugs: {
        Row: {
          company_id: string
          created_at: string
          is_active: boolean
          slug: string
        }
        Insert: {
          company_id: string
          created_at?: string
          is_active?: boolean
          slug: string
        }
        Update: {
          company_id?: string
          created_at?: string
          is_active?: boolean
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "widget_slugs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_subscription_for_payment: {
        Args: { _payment_id: string }
        Returns: string
      }
      can_company_add_agent: { Args: { _company_id: string }; Returns: boolean }
      can_company_make_call: { Args: { _company_id: string }; Returns: boolean }
      consume_call_quota: { Args: { _company_id: string }; Returns: boolean }
      generate_short_slug: { Args: never; Returns: string }
      get_company_active_subscription: {
        Args: { _company_id: string }
        Returns: {
          company_id: string
          created_at: string
          expires_at: string
          id: string
          plan_id: string
          starts_at: string
          status: string
          updated_at: string
          used_calls: number
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_company_agent_limits: {
        Args: { _company_id: string }
        Returns: {
          quota: number
          used: number
        }[]
      }
      get_employee_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_ip_allowed_for_company: {
        Args: { _company_id: string; _ip: string }
        Returns: boolean
      }
      is_origin_allowed_for_company: {
        Args: { _company_id: string; _origin: string }
        Returns: boolean
      }
      verify_app_key: { Args: { _key: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "company_owner" | "employee"
      call_status: "waiting" | "active" | "ended"
      company_status: "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "company_owner", "employee"],
      call_status: ["waiting", "active", "ended"],
      company_status: ["pending", "approved", "rejected"],
    },
  },
} as const
