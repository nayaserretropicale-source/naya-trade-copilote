"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Portfolio = { id: string; starting_capital: number; cash_balance: number };
type Settings = { max_per_trade: number; stop_loss_pct: number; require_human_validation: boolean; agents_paused: boolean; usd_to_xof: number };
type Position = { symbol: string; name: string; quantity: number; avgPrice: number; price: number; currentValueUsd: number; costUsd: number; plUsd: number; plPct: number };
type Report = { title: string; summary: string; risk_level: string };
type MarketItem = { symbol: string; name: string; tier: string; explain: string; changePct: number | null };
type Market = { markets: MarketItem[]; chart: { symbol: string; points: { date: string; close: number }[] } };
type Suggestion = { id: string; symbol: string; name: string | null; action: string; amount: number | null; fraction: number | null; reason: string; confidence: string };
type Op = { date: string; symbol: string; side: string; quantity: number; price: number; total: number; realizedPl: number | null };
type Day = { date: string; realizedPl: number; buys: number; sells: number };
type History = { operations: Op[]; daily: Day[]; totalRealizedPl: number };
type Snap = { date: string; value: number };
type Weekly = { summary: string; week_end: string } | null;

const TIERS = ["Prudent", "Équilibré", "Dynamique"];
const CONF: Record<string, string> = { faible: "faible", moderee: "modérée", elevee: "élevée" };
const QUICK_AMOUNTS = ["5000", "15000", "30000"];
const BADGE: Record<string, string> = {
  ok: "text-[#34D39A] bg-[#102A20] border-[#1C3B2C]",
  warn: "text-[#E0A53C] bg-[#2A2310] border-[#4A3D1C]",
  bad: "text-[#FF6F61] bg-[#2A1512] border-[#4A221C]",
};
const TIER_BADGE: Record<string, string> = { "Prudent": BADGE.ok, "Équilibré": BADGE.warn, "Dynamique": BADGE.bad };
const RISK_BADGE: Record<string, string> = { faible: BADGE.ok, modere: BADGE.warn, eleve: BADGE.bad };

