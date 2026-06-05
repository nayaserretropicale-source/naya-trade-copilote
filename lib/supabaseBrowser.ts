import { createClient } from "@supabase/supabase-js";

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, "");

if (!url || !anon) {
  throw new Error("Variables manquantes : NEXT_PUBLIC_SUPABASE_URL et/ou NEXT_PUBLIC_SUPABASE_ANON_KEY ne sont pas chargées (vérifie .env.local puis redémarre le serveur).");
}

export const supabaseBrowser = createClient(url, anon);
