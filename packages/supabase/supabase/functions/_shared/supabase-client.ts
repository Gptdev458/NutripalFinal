import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

export const createSupabaseClient = (req: Request) => {
  const authHeader = req.headers.get('Authorization')
  
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    }
  )
}

export const createAdminClient = () => {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
}
