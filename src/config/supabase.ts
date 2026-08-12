import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Service-role client — server-side only. Never send this key to any frontend.
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const STORAGE_BUCKET = env.SUPABASE_STORAGE_BUCKET;
