"use client";

import { useEffect, useRef, useState } from "react";

type Portfolio = { id: string; starting_capital: number; cash_balance: number };
type Settings = { max_per_trade: number; stop_loss_pct: number; require_human_validation: boolean; agents_paused: boolean; usd_to_xof: number };
type Holding = { symbol: string; quantity: number; avg_price: number };
type Report = { title: string; summary: string; risk_level: string };
type Index = { name: string; symbol: string; price: number | null; changePct: number | null };
type Market = { indices: Index[]; chart: { symbol: string; points: { date: string; close: number }[] } };

const RISK_STYLE: Record<string, string> = {
  faible: "text-[#1F4D3A] bg-[#EAF1EC] border-[#D4E2D7]",
  modere: "text-[#A9772A] bg-[#F4ECD8] border-[#E6CFa0]",
  eleve: "text-[#B0432E] bg-[#F6E7E2] border-[#E9C9BF]",
};

export default function Home() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [symbol, setSymbol] = useState("AAPL");
  const [amount, setAmount] = useState("15000");
  const [buying, setBuying] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const buyRef = useRef<HTMLDivElement>(null);

  async function loadPortfolio() {
    const res = await fetch("/api/portfolio");
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setPortfolio(data.portfolio); setSettings(data.settings); setHoldings(data.holdings ?? []);
  }
  async function loadReport() {
    const res = await fetch("/api/report");
    const data = await res.json();
    if (data.report) setReport(data.report);
  }
  async function loadMarket() {
    try { const res = await fetch("/api/market"); const data = await res.json(); if (!data.error) setMarket(data); } catch {}
  }

  useEffect(() => {
    (async () => {
      try { await loadPortfolio(); await loadReport(); await loadMarket(); }
      catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
      finally { setLoading(false); }
    })();
  }, []);

  const rate = settings?.usd_to_xof ?? 600;
  const fcfa = (usd: number) => Math.round(usd * rate).toLocaleString("fr-FR") + " FCFA";

  const holdingsValue = holdings.reduce((s, h) => s + h.quantity * h.avg_price, 0);
  const totalValue = holdingsValue + (portfolio?.cash_balance ?? 0);
  const concentration = holdings.length && totalValue > 0
    ? Math.max(...holdings.map((h) => (h.quantity * h.avg_price) / totalValue * 100)) : 0;
  let diversNote = "Aucune position pour l'instant — rien à risquer.";
  let diversGood: boolean | undefined = undefined;
  if (holdings.length > 0) {
    if (concentration >= 50) { diversNote = `Attention : ${concentration.toFixed(0)} % de ton portefeuille est sur une seule valeur. Diversifier réduirait nettement le risque.`; diversGood = false; }
    else if (concentration >= 35) { diversNote = `Concentration modérée (${concentration.toFixed(0)} % sur une valeur). Garde un œil dessus.`; }
    else { diversNote = "Bien réparti — pas de concentration excessive. 👍"; diversGood = true; }
  }

  function selectForBuy(sym: string) {
    setSymbol(sym);
    setMessage(null);
    buyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handleBuy() {
    setBuying(true); setMessage(null);
    try {
      const res = await fetch("/api/trade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol, amountXof: Number(amount) }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessage({ type: "ok", text: `Acheté ${data.quantity.toFixed(4)} ${data.symbol} à ${data.price.toFixed(2)} $ · liquidités : ${fcfa(data.newCash)}` });
      await loadPortfolio();
    } catch (e) { setMessage({ type: "err", text: e instanceof Error ? e.message : "Erreur" }); }
    finally { setBuying(false); }
  }
  async function handleReport() {
    setGenerating(true);
    try {
      const res = await fetch("/api/report", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setReport(data.report);
    } catch (e) { setReport({ title: "Erreur", summary: e instanceof Error ? e.message : "Erreur", risk_level: "faible" }); }
    finally { setGenerating(false); }
  }

  const W = 600, H = 120;
  let spyPath = "";
  let spyUp = true;
  if (market && market.chart.points.length > 1) {
    const pts = market.chart.points;
    const vals = pts.map((p) => p.close);
    const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
    spyPath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${((i / (pts.length - 1)) * W).toFixed(1)},${(H - ((p.close - min) / range) * H).toFixed(1)}`).join(" ");
    spyUp = pts[pts.length - 1].close >= pts[0].close;
  }

  return (
    <main className="min-h-screen bg-[#F6F2E9] text-[#1B1E1A] flex justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold">Naya · Copilote Marché</p>
            <h1 className="text-2xl font-semibold mt-1">Tableau de bord</h1>
          </div>
          <a href="/backtest" className="text-xs font-semibold text-[#1F4D3A] bg-white border border-[#E6DFD0] px-3 py-2 rounded-xl hover:bg-[#FCFAF4] transition">📊 Backtest</a>
        </div>

        {loading && <p className="text-[#6E7268]">Chargement…</p>}
        {error && <p className="text-[#B0432E] font-medium">⚠️ {error}</p>}

        {portfolio && settings && !loading && (
          <>
            {market && (
              <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
                <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold mb-2">Marché aujourd'hui</p>
                <div className="mb-3">
                  {market.indices.map((idx) => (
                    <div key={idx.symbol} className="flex items-center justify-between py-2 border-t border-[#EFEADD] first:border-t-0">
                      <div>
                        <p className="text-sm font-semibold">{idx.name}</p>
                        <p className={`text-xs font-semibold ${idx.changePct === null ? "text-[#9A9D92]" : idx.changePct >= 0 ? "text-[#2F6B4F]" : "text-[#B0432E]"}`}>
                          {idx.changePct === null ? "—" : `${idx.changePct >= 0 ? "▲" : "▼"} ${Math.abs(idx.changePct)}% aujourd'hui`}
                        </p>
                      </div>
                      <button onClick={() => selectForBuy(idx.symbol)} className="text-xs font-semibold text-[#1F4D3A] bg-[#EAF1EC] border border-[#D4E2D7] px-3 py-2 rounded-xl hover:brightness-95 transition">
                        Acheter
                      </button>
                    </div>
                  ))}
                </div>
                {spyPath && (
                  <>
                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 90 }} preserveAspectRatio="none">
                      <path d={spyPath} fill="none" stroke={spyUp ? "#2F6B4F" : "#B0432E"} strokeWidth="2" />
                    </svg>
                    <p className="text-xs text-[#9A9D92] mt-1">S&amp;P 500 (SPY) · 90 derniers jours · acheter un indice = diversification instantanée</p>
                  </>
                )}
              </div>
            )}

            <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
              <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold">Portefeuille (simulation)</p>
              <p className="text-3xl font-semibold mt-3">{fcfa(totalValue)}</p>
              <p className="text-sm text-[#6E7268] mt-2">Dont liquidités : {fcfa(portfolio.cash_balance)} · départ : {fcfa(portfolio.starting_capital)}</p>
            </div>

            <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
              <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold mb-2">Diversification &amp; risque</p>
              <p className={`text-sm font-medium ${diversGood === false ? "text-[#B0432E]" : diversGood === true ? "text-[#2F6B4F]" : "text-[#6E7268]"}`}>{diversNote}</p>
            </div>

            <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold">Le rapport du soir</p>
                {report?.risk_level && (<span className={`text-xs font-semibold px-3 py-1 rounded-full border ${RISK_STYLE[report.risk_level] ?? RISK_STYLE.faible}`}>Risque {report.risk_level}</span>)}
              </div>
              {report ? (<><h2 className="text-lg font-semibold">{report.title}</h2><p className="text-sm text-[#33372F] mt-2 leading-relaxed">{report.summary}</p></>) : (<p className="text-sm text-[#6E7268]">Aucun rapport encore.</p>)}
              <button onClick={handleReport} disabled={generating} className="w-full mt-4 py-3 rounded-xl bg-[#1F4D3A] text-white font-semibold hover:bg-[#1a4232] transition disabled:opacity-50">{generating ? "L'agent analyse…" : "Générer le rapport du soir"}</button>
            </div>

            <div ref={buyRef} className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
              <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold mb-3">Passer un achat (simulation)</p>
              <div className="space-y-2">
                <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Symbole (ex: AAPL)" className="w-full px-4 py-3 rounded-xl border border-[#E6DFD0] outline-none focus:border-[#2F6B4F]" />
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="Montant en FCFA" className="w-full px-4 py-3 rounded-xl border border-[#E6DFD0] outline-none focus:border-[#2F6B4F]" />
                <button onClick={handleBuy} disabled={buying} className="w-full py-3 rounded-xl bg-[#1F4D3A] text-white font-semibold hover:bg-[#1a4232] transition disabled:opacity-50">{buying ? "Achat en cours…" : "Acheter (simulation)"}</button>
              </div>
              {message && (<p className={`mt-3 text-sm font-medium ${message.type === "ok" ? "text-[#2F6B4F]" : "text-[#B0432E]"}`}>{message.type === "ok" ? "✓ " : "⚠️ "}{message.text}</p>)}
            </div>

            <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
              <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold mb-3">Mes positions</p>
              {holdings.length === 0 ? (<p className="text-sm text-[#6E7268]">Aucune position pour l'instant.</p>) : (
                <div className="space-y-2">
                  {holdings.map((h) => (
                    <div key={h.symbol} className="flex items-center justify-between py-2 border-t border-[#EFEADD] first:border-t-0">
                      <div><p className="font-semibold text-sm">{h.symbol}</p><p className="text-xs text-[#6E7268]">{h.quantity.toFixed(4)} parts · prix moyen {fcfa(h.avg_price)}</p></div>
                      <span className="text-sm font-semibold text-[#1F4D3A]">{fcfa(h.quantity * h.avg_price)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
