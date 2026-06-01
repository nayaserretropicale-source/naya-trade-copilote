import { createClient } from "@supabase/supabase-js";

// Client serveur : il utilise la clé secrète, donc il contourne le RLS.
// À n'utiliser QUE dans des routes API (jamais côté navigateur).
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } }
);
