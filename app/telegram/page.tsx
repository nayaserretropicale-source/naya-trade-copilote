"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

function IconHome() { return (<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10" /></svg>); }
function IconChart() { return (<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-6" /></svg>); }
function IconNews() { return (<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v14H4zM8 9h8M8 13h8M8 17h5" /></svg>); }
function IconSend() { return (<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>); }
function BottomNav({ active }: { active: string }) {
  const items = [{ key: "home", label: "Accueil", href: "/", icon: <IconHome /> }, { key: "backtest", label: "Backtest", href: "/backtest", icon: <IconChart /> }, { key: "actu", label: "Actu", href: "/actualite", icon: <IconNews /> }, { key: "telegram", label: "Telegram", href: "/telegram", icon: <IconSend /> }];
  return (<nav className="fixed inset-x-0 bottom-0 z-50 bg-[#0A0F0C]/90 backdrop-blur-xl border-t border-[#1A231D]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}><div className="max-w-md mx-auto flex justify-around items-stretch px-2 py-2">{items.map((it) => (<a key={it.key} href={it.href} className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition active:scale-95 ${active === it.key ? "text-[#36C27D]" : "text-[#69736A]"}`}>{it.icon}<span className="text-[10px] font-semibold tracking-wide">{it.label}</span></a>))}</div></nav>);
}

export default function TelegramPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [botUrl, setBotUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.backgroundColor = "#0C120E";
    supabaseBrowser.auth.getSession().then(({ data }) => { setToken(data.session?.access_token ?? null); setReady(true); });
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_e, s) => setToken(s?.access_token ?? null));
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  async function load() {
    if (!token) return;
    setLoading(true); setErr(null);
    try { const res = await fetch("/api/telegram/link", { headers: { Authorization: `Bearer ${token}` } }); const data = await res.json(); if (data.error) throw new Error(data.error); setConnected(!!data.connected); setBotUrl(data.botUrl || ""); }
    catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); } finally { setLoading(false); }
  }
  useEffect(() => { if (token) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  async function disconnect() { if (!token) return; await fetch("/api/telegram/link", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }); await load(); }

  if (!ready) return <main className="min-h-screen bg-[#0C120E] flex items-center justify-center"><p className="text-[#69736A]">Chargement…</p></main>;
  if (!token) return <main className="min-h-screen bg-[#0C120E] flex items-center justify-center p-6"><div className="text-center"><p className="text-[#8C968B] mb-3">Connecte-toi d'abord.</p><a href="/" className="text-[#36C27D] font-semibold underline">Aller à la connexion</a></div></main>;

  return (
    <main className="min-h-screen bg-[#0C120E] text-[#ECF0EA] flex justify-center px-4 pt-6 pb-28">
      <div className="w-full max-w-md space-y-4">
        <div>
          <p className="text-[11px] tracking-[0.16em] uppercase text-[#69736A] font-semibold">Naya · Copilote Marché</p>
          <h1 className="text-2xl font-semibold mt-1 tracking-tight">Notifications Telegram</h1>
        </div>
        <div className="bg-[#141C17] border border-[#243029] rounded-3xl p-5 space-y-3">
          {loading ? <p className="text-[#69736A]">Chargement…</p> : err ? <p className="text-[#E8705D] font-medium">⚠️ {err}</p> : connected ? (
            <>
              <p className="text-sm font-semibold text-[#36C27D]">✅ Ton Telegram est connecté.</p>
              <p className="text-sm text-[#8C968B]">Tu reçois ton récap quotidien automatiquement.</p>
              <button onClick={disconnect} className="w-full py-3 rounded-2xl bg-[#18211B] border border-[#243029] font-semibold active:scale-[0.99] transition">Déconnecter mon Telegram</button>
            </>
          ) : (
            <>
              <p className="text-sm text-[#C2CABF]">Reçois ton récap quotidien (valeur, gains/pertes) sur Telegram. En un tap :</p>
              <ol className="text-sm text-[#C2CABF] list-decimal pl-5 space-y-1">
                <li>Clique le bouton ci-dessous (ça ouvre le bot Naya).</li>
                <li>Appuie sur <b>Démarrer</b> dans Telegram.</li>
                <li>Reviens ici et clique <b>« J'ai connecté »</b>.</li>
              </ol>
              <a href={botUrl} target="_blank" rel="noopener noreferrer" className="block w-full text-center py-3 rounded-2xl bg-[#36C27D] text-[#06140C] font-semibold active:scale-[0.99] transition">Connecter mon Telegram</a>
              <button onClick={load} className="w-full py-3 rounded-2xl bg-[#18211B] border border-[#243029] font-semibold active:scale-[0.99] transition">J'ai connecté — vérifier</button>
            </>
          )}
        </div>
        <p className="text-xs text-[#69736A] text-center">Simulation éducative — sans argent réel.</p>
      </div>
      <BottomNav active="telegram" />
    </main>
  );
}
