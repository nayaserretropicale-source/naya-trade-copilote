"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type News = { headline: string; source: string; url: string; datetime: number };
type Mover = { symbol: string; name: string; changePct: number };
type WL = { symbol: string; name: string };

export default function Actualite() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [general, setGeneral] = useState<News[]>([]);
  const [up, setUp] = useState<Mover[]>([]);
  const [down, setDown] = useState<Mover[]>([]);
  const [watchlist, setWatchlist] = useState<WL[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [genSum, setGenSum] = useState(false);
  const [selSym, setSelSym] = useState<string | null>(null);
  const [symNews, setSymNews] = useState<News[]>([]);
  const [symLoading, setSymLoading] = useState(false);

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => { setToken(data.session?.access_token ?? null); setReady(true); });
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_e, s) => setToken(s?.access_token ?? null));
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const authedFetch = (path: string, options: RequestInit = {}) => fetch(path, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } });

  async function load() {
    if (!token) return;
    setLoading(true); setErr(null);
    try {
      const res = await authedFetch("/api/news");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGeneral(data.general ?? []); setUp(data.up ?? []); setDown(data.down ?? []); setWatchlist(data.watchlist ?? []);
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (token) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  async function genSummary() {
    setGenSum(true); setSummary(null);
    try { const res = await authedFetch("/api/news/summary", { method: "POST" }); const data = await res.json(); if (data.error) throw new Error(data.error); setSummary(data.summary); }
    catch (e) { setSummary(e instanceof Error ? e.message : "Erreur"); }
    finally { setGenSum(false); }
  }

  async function loadSym(sym: string) {
    if (selSym === sym) { setSelSym(null); setSymNews([]); return; }
    setSelSym(sym); setSymNews([]); setSymLoading(true);
    try { const res = await authedFetch(`/api/news?symbol=${encodeURIComponent(sym)}`); const data = await res.json(); setSymNews(data.news ?? []); }
    catch {} finally { setSymLoading(false); }
  }

  const fmt = (ts: number) => ts ? new Date(ts * 1000).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

  if (!ready) return <main className="min-h-screen bg-[#F6F2E9] flex items-center justify-center"><p className="text-[#6E7268]">Chargement…</p></main>;
  if (!token) return <main className="min-h-screen bg-[#F6F2E9] flex items-center justify-center p-6"><div className="text-center"><p className="text-[#6E7268] mb-3">Connecte-toi d'abord.</p><a href="/" className="text-[#1F4D3A] font-semibold underline">Aller à la connexion</a></div></main>;

  return (
    <main className="min-h-screen bg-[#F6F2E9] text-[#1B1E1A] flex justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold">Naya · Copilote Marché</p>
            <h1 className="text-2xl font-semibold mt-1">Actualité</h1>
          </div>
          <a href="/" className="text-xs font-semibold text-[#1F4D3A] bg-white border border-[#E6DFD0] px-3 py-2 rounded-xl hover:bg-[#FCFAF4] transition">← Accueil</a>
        </div>

        {loading && <p className="text-[#6E7268]">Chargement…</p>}
        {err && <p className="text-[#B0432E] font-medium">⚠️ {err}</p>}

        {!loading && (
          <>
            <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
              <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold mb-2">Le point marché de l'IA</p>
              {summary ? <p className="text-sm text-[#33372F] leading-relaxed whitespace-pre-line">{summary}</p> : <p className="text-sm text-[#6E7268]">Un résumé neutre de l'actu du jour, pour comprendre — jamais pour te dire quoi acheter.</p>}
              <button onClick={genSummary} disabled={genSum} className="w-full mt-3 py-3 rounded-xl bg-[#1F4D3A] text-white font-semibold hover:bg-[#1a4232] transition disabled:opacity-50">{genSum ? "L'IA lit l'actu…" : "Générer le point marché"}</button>
            </div>

            <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
              <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold mb-3">Tendances du jour (ta liste)</p>
              {up.length === 0 && down.length === 0 ? <p className="text-sm text-[#6E7268]">Pas de données de variation pour l'instant.</p> : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-[#2F6B4F] mb-1">▲ En hausse</p>
                    {up.length === 0 ? <p className="text-xs text-[#9A9D92]">—</p> : up.map((m) => (<div key={m.symbol} className="flex items-center justify-between py-1 text-sm"><span className="truncate pr-2">{m.name}</span><span className="font-semibold text-[#2F6B4F]">+{m.changePct}%</span></div>))}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#B0432E] mb-1">▼ En baisse</p>
                    {down.length === 0 ? <p className="text-xs text-[#9A9D92]">—</p> : down.map((m) => (<div key={m.symbol} className="flex items-center justify-between py-1 text-sm"><span className="truncate pr-2">{m.name}</span><span className="font-semibold text-[#B0432E]">{m.changePct}%</span></div>))}
                  </div>
                </div>
              )}
            </div>

            {watchlist.length > 0 && (
              <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
                <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold mb-3">Actu par valeur</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {watchlist.map((w) => (<button key={w.symbol} onClick={() => loadSym(w.symbol)} className={`text-xs font-semibold px-3 py-2 rounded-xl border transition ${selSym === w.symbol ? "bg-[#1F4D3A] text-white border-[#1F4D3A]" : "bg-white border-[#E6DFD0] hover:bg-[#FCFAF4]"}`}>{w.symbol}</button>))}
                </div>
                {selSym && (symLoading ? <p className="text-sm text-[#6E7268]">Chargement…</p> : symNews.length === 0 ? <p className="text-sm text-[#6E7268]">Aucune actu récente pour {selSym}.</p> : (
                  <div className="space-y-3">
                    {symNews.map((n, i) => (<a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className="block border-b border-[#F3EFE4] last:border-b-0 pb-2"><p className="text-sm font-medium leading-snug">{n.headline}</p><p className="text-xs text-[#9A9D92] mt-1">{n.source} · {fmt(n.datetime)}</p></a>))}
                  </div>
                ))}
              </div>
            )}

            <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
              <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold mb-3">Actu marché</p>
              {general.length === 0 ? <p className="text-sm text-[#6E7268]">Aucune actu disponible.</p> : (
                <div className="space-y-3">
                  {general.map((n, i) => (<a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className="block border-b border-[#F3EFE4] last:border-b-0 pb-2"><p className="text-sm font-medium leading-snug">{n.headline}</p><p className="text-xs text-[#9A9D92] mt-1">{n.source} · {fmt(n.datetime)}</p></a>))}
                </div>
              )}
            </div>

            <p className="text-xs text-[#9A9D92] text-center">L'actualité aide à comprendre, pas à deviner. Reste prudent : diversifie, agis peu, vois loin.</p>
          </>
        )}
      </div>
    </main>
  );
}
