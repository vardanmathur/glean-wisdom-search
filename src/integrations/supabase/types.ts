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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      books: {
        Row: {
          author: string
          cover_image_url: string | null
          created_at: string
          description: string | null
          id: string
          isbn: string | null
          title: string
        }
        Insert: {
          author: string
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          isbn?: string | null
          title: string
        }
        Update: {
          author?: string
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          isbn?: string | null
          title?: string
        }
        Relationships: []
      }
      highlights: {
        Row: {
          book_id: string | null
          created_at: string
          embedding: string | null
          id: string
          my_notes: string | null
          quote: string
          reported: boolean | null
          source: string | null
          stars: boolean | null
          tags: string[] | null
          user_id: string | null
          visibility: string | null
        }
        Insert: {
          book_id?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          my_notes?: string | null
          quote: string
          reported?: boolean | null
          source?: string | null
          stars?: boolean | null
          tags?: string[] | null
          user_id?: string | null
          visibility?: string | null
        }
        Update: {
          book_id?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          my_notes?: string | null
          quote?: string
          reported?: boolean | null
          source?: string | null
          stars?: boolean | null
          tags?: string[] | null
          user_id?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "highlights_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "highlights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kindle_import_staging: {
        Row: {
          author: string | null
          book_title: string
          client_id: string | null
          created_at: string
          duplicate_of: string | null
          id: string
          kindle_location: string | null
          kindle_timestamp: string | null
          my_notes: string | null
          quote: string
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          author?: string | null
          book_title: string
          client_id?: string | null
          created_at?: string
          duplicate_of?: string | null
          id?: string
          kindle_location?: string | null
          kindle_timestamp?: string | null
          my_notes?: string | null
          quote: string
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          author?: string | null
          book_title?: string
          client_id?: string | null
          created_at?: string
          duplicate_of?: string | null
          id?: string
          kindle_location?: string | null
          kindle_timestamp?: string | null
          my_notes?: string | null
          quote?: string
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kindle_import_staging_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "highlights"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_highlights: {
        Row: {
          created_at: string
          highlight_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          highlight_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          highlight_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_highlights_highlight_id_fkey"
            columns: ["highlight_id"]
            isOneToOne: false
            referencedRelation: "highlights"
            referencedColumns: ["id"]
          },
        ]
      }
      think_config: {
        Row: {
          created_at: string
          daily_limit: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_limit?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_limit?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      think_sessions: {
        Row: {
          ai_response: string | null
          created_at: string
          highlight_ids: string[] | null
          id: string
          mode: string
          promoted: boolean
          user_id: string
          user_input: string | null
        }
        Insert: {
          ai_response?: string | null
          created_at?: string
          highlight_ids?: string[] | null
          id?: string
          mode: string
          promoted?: boolean
          user_id: string
          user_input?: string | null
        }
        Update: {
          ai_response?: string | null
          created_at?: string
          highlight_ids?: string[] | null
          id?: string
          mode?: string
          promoted?: boolean
          user_id?: string
          user_input?: string | null
        }
        Relationships: []
      }
      think_usage: {
        Row: {
          ai_calls_used: number
          date: string
          id: string
          user_id: string
        }
        Insert: {
          ai_calls_used?: number
          date: string
          id?: string
          user_id: string
        }
        Update: {
          ai_calls_used?: number
          date?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      topic_summaries: {
        Row: {
          summary: string
          topic: string
          updated_at: string
        }
        Insert: {
          summary: string
          topic: string
          updated_at?: string
        }
        Update: {
          summary?: string
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          expires_at: string | null
          feature: string
          granted_at: string
          granted_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          feature: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          expires_at?: string | null
          feature?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          default_visibility: string | null
          display_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          default_visibility?: string | null
          display_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          default_visibility?: string | null
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_highlights: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          book_id: string
          id: string
          my_notes: string
          quote: string
          tags: string[]
          vector_score: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
