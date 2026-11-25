import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://axednjikcambzbkxyqpp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Vysddy5_b0uZ3iKgnkDTIw_X5O1pBEd";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
