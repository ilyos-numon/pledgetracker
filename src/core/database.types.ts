export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      evidence: {
        Row: {
          added_by: string
          checked_at: string | null
          created_at: string
          id: string
          kind: string
          locator: string | null
          note: string | null
          pledge_id: string
          published_at: string | null
          title: string
          url: string
        }
        Insert: {
          added_by: string
          checked_at?: string | null
          created_at?: string
          id?: string
          kind: string
          locator?: string | null
          note?: string | null
          pledge_id: string
          published_at?: string | null
          title: string
          url: string
        }
        Update: {
          added_by?: string
          checked_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          locator?: string | null
          note?: string | null
          pledge_id?: string
          published_at?: string | null
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_pledge_id_fkey"
            columns: ["pledge_id"]
            isOneToOne: false
            referencedRelation: "pledges"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_candidates: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          llm_note: string | null
          matched_keywords: string[]
          pledge_id: string
          published_at: string | null
          score: number
          source: string
          state: string
          title: string
          url: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          llm_note?: string | null
          matched_keywords?: string[]
          pledge_id: string
          published_at?: string | null
          score?: number
          source: string
          state?: string
          title: string
          url: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          llm_note?: string | null
          matched_keywords?: string[]
          pledge_id?: string
          published_at?: string | null
          score?: number
          source?: string
          state?: string
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_candidates_pledge_id_fkey"
            columns: ["pledge_id"]
            isOneToOne: false
            referencedRelation: "pledges"
            referencedColumns: ["id"]
          },
        ]
      }
      objections: {
        Row: {
          body: string
          created_at: string
          evidence_url: string | null
          id: string
          pledge_id: string
          resolution_note: string | null
          resolved_at: string | null
          state: string
        }
        Insert: {
          body: string
          created_at?: string
          evidence_url?: string | null
          id?: string
          pledge_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          state?: string
        }
        Update: {
          body?: string
          created_at?: string
          evidence_url?: string | null
          id?: string
          pledge_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "objections_pledge_id_fkey"
            columns: ["pledge_id"]
            isOneToOne: false
            referencedRelation: "pledges"
            referencedColumns: ["id"]
          },
        ]
      }
      official_catalog: {
        Row: {
          id: string
          is_sample: boolean
          level: string
          office: string
          person_name: string
          region_name: string
          source_url: string
          term_end: string
          term_start: string
          updated_at: string
        }
        Insert: {
          id: string
          is_sample?: boolean
          level: string
          office: string
          person_name: string
          region_name: string
          source_url: string
          term_end: string
          term_start: string
          updated_at?: string
        }
        Update: {
          id?: string
          is_sample?: boolean
          level?: string
          office?: string
          person_name?: string
          region_name?: string
          source_url?: string
          term_end?: string
          term_start?: string
          updated_at?: string
        }
        Relationships: []
      }
      officials: {
        Row: {
          election_date: string
          id: string
          is_sample: boolean
          office: string
          person_name: string
          region_name: string
          source_kind: string
          source_url: string
          term_end: string
          term_start: string
          updated_at: string
        }
        Insert: {
          election_date: string
          id: string
          is_sample?: boolean
          office: string
          person_name: string
          region_name: string
          source_kind: string
          source_url: string
          term_end: string
          term_start: string
          updated_at?: string
        }
        Update: {
          election_date?: string
          id?: string
          is_sample?: boolean
          office?: string
          person_name?: string
          region_name?: string
          source_kind?: string
          source_url?: string
          term_end?: string
          term_start?: string
          updated_at?: string
        }
        Relationships: []
      }
      pledge_events: {
        Row: {
          created_at: string
          event_date: string
          evidence_id: string | null
          from_status: Database["public"]["Enums"]["pledge_status"] | null
          id: number
          kind: string
          objection_id: string | null
          pledge_id: string
          reason: string
          to_status: Database["public"]["Enums"]["pledge_status"] | null
        }
        Insert: {
          created_at?: string
          event_date?: string
          evidence_id?: string | null
          from_status?: Database["public"]["Enums"]["pledge_status"] | null
          id?: never
          kind: string
          objection_id?: string | null
          pledge_id: string
          reason?: string
          to_status?: Database["public"]["Enums"]["pledge_status"] | null
        }
        Update: {
          created_at?: string
          event_date?: string
          evidence_id?: string | null
          from_status?: Database["public"]["Enums"]["pledge_status"] | null
          id?: never
          kind?: string
          objection_id?: string | null
          pledge_id?: string
          reason?: string
          to_status?: Database["public"]["Enums"]["pledge_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "pledge_events_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pledge_events_objection_id_fkey"
            columns: ["objection_id"]
            isOneToOne: false
            referencedRelation: "objections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pledge_events_pledge_id_fkey"
            columns: ["pledge_id"]
            isOneToOne: false
            referencedRelation: "pledges"
            referencedColumns: ["id"]
          },
        ]
      }
      pledges: {
        Row: {
          category: string
          id: string
          keywords: string[]
          official_id: string
          seq: number
          source_locator: string | null
          source_url: string
          status: Database["public"]["Enums"]["pledge_status"]
          status_decided_at: string | null
          status_reason: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          id: string
          keywords?: string[]
          official_id: string
          seq: number
          source_locator?: string | null
          source_url: string
          status?: Database["public"]["Enums"]["pledge_status"]
          status_decided_at?: string | null
          status_reason?: string
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          id?: string
          keywords?: string[]
          official_id?: string
          seq?: number
          source_locator?: string | null
          source_url?: string
          status?: Database["public"]["Enums"]["pledge_status"]
          status_decided_at?: string | null
          status_reason?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pledges_official_id_fkey"
            columns: ["official_id"]
            isOneToOne: false
            referencedRelation: "officials"
            referencedColumns: ["id"]
          },
        ]
      }
      reviewers: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_reviewer: { Args: never; Returns: boolean }
      resolve_objection: {
        Args: {
          p_decision: string
          p_new_status?: Database["public"]["Enums"]["pledge_status"]
          p_note: string
          p_objection_id: string
        }
        Returns: Json
      }
      review_candidate: {
        Args: {
          p_candidate_id: string
          p_decision: string
          p_new_status?: Database["public"]["Enums"]["pledge_status"]
          p_reason?: string
        }
        Returns: Json
      }
      search_catalog: {
        Args: { p_query: string }
        Returns: {
          id: string
          is_sample: boolean
          level: string
          office: string
          person_name: string
          pledge_count: number
          region_name: string
          source_url: string
          term_end: string
          term_start: string
          tracked: boolean
        }[]
      }
    }
    Enums: {
      pledge_status:
        | "not_started"
        | "in_progress"
        | "fulfilled"
        | "modified"
        | "abandoned"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      pledge_status: [
        "not_started",
        "in_progress",
        "fulfilled",
        "modified",
        "abandoned",
      ],
    },
  },
} as const