function IconHome() { return (<svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10" /></svg>); }
function IconChart() { return (<svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-6" /></svg>); }
function IconNews() { return (<svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v14H4zM8 9h8M8 13h8M8 17h5" /></svg>); }
function IconSend() { return (<svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>); }

function BottomNav({ active }: { active: string }) {
  const items = [
    { key: "home", label: "Accueil", href: "/", icon: <IconHome /> },
    { key: "backtest", label: "Backtest", href: "/backtest", icon: <IconChart /> },
    { key: "actu", label: "Actu", href: "/actualite", icon: <IconNews /> },
    { key: "telegram", label: "Telegram", href: "/telegram", icon: <IconSend /> },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 bg-[#0B0F0D]/85 backdrop-blur-xl border-t border-[#1B231F]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="max-w-md mx-auto flex justify-around items-stretch px-2 py-2">
        {items.map((it) => (
          <a key={it.key} href={it.href} className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition active:scale-95 ${active === it.key ? "text-[#34D39A]" : "text-[#6F776F]"}`}>
            {it.icon}
            <span className="text-[10px] font-semibold tracking-wide">{it.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    document.body.style.backgroundColor = "#0B0F0D";
    supabaseBrowser.auth.getSession().then(({ data }) => { setToken(data.session?.access_token ?? null); setAuthReady(true); });
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_e, session) => { setToken(session?.access_token ?? null); });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  if (!authReady) return <main className="min-h-screen bg-[#0B0F0D] flex items-center justify-center"><p className="text-[#6F776F]">Chargement…</p></main>;
  if (!token) return <AuthScreen />;
  return <Dashboard token={token} />;
}

function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      if (mode === "signup") { const { error } = await supabaseBrowser.auth.signUp({ email, password }); if (error) throw error; }
      else { const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password }); if (error) throw error; }
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); }
  }

  const input = "w-full px-4 py-3 rounded-2xl bg-[#111714] border border-[#242D28] text-[#EAEEEA] placeholder-[#5C645C] outline-none focus:border-[#34D39A] transition";

  return (
    <main className="min-h-screen bg-[#0B0F0D] text-[#EAEEEA] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#102A20] border border-[#1C3B2C] mb-3"><span className="text-[#34D39A] text-xl font-bold">N</span></div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#6F776F] font-semibold">Naya · Copilote Marché</p>
          <h1 className="text-2xl font-semibold mt-1 tracking-tight">{mode === "login" ? "Connexion" : "Créer un compte"}</h1>
          <p className="text-sm text-[#99A19A] mt-2">Apprends la bourse en simulation, sans argent réel.</p>
        </div>
        <div className="bg-[#141B18] border border-[#242D28] rounded-3xl p-6 space-y-3">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" className={input} />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Mot de passe" className={input} />
          <button onClick={submit} disabled={busy || !email || !password} className="w-full py-3 rounded-2xl bg-[#34D39A] text-[#07120D] font-semibold active:scale-[0.99] transition disabled:opacity-50">{busy ? "Patiente…" : mode === "login" ? "Se connecter" : "Créer mon compte"}</button>
          {err && <p className="text-sm font-medium text-[#FF6F61]">⚠️ {err}</p>}
          <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(null); }} className="w-full text-sm text-[#34D39A] font-medium pt-1">{mode === "login" ? "Pas encore de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}</button>
        </div>
        <p className="text-xs text-[#6F776F] text-center mt-4">Simulation éducative — aucun argent réel n'est utilisé.</p>
      </div>
    </main>
  );
}

function Dashboard({ token }: { token: string }) {
  const authedFetch = (path: string, options: RequestInit = {}) => fetch(path, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } });

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [market, setMarket] = useState<Market | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [history, setHistory] = useState<History | null>(null);
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [weekly, setWeekly] = useState<Weekly>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [symbol, setSymbol] = useState("SPY");
  const [amount, setAmount] = useState("15000");
  const [buying, setBuying] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingWeekly, setGeneratingWeekly] = useState(false);
  const [weeklyNote, setWeeklyNote] = useState<string | null>(null);
  const [askingSug, setAskingSug] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [confirmSell, setConfirmSell] = useState<string | null>(null);
  const [selling, setSelling] = useState(false);
  const [sendingRecap, setSendingRecap] = useState(false);
  const [recapNote, setRecapNote] = useState<string | null>(null);
  const [showAddMarket, setShowAddMarket] = useState(false);
  const [newSym, setNewSym] = useState("");
  const [newName, setNewName] = useState("");
  const [newTier, setNewTier] = useState("Dynamique");
  const [addingMarket, setAddingMarket] = useState(false);
  const [marketNote, setMarketNote] = useState<string | null>(null);
  const buyRef = useRef<HTMLDivElement>(null);
  const refreshingRef = useRef(false);

  async function loadPortfolio() { const res = await authedFetch("/api/portfolio"); const data = await res.json(); if (data.error) throw new Error(data.error); setPortfolio(data.portfolio); setSettings(data.settings); }
  async function loadPositions() { try { const res = await authedFetch("/api/positions"); const data = await res.json(); setPositions(data.positions ?? []); } catch {} }
  async function loadReport() { const res = await authedFetch("/api/report"); const data = await res.json(); if (data.report) setReport(data.report); }
  async function loadMarket() { try { const res = await authedFetch("/api/market"); const data = await res.json(); if (!data.error) setMarket(data); } catch {} }
  async function loadSuggestions() { try { const res = await authedFetch("/api/suggestions"); const data = await res.json(); setSuggestions(data.suggestions ?? []); } catch {} }
  async function loadHistory() { try { const res = await authedFetch("/api/history"); const data = await res.json(); setHistory(data); } catch {} }
  async function loadSnapshots() { try { const res = await authedFetch("/api/snapshots", { method: "POST" }); const data = await res.json(); if (data.series) setSnaps(data.series); } catch {} }
  async function loadWeekly() { try { const res = await authedFetch("/api/weekly"); const data = await res.json(); setWeekly(data.review ?? null); } catch {} }

  async function refreshLive() {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try { await Promise.all([loadPortfolio(), loadPositions(), loadHistory()]); setLastUpdated(new Date()); }
    catch {} finally { refreshingRef.current = false; }
  }

  useEffect(() => {
    (async () => {
      try { await loadPortfolio(); await loadPositions(); await loadReport(); await loadMarket(); await loadSuggestions(); await loadHistory(); await loadSnapshots(); await loadWeekly(); setLastUpdated(new Date()); }
      catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => { refreshLive(); }, 60000);
    const onVisible = () => { if (document.visibilityState === "visible") { refreshLive(); loadMarket(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rate = settings?.usd_to_xof ?? 600;
  const fcfa = (usd: number) => Math.round(usd * rate).toLocaleString("fr-FR") + " FCFA";
  const signFcfa = (usd: number) => (usd >= 0 ? "+" : "−") + Math.round(Math.abs(usd) * rate).toLocaleString("fr-FR") + " FCFA";
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const fmtTime = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  const cash = portfolio?.cash_balance ?? 0;
  const holdingsValue = positions.reduce((s, p) => s + p.currentValueUsd, 0);
  const totalValue = cash + holdingsValue;
  const starting = portfolio?.starting_capital ?? 0;
  const overallPl = totalValue - starting;
  const overallPlPct = starting > 0 ? (overallPl / starting) * 100 : 0;

  const today = new Date().toISOString().slice(0, 10);
  const todayDay = history?.daily.find((d) => d.date === today) ?? null;

  const concentration = positions.length && totalValue > 0 ? Math.max(...positions.map((p) => p.currentValueUsd / totalValue * 100)) : 0;
  let diversNote = "Aucune position pour l'instant — rien à risquer.";
  let diversTone = "muted";
  if (positions.length > 0) {
    if (concentration >= 50) { diversNote = `Attention : ${concentration.toFixed(0)} % sur une seule valeur. Diversifier réduirait nettement le risque.`; diversTone = "bad"; }
    else if (concentration >= 35) { diversNote = `Concentration modérée (${concentration.toFixed(0)} % sur une valeur). Garde un œil dessus.`; diversTone = "warn"; }
    else { diversNote = "Bien réparti — pas de concentration excessive. 👍"; diversTone = "ok"; }
  }
  const diversColor = diversTone === "bad" ? "text-[#FF6F61]" : diversTone === "ok" ? "text-[#34D39A]" : diversTone === "warn" ? "text-[#E0A53C]" : "text-[#99A19A]";

  function selectForBuy(sym: string) { setSymbol(sym); setMessage(null); buyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }
  async function reloadAll() { await loadPortfolio(); await loadPositions(); await loadHistory(); await loadSnapshots(); setLastUpdated(new Date()); }
  async function logout() { await supabaseBrowser.auth.signOut(); }

  async function addMarket() {
    setAddingMarket(true); setMarketNote(null);
    try {
      const res = await authedFetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: newSym, name: newName, tier: newTier }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setNewSym(""); setNewName(""); setShowAddMarket(false); await loadMarket();
    } catch (e) { setMarketNote(e instanceof Error ? e.message : "Erreur"); }
    finally { setAddingMarket(false); }
  }
  async function removeMarket(sym: string) { try { await authedFetch(`/api/watchlist?symbol=${encodeURIComponent(sym)}`, { method: "DELETE" }); await loadMarket(); } catch {} }

  async function handleBuy() {
    setBuying(true); setMessage(null);
    try {
      const res = await authedFetch("/api/trade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol, amountXof: Number(amount) }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessage({ type: "ok", text: `Acheté ${data.quantity.toFixed(4)} ${data.symbol} à ${data.price.toFixed(2)} $ · liquidités : ${fcfa(data.newCash)}` });
      await reloadAll();
    } catch (e) { setMessage({ type: "err", text: e instanceof Error ? e.message : "Erreur" }); }
    finally { setBuying(false); }
  }
  async function doSell(sym: string, fraction: number) {
    setSelling(true); setMessage(null);
    try {
      const res = await authedFetch("/api/sell", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: sym, fraction }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const word = data.realizedPl >= 0 ? "gain" : "perte";
      const scope = data.partial ? "50 % de " : "";
      setMessage({ type: "ok", text: `Vendu ${scope}${data.symbol} à ${data.price.toFixed(2)} $ · ${word} de ${fcfa(Math.abs(data.realizedPl))}` });
      setConfirmSell(null); await reloadAll();
    } catch (e) { setMessage({ type: "err", text: e instanceof Error ? e.message : "Erreur" }); }
    finally { setSelling(false); }
  }
  async function handleReport() {
    setGenerating(true);
    try { const res = await authedFetch("/api/report", { method: "POST" }); const data = await res.json(); if (data.error) throw new Error(data.error); setReport(data.report); }
    catch (e) { setReport({ title: "Erreur", summary: e instanceof Error ? e.message : "Erreur", risk_level: "faible" }); }
    finally { setGenerating(false); }
  }
  async function handleWeekly() {
    setGeneratingWeekly(true); setWeeklyNote(null);
    try { const res = await authedFetch("/api/weekly", { method: "POST" }); const data = await res.json(); if (data.error) throw new Error(data.error); setWeekly(data.review ?? null); }
    catch (e) { setWeeklyNote(e instanceof Error ? e.message : "Erreur"); }
    finally { setGeneratingWeekly(false); }
  }
  async function askSuggestions() {
    setAskingSug(true);
    try { const res = await authedFetch("/api/suggestions", { method: "POST" }); const data = await res.json(); if (data.error) throw new Error(data.error); setSuggestions(data.suggestions ?? []); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setAskingSug(false); }
  }
  async function resolveSug(id: string, decision: "validate" | "reject") {
    setResolving(true);
    try { const res = await authedFetch("/api/suggestions/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, decision }) }); const data = await res.json(); if (data.error) throw new Error(data.error); await loadSuggestions(); await reloadAll(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setResolving(false); }
  }
  async function sendRecap() {
    setSendingRecap(true); setRecapNote(null);
    try { const res = await authedFetch("/api/recap", { method: "POST" }); const data = await res.json(); if (data.error) throw new Error(data.error); setRecapNote(data.note || "Récap envoyé sur Telegram ✓"); }
    catch (e) { setRecapNote(e instanceof Error ? e.message : "Erreur"); }
    finally { setSendingRecap(false); }
  }

  const W = 600, H = 120;
  let spyPath = ""; let spyUp = true;
  if (market && market.chart.points.length > 1) {
    const pts = market.chart.points; const vals = pts.map((p) => p.close);
    const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
    spyPath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${((i / (pts.length - 1)) * W).toFixed(1)},${(H - ((p.close - min) / range) * H).toFixed(1)}`).join(" ");
    spyUp = pts[pts.length - 1].close >= pts[0].close;
  }
  const CW = 600, CH = 120;
  let valuePath = ""; let valueUp = true; let baseY = 0;
  if (snaps.length > 1) {
    const vals = snaps.map((s) => s.value);
    const min = Math.min(...vals, starting), max = Math.max(...vals, starting), range = max - min || 1;
    const x = (i: number) => (i / (snaps.length - 1)) * CW;
    const y = (v: number) => CH - ((v - min) / range) * CH;
    valuePath = snaps.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.value).toFixed(1)}`).join(" ");
    baseY = y(starting); valueUp = snaps[snaps.length - 1].value >= snaps[0].value;
  }

  const sugLabel = (a: string) => (a === "buy" ? "Achat" : a === "sell" ? "Vente" : "À surveiller");
  const sugBadge = (a: string) => (a === "buy" ? BADGE.ok : a === "sell" ? BADGE.bad : BADGE.warn);

  const card = "bg-[#141B18] border border-[#242D28] rounded-3xl p-5";
  const lbl = "text-[11px] tracking-[0.18em] uppercase text-[#6F776F] font-semibold";
  const btnP = "w-full py-3 rounded-2xl bg-[#34D39A] text-[#07120D] font-semibold active:scale-[0.99] transition disabled:opacity-50";
  const btnG = "w-full py-3 rounded-2xl bg-[#1B2420] border border-[#242D28] text-[#EAEEEA] font-semibold active:scale-[0.99] transition disabled:opacity-50";
  const inp = "w-full px-4 py-3 rounded-2xl bg-[#111714] border border-[#242D28] text-[#EAEEEA] placeholder-[#5C645C] outline-none focus:border-[#34D39A] transition";

  return (
    <main className="min-h-screen bg-[#0B0F0D] text-[#EAEEEA] flex justify-center px-4 pt-6 pb-28">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className={lbl}>Naya · Copilote Marché</p>
            <h1 className="text-2xl font-semibold mt-1 tracking-tight">Tableau de bord</h1>
            {lastUpdated && <p className="text-xs text-[#6F776F] mt-1">🟢 Mis à jour à {fmtTime(lastUpdated)}</p>}
          </div>
          <button onClick={logout} className="text-xs font-semibold text-[#99A19A] bg-[#141B18] border border-[#242D28] px-3 py-2 rounded-xl active:scale-95 transition">Déconnexion</button>
        </div>

        {loading && <p className="text-[#6F776F]">Chargement…</p>}
        {error && <p className="text-[#FF6F61] font-medium">⚠️ {error}</p>}

        {portfolio && settings && !loading && (
          <>
            <div className="rounded-3xl p-6 border border-[#1F2C26] bg-gradient-to-br from-[#16221C] to-[#101714]">
              <p className={lbl}>Portefeuille · simulation</p>
              <p className="text-4xl font-semibold mt-3 tracking-tight tabular-nums">{fcfa(totalValue)}</p>
              <div className="mt-3">
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold border ${overallPl >= 0 ? BADGE.ok : BADGE.bad}`}>{overallPl >= 0 ? "▲" : "▼"} {signFcfa(overallPl)} ({overallPl >= 0 ? "+" : ""}{overallPlPct.toFixed(1)} %)</span>
              </div>
              <p className="text-xs text-[#6F776F] mt-3">Liquidités {fcfa(cash)} · investi {fcfa(holdingsValue)} · départ {fcfa(starting)}</p>
            </div>

            <div className={card}>
              <p className={`${lbl} mb-2`}>Évolution de ton portefeuille</p>
              {snaps.length > 1 ? (
                <>
                  <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full" style={{ height: 100 }} preserveAspectRatio="none">
                    <line x1="0" y1={baseY} x2={CW} y2={baseY} stroke="#3A443E" strokeWidth="1.5" strokeDasharray="5 5" />
                    <path d={valuePath} fill="none" stroke={valueUp ? "#34D39A" : "#FF6F61"} strokeWidth="2.5" />
                  </svg>
                  <div className="flex gap-4 mt-2 text-xs text-[#6F776F]">
                    <span className="flex items-center gap-1"><span className="inline-block w-4 h-[3px]" style={{ background: valueUp ? "#34D39A" : "#FF6F61" }}></span> Ta valeur</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-4 h-[2px] bg-[#3A443E]"></span> Capital de départ</span>
                  </div>
                </>
              ) : (<p className="text-sm text-[#99A19A]">La courbe se construit au fil du temps — un point chaque jour. Reviens demain. 🌱</p>)}
            </div>

            {market && (
              <div className={card}>
                <div className="flex items-center justify-between mb-2">
                  <p className={lbl}>Marché — par niveau de risque</p>
                  <button onClick={() => { setShowAddMarket((v) => !v); setMarketNote(null); }} className={`text-xs font-semibold px-2 py-1 rounded-lg border active:scale-95 transition ${BADGE.ok}`}>{showAddMarket ? "Fermer" : "+ Ajouter"}</button>
                </div>
                {showAddMarket && (
                  <div className="border border-[#242D28] rounded-2xl p-3 mb-3 space-y-2">
                    <input value={newSym} onChange={(e) => setNewSym(e.target.value.toUpperCase())} placeholder="Symbole (ex: AMZN, MSFT)" className={inp} />
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nom affiché (optionnel)" className={inp} />
                    <div className="flex gap-2">
                      {TIERS.map((t) => (<button key={t} onClick={() => setNewTier(t)} className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition active:scale-95 ${newTier === t ? "bg-[#34D39A] text-[#07120D] border-[#34D39A]" : "bg-[#111714] border-[#242D28] text-[#EAEEEA]"}`}>{t}</button>))}
                    </div>
                    <button onClick={addMarket} disabled={addingMarket} className={btnP}>{addingMarket ? "Vérification…" : "Ajouter à ma liste"}</button>
                    {marketNote && <p className="text-sm font-medium text-[#FF6F61]">⚠️ {marketNote}</p>}
                  </div>
                )}
                {TIERS.map((tier) => {
                  const items = market.markets.filter((m) => m.tier === tier);
                  if (items.length === 0) return null;
                  return (
                    <div key={tier} className="mb-2">
                      <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-full border ${TIER_BADGE[tier]}`}>{tier}</span>
                      {items.map((m) => (
                        <div key={m.symbol} className="flex items-center justify-between py-2 border-b border-[#1B231F] last:border-b-0">
                          <div className="pr-2 flex-1">
                            <p className="text-sm font-semibold">{m.name} <span className={`text-xs font-semibold tabular-nums ${m.changePct === null ? "text-[#6F776F]" : m.changePct >= 0 ? "text-[#34D39A]" : "text-[#FF6F61]"}`}>{m.changePct === null ? "" : `${m.changePct >= 0 ? "▲" : "▼"} ${Math.abs(m.changePct)}%`}</span></p>
                            {m.explain && <p className="text-xs text-[#6F776F] mt-0.5">{m.explain}</p>}
                          </div>
                          <div className="flex items-center gap-1 flex-none">
                            <button onClick={() => selectForBuy(m.symbol)} className={`text-xs font-semibold px-3 py-2 rounded-xl border active:scale-95 transition ${BADGE.ok}`}>Acheter</button>
                            <button onClick={() => removeMarket(m.symbol)} title="Retirer" className="text-xs font-semibold text-[#6F776F] bg-[#111714] border border-[#242D28] px-2 py-2 rounded-xl active:scale-95 transition">✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
                {spyPath && (<><svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-2" style={{ height: 80 }} preserveAspectRatio="none"><path d={spyPath} fill="none" stroke={spyUp ? "#34D39A" : "#FF6F61"} strokeWidth="2" /></svg><p className="text-xs text-[#6F776F] mt-1">S&amp;P 500 · 90 jours</p></>)}
              </div>
            )}

            <div className={card}>
              <p className={`${lbl} mb-2`}>Diversification &amp; risque</p>
              <p className={`text-sm font-medium ${diversColor}`}>{diversNote}</p>
            </div>

            <div className={card}>
              <p className={`${lbl} mb-3`}>Suggestions de l'IA</p>
              {suggestions.length === 0 ? (<p className="text-sm text-[#99A19A]">Aucune suggestion en attente. Demande à l'IA d'analyser ta situation.</p>) : (
                <div className="space-y-3">
                  {suggestions.map((s) => (
                    <div key={s.id} className="border border-[#242D28] rounded-2xl p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm">{s.name || s.symbol} <span className="text-xs text-[#6F776F]">({s.symbol})</span></p>
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${sugBadge(s.action)}`}>{sugLabel(s.action)}</span>
                      </div>
                      {s.action === "buy" && s.amount ? <p className="text-xs text-[#6F776F] mt-1">Montant suggéré : {fcfa(s.amount)}</p> : null}
                      {s.action === "sell" ? <p className="text-xs text-[#6F776F] mt-1">{s.fraction && s.fraction < 1 ? `Alléger d'environ ${Math.round((s.fraction ?? 0.5) * 100)} %` : "Vendre toute la position"}</p> : null}
                      <p className="text-sm text-[#C7CEC6] mt-2 leading-relaxed">{s.reason}</p>
                      <p className="text-xs text-[#6F776F] mt-1">Confiance : {CONF[s.confidence] ?? s.confidence}</p>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => resolveSug(s.id, "validate")} disabled={resolving} className={btnP}>{s.action === "buy" ? "Valider l'achat" : s.action === "sell" ? "Valider la vente" : "OK, noté"}</button>
                        <button onClick={() => resolveSug(s.id, "reject")} disabled={resolving} className={btnG}>Refuser</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={askSuggestions} disabled={askingSug} className={`${btnP} mt-3`}>{askingSug ? "L'IA analyse…" : "Demander des suggestions à l'IA"}</button>
            </div>

            <div className={card}>
              <div className="flex items-center justify-between mb-3">
                <p className={lbl}>Le rapport du soir</p>
                {report?.risk_level && (<span className={`text-xs font-semibold px-3 py-1 rounded-full border ${RISK_BADGE[report.risk_level] ?? BADGE.ok}`}>Risque {report.risk_level}</span>)}
              </div>
              {report ? (<><h2 className="text-lg font-semibold">{report.title}</h2><p className="text-sm text-[#C7CEC6] mt-2 leading-relaxed">{report.summary}</p></>) : (<p className="text-sm text-[#99A19A]">Aucun rapport encore.</p>)}
              <button onClick={handleReport} disabled={generating} className={`${btnP} mt-4`}>{generating ? "L'agent analyse…" : "Générer le rapport du soir"}</button>
            </div>

            <div className={card}>
              <p className={`${lbl} mb-3`}>Bilan de la semaine</p>
              {weekly ? (<><p className="text-sm text-[#C7CEC6] leading-relaxed whitespace-pre-line">{weekly.summary}</p><p className="text-xs text-[#6F776F] mt-2">Établi le {fmtDate(weekly.week_end)}</p></>) : (<p className="text-sm text-[#99A19A]">Pas encore de bilan. Génère-le quand tu veux.</p>)}
              <button onClick={handleWeekly} disabled={generatingWeekly} className={`${btnP} mt-4`}>{generatingWeekly ? "Le coach analyse…" : "Générer mon bilan de la semaine"}</button>
              {weeklyNote && <p className="text-sm font-medium text-[#FF6F61] mt-2">{weeklyNote}</p>}
            </div>

            <div ref={buyRef} className={card}>
              <p className={`${lbl} mb-3`}>Passer un achat · simulation</p>
              <div className="space-y-2">
                <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Symbole (ex: SPY, NKE)" className={inp} />
                <div className="flex gap-2">
                  {QUICK_AMOUNTS.map((a) => (<button key={a} onClick={() => setAmount(a)} className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition active:scale-95 ${amount === a ? "bg-[#34D39A] text-[#07120D] border-[#34D39A]" : "bg-[#111714] border-[#242D28] text-[#EAEEEA]"}`}>{Number(a).toLocaleString("fr-FR")} F</button>))}
                </div>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="Montant en FCFA" className={inp} />
                <button onClick={handleBuy} disabled={buying} className={btnP}>{buying ? "Achat en cours…" : "Acheter (simulation)"}</button>
              </div>
              {message && (<p className={`mt-3 text-sm font-medium ${message.type === "ok" ? "text-[#34D39A]" : "text-[#FF6F61]"}`}>{message.type === "ok" ? "✓ " : "⚠️ "}{message.text}</p>)}
            </div>

            <div className={card}>
              <p className={`${lbl} mb-3`}>Mes positions</p>
              {positions.length === 0 ? (<p className="text-sm text-[#99A19A]">Aucune position pour l'instant.</p>) : (
                <div className="space-y-3">
                  {positions.map((p) => (
                    <div key={p.symbol} className="py-2 border-t border-[#1B231F] first:border-t-0">
                      <div className="flex items-center justify-between">
                        <div><p className="font-semibold text-sm">{p.symbol}</p><p className="text-xs text-[#6F776F] tabular-nums">{p.quantity.toFixed(4)} parts · {fcfa(p.currentValueUsd)}</p></div>
                        <div className="text-right">
                          <p className={`text-sm font-semibold tabular-nums ${p.plUsd >= 0 ? "text-[#34D39A]" : "text-[#FF6F61]"}`}>{p.plUsd >= 0 ? "▲" : "▼"} {p.plPct >= 0 ? "+" : ""}{p.plPct}%</p>
                          <p className={`text-xs tabular-nums ${p.plUsd >= 0 ? "text-[#34D39A]" : "text-[#FF6F61]"}`}>{signFcfa(p.plUsd)}</p>
                        </div>
                      </div>
                      {confirmSell === p.symbol ? (
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => doSell(p.symbol, 0.5)} disabled={selling} className="flex-1 py-2 rounded-xl bg-[#E0A53C] text-[#1A1206] text-sm font-semibold active:scale-95 transition disabled:opacity-50">{selling ? "…" : "Vendre 50 %"}</button>
                          <button onClick={() => doSell(p.symbol, 1)} disabled={selling} className="flex-1 py-2 rounded-xl bg-[#FF6F61] text-[#1A0907] text-sm font-semibold active:scale-95 transition disabled:opacity-50">{selling ? "…" : "Vendre tout"}</button>
                          <button onClick={() => setConfirmSell(null)} disabled={selling} className="flex-none py-2 px-3 rounded-xl bg-[#1B2420] border border-[#242D28] text-sm font-semibold active:scale-95 transition">Annuler</button>
                        </div>
                      ) : (<button onClick={() => { setConfirmSell(p.symbol); setMessage(null); }} className={`${btnG} mt-2`}>Vendre</button>)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {history && (
              <div className={card}>
                <p className={`${lbl} mb-2`}>Historique &amp; gains</p>
                <div className="rounded-2xl bg-[#111714] border border-[#242D28] p-3 mb-3">
                  <p className="text-xs text-[#6F776F]">Aujourd'hui</p>
                  <p className={`text-lg font-semibold tabular-nums ${!todayDay || todayDay.sells === 0 ? "text-[#99A19A]" : todayDay.realizedPl >= 0 ? "text-[#34D39A]" : "text-[#FF6F61]"}`}>{!todayDay || todayDay.sells === 0 ? "Aucune vente aujourd'hui" : `${todayDay.realizedPl >= 0 ? "▲" : "▼"} ${signFcfa(todayDay.realizedPl)}`}</p>
                  {todayDay && <p className="text-xs text-[#6F776F] mt-0.5">{todayDay.buys} achat(s) · {todayDay.sells} vente(s)</p>}
                </div>
                <p className="text-sm">Gains réalisés au total : <span className={`font-semibold tabular-nums ${history.totalRealizedPl >= 0 ? "text-[#34D39A]" : "text-[#FF6F61]"}`}>{signFcfa(history.totalRealizedPl)}</span></p>
                <p className="text-xs text-[#6F776F] mt-1">Un gain se « verrouille » à la vente. Avant ça, il est latent.</p>
                {history.daily.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-[#6F776F] mb-1">Par journée</p>
                    {history.daily.slice(0, 10).map((d) => (
                      <div key={d.date} className="flex items-center justify-between py-2 border-b border-[#1B231F] last:border-b-0 text-sm">
                        <span>{fmtDate(d.date)}</span>
                        <span className="text-xs text-[#6F776F]">{d.buys} A · {d.sells} V</span>
                        <span className={`font-semibold tabular-nums ${d.sells === 0 ? "text-[#6F776F]" : d.realizedPl >= 0 ? "text-[#34D39A]" : "text-[#FF6F61]"}`}>{d.sells === 0 ? "—" : signFcfa(d.realizedPl)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4">
                  <p className="text-xs font-semibold text-[#6F776F] mb-1">Par opération</p>
                  {history.operations.length === 0 ? (<p className="text-sm text-[#99A19A]">Aucune opération encore.</p>) : (
                    history.operations.slice(0, 15).map((o, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-[#1B231F] last:border-b-0">
                        <div><p className="text-sm font-semibold">{o.side === "buy" ? "Achat" : "Vente"} {o.symbol}</p><p className="text-xs text-[#6F776F]">{fmtDateTime(o.date)}</p></div>
                        {o.side === "sell" && o.realizedPl !== null ? (<span className={`text-sm font-semibold tabular-nums ${o.realizedPl >= 0 ? "text-[#34D39A]" : "text-[#FF6F61]"}`}>{o.realizedPl >= 0 ? "gain " : "perte "}{signFcfa(o.realizedPl)}</span>) : (<span className="text-sm text-[#99A19A] tabular-nums">{fcfa(o.total)}</span>)}
                      </div>
                    ))
                  )}
                </div>
                <button onClick={sendRecap} disabled={sendingRecap} className={`${btnP} mt-4`}>{sendingRecap ? "Envoi…" : "📲 Envoyer le récap sur Telegram"}</button>
                {recapNote && <p className="text-sm font-medium text-[#34D39A] mt-2">{recapNote}</p>}
              </div>
            )}
          </>
        )}
      </div>
      <BottomNav active="home" />
    </main>
  );
}
