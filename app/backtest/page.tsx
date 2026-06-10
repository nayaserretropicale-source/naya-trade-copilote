"use client";

import { useState, useEffect } from "react";

type Point = { date: string; strat: number; hold: number };
type Result = {
  symbol: string; shortP: number; longP: number; from: string; to: string;
  stratReturn: number; holdReturn: number; trades: number; winRate: number;
  maxDrawdown: number; curve: Point[];
};

function IconHome() { return (<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10" /></svg>); }
function IconChart() { return (<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-6" /></svg>); }
function IconNews() { return (<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v14H4zM8 9h8M8 13h8M8 17h5" /></svg>); }
function IconSend() { return (<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>); }
function BottomNav({ active }: { active: string }) {
  const items = [{ key: "home", label: "Accueil", href: "/", icon: <IconHome /> }, { key: "backtest", label: "Backtest", href: "/backtest", icon: <IconChart /> }, { key: "actu", label: "Actu", href: "/actualite", icon: <IconNews /> }, { key: "telegram", label: "Telegram", href: "/telegram", icon: <IconSend /> }];
  return (<nav className="fixed inset-x-0 bottom-0 z-50 bg-[#0A0F0C]/90 backdrop-blur-xl border-t border-[#1A231D]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}><div className="max-w-md mx-auto flex justify-around items-stretch px-2 py-2">{items.map((it) => (<a key={it.key} href={it.href} className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition active:scale-95 ${active === it.key ? "text-[#36C27D]" : "text-[#69736A]"}`}>{it.icon}<span className="text-[10px] font-semibold tracking-wide">{it.label}</span></a>))}</div></nav>);
}

export default function Backtest() {
  const [symbol, setSymbol] = useState("AAPL");
  const [shortP, setShortP] = useState("20");
  const [longP, setLongP] = useState("50");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch(`/api/backtest?symbol=${symbol}&short=${shortP}&long=${longP}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setLoading(false); }
  }

  useEffect(() => { document.body.style.backgroundColor = "#0C120E"; run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const W = 600, H = 200;
  let stratPath = "", holdPath = "";
  if (result && result.curve.length > 1) {
    const vals = result.curve.flatMap((p) => [p.strat, p.hold]);
    const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
    const x = (i: number) => (i / (result.curve.length - 1)) * W;
    const y = (v: number) => H - ((v - min) / range) * H;
    const build = (sel: (p: Point) => number) => result.curve.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(sel(p)).toFixed(1)}`).join(" ");
    stratPath = build((p) => p.strat);
    holdPath = build((p) => p.hold);
  }
  const beats = result ? result.stratReturn > result.holdReturn : false;

  const card = "bg-[#141C17] border border-[#243029] rounded-3xl p-5";
  const lbl = "text-[11px] tracking-[0.16em] uppercase text-[#69736A] font-semibold";
  const inp = "mt-1 w-full px-3 py-2 rounded-xl bg-[#111814] border border-[#243029] text-[#ECF0EA] outline-none focus:border-[#36C27D] transition";

  return (
    <main className="min-h-screen bg-[#0C120E] text-[#ECF0EA] flex justify-center px-4 pt-6 pb-28">
      <div className="w-full max-w-md space-y-4">
        <div>
          <p className={lbl}>Naya · Copilote Marché</p>
          <h1 className="text-2xl font-semibold mt-1 tracking-tight">Backtest — croisement de moyennes</h1>
          <p className="text-sm text-[#8C968B] mt-2">Teste la stratégie sur ~2 ans d'historique réel, sans risque.</p>
        </div>

        <div className={`${card} space-y-3`}>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-[#8C968B]">Symbole<input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className={inp} /></label>
            <label className="text-xs text-[#8C968B]">MA courte<input value={shortP} onChange={(e) => setShortP(e.target.value)} inputMode="numeric" className={inp} /></label>
            <label className="text-xs text-[#8C968B]">MA longue<input value={longP} onChange={(e) => setLongP(e.target.value)} inputMode="numeric" className={inp} /></label>
          </div>
          <button onClick={run} disabled={loading} className="w-full py-3 rounded-2xl bg-[#36C27D] text-[#06140C] font-semibold active:scale-[0.99] transition disabled:opacity-50">{loading ? "Calcul en cours…" : "Relancer le backtest"}</button>
          {error && <p className="text-[#E8705D] text-sm font-medium">⚠️ {error}</p>}
        </div>

        {loading && !result && <p className="text-[#69736A] text-sm">Chargement de l'exemple…</p>}

        {result && (
          <>
            <div className={card}>
              <p className={lbl}>Résultat · {result.symbol}</p>
              <p className="text-xs text-[#69736A] mt-1 mb-4">{result.from} → {result.to} · moyennes {result.shortP}/{result.longP} jours</p>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }} preserveAspectRatio="none">
                <path d={holdPath} fill="none" stroke="#69736A" strokeWidth="2" />
                <path d={stratPath} fill="none" stroke="#36C27D" strokeWidth="2.5" />
              </svg>
              <div className="flex gap-4 mt-3 text-xs text-[#8C968B]">
                <span className="flex items-center gap-1"><span className="inline-block w-4 h-[3px] bg-[#36C27D]"></span> Stratégie</span>
                <span className="flex items-center gap-1"><span className="inline-block w-4 h-[3px] bg-[#69736A]"></span> Achat &amp; conservation</span>
              </div>
            </div>

            <div className={`${card} grid grid-cols-2 gap-4`}>
              <Metric label="Rendement stratégie" value={`${result.stratReturn >= 0 ? "+" : ""}${result.stratReturn}%`} good={result.stratReturn >= 0} />
              <Metric label="Achat & conservation" value={`${result.holdReturn >= 0 ? "+" : ""}${result.holdReturn}%`} good={result.holdReturn >= 0} />
              <Metric label="Nombre de trades" value={`${result.trades}`} />
              <Metric label="Trades gagnants" value={`${result.winRate}%`} />
              <Metric label="Pire baisse" value={`-${result.maxDrawdown}%`} good={false} />
              <Metric label="Verdict" value={beats ? "Bat le marché" : "Sous le marché"} good={beats} />
            </div>

            <p className="text-xs text-[#69736A] leading-relaxed">⚠️ Backtest indicatif : sans frais ni slippage, sur une seule période. Le passé ne garantit pas l'avenir. Outil d'apprentissage, pas une promesse.</p>
          </>
        )}
      </div>
      <BottomNav active="backtest" />
    </main>
  );
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) {
  const color = good === undefined ? "text-[#ECF0EA]" : good ? "text-[#36C27D]" : "text-[#E8705D]";
  return (
    <div>
      <p className="text-xs text-[#69736A]">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
