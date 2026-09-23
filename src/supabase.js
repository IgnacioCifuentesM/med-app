import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from './lib/config.js';
const config = supabaseConfig(import.meta.env);
export const configurationError = config.error;
export const supabase = config.error
  ? null
  : createClient(config.url, config.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
