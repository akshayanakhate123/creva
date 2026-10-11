// Server-only Supabase client. Uses the service role key, which bypasses row level security.
// NEVER import this from anything that ships to the browser. Never log the key or the URL's query.
// Syntax per Supabase JS docs: import { createClient } from '@supabase/supabase-js'; createClient(url, key, options).
// The options auth.persistSession and auth.autoRefreshToken are documented client options; both are off
// because a server function has no browser session to keep.
import { createClient } from '@supabase/supabase-js';

export const DEMO_USER = 'demo-ananya';

let client = null;

export function supabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabase() {
  if (!supabaseConfigured()) return null;
  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
