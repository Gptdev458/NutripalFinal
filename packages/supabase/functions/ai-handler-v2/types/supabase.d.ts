declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export interface SupabaseClientOptions {
    global?: {
      headers?: {
        Authorization?: string;
        [key: string]: string | undefined;
      };
    };
    auth?: {
      persistSession?: boolean;
      autoRefreshToken?: boolean;
      detectSessionInUrl?: boolean;
    };
  }

  export interface User {
    id: string;
    email?: string;
    app_metadata: any;
    user_metadata: any;
    aud: string;
    created_at?: string;
  }

  export interface Session {
    provider_token?: string | null;
    provider_refresh_token?: string | null;
    access_token: string;
    refresh_token: string;
    expires_in: number;
    expires_at?: number;
    token_type: string;
    user: User;
  }

  export interface AuthResponse {
    data: {
      user: User | null;
      session: Session | null;
    };
    error: Error | null;
  }

  export interface AuthUser {
    data: {
      user: User | null;
    };
    error: Error | null;
  }

  export interface Error {
    message: string;
    status?: number;
  }

  export interface PostgrestResponse<T> {
    data: T | null;
    error: Error | null;
    count?: number;
    status: number;
    statusText: string;
  }

  export interface SupabaseClient {
    from: (table: string) => {
      select: (columns?: string) => {
        eq: (column: string, value: any) => {
          single: () => Promise<PostgrestResponse<any>>;
          maybeSingle: () => Promise<PostgrestResponse<any>>;
          order: (column: string, options?: { ascending?: boolean }) => {
            limit: (limit: number) => Promise<PostgrestResponse<any[]>>;
          };
          limit: (limit: number) => Promise<PostgrestResponse<any[]>>;
          gt: (column: string, value: any) => Promise<PostgrestResponse<any[]>>;
          gte: (column: string, value: any) => Promise<PostgrestResponse<any[]>>;
          lt: (column: string, value: any) => Promise<PostgrestResponse<any[]>>;
          lte: (column: string, value: any) => Promise<PostgrestResponse<any[]>>;
          ilike: (column: string, value: any) => Promise<PostgrestResponse<any[]>>;
          or: (query: string) => Promise<PostgrestResponse<any[]>>;
        };
        order: (column: string, options?: { ascending?: boolean }) => {
          limit: (limit: number) => Promise<PostgrestResponse<any[]>>;
        };
      };
      insert: (data: any | any[]) => {
        select: (columns?: string) => Promise<PostgrestResponse<any>>;
      };
      update: (data: any) => {
        eq: (column: string, value: any) => Promise<PostgrestResponse<any>>;
      };
      delete: () => {
        eq: (column: string, value: any) => Promise<PostgrestResponse<any>>;
      };
      upsert: (data: any, options?: { onConflict?: string }) => {
        select: (columns?: string) => Promise<PostgrestResponse<any>>;
      };
    };

    auth: {
      getUser: (jwt?: string) => Promise<AuthUser>;
      getSession: () => Promise<AuthResponse>;
      signOut: () => Promise<{ error: Error | null }>;
    };
  }

  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: SupabaseClientOptions
  ): SupabaseClient;
}

declare module '@supabase/supabase-js' {
  export interface User {
    id: string;
    email?: string;
    app_metadata: any;
    user_metadata: any;
    aud: string;
    created_at?: string;
  }
} 