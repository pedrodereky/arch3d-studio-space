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
      api_costs: {
        Row: {
          cost_usd: number
          created_at: string
          generation_id: string | null
          id: string
          operation: string
          provider: string
          user_id: string | null
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          generation_id?: string | null
          id?: string
          operation: string
          provider: string
          user_id?: string | null
        }
        Update: {
          cost_usd?: number
          created_at?: string
          generation_id?: string | null
          id?: string
          operation?: string
          provider?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_costs_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_assets: {
        Row: {
          created_at: string
          generation_id: string
          id: string
          metadata: Json
          signed_url: string | null
          storage_path: string
          type: Database["public"]["Enums"]["asset_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          generation_id: string
          id?: string
          metadata?: Json
          signed_url?: string | null
          storage_path: string
          type: Database["public"]["Enums"]["asset_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          generation_id?: string
          id?: string
          metadata?: Json
          signed_url?: string | null
          storage_path?: string
          type?: Database["public"]["Enums"]["asset_type"]
          user_id?: string
        }
        Relationships: []
      }
      generation_logs: {
        Row: {
          created_at: string
          details: Json
          duration_ms: number | null
          event: string
          generation_id: string
          id: string
          memory_mb: number | null
          message: string | null
          payload_kb: number | null
          step: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          duration_ms?: number | null
          event: string
          generation_id: string
          id?: string
          memory_mb?: number | null
          message?: string | null
          payload_kb?: number | null
          step: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          duration_ms?: number | null
          event?: string
          generation_id?: string
          id?: string
          memory_mb?: number | null
          message?: string | null
          payload_kb?: number | null
          step?: string
          user_id?: string
        }
        Relationships: []
      }
      generations: {
        Row: {
          completed_at: string | null
          context_image_url: string | null
          cost_usd: number | null
          created_at: string
          edit_instruction: string | null
          engine: string
          error_message: string | null
          fbx_url: string | null
          final_render_url: string | null
          glb_url: string | null
          id: string
          intermediate_images: Json | null
          is_public: boolean
          metadata: Json
          obj_url: string | null
          pipeline_type: Database["public"]["Enums"]["pipeline_type"]
          poly_count: number | null
          progress_percent: number
          progress_stage: string | null
          prompt: string | null
          replicate_prediction_id: string | null
          source_images: Json
          status: Database["public"]["Enums"]["generation_status"]
          thumbnail_url: string | null
          user_id: string
          video_url: string | null
        }
        Insert: {
          completed_at?: string | null
          context_image_url?: string | null
          cost_usd?: number | null
          created_at?: string
          edit_instruction?: string | null
          engine?: string
          error_message?: string | null
          fbx_url?: string | null
          final_render_url?: string | null
          glb_url?: string | null
          id?: string
          intermediate_images?: Json | null
          is_public?: boolean
          metadata?: Json
          obj_url?: string | null
          pipeline_type: Database["public"]["Enums"]["pipeline_type"]
          poly_count?: number | null
          progress_percent?: number
          progress_stage?: string | null
          prompt?: string | null
          replicate_prediction_id?: string | null
          source_images?: Json
          status?: Database["public"]["Enums"]["generation_status"]
          thumbnail_url?: string | null
          user_id: string
          video_url?: string | null
        }
        Update: {
          completed_at?: string | null
          context_image_url?: string | null
          cost_usd?: number | null
          created_at?: string
          edit_instruction?: string | null
          engine?: string
          error_message?: string | null
          fbx_url?: string | null
          final_render_url?: string | null
          glb_url?: string | null
          id?: string
          intermediate_images?: Json | null
          is_public?: boolean
          metadata?: Json
          obj_url?: string | null
          pipeline_type?: Database["public"]["Enums"]["pipeline_type"]
          poly_count?: number | null
          progress_percent?: number
          progress_stage?: string | null
          prompt?: string | null
          replicate_prediction_id?: string | null
          source_images?: Json
          status?: Database["public"]["Enums"]["generation_status"]
          thumbnail_url?: string | null
          user_id?: string
          video_url?: string | null
        }
        Relationships: []
      }
      instance_config: {
        Row: {
          brand_secondary_color: string | null
          created_at: string
          custom_domain: string | null
          gemini_configured: boolean
          id: number
          legal_privacy: string | null
          legal_terms: string | null
          legal_terms_accepted: boolean
          logo_url: string | null
          operation_mode: string
          product_name: string
          replicate_configured: boolean
          setup_completed: boolean
          updated_at: string
        }
        Insert: {
          brand_secondary_color?: string | null
          created_at?: string
          custom_domain?: string | null
          gemini_configured?: boolean
          id: number
          legal_privacy?: string | null
          legal_terms?: string | null
          legal_terms_accepted?: boolean
          logo_url?: string | null
          operation_mode?: string
          product_name?: string
          replicate_configured?: boolean
          setup_completed?: boolean
          updated_at?: string
        }
        Update: {
          brand_secondary_color?: string | null
          created_at?: string
          custom_domain?: string | null
          gemini_configured?: boolean
          id?: number
          legal_privacy?: string | null
          legal_terms?: string | null
          legal_terms_accepted?: boolean
          logo_url?: string | null
          operation_mode?: string
          product_name?: string
          replicate_configured?: boolean
          setup_completed?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cau_number: string | null
          created_at: string
          full_name: string | null
          id: string
          office_name: string | null
          role: Database["public"]["Enums"]["app_role"]
          total_cost_usd: number
          total_generations: number
          updated_at: string
        }
        Insert: {
          cau_number?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          office_name?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          total_cost_usd?: number
          total_generations?: number
          updated_at?: string
        }
        Update: {
          cau_number?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          office_name?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          total_cost_usd?: number
          total_generations?: number
          updated_at?: string
        }
        Relationships: []
      }
      project_assets: {
        Row: {
          added_at: string
          generation_id: string
          project_id: string
        }
        Insert: {
          added_at?: string
          generation_id: string
          project_id: string
        }
        Update: {
          added_at?: string
          generation_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assets_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          briefing: string | null
          client_name: string | null
          created_at: string
          deadline: string | null
          id: string
          name: string
          share_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          briefing?: string | null
          client_name?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          name: string
          share_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          briefing?: string | null
          client_name?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          name?: string
          share_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      public_library: {
        Row: {
          category: string | null
          created_at: string
          downloads: number
          generation_id: string
          is_featured: boolean
          slug: string | null
          tags: string[]
          views: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          downloads?: number
          generation_id: string
          is_featured?: boolean
          slug?: string | null
          tags?: string[]
          views?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          downloads?: number
          generation_id?: string
          is_featured?: boolean
          slug?: string | null
          tags?: string[]
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "public_library_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: true
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_runs: {
        Row: {
          completed_at: string | null
          cost_usd: number
          created_at: string
          current_node: string | null
          error_message: string | null
          final_output_path: string | null
          final_output_url: string | null
          graph: Json
          id: string
          node_results: Json
          progress_percent: number
          status: string
          updated_at: string
          user_id: string
          workflow_id: string | null
        }
        Insert: {
          completed_at?: string | null
          cost_usd?: number
          created_at?: string
          current_node?: string | null
          error_message?: string | null
          final_output_path?: string | null
          final_output_url?: string | null
          graph: Json
          id?: string
          node_results?: Json
          progress_percent?: number
          status?: string
          updated_at?: string
          user_id: string
          workflow_id?: string | null
        }
        Update: {
          completed_at?: string | null
          cost_usd?: number
          created_at?: string
          current_node?: string | null
          error_message?: string | null
          final_output_path?: string | null
          final_output_url?: string | null
          graph?: Json
          id?: string
          node_results?: Json
          progress_percent?: number
          status?: string
          updated_at?: string
          user_id?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studio_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "studio_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_workflows: {
        Row: {
          created_at: string
          graph: Json
          id: string
          last_run_id: string | null
          name: string
          thumbnail_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          graph?: Json
          id?: string
          last_run_id?: string | null
          name?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          graph?: Json
          id?: string
          last_run_id?: string | null
          name?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_secret_exists: { Args: { _name: string }; Returns: boolean }
      admin_set_secret: {
        Args: { _name: string; _value: string }
        Returns: undefined
      }
      get_shared_project: { Args: { _token: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_stuck_generations_failed: { Args: never; Returns: number }
      service_get_secret: { Args: { _name: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "user"
      asset_type:
        | "page_raster"
        | "geometry_clean"
        | "layout_clean"
        | "room_map"
        | "equipment_map"
        | "section_reference"
        | "style_board"
        | "brief_json"
        | "floorplan"
        | "floorplan_render"
      generation_status:
        | "queued"
        | "pending"
        | "processing"
        | "succeeded"
        | "failed"
        | "cancelled"
      pipeline_type:
        | "direct"
        | "enriched"
        | "edit"
        | "in_scene"
        | "floorplan"
        | "text_to_3d"
        | "scene_to_3d"
        | "floorplan_render"
        | "render_to_video"
        | "redecorate"
        | "floorplan_2d"
        | "floorplan_analysis"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user"],
      asset_type: [
        "page_raster",
        "geometry_clean",
        "layout_clean",
        "room_map",
        "equipment_map",
        "section_reference",
        "style_board",
        "brief_json",
        "floorplan",
        "floorplan_render",
      ],
      generation_status: [
        "queued",
        "pending",
        "processing",
        "succeeded",
        "failed",
        "cancelled",
      ],
      pipeline_type: [
        "direct",
        "enriched",
        "edit",
        "in_scene",
        "floorplan",
        "text_to_3d",
        "scene_to_3d",
        "floorplan_render",
        "render_to_video",
        "redecorate",
        "floorplan_2d",
        "floorplan_analysis",
      ],
    },
  },
} as const
