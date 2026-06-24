"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type News = { headline: string; source: string; url: string; datetime: number };
type Mover = { symbol: string; name: string; changePct: number };
type WL = { symbol: string; name: string };
type MarketSug = { symbol: string; name: string; tier: string; reason: string };

const BADGE: Record<string, string> = { ok: "text-[#5FD89B] bg-[#13251C] border-[#1F3A2C]", warn: "text-[#D8B26A] bg-[#241E10] border-[#3A301A]", bad: "text-[#E8705D] bg-[#251512] border-[#3E221C]" };
const TIER_BADGE: Record<string, string> = { "Prudent": BADGE.ok, "Équilibré": BADGE.warn, "Dynamique": BADGE.bad };

function IconHome() { return (<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10" /></svg>); }
function IconChart() { return (<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-6" /></svg>); }
function IconNews() { return (<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v14H4zM8 9h8M8 13h8M8 17h5" /></svg>); }
function IconSend() { return (<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>); }
function BottomNav({ active }: { active: string }) {
  const items = [{ key: "home", label: "Accueil", href: "/", icon: <IconHome /> }, { key: "backtest", label: "Backtest", href: "/backtest", icon: <IconChart /> }, { key: "actu", label: "Actu", href: "/actualite", icon: <IconNews /> }, { key: "telegram", label: "Telegram", href: "/telegram", icon: <IconSend /> }];
  return (<nav className="fixed inset-x-0 bottom-0 z-50 bg-[#0A0F0C]/90 backdrop-blur-xl border-t border-[#1A231D]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}><div className="max-w-md mx-auto flex justify-around items-stretch px-2 py-2">{items.map((it) => (<a key={it.key} href={it.href} className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition active:scale-95 ${active === it.key ? "text-[#36C27D]" : "text-[#69736A]"}`}>{it.icon}<span className="text-[10px] font-semibold tracking-wide">{it.label}</span></a>))}</div></nav>);
}

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
  const [marketSugs, setMarketSugs] = useState<MarketSug[]>([]);
  const [loadingMS, setLoadingMS] = useState(false);
  const [askedMS, setAskedMS] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [msNote, setMsNote] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.backgroundColor = "#0C120E";
    supabaseBrowser.auth.getSession().then(({ data }) => { setToken(data.session?.access_token ?? null); setReady(true); });
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_e, s) => setToken(s?.access_token ?? null));
    return () => { sub.subscription.unsubscribe(); };
  }, []);
  const authedFetch = (path: string, options: RequestInit = {}) => fetch(path, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } });

  async function load() {
    if (!token) return;
    setLoading(true); setErr(null);
    try { const res = await authedFetch("/api/news"); const data = await res.json(); if (data.error) throw new Error(data.error); setGeneral(data.general ?? []); setUp(data.up ?? []); setDown(data.down ?? []); setWatchlist(data.watchlist ?? []); }
    catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); } finally { setLoading(false); }
  }
  useEffect(() => {
    if (!token) return;
    const id = setTimeout(() => load(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function genSummary() { setGenSum(true); setSummary(null); try { const res = await authedFetch("/api/news/summary", { method: "POST" }); const data = await res.json(); if (data.error) throw new Error(data.error); setSummary(data.summary); } catch (e) { setSummary(e instanceof Error ? e.message : "Erreur"); } finally { setGenSum(false); } }
  async function suggestMarkets() { setLoadingMS(true); setMsNote(null); setAskedMS(true); try { const res = await authedFetch("/api/watchlist/suggest", { method: "POST" }); const data = await res.json(); if (data.error) throw new Error(data.error); setMarketSugs(data.suggestions ?? []); } catch (e) { setMsNote(e instanceof Error ? e.message : "Erreur"); } finally { setLoadingMS(false); } }
  async function addSuggested(s: MarketSug) { setAdding(s.symbol); setMsNote(null); try { const res = await authedFetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: s.symbol, name: s.name, tier: s.tier }) }); const data = await res.json(); if (data.error) throw new Error(data.error); setMarketSugs((prev) => prev.filter((m) => m.symbol !== s.symbol)); setMsNote(`✓ ${s.symbol} ajouté à ta liste.`); await load(); } catch (e) { setMsNote(e instanceof Error ? e.message : "Erreur"); } finally { setAdding(null); } }
  async function loadSym(sym: string) { if (selSym === sym) { setSelSym(null); setSymNews([]); return; } setSelSym(sym); setSymNews([]); setSymLoading(true); try { const res = await authedFetch(`/api/news?symbol=${encodeURIComponent(sym)}`); const data = await res.json(); setSymNews(data.news ?? []); } catch {} finally { setSymLoading(false); } }

  const fmt = (ts: number) => ts ? new Date(ts * 1000).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const card = "bg-[#141C17] border border-[#243029] rounded-3xl p-5";
  const lbl = "text-[11px] tracking-[0.16em] uppercase text-[#69736A] font-semibold";
  const btnP = "w-full py-3 rounded-2xl bg-[#36C27D] text-[#06140C] font-semibold active:scale-[0.99] transition disabled:opacity-50";
  const btnG = "w-full py-3 rounded-2xl bg-[#18211B] border border-[#243029] text-[#ECF0EA] font-semibold active:scale-[0.99] transition disabled:opacity-50";

  if (!ready) return <main className="min-h-screen bg-[#0C120E] flex items-center justify-center"><p className="text-[#69736A]">Chargement…</p></main>;
  if (!token) return <main className="min-h-screen bg-[#0C120E] flex items-center justify-center p-6"><div className="text-center"><p className="text-[#8C968B] mb-3">Connecte-toi d&apos;abord.</p><Link href="/" className="text-[#36C27D] font-semibold underline">Aller à la connexion</Link></div></main>;

  return (
    <main className="min-h-screen bg-[#0C120E] text-[#ECF0EA] flex justify-center px-4 pt-6 pb-28">
      <div className="w-full max-w-md space-y-4">
        <div>
          <p className={lbl}>Naya · Copilote Marché</p>
          <h1 className="text-2xl font-semibold mt-1 tracking-tight">Actualité</h1>
        </div>

        {loading && <p className="text-[#69736A]">Chargement…</p>}
        {err && <p className="text-[#E8705D] font-medium">⚠️ {err}</p>}

        {!loading && (
          <>
            <div className={card}>
              <p className={`${lbl} mb-2`}>Le point marché de l&apos;IA</p>
              {summary ? <p className="text-sm text-[#C2CABF] leading-relaxed whitespace-pre-line">{summary}</p> : <p className="text-sm text-[#8C968B]">Un résumé neutre de l&apos;actu du jour, pour comprendre — jamais pour te dire quoi acheter.</p>}
              <button onClick={genSummary} disabled={genSum} className={`${btnP} mt-3`}>{genSum ? "L'IA lit l'actu…" : "Générer le point marché"}</button>
            </div>

            <div className={card}>
              <p className={`${lbl} mb-2`}>Découvrir des marchés (IA)</p>
              <p className="text-sm text-[#8C968B] mb-3">L&apos;IA repère les trous de ta diversification et te propose quoi ajouter (valeurs US vérifiées, pas de prédiction).</p>
              {marketSugs.length > 0 && (
                <div className="space-y-3 mb-3">{marketSugs.map((s) => (
                  <div key={s.symbol} className="border border-[#243029] rounded-2xl p-3">
                    <div className="flex items-center justify-between"><p className="font-semibold text-sm">{s.name} <span className="text-xs text-[#69736A]">({s.symbol})</span></p><span className={`text-xs font-semibold px-2 py-1 rounded-full border ${TIER_BADGE[s.tier] ?? TIER_BADGE["Dynamique"]}`}>{s.tier}</span></div>
                    <p className="text-sm text-[#C2CABF] mt-2 leading-relaxed">{s.reason}</p>
                    <button onClick={() => addSuggested(s)} disabled={adding === s.symbol} className={`${btnP} mt-3`}>{adding === s.symbol ? "Ajout…" : "Ajouter à ma liste"}</button>
                  </div>
                ))}</div>
              )}
              {askedMS && !loadingMS && marketSugs.length === 0 && !msNote && <p className="text-sm text-[#8C968B] mb-2">Rien de plus à proposer — ta liste est déjà bien diversifiée. 👍</p>}
              {msNote && <p className="text-sm font-medium text-[#36C27D] mb-2">{msNote}</p>}
              <button onClick={suggestMarkets} disabled={loadingMS} className={btnG}>{loadingMS ? "L'IA analyse ta liste…" : "Suggérer des marchés à ajouter"}</button>
            </div>

            <div className={card}>
              <p className={`${lbl} mb-3`}>Tendances du jour (ta liste)</p>
              {up.length === 0 && down.length === 0 ? <p className="text-sm text-[#8C968B]">Pas de données de variation pour l&apos;instant.</p> : (
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs font-semibold text-[#36C27D] mb-1">▲ En hausse</p>{up.length === 0 ? <p className="text-xs text-[#69736A]">—</p> : up.map((m) => (<div key={m.symbol} className="flex items-center justify-between py-1 text-sm"><span className="truncate pr-2">{m.name}</span><span className="font-semibold text-[#36C27D] tabular-nums">+{m.changePct}%</span></div>))}</div>
                  <div><p className="text-xs font-semibold text-[#E8705D] mb-1">▼ En baisse</p>{down.length === 0 ? <p className="text-xs text-[#69736A]">—</p> : down.map((m) => (<div key={m.symbol} className="flex items-center justify-between py-1 text-sm"><span className="truncate pr-2">{m.name}</span><span className="font-semibold text-[#E8705D] tabular-nums">{m.changePct}%</span></div>))}</div>
                </div>
              )}
            </div>

            {watchlist.length > 0 && (
              <div className={card}>
                <p className={`${lbl} mb-3`}>Actu par valeur</p>
                <div className="flex flex-wrap gap-2 mb-3">{watchlist.map((w) => (<button key={w.symbol} onClick={() => loadSym(w.symbol)} className={`text-xs font-semibold px-3 py-2 rounded-xl border transition active:scale-95 ${selSym === w.symbol ? "bg-[#36C27D] text-[#06140C] border-[#36C27D]" : "bg-[#18211B] border-[#243029] text-[#ECF0EA]"}`}>{w.symbol}</button>))}</div>
                {selSym && (symLoading ? <p className="text-sm text-[#69736A]">Chargement…</p> : symNews.length === 0 ? <p className="text-sm text-[#8C968B]">Aucune actu récente pour {selSym}.</p> : (
                  <div className="space-y-3">{symNews.map((n, i) => (<a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className="block border-b border-[#1A231D] last:border-b-0 pb-2"><p className="text-sm font-medium leading-snug">{n.headline}</p><p className="text-xs text-[#69736A] mt-1">{n.source} · {fmt(n.datetime)}</p></a>))}</div>
                ))}
              </div>
            )}

            <div className={card}>
              <p className={`${lbl} mb-3`}>Actu marché</p>
              {general.length === 0 ? <p className="text-sm text-[#8C968B]">Aucune actu disponible.</p> : (
                <div className="space-y-3">{general.map((n, i) => (<a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className="block border-b border-[#1A231D] last:border-b-0 pb-2"><p className="text-sm font-medium leading-snug">{n.headline}</p><p className="text-xs text-[#69736A] mt-1">{n.source} · {fmt(n.datetime)}</p></a>))}</div>
              )}
            </div>

            <p className="text-xs text-[#69736A] text-center">L&apos;actualité aide à comprendre, pas à deviner. Reste prudent : diversifie, agis peu, vois loin.</p>
          </>
        )}
      </div>
      <BottomNav active="actu" />
    </main>
  );
}
