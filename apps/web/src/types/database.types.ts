// Arquivo gerado por `pnpm db:types` — NÃO EDITAR MANUALMENTE.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13"
  }
  public: {
    Tables: {
      agenda_appointments: {
        Row: {
          canceled_reason: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          ends_at: string
          id: string
          idempotency_key: string | null
          notes: string | null
          origin: string | null
          professional_user_id: string
          service_id: string
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          canceled_reason?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          ends_at: string
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          origin?: string | null
          professional_user_id: string
          service_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          canceled_reason?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          ends_at?: string
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          origin?: string | null
          professional_user_id?: string
          service_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_appointments_customer_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "agenda_appointments_professional_user_id_fkey"
            columns: ["professional_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_appointments_service_fkey"
            columns: ["tenant_id", "service_id"]
            isOneToOne: false
            referencedRelation: "agenda_services"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "agenda_appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_service_professionals: {
        Row: {
          created_at: string
          professional_user_id: string
          service_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          professional_user_id: string
          service_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          professional_user_id?: string
          service_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_service_professionals_professional_user_id_fkey"
            columns: ["professional_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_service_professionals_service_fkey"
            columns: ["tenant_id", "service_id"]
            isOneToOne: false
            referencedRelation: "agenda_services"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      agenda_services: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          name: string
          price: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes: number
          id?: string
          is_active?: boolean
          name: string
          price?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_services_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversation_states: {
        Row: {
          conversation_id: string
          draft_items: Json
          last_tool_used: string | null
          tenant_id: string
          turn_count: number
          updated_at: string
        }
        Insert: {
          conversation_id: string
          draft_items?: Json
          last_tool_used?: string | null
          tenant_id: string
          turn_count?: number
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          draft_items?: Json
          last_tool_used?: string | null
          tenant_id?: string
          turn_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversation_states_conversation_fkey"
            columns: ["tenant_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          conversation_id: string | null
          cost_usd: number
          created_at: string
          id: string
          input_tokens: number
          message_id: string | null
          model: string
          output_tokens: number
          tenant_id: string
        }
        Insert: {
          conversation_id?: string | null
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          message_id?: string | null
          model: string
          output_tokens?: number
          tenant_id: string
        }
        Update: {
          conversation_id?: string | null
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          message_id?: string | null
          model?: string
          output_tokens?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      allergens: {
        Row: {
          code: string
          description: string
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          description?: string
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_type: Database["public"]["Enums"]["audit_actor_type"]
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          metadata: Json
          request_id: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_type?: Database["public"]["Enums"]["audit_actor_type"]
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          metadata?: Json
          request_id?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_type?: Database["public"]["Enums"]["audit_actor_type"]
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          metadata?: Json
          request_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_fkey"
            columns: ["tenant_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          responsible_user_id: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          tenant_id: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          responsible_user_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          tenant_id: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          responsible_user_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          tenant_id?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_customer_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "conversations_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_opportunities: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          estimated_value: number | null
          expected_at: string | null
          id: string
          lost_at: string | null
          lost_reason: string | null
          notes: string | null
          origin: string | null
          responsible_user_id: string | null
          stage_id: string
          tenant_id: string
          title: string | null
          updated_at: string
          won_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          estimated_value?: number | null
          expected_at?: string | null
          id?: string
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          origin?: string | null
          responsible_user_id?: string | null
          stage_id: string
          tenant_id: string
          title?: string | null
          updated_at?: string
          won_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          estimated_value?: number | null
          expected_at?: string | null
          id?: string
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          origin?: string | null
          responsible_user_id?: string | null
          stage_id?: string
          tenant_id?: string
          title?: string | null
          updated_at?: string
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_opportunities_customer_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "crm_opportunities_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_opportunities_stage_fkey"
            columns: ["tenant_id", "stage_id"]
            isOneToOne: false
            referencedRelation: "crm_stages"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "crm_opportunities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_opportunity_products: {
        Row: {
          created_at: string
          opportunity_id: string
          quantity: number
          tenant_id: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          opportunity_id: string
          quantity?: number
          tenant_id: string
          variant_id: string
        }
        Update: {
          created_at?: string
          opportunity_id?: string
          quantity?: number
          tenant_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_opportunity_products_opportunity_fkey"
            columns: ["tenant_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "crm_opportunity_products_variant_fkey"
            columns: ["tenant_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      crm_stages: {
        Row: {
          code: string
          color: string
          created_at: string
          id: string
          is_active: boolean
          is_lost: boolean
          is_won: boolean
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_lost?: boolean
          is_won?: boolean
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_lost?: boolean
          is_won?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_stages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          archived_at: string | null
          birthday: string | null
          created_at: string
          created_by: string | null
          document: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          origin: string | null
          phone: string | null
          responsible_user_id: string | null
          tags: string[]
          tenant_id: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          archived_at?: string | null
          birthday?: string | null
          created_at?: string
          created_by?: string | null
          document?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          origin?: string | null
          phone?: string | null
          responsible_user_id?: string | null
          tags?: string[]
          tenant_id: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          archived_at?: string | null
          birthday?: string | null
          created_at?: string
          created_by?: string | null
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          origin?: string | null
          phone?: string | null
          responsible_user_id?: string | null
          tags?: string[]
          tenant_id?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          external_message_id: string | null
          failed_reason: string | null
          id: string
          media_path: string | null
          media_type: string | null
          sender_type: Database["public"]["Enums"]["message_sender_type"]
          sender_user_id: string | null
          status: Database["public"]["Enums"]["message_status"]
          tenant_id: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          external_message_id?: string | null
          failed_reason?: string | null
          id?: string
          media_path?: string | null
          media_type?: string | null
          sender_type: Database["public"]["Enums"]["message_sender_type"]
          sender_user_id?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          tenant_id: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          external_message_id?: string | null
          failed_reason?: string | null
          id?: string
          media_path?: string | null
          media_type?: string | null
          sender_type?: Database["public"]["Enums"]["message_sender_type"]
          sender_user_id?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_fkey"
            columns: ["tenant_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "messages_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrients: {
        Row: {
          category: string
          code: string
          is_core: boolean
          name: string
          sort_order: number
          unit: string
        }
        Insert: {
          category: string
          code: string
          is_core?: boolean
          name: string
          sort_order?: number
          unit: string
        }
        Update: {
          category?: string
          code?: string
          is_core?: boolean
          name?: string
          sort_order?: number
          unit?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          canceled_at: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          failed_reason: string | null
          id: string
          metadata: Json
          method: string
          provider: string
          provider_charge_id: string | null
          reservation_id: string
          status: Database["public"]["Enums"]["payment_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          canceled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          failed_reason?: string | null
          id?: string
          metadata?: Json
          method: string
          provider?: string
          provider_charge_id?: string | null
          reservation_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          canceled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          failed_reason?: string | null
          id?: string
          metadata?: Json
          method?: string
          provider?: string
          provider_charge_id?: string | null
          reservation_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "payments_reservation_fkey"
            columns: ["tenant_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          description: string
          module: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          module: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          module?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          granted_by: string | null
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          metadata: Json
          reason: string | null
          request_id: string | null
          target_tenant_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          request_id?: string | null
          target_tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          request_id?: string | null
          target_tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_logs_target_tenant_id_fkey"
            columns: ["target_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_allergens: {
        Row: {
          allergen_code: string
          created_at: string
          id: string
          may_contain_traces: boolean
          notes: string | null
          presence: Database["public"]["Enums"]["tri_state"]
          product_id: string
          source: Database["public"]["Enums"]["info_source"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          variant_id: string | null
        }
        Insert: {
          allergen_code: string
          created_at?: string
          id?: string
          may_contain_traces?: boolean
          notes?: string | null
          presence: Database["public"]["Enums"]["tri_state"]
          product_id: string
          source: Database["public"]["Enums"]["info_source"]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          variant_id?: string | null
        }
        Update: {
          allergen_code?: string
          created_at?: string
          id?: string
          may_contain_traces?: boolean
          notes?: string | null
          presence?: Database["public"]["Enums"]["tri_state"]
          product_id?: string
          source?: Database["public"]["Enums"]["info_source"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_allergens_allergen_code_fkey"
            columns: ["allergen_code"]
            isOneToOne: false
            referencedRelation: "allergens"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "product_allergens_product_fkey"
            columns: ["tenant_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "product_allergens_variant_fkey"
            columns: ["tenant_id", "product_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["tenant_id", "product_id", "id"]
          },
        ]
      }
      product_attribute_options: {
        Row: {
          attribute_id: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attribute_id: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attribute_id?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_attribute_options_attribute_fkey"
            columns: ["tenant_id", "attribute_id"]
            isOneToOne: false
            referencedRelation: "product_attributes"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      product_attribute_values: {
        Row: {
          attribute_id: string
          created_at: string
          id: string
          option_id: string | null
          product_id: string
          source: Database["public"]["Enums"]["info_source"]
          tenant_id: string
          updated_at: string
          value_boolean: boolean | null
          value_number: number | null
          value_text: string | null
          variant_id: string | null
        }
        Insert: {
          attribute_id: string
          created_at?: string
          id?: string
          option_id?: string | null
          product_id: string
          source?: Database["public"]["Enums"]["info_source"]
          tenant_id: string
          updated_at?: string
          value_boolean?: boolean | null
          value_number?: number | null
          value_text?: string | null
          variant_id?: string | null
        }
        Update: {
          attribute_id?: string
          created_at?: string
          id?: string
          option_id?: string | null
          product_id?: string
          source?: Database["public"]["Enums"]["info_source"]
          tenant_id?: string
          updated_at?: string
          value_boolean?: boolean | null
          value_number?: number | null
          value_text?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_attribute_values_attribute_fkey"
            columns: ["tenant_id", "attribute_id"]
            isOneToOne: false
            referencedRelation: "product_attributes"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "product_attribute_values_option_fkey"
            columns: ["tenant_id", "option_id"]
            isOneToOne: false
            referencedRelation: "product_attribute_options"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "product_attribute_values_product_fkey"
            columns: ["tenant_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "product_attribute_values_variant_fkey"
            columns: ["tenant_id", "product_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["tenant_id", "product_id", "id"]
          },
        ]
      }
      product_attributes: {
        Row: {
          code: string
          created_at: string
          data_type: Database["public"]["Enums"]["attribute_data_type"]
          description: string | null
          group_name: string | null
          id: string
          is_active: boolean
          is_compatibility_enabled: boolean
          is_filterable: boolean
          is_searchable: boolean
          is_variant_axis: boolean
          name: string
          sort_order: number
          tenant_id: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          data_type: Database["public"]["Enums"]["attribute_data_type"]
          description?: string | null
          group_name?: string | null
          id?: string
          is_active?: boolean
          is_compatibility_enabled?: boolean
          is_filterable?: boolean
          is_searchable?: boolean
          is_variant_axis?: boolean
          name: string
          sort_order?: number
          tenant_id: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          data_type?: Database["public"]["Enums"]["attribute_data_type"]
          description?: string | null
          group_name?: string | null
          id?: string
          is_active?: boolean
          is_compatibility_enabled?: boolean
          is_filterable?: boolean
          is_searchable?: boolean
          is_variant_axis?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_attributes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_nutrition: {
        Row: {
          created_at: string
          id: string
          product_id: string
          serving_description: string | null
          serving_size: number
          serving_unit: string
          servings_per_container: number | null
          source: Database["public"]["Enums"]["info_source"]
          source_notes: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          serving_description?: string | null
          serving_size: number
          serving_unit: string
          servings_per_container?: number | null
          source: Database["public"]["Enums"]["info_source"]
          source_notes?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          serving_description?: string | null
          serving_size?: number
          serving_unit?: string
          servings_per_container?: number | null
          source?: Database["public"]["Enums"]["info_source"]
          source_notes?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_nutrition_product_fkey"
            columns: ["tenant_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "product_nutrition_variant_fkey"
            columns: ["tenant_id", "product_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["tenant_id", "product_id", "id"]
          },
        ]
      }
      product_nutrition_values: {
        Row: {
          amount: number
          nutrient_code: string
          nutrition_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          nutrient_code: string
          nutrition_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          nutrient_code?: string
          nutrition_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_nutrition_values_nutrient_code_fkey"
            columns: ["nutrient_code"]
            isOneToOne: false
            referencedRelation: "nutrients"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "product_nutrition_values_nutrition_fkey"
            columns: ["tenant_id", "nutrition_id"]
            isOneToOne: false
            referencedRelation: "product_nutrition"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      product_variant_costs: {
        Row: {
          cost_price: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
          variant_id: string
        }
        Insert: {
          cost_price: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          variant_id: string
        }
        Update: {
          cost_price?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_costs_variant_fkey"
            columns: ["tenant_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      product_variants: {
        Row: {
          archived_at: string | null
          barcode: string | null
          created_at: string
          id: string
          image_path: string | null
          is_active: boolean
          is_default: boolean
          min_stock: number | null
          name: string
          product_id: string
          promo_price: number | null
          sale_price: number | null
          sku: string | null
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          barcode?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          is_active?: boolean
          is_default?: boolean
          min_stock?: number | null
          name: string
          product_id: string
          promo_price?: number | null
          sale_price?: number | null
          sku?: string | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          barcode?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          is_active?: boolean
          is_default?: boolean
          min_stock?: number | null
          name?: string
          product_id?: string
          promo_price?: number | null
          sale_price?: number | null
          sku?: string | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_fkey"
            columns: ["tenant_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      products: {
        Row: {
          archived_at: string | null
          brand_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          has_variants: boolean
          id: string
          image_path: string | null
          is_active: boolean
          min_stock: number
          name: string
          promo_price: number | null
          sale_price: number
          supplier_id: string | null
          tenant_id: string
          track_lots: boolean
          unit: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          has_variants?: boolean
          id?: string
          image_path?: string | null
          is_active?: boolean
          min_stock?: number
          name: string
          promo_price?: number | null
          sale_price: number
          supplier_id?: string | null
          tenant_id: string
          track_lots?: boolean
          unit?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          has_variants?: boolean
          id?: string
          image_path?: string | null
          is_active?: boolean
          min_stock?: number
          name?: string
          promo_price?: number | null
          sale_price?: number
          supplier_id?: string | null
          tenant_id?: string
          track_lots?: boolean
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_fkey"
            columns: ["tenant_id", "brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "products_category_fkey"
            columns: ["tenant_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_fkey"
            columns: ["tenant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reservation_items: {
        Row: {
          created_at: string
          id: string
          quantity: number
          reservation_id: string
          tenant_id: string
          unit_price: number
          variant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          quantity: number
          reservation_id: string
          tenant_id: string
          unit_price: number
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          quantity?: number
          reservation_id?: string
          tenant_id?: string
          unit_price?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_items_reservation_fkey"
            columns: ["tenant_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "reservation_items_variant_fkey"
            columns: ["tenant_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      reservations: {
        Row: {
          canceled_reason: string | null
          completed_sale_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          expires_at: string | null
          id: string
          idempotency_key: string | null
          notes: string | null
          origin: string | null
          responsible_user_id: string | null
          status: Database["public"]["Enums"]["reservation_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          canceled_reason?: string | null
          completed_sale_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          origin?: string | null
          responsible_user_id?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          canceled_reason?: string | null
          completed_sale_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          origin?: string | null
          responsible_user_id?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_customer_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "reservations_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_sale_fkey"
            columns: ["tenant_id", "completed_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_code: string
          role_code: string
        }
        Insert: {
          permission_code: string
          role_code: string
        }
        Update: {
          permission_code?: string
          role_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "role_permissions_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          description: string
          name: string
          rank: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string
          name: string
          rank: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          name?: string
          rank?: number
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          created_at: string
          id: string
          line_total: number | null
          quantity: number
          sale_id: string
          tenant_id: string
          unit_cost: number | null
          unit_price: number
          variant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: never
          quantity: number
          sale_id: string
          tenant_id: string
          unit_cost?: number | null
          unit_price: number
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: never
          quantity?: number
          sale_id?: string
          tenant_id?: string
          unit_cost?: number | null
          unit_price?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_fkey"
            columns: ["tenant_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "sale_items_variant_fkey"
            columns: ["tenant_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      sales: {
        Row: {
          canceled_at: string | null
          canceled_reason: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          discount_amount: number
          id: string
          idempotency_key: string | null
          notes: string | null
          origin: Database["public"]["Enums"]["sale_origin"]
          paid_amount: number | null
          payment_method: string | null
          reservation_id: string | null
          responsible_user_id: string | null
          subtotal: number
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          canceled_at?: string | null
          canceled_reason?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount_amount?: number
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          origin?: Database["public"]["Enums"]["sale_origin"]
          paid_amount?: number | null
          payment_method?: string | null
          reservation_id?: string | null
          responsible_user_id?: string | null
          subtotal: number
          tenant_id: string
          total: number
          updated_at?: string
        }
        Update: {
          canceled_at?: string | null
          canceled_reason?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount_amount?: number
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          origin?: Database["public"]["Enums"]["sale_origin"]
          paid_amount?: number | null
          payment_method?: string | null
          reservation_id?: string | null
          responsible_user_id?: string | null
          subtotal?: number
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "sales_reservation_fkey"
            columns: ["tenant_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "sales_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_levels: {
        Row: {
          available_quantity: number | null
          physical_quantity: number
          product_id: string
          reserved_quantity: number
          tenant_id: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          available_quantity?: never
          physical_quantity?: number
          product_id: string
          reserved_quantity?: number
          tenant_id: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          available_quantity?: never
          physical_quantity?: number
          product_id?: string
          reserved_quantity?: number
          tenant_id?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_levels_variant_fkey"
            columns: ["tenant_id", "product_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["tenant_id", "product_id", "id"]
          },
        ]
      }
      stock_lots: {
        Row: {
          created_at: string
          created_by: string | null
          expires_on: string | null
          id: string
          lot_code: string
          manufactured_on: string | null
          notes: string | null
          product_id: string
          quantity: number
          received_quantity: number
          supplier_id: string | null
          tenant_id: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_on?: string | null
          id?: string
          lot_code: string
          manufactured_on?: string | null
          notes?: string | null
          product_id: string
          quantity?: number
          received_quantity?: number
          supplier_id?: string | null
          tenant_id: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_on?: string | null
          id?: string
          lot_code?: string
          manufactured_on?: string | null
          notes?: string | null
          product_id?: string
          quantity?: number
          received_quantity?: number
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_lots_supplier_fkey"
            columns: ["tenant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "stock_lots_variant_fkey"
            columns: ["tenant_id", "product_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["tenant_id", "product_id", "id"]
          },
        ]
      }
      stock_movement_lots: {
        Row: {
          lot_id: string
          lot_quantity_after: number
          movement_id: string
          quantity_delta: number
          tenant_id: string
        }
        Insert: {
          lot_id: string
          lot_quantity_after: number
          movement_id: string
          quantity_delta: number
          tenant_id: string
        }
        Update: {
          lot_id?: string
          lot_quantity_after?: number
          movement_id?: string
          quantity_delta?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movement_lots_lot_fkey"
            columns: ["tenant_id", "lot_id"]
            isOneToOne: false
            referencedRelation: "stock_lots"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "stock_movement_lots_movement_fkey"
            columns: ["tenant_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          actor_type: Database["public"]["Enums"]["audit_actor_type"]
          actor_user_id: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          origin: Database["public"]["Enums"]["stock_movement_origin"]
          physical_after: number
          physical_delta: number
          product_id: string
          quantity: number
          reason: string | null
          reference_id: string | null
          reference_type: string | null
          request_id: string | null
          reserved_after: number
          reserved_delta: number
          tenant_id: string
          type: Database["public"]["Enums"]["stock_movement_type"]
          unit_cost: number | null
          variant_id: string
        }
        Insert: {
          actor_type?: Database["public"]["Enums"]["audit_actor_type"]
          actor_user_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          origin: Database["public"]["Enums"]["stock_movement_origin"]
          physical_after: number
          physical_delta: number
          product_id: string
          quantity: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          request_id?: string | null
          reserved_after: number
          reserved_delta: number
          tenant_id: string
          type: Database["public"]["Enums"]["stock_movement_type"]
          unit_cost?: number | null
          variant_id: string
        }
        Update: {
          actor_type?: Database["public"]["Enums"]["audit_actor_type"]
          actor_user_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          origin?: Database["public"]["Enums"]["stock_movement_origin"]
          physical_after?: number
          physical_delta?: number
          product_id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          request_id?: string | null
          reserved_after?: number
          reserved_delta?: number
          tenant_id?: string
          type?: Database["public"]["Enums"]["stock_movement_type"]
          unit_cost?: number | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_fkey"
            columns: ["tenant_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "stock_movements_variant_fkey"
            columns: ["tenant_id", "product_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["tenant_id", "product_id", "id"]
          },
        ]
      }
      suppliers: {
        Row: {
          contact_name: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          is_active: boolean
          legal_name: string | null
          name: string
          notes: string | null
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_ai_settings: {
        Row: {
          created_at: string
          enabled: boolean
          max_tokens_per_reply: number
          model: string
          monthly_budget_cents: number | null
          system_prompt: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          max_tokens_per_reply?: number
          model?: string
          monthly_budget_cents?: number | null
          system_prompt?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          max_tokens_per_reply?: number
          model?: string
          monthly_budget_cents?: number | null
          system_prompt?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_ai_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_ai_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_module_flags: {
        Row: {
          enabled: boolean
          module_code: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          module_code: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          module_code?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_module_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_module_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_user_permission_overrides: {
        Row: {
          granted: boolean
          permission_code: string
          tenant_id: string
          tenant_user_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          granted: boolean
          permission_code: string
          tenant_id: string
          tenant_user_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          granted?: boolean
          permission_code?: string
          tenant_id?: string
          tenant_user_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_user_permission_overrides_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "tenant_user_permission_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_user_permission_overrides_tenant_user_id_fkey"
            columns: ["tenant_user_id"]
            isOneToOne: false
            referencedRelation: "tenant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_user_permission_overrides_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_users: {
        Row: {
          created_at: string
          id: string
          invited_at: string | null
          invited_by: string | null
          joined_at: string | null
          role_code: string
          status: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          role_code: string
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          role_code?: string
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_users_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_users_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "tenant_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          business_type: Database["public"]["Enums"]["tenant_business_type"]
          created_at: string
          created_by: string | null
          currency: string
          document: string | null
          email: string | null
          id: string
          legal_name: string | null
          name: string
          onboarding_completed_at: string | null
          phone: string | null
          segment: string
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          business_type?: Database["public"]["Enums"]["tenant_business_type"]
          created_at?: string
          created_by?: string | null
          currency?: string
          document?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          name: string
          onboarding_completed_at?: string | null
          phone?: string | null
          segment?: string
          settings?: Json
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          business_type?: Database["public"]["Enums"]["tenant_business_type"]
          created_at?: string
          created_by?: string | null
          currency?: string
          document?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          onboarding_completed_at?: string | null
          phone?: string | null
          segment?: string
          settings?: Json
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_events: {
        Row: {
          actor_type: Database["public"]["Enums"]["audit_actor_type"]
          actor_user_id: string | null
          customer_id: string
          id: string
          occurred_at: string
          payload: Json
          tenant_id: string
          type: string
        }
        Insert: {
          actor_type?: Database["public"]["Enums"]["audit_actor_type"]
          actor_user_id?: string | null
          customer_id: string
          id?: string
          occurred_at?: string
          payload?: Json
          tenant_id: string
          type: string
        }
        Update: {
          actor_type?: Database["public"]["Enums"]["audit_actor_type"]
          actor_user_id?: string | null
          customer_id?: string
          id?: string
          occurred_at?: string
          payload?: Json
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_customer_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "timeline_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_accounts: {
        Row: {
          connected_at: string | null
          created_at: string
          error_message: string | null
          id: string
          last_activity_at: string | null
          phone_number: string | null
          qr_code: string | null
          status: Database["public"]["Enums"]["whatsapp_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          last_activity_at?: string | null
          phone_number?: string | null
          qr_code?: string | null
          status?: Database["public"]["Enums"]["whatsapp_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          last_activity_at?: string | null
          phone_number?: string | null
          qr_code?: string | null
          status?: Database["public"]["Enums"]["whatsapp_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      customer_stats: {
        Row: {
          average_ticket: number | null
          customer_id: string | null
          last_purchase_at: string | null
          purchase_count: number | null
          tenant_id: string | null
          total_spent: number | null
        }
        Relationships: []
      }
      effective_variant_allergens: {
        Row: {
          allergen_code: string | null
          allergen_name: string | null
          defined_at: string | null
          may_contain_traces: boolean | null
          notes: string | null
          presence: Database["public"]["Enums"]["tri_state"] | null
          product_id: string | null
          sort_order: number | null
          source: Database["public"]["Enums"]["info_source"] | null
          tenant_id: string | null
          variant_id: string | null
        }
        Relationships: []
      }
      effective_variant_attributes: {
        Row: {
          attribute_code: string | null
          attribute_id: string | null
          attribute_name: string | null
          data_type: Database["public"]["Enums"]["attribute_data_type"] | null
          defined_at: string | null
          group_name: string | null
          is_compatibility_enabled: boolean | null
          is_filterable: boolean | null
          is_searchable: boolean | null
          option_code: string | null
          option_id: string | null
          option_label: string | null
          product_id: string | null
          sort_order: number | null
          source: Database["public"]["Enums"]["info_source"] | null
          tenant_id: string | null
          unit: string | null
          value_boolean: boolean | null
          value_number: number | null
          value_text: string | null
          variant_id: string | null
        }
        Relationships: []
      }
      effective_variant_nutrition: {
        Row: {
          defined_at: string | null
          nutrient_values: Json | null
          nutrition_id: string | null
          product_id: string | null
          serving_description: string | null
          serving_size: number | null
          serving_unit: string | null
          servings_per_container: number | null
          source: Database["public"]["Enums"]["info_source"] | null
          source_notes: string | null
          tenant_id: string | null
          variant_id: string | null
        }
        Relationships: []
      }
      inventory_lot_overview: {
        Row: {
          created_at: string | null
          days_to_expiry: number | null
          expires_on: string | null
          expiry_status: string | null
          has_variants: boolean | null
          lot_code: string | null
          lot_id: string | null
          manufactured_on: string | null
          product_id: string | null
          product_name: string | null
          quantity: number | null
          received_quantity: number | null
          sku: string | null
          supplier_name: string | null
          tenant_id: string | null
          variant_id: string | null
          variant_name: string | null
        }
        Relationships: []
      }
      inventory_variant_overview: {
        Row: {
          available_quantity: number | null
          barcode: string | null
          brand_name: string | null
          category_id: string | null
          category_name: string | null
          expired_quantity: number | null
          expiring_quantity: number | null
          has_variants: boolean | null
          image_path: string | null
          is_active: boolean | null
          min_stock: number | null
          next_expiration: string | null
          physical_quantity: number | null
          product_id: string | null
          product_name: string | null
          reserved_quantity: number | null
          search_text: string | null
          sku: string | null
          stock_status: string | null
          stock_updated_at: string | null
          tenant_id: string | null
          track_lots: boolean | null
          unit: string | null
          variant_id: string | null
          variant_name: string | null
        }
        Relationships: []
      }
      product_variant_details: {
        Row: {
          available_quantity: number | null
          barcode: string | null
          created_at: string | null
          current_price: number | null
          effective_min_stock: number | null
          effective_promo_price: number | null
          effective_sale_price: number | null
          image_path: string | null
          is_active: boolean | null
          is_default: boolean | null
          name: string | null
          own_min_stock: number | null
          own_promo_price: number | null
          own_sale_price: number | null
          physical_quantity: number | null
          product_id: string | null
          reserved_quantity: number | null
          sku: string | null
          sort_order: number | null
          stock_status: string | null
          tenant_id: string | null
          updated_at: string | null
          variant_id: string | null
          variant_is_active: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_tenant_invitation: {
        Args: {
          p_tenant_id: string
        }
        Returns: undefined
      }
      admin_create_tenant: {
        Args: {
          p_name: string
          p_segment: string
          p_owner_email: string
          p_business_type?: Database["public"]["Enums"]["tenant_business_type"]
        }
        Returns: string
      }
      admin_invite_tenant_user: {
        Args: {
          p_tenant_id: string
          p_email: string
          p_role_code: string
          p_active?: boolean
        }
        Returns: string
      }
      admin_list_module_flags: {
        Args: {
          p_tenant_id: string
        }
        Returns: Database["public"]["Tables"]["tenant_module_flags"]["Row"][]
      }
      admin_list_tenant_user_permissions: {
        Args: {
          p_membership_id: string
        }
        Returns: {
            permission_code: string
            granted: boolean
            is_override: boolean
            role_default: boolean
          }[]
      }
      admin_list_tenants: {
        Args: {
          p_search?: string
          p_status?: Database["public"]["Enums"]["tenant_status"]
          p_limit?: number
          p_offset?: number
        }
        Returns: {
            id: string
            name: string
            slug: string
            status: Database["public"]["Enums"]["tenant_status"]
            segment: string
            created_at: string
            owner_name: string
            owner_email: string
            active_users: number
            last_activity_at: string
            total_count: number
          }[]
      }
      admin_log_password_reset: {
        Args: {
          p_target_user_id: string
          p_tenant_id?: string
        }
        Returns: undefined
      }
      admin_platform_overview: {
        Args: never
        Returns: Json
      }
      admin_remove_tenant_user: {
        Args: {
          p_membership_id: string
        }
        Returns: undefined
      }
      admin_set_module_flag: {
        Args: {
          p_tenant_id: string
          p_module_code: string
          p_enabled: boolean
        }
        Returns: undefined
      }
      admin_set_tenant_status: {
        Args: {
          p_tenant_id: string
          p_status: Database["public"]["Enums"]["tenant_status"]
          p_reason: string
        }
        Returns: undefined
      }
      admin_set_tenant_user_permissions: {
        Args: {
          p_membership_id: string
          p_overrides: Json
        }
        Returns: undefined
      }
      agenda_appointment_advance: {
        Args: {
          p_appointment_id: string
          p_status: Database["public"]["Enums"]["appointment_status"]
        }
        Returns: undefined
      }
      agenda_appointment_cancel: {
        Args: {
          p_appointment_id: string
          p_reason?: string
        }
        Returns: undefined
      }
      agenda_appointment_create: {
        Args: {
          p_tenant_id: string
          p_customer_id: string
          p_service_id: string
          p_professional_user_id: string
          p_starts_at: string
          p_notes?: string
          p_origin?: string
          p_idempotency_key?: string
        }
        Returns: string
      }
      agenda_service_create: {
        Args: {
          p_tenant_id: string
          p_name: string
          p_duration_minutes: number
          p_price: number
          p_description?: string
        }
        Returns: string
      }
      agenda_service_set_professionals: {
        Args: {
          p_service_id: string
          p_professional_user_ids: string[]
        }
        Returns: undefined
      }
      agenda_service_update: {
        Args: {
          p_service_id: string
          p_name: string
          p_duration_minutes: number
          p_price: number
          p_description?: string
          p_is_active?: boolean
        }
        Returns: undefined
      }
      ai_agenda_book: {
        Args: {
          p_conversation_id: string
          p_service_id: string
          p_professional_user_id: string
          p_starts_at: string
          p_notes?: string
        }
        Returns: string
      }
      ai_escalate_conversation: {
        Args: {
          p_conversation_id: string
          p_reason?: string
        }
        Returns: undefined
      }
      ai_log_usage: {
        Args: {
          p_tenant_id: string
          p_conversation_id: string
          p_model: string
          p_input_tokens: number
          p_output_tokens: number
          p_cost_usd: number
          p_message_id?: string
        }
        Returns: string
      }
      ai_message_send: {
        Args: {
          p_conversation_id: string
          p_content: string
        }
        Returns: string
      }
      ai_reservation_create: {
        Args: {
          p_conversation_id: string
          p_items: Json
          p_expires_at?: string
          p_notes?: string
          p_idempotency_key?: string
        }
        Returns: string
      }
      ai_settings_get: {
        Args: {
          p_tenant_id: string
        }
        Returns: Database["public"]["Tables"]["tenant_ai_settings"]["Row"][]
      }
      ai_settings_update: {
        Args: {
          p_tenant_id: string
          p_enabled: boolean
          p_system_prompt?: string
          p_model?: string
          p_max_tokens_per_reply?: number
          p_monthly_budget_cents?: number
        }
        Returns: Database["public"]["Tables"]["tenant_ai_settings"]["Row"][]
      }
      ai_upsert_conversation_state: {
        Args: {
          p_conversation_id: string
          p_turn_count: number
          p_last_tool_used?: string
          p_draft_items?: Json
        }
        Returns: undefined
      }
      ai_usage_month_to_date: {
        Args: {
          p_tenant_id: string
        }
        Returns: number
      }
      catalog_archive_product: {
        Args: {
          p_product_id: string
        }
        Returns: undefined
      }
      catalog_archive_variant: {
        Args: {
          p_variant_id: string
        }
        Returns: undefined
      }
      catalog_check_compatibility: {
        Args: {
          p_tenant_id: string
          p_variant_ids: string[]
          p_requirements: Json
        }
        Returns: {
            variant_id: string
            status: string
            results: Json
          }[]
      }
      catalog_create_product: {
        Args: {
          p_tenant_id: string
          p_name: string
          p_sale_price: number
          p_description?: string
          p_category_id?: string
          p_brand_id?: string
          p_supplier_id?: string
          p_unit?: string
          p_promo_price?: number
          p_min_stock?: number
          p_is_active?: boolean
          p_track_lots?: boolean
          p_sku?: string
          p_barcode?: string
          p_cost_price?: number
        }
        Returns: string
      }
      catalog_lookup_variants: {
        Args: {
          p_tenant_id: string
          p_query?: string
          p_limit?: number
        }
        Returns: {
            variant_id: string
            product_id: string
            product_name: string
            variant_name: string
            has_variants: boolean
            sku: string
            barcode: string
            unit: string
            track_lots: boolean
            physical_quantity: number
            available_quantity: number
            image_path: string
          }[]
      }
      catalog_search_products: {
        Args: {
          p_tenant_id: string
          p_query?: string
          p_category_id?: string
          p_brand_id?: string
          p_status?: string
          p_stock_status?: string
          p_sort?: string
          p_limit?: number
          p_offset?: number
        }
        Returns: {
            id: string
            name: string
            image_path: string
            category_id: string
            category_name: string
            brand_id: string
            brand_name: string
            unit: string
            is_active: boolean
            has_variants: boolean
            track_lots: boolean
            variant_count: number
            sku: string
            barcode: string
            min_price: number
            max_price: number
            sale_price: number
            promo_price: number
            physical_quantity: number
            reserved_quantity: number
            available_quantity: number
            stock_status: string
            updated_at: string
            total_count: number
          }[]
      }
      catalog_search_variants: {
        Args: {
          p_tenant_id: string
          p_query?: string
          p_category_id?: string
          p_brand_id?: string
          p_price_min?: number
          p_price_max?: number
          p_in_stock_only?: boolean
          p_requirements?: Json
          p_exclude_incompatible?: boolean
          p_sort?: string
          p_limit?: number
          p_offset?: number
        }
        Returns: {
            variant_id: string
            product_id: string
            product_name: string
            variant_name: string
            has_variants: boolean
            sku: string
            image_path: string
            category_name: string
            brand_name: string
            unit: string
            current_price: number
            available_quantity: number
            stock_status: string
            compatibility_status: string
            compatibility_results: Json
            matched_preferences: number
            total_requirements: number
            total_count: number
          }[]
      }
      catalog_set_allergens: {
        Args: {
          p_product_id: string
          p_allergens: Json
          p_variant_id?: string
        }
        Returns: undefined
      }
      catalog_set_attribute_values: {
        Args: {
          p_product_id: string
          p_values: Json
          p_variant_id?: string
        }
        Returns: undefined
      }
      catalog_set_nutrition: {
        Args: {
          p_product_id: string
          p_nutrition: Json
          p_variant_id?: string
        }
        Returns: undefined
      }
      catalog_set_product_active: {
        Args: {
          p_product_id: string
          p_active: boolean
        }
        Returns: undefined
      }
      catalog_set_product_image: {
        Args: {
          p_product_id: string
          p_image_path?: string
        }
        Returns: undefined
      }
      catalog_update_product: {
        Args: {
          p_product_id: string
          p_name: string
          p_sale_price: number
          p_description?: string
          p_category_id?: string
          p_brand_id?: string
          p_supplier_id?: string
          p_unit?: string
          p_promo_price?: number
          p_min_stock?: number
          p_is_active?: boolean
          p_track_lots?: boolean
          p_sku?: string
          p_barcode?: string
          p_cost_price?: number
          p_update_cost?: boolean
        }
        Returns: undefined
      }
      catalog_upsert_variant: {
        Args: {
          p_product_id: string
          p_name: string
          p_variant_id?: string
          p_sku?: string
          p_barcode?: string
          p_sale_price?: number
          p_promo_price?: number
          p_min_stock?: number
          p_is_active?: boolean
          p_cost_price?: number
          p_update_cost?: boolean
        }
        Returns: string
      }
      conversation_assume: {
        Args: {
          p_conversation_id: string
        }
        Returns: undefined
      }
      conversation_mark_read: {
        Args: {
          p_conversation_id: string
        }
        Returns: undefined
      }
      conversation_pause: {
        Args: {
          p_conversation_id: string
        }
        Returns: undefined
      }
      conversation_return_to_ai: {
        Args: {
          p_conversation_id: string
        }
        Returns: undefined
      }
      create_tenant: {
        Args: {
          p_name: string
          p_segment?: string
          p_business_type?: Database["public"]["Enums"]["tenant_business_type"]
        }
        Returns: string
      }
      crm_create_opportunity: {
        Args: {
          p_tenant_id: string
          p_customer_id: string
          p_stage_id?: string
          p_title?: string
          p_estimated_value?: number
          p_responsible_user_id?: string
          p_origin?: string
          p_notes?: string
          p_expected_at?: string
          p_variant_ids?: string[]
        }
        Returns: string
      }
      crm_move_opportunity: {
        Args: {
          p_opportunity_id: string
          p_stage_id: string
          p_lost_reason?: string
        }
        Returns: undefined
      }
      crm_set_opportunity_products: {
        Args: {
          p_opportunity_id: string
          p_variant_ids: string[]
        }
        Returns: undefined
      }
      crm_update_opportunity: {
        Args: {
          p_opportunity_id: string
          p_title?: string
          p_estimated_value?: number
          p_responsible_user_id?: string
          p_origin?: string
          p_notes?: string
          p_expected_at?: string
        }
        Returns: undefined
      }
      decline_tenant_invitation: {
        Args: {
          p_tenant_id: string
        }
        Returns: undefined
      }
      financial_summary: {
        Args: {
          p_tenant_id: string
          p_since?: string
        }
        Returns: {
            revenue: number
            received: number
            pending: number
            sales_count: number
            by_method: Json
          }[]
      }
      get_my_permissions: {
        Args: {
          p_tenant_id: string
        }
        Returns: string[]
      }
      inventory_adjust_stock: {
        Args: {
          p_variant_id: string
          p_counted_quantity: number
          p_reason: string
          p_idempotency_key: string
          p_lot_id?: string
          p_lot_code?: string
          p_expires_on?: string
        }
        Returns: string
      }
      inventory_register_entry: {
        Args: {
          p_variant_id: string
          p_quantity: number
          p_idempotency_key: string
          p_reason?: string
          p_unit_cost?: number
          p_lot_id?: string
          p_lot_code?: string
          p_manufactured_on?: string
          p_expires_on?: string
          p_supplier_id?: string
        }
        Returns: string
      }
      inventory_register_loss: {
        Args: {
          p_variant_id: string
          p_quantity: number
          p_reason: string
          p_idempotency_key: string
          p_lot_id?: string
        }
        Returns: string
      }
      inventory_summary: {
        Args: {
          p_tenant_id: string
        }
        Returns: Json
      }
      invite_tenant_user: {
        Args: {
          p_tenant_id: string
          p_email: string
          p_role_code: string
          p_active?: boolean
        }
        Returns: string
      }
      list_assignable_roles: {
        Args: {
          p_tenant_id: string
        }
        Returns: Database["public"]["Tables"]["roles"]["Row"][]
      }
      list_my_invitations: {
        Args: never
        Returns: {
            membership_id: string
            tenant_id: string
            tenant_name: string
            role_code: string
            role_name: string
            invited_by_name: string
            invited_at: string
          }[]
      }
      list_tenant_user_permissions: {
        Args: {
          p_membership_id: string
        }
        Returns: {
            permission_code: string
            granted: boolean
            is_override: boolean
            role_default: boolean
          }[]
      }
      message_mark_failed: {
        Args: {
          p_message_id: string
          p_reason?: string
        }
        Returns: undefined
      }
      message_mark_sent: {
        Args: {
          p_message_id: string
          p_external_message_id?: string
        }
        Returns: undefined
      }
      message_send: {
        Args: {
          p_conversation_id: string
          p_content?: string
          p_media_path?: string
          p_media_type?: string
        }
        Returns: string
      }
      payment_attach_provider_info: {
        Args: {
          p_payment_id: string
          p_provider_charge_id: string
          p_metadata?: Json
        }
        Returns: undefined
      }
      payment_cancel: {
        Args: {
          p_payment_id: string
        }
        Returns: undefined
      }
      payment_confirm: {
        Args: {
          p_payment_id: string
          p_provider_charge_id?: string
        }
        Returns: string
      }
      payment_create_charge: {
        Args: {
          p_tenant_id: string
          p_reservation_id: string
          p_method: string
          p_provider?: string
          p_provider_charge_id?: string
          p_metadata?: Json
        }
        Returns: string
      }
      payment_fail: {
        Args: {
          p_payment_id: string
          p_reason?: string
        }
        Returns: undefined
      }
      remove_tenant_user: {
        Args: {
          p_membership_id: string
        }
        Returns: undefined
      }
      report_agenda_summary: {
        Args: {
          p_tenant_id: string
          p_since?: string
        }
        Returns: {
            appointments_count: number
            completed_count: number
            no_show_count: number
            canceled_count: number
            revenue: number
          }[]
      }
      report_crm_funnel: {
        Args: {
          p_tenant_id: string
          p_since?: string
        }
        Returns: {
            stage_id: string
            stage_name: string
            stage_color: string
            sort_order: number
            opportunity_count: number
            won_count: number
            lost_count: number
          }[]
      }
      report_sales_by_day: {
        Args: {
          p_tenant_id: string
          p_since?: string
          p_until?: string
        }
        Returns: {
            day: string
            sales_count: number
            revenue: number
          }[]
      }
      report_top_customers: {
        Args: {
          p_tenant_id: string
          p_since?: string
          p_limit?: number
        }
        Returns: {
            customer_id: string
            customer_name: string
            purchase_count: number
            total_spent: number
          }[]
      }
      report_top_products: {
        Args: {
          p_tenant_id: string
          p_since?: string
          p_limit?: number
        }
        Returns: {
            variant_id: string
            product_name: string
            variant_name: string
            quantity_sold: number
            revenue: number
          }[]
      }
      reservation_advance: {
        Args: {
          p_reservation_id: string
          p_status: Database["public"]["Enums"]["reservation_status"]
        }
        Returns: undefined
      }
      reservation_cancel: {
        Args: {
          p_reservation_id: string
          p_reason?: string
        }
        Returns: undefined
      }
      reservation_complete: {
        Args: {
          p_reservation_id: string
          p_payment_method?: string
          p_paid_amount?: number
          p_discount_amount?: number
          p_opportunity_id?: string
        }
        Returns: string
      }
      reservation_create: {
        Args: {
          p_tenant_id: string
          p_customer_id: string
          p_items: Json
          p_expires_at?: string
          p_origin?: string
          p_notes?: string
          p_idempotency_key?: string
        }
        Returns: string
      }
      reservations_expire_due: {
        Args: {
          p_tenant_id: string
        }
        Returns: number
      }
      reservations_expire_due_sweep: {
        Args: never
        Returns: number
      }
      sale_cancel: {
        Args: {
          p_sale_id: string
          p_reason?: string
        }
        Returns: undefined
      }
      sale_create: {
        Args: {
          p_tenant_id: string
          p_items: Json
          p_customer_id?: string
          p_origin?: Database["public"]["Enums"]["sale_origin"]
          p_discount_amount?: number
          p_payment_method?: string
          p_paid_amount?: number
          p_notes?: string
          p_opportunity_id?: string
          p_idempotency_key?: string
        }
        Returns: string
      }
      sales_receivables: {
        Args: {
          p_tenant_id: string
        }
        Returns: {
            sale_id: string
            customer_id: string
            customer_name: string
            total: number
            paid_amount: number
            balance: number
            created_at: string
          }[]
      }
      set_tenant_user_permissions: {
        Args: {
          p_membership_id: string
          p_overrides: Json
        }
        Returns: undefined
      }
      set_tenant_user_status: {
        Args: {
          p_membership_id: string
          p_active: boolean
        }
        Returns: undefined
      }
      update_tenant_user_role: {
        Args: {
          p_membership_id: string
          p_role_code: string
        }
        Returns: undefined
      }
      whatsapp_receive_message: {
        Args: {
          p_tenant_id: string
          p_whatsapp_number: string
          p_content?: string
          p_external_message_id?: string
          p_sender_name?: string
          p_media_path?: string
          p_media_type?: string
        }
        Returns: string
      }
    }
    Enums: {
      appointment_status: "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELED" | "NO_SHOW"
      attribute_data_type: "BOOLEAN" | "NUMBER" | "TEXT" | "ENUM"
      audit_actor_type: "USER" | "SYSTEM" | "AI" | "INTEGRATION" | "PLATFORM_ADMIN"
      conversation_status: "AI_ACTIVE" | "HUMAN_ACTIVE" | "PAUSED"
      info_source: "LABEL" | "MANUFACTURER" | "TECHNICAL_SHEET" | "MANUAL"
      membership_status: "INVITED" | "ACTIVE" | "DISABLED"
      message_direction: "INBOUND" | "OUTBOUND"
      message_sender_type: "CUSTOMER" | "USER" | "AI" | "SYSTEM"
      message_status: "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED"
      payment_status: "PENDING" | "CONFIRMED" | "FAILED" | "CANCELED"
      reservation_status: "PENDING" | "CONFIRMED" | "AWAITING_PICKUP" | "COMPLETED" | "EXPIRED" | "CANCELED"
      sale_origin: "WHATSAPP" | "BALCAO" | "MANUAL" | "OTHER"
      stock_movement_origin: "MANUAL" | "RESERVATION" | "ORDER" | "SALE" | "IMPORT" | "SYSTEM"
      stock_movement_type: "ENTRY" | "SALE" | "RESERVATION" | "RESERVATION_RELEASE" | "ADJUSTMENT" | "LOSS" | "RETURN"
      tenant_business_type: "RETAIL" | "SERVICES"
      tenant_status: "ACTIVE" | "SUSPENDED" | "CANCELED"
      tri_state: "TRUE" | "FALSE" | "UNKNOWN"
      whatsapp_status: "DISCONNECTED" | "WAITING_QR" | "CONNECTED" | "ERROR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"]
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]
export type Functions<T extends keyof PublicSchema["Functions"]> = PublicSchema["Functions"][T]

export const Constants = {
  public: {
    Enums: {
      appointment_status: ["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELED", "NO_SHOW"],
      attribute_data_type: ["BOOLEAN", "NUMBER", "TEXT", "ENUM"],
      audit_actor_type: ["USER", "SYSTEM", "AI", "INTEGRATION", "PLATFORM_ADMIN"],
      conversation_status: ["AI_ACTIVE", "HUMAN_ACTIVE", "PAUSED"],
      info_source: ["LABEL", "MANUFACTURER", "TECHNICAL_SHEET", "MANUAL"],
      membership_status: ["INVITED", "ACTIVE", "DISABLED"],
      message_direction: ["INBOUND", "OUTBOUND"],
      message_sender_type: ["CUSTOMER", "USER", "AI", "SYSTEM"],
      message_status: ["QUEUED", "SENT", "DELIVERED", "READ", "FAILED"],
      payment_status: ["PENDING", "CONFIRMED", "FAILED", "CANCELED"],
      reservation_status: ["PENDING", "CONFIRMED", "AWAITING_PICKUP", "COMPLETED", "EXPIRED", "CANCELED"],
      sale_origin: ["WHATSAPP", "BALCAO", "MANUAL", "OTHER"],
      stock_movement_origin: ["MANUAL", "RESERVATION", "ORDER", "SALE", "IMPORT", "SYSTEM"],
      stock_movement_type: ["ENTRY", "SALE", "RESERVATION", "RESERVATION_RELEASE", "ADJUSTMENT", "LOSS", "RETURN"],
      tenant_business_type: ["RETAIL", "SERVICES"],
      tenant_status: ["ACTIVE", "SUSPENDED", "CANCELED"],
      tri_state: ["TRUE", "FALSE", "UNKNOWN"],
      whatsapp_status: ["DISCONNECTED", "WAITING_QR", "CONNECTED", "ERROR"],
    },
  },
} as const
