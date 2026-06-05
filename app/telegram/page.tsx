"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function TelegramPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [botUrl, setBotUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => { setToken(data.session?.access_token ?? null); setReady(true); });
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_e, s) => setToken(s?.access_token ?? null));
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  async function load() {
    if (!token) return;
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/telegram/link", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setConnected(!!data.connected); setBotUrl(data.botUrl || "");
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (token) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  async function disconnect() {
    if (!token) return;
    await fetch("/api/telegram/link", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    await load();
  }

  if (!ready) return <main className="min-h-screen bg-[#F6F2E9] flex items-center justify-center"><p className="text-[#6E7268]">Chargement…</p></main>;
  if (!token) return <main className="min-h-screen bg-[#F6F2E9] flex items-center justify-center p-6"><div className="text-center"><p className="text-[#6E7268] mb-3">Connecte-toi d'abord.</p><a href="/" className="text-[#1F4D3A] font-semibold underline">Aller à la connexion</a></div></main>;

  return (
    <main className="min-h-screen bg-[#F6F2E9] text-[#1B1E1A] flex justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold">Naya · Copilote Marché</p>
            <h1 className="text-2xl font-semibold mt-1">Notifications Telegram</h1>
          </div>
          <a href="/" className="text-xs font-semibold text-[#1F4D3A] bg-white border border-[#E6DFD0] px-3 py-2 rounded-xl hover:bg-[#FCFAF4] transition">← Accueil</a>
        </div>

        <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm space-y-3">
          {loading ? <p className="text-[#6E7268]">Chargement…</p> : err ? <p className="text-[#B0432E] font-medium">⚠️ {err}</p> : connected ? (
            <>
              <p className="text-sm font-semibold text-[#2F6B4F]">✅ Ton Telegram est connecté.</p>
              <p className="text-sm text-[#6E7268]">Tu reçois ton récap quotidien automatiquement.</p>
              <button onClick={disconnect} className="w-full py-3 rounded-xl bg-white border border-[#E6DFD0] font-semibold hover:bg-[#FCFAF4] transition">Déconnecter mon Telegram</button>
            </>
          ) : (
            <>
              <p className="text-sm text-[#33372F]">Reçois ton récap quotidien (valeur, gains/pertes) sur Telegram. En un tap :</p>
              <ol className="text-sm text-[#33372F] list-decimal pl-5 space-y-1">
                <li>Clique le bouton ci-dessous (ça ouvre le bot Naya).</li>
                <li>Appuie sur <b>Démarrer</b> dans Telegram.</li>
                <li>Reviens ici et clique <b>« J'ai connecté »</b>.</li>
              </ol>
              <a href={botUrl} target="_blank" rel="noopener noreferrer" className="block w-full text-center py-3 rounded-xl bg-[#1F4D3A] text-white font-semibold hover:bg-[#1a4232] transition">Connecter mon Telegram</a>
              <button onClick={load} className="w-full py-3 rounded-xl bg-white border border-[#E6DFD0] font-semibold hover:bg-[#FCFAF4] transition">J'ai connecté — vérifier</button>
            </>
          )}
        </div>
        <p className="text-xs text-[#9A9D92] text-center">Simulation éducative — sans argent réel.</p>
      </div>
    </main>
  );
}
