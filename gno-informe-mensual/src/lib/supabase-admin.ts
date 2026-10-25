import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient;

export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return client;
}
