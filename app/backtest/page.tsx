"use client";

import { useState, useEffect } from "react";

type Point = { date: string; strat: number; hold: number };
type Result = {
  symbol: string; shortP: number; longP: number; from: string; to: string;
  stratReturn: number; holdReturn: number; trades: number; winRate: number;
  maxDrawdown: number; curve: Point[];
};

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally { setLoading(false); }
  }

  // Lance un exemple automatiquement a l'ouverture
  useEffect(() => { run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const W = 600, H = 200;
  let stratPath = "", holdPath = "";
  if (result && result.curve.length > 1) {
    const vals = result.curve.flatMap((p) => [p.strat, p.hold]);
    const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
    const x = (i: number) => (i / (result.curve.length - 1)) * W;
    const y = (v: number) => H - ((v - min) / range) * H;
    const build = (sel: (p: Point) => number) =>
      result.curve.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(sel(p)).toFixed(1)}`).join(" ");
    stratPath = build((p) => p.strat);
    holdPath = build((p) => p.hold);
  }

  const beats = result ? result.stratReturn > result.holdReturn : false;

  return (
    <main className="min-h-screen bg-[#F6F2E9] text-[#1B1E1A] flex justify-center p-6">
      <div className="w-full max-w-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold">Naya · Copilote Marché</p>
            <h1 className="text-2xl font-semibold mt-1">Backtest — croisement de moyennes</h1>
          </div>
          <a href="/" className="text-xs font-semibold text-[#1F4D3A] bg-white border border-[#E6DFD0] px-3 py-2 rounded-xl hover:bg-[#FCFAF4] transition">← Accueil</a>
        </div>
        <p className="text-sm text-[#6E7268]">Teste la stratégie sur ~2 ans d'historique réel, sans risque.</p>

        <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-[#6E7268]">Symbole
              <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="mt-1 w-full px-3 py-2 rounded-xl border border-[#E6DFD0] outline-none focus:border-[#2F6B4F]" />
            </label>
            <label className="text-xs text-[#6E7268]">MA courte
              <input value={shortP} onChange={(e) => setShortP(e.target.value)} inputMode="numeric" className="mt-1 w-full px-3 py-2 rounded-xl border border-[#E6DFD0] outline-none focus:border-[#2F6B4F]" />
            </label>
            <label className="text-xs text-[#6E7268]">MA longue
              <input value={longP} onChange={(e) => setLongP(e.target.value)} inputMode="numeric" className="mt-1 w-full px-3 py-2 rounded-xl border border-[#E6DFD0] outline-none focus:border-[#2F6B4F]" />
            </label>
          </div>
          <button onClick={run} disabled={loading} className="w-full py-3 rounded-xl bg-[#1F4D3A] text-white font-semibold hover:bg-[#1a4232] transition disabled:opacity-50">
            {loading ? "Calcul en cours…" : "Relancer le backtest"}
          </button>
          {error && <p className="text-[#B0432E] text-sm font-medium">⚠️ {error}</p>}
        </div>

        {loading && !result && <p className="text-[#6E7268] text-sm">Chargement de l'exemple…</p>}

        {result && (
          <>
            <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
              <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold">Résultat · {result.symbol}</p>
              <p className="text-xs text-[#9A9D92] mt-1 mb-4">{result.from} → {result.to} · moyennes {result.shortP}/{result.longP} jours</p>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }} preserveAspectRatio="none">
                <path d={holdPath} fill="none" stroke="#C9C2B2" strokeWidth="2" />
                <path d={stratPath} fill="none" stroke="#2F6B4F" strokeWidth="2.5" />
              </svg>
              <div className="flex gap-4 mt-3 text-xs text-[#6E7268]">
                <span className="flex items-center gap-1"><span className="inline-block w-4 h-[3px] bg-[#2F6B4F]"></span> Stratégie</span>
                <span className="flex items-center gap-1"><span className="inline-block w-4 h-[3px] bg-[#C9C2B2]"></span> Achat &amp; conservation</span>
              </div>
            </div>

            <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm grid grid-cols-2 gap-4">
              <Metric label="Rendement stratégie" value={`${result.stratReturn >= 0 ? "+" : ""}${result.stratReturn}%`} good={result.stratReturn >= 0} />
              <Metric label="Achat & conservation" value={`${result.holdReturn >= 0 ? "+" : ""}${result.holdReturn}%`} good={result.holdReturn >= 0} />
              <Metric label="Nombre de trades" value={`${result.trades}`} />
              <Metric label="Trades gagnants" value={`${result.winRate}%`} />
              <Metric label="Pire baisse" value={`-${result.maxDrawdown}%`} good={false} />
              <Metric label="Verdict" value={beats ? "Bat le marché" : "Sous le marché"} good={beats} />
            </div>

            <p className="text-xs text-[#9A9D92] leading-relaxed">
              ⚠️ Backtest indicatif : sans frais ni slippage, sur une seule période. Le passé ne garantit pas l'avenir. Outil d'apprentissage, pas une promesse.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) {
  const color = good === undefined ? "text-[#1B1E1A]" : good ? "text-[#2F6B4F]" : "text-[#B0432E]";
  return (
    <div>
      <p className="text-xs text-[#6E7268]">{label}</p>
      <p className={`text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}
