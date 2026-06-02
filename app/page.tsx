"use client";

import { useEffect, useRef, useState } from "react";

type Portfolio = { id: string; starting_capital: number; cash_balance: number };
type Settings = { max_per_trade: number; stop_loss_pct: number; require_human_validation: boolean; agents_paused: boolean; usd_to_xof: number };
type Position = { symbol: string; name: string; quantity: number; avgPrice: number; price: number; currentValueUsd: number; costUsd: number; plUsd: number; plPct: number };
type Report = { title: string; summary: string; risk_level: string };
type MarketItem = { symbol: string; name: string; tier: string; explain: string; changePct: number | null };
type Market = { markets: MarketItem[]; chart: { symbol: string; points: { date: string; close: number }[] } };
type Suggestion = { id: string; symbol: string; name: string | null; action: string; amount: number | null; reason: string; confidence: string };

const RISK_STYLE: Record<string, string> = {
  faible: "text-[#1F4D3A] bg-[#EAF1EC] border-[#D4E2D7]",
  modere: "text-[#A9772A] bg-[#F4ECD8] border-[#E6CFa0]",
  eleve: "text-[#B0432E] bg-[#F6E7E2] border-[#E9C9BF]",
};
const TIER_STYLE: Record<string, string> = {
  "Prudent": "text-[#1F4D3A] bg-[#EAF1EC] border-[#D4E2D7]",
  "Équilibré": "text-[#A9772A] bg-[#F4ECD8] border-[#E6CFa0]",
  "Dynamique": "text-[#B0432E] bg-[#F6E7E2] border-[#E9C9BF]",
};
const TIERS = ["Prudent", "Équilibré", "Dynamique"];
const CONF: Record<string, string> = { faible: "faible", moderee: "modérée", elevee: "élevée" };

export default function Home() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [market, setMarket] = useState<Market | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [symbol, setSymbol] = useState("SPY");
  const [amount, setAmount] = useState("15000");
  const [buying, setBuying] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [askingSug, setAskingSug] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [confirmSell, setConfirmSell] = useState<string | null>(null);
  const [selling, setSelling] = useState(false);
  const buyRef = useRef<HTMLDivElement>(null);

  async function loadPortfolio() {
    const res = await fetch("/api/portfolio");
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setPortfolio(data.portfolio); setSettings(data.settings);
  }
  async function loadPositions() { try { const res = await fetch("/api/positions"); const data = await res.json(); setPositions(data.positions ?? []); } catch {} }
  async function loadReport() { const res = await fetch("/api/report"); const data = await res.json(); if (data.report) setReport(data.report); }
  async function loadMarket() { try { const res = await fetch("/api/market"); const data = await res.json(); if (!data.error) setMarket(data); } catch {} }
  async function loadSuggestions() { try { const res = await fetch("/api/suggestions"); const data = await res.json(); setSuggestions(data.suggestions ?? []); } catch {} }

  useEffect(() => {
    (async () => {
      try { await loadPortfolio(); await loadPositions(); await loadReport(); await loadMarket(); await loadSuggestions(); }
      catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
      finally { setLoading(false); }
    })();
  }, []);

  const rate = settings?.usd_to_xof ?? 600;
  const fcfa = (usd: number) => Math.round(usd * rate).toLocaleString("fr-FR") + " FCFA";
  const signFcfa = (usd: number) => (usd >= 0 ? "+" : "−") + Math.round(Math.abs(usd) * rate).toLocaleString("fr-FR") + " FCFA";

  const cash = portfolio?.cash_balance ?? 0;
  const holdingsValue = positions.reduce((s, p) => s + p.currentValueUsd, 0);
  const totalValue = cash + holdingsValue;
  const starting = portfolio?.starting_capital ?? 0;
  const overallPl = totalValue - starting;
  const overallPlPct = starting > 0 ? (overallPl / starting) * 100 : 0;

  const concentration = positions.length && totalValue > 0 ? Math.max(...positions.map((p) => p.currentValueUsd / totalValue * 100)) : 0;
  let diversNote = "Aucune position pour l'instant — rien à risquer.";
  let diversGood: boolean | undefined = undefined;
  if (positions.length > 0) {
    if (concentration >= 50) { diversNote = `Attention : ${concentration.toFixed(0)} % sur une seule valeur. Diversifier réduirait nettement le risque.`; diversGood = false; }
    else if (concentration >= 35) { diversNote = `Concentration modérée (${concentration.toFixed(0)} % sur une valeur). Garde un œil dessus.`; }
    else { diversNote = "Bien réparti — pas de concentration excessive. 👍"; diversGood = true; }
  }

  function selectForBuy(sym: string) { setSymbol(sym); setMessage(null); buyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }

  async function reloadAll() { await loadPortfolio(); await loadPositions(); }

  async function handleBuy() {
    setBuying(true); setMessage(null);
    try {
      const res = await fetch("/api/trade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol, amountXof: Number(amount) }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessage({ type: "ok", text: `Acheté ${data.quantity.toFixed(4)} ${data.symbol} à ${data.price.toFixed(2)} $ · liquidités : ${fcfa(data.newCash)}` });
      await reloadAll();
    } catch (e) { setMessage({ type: "err", text: e instanceof Error ? e.message : "Erreur" }); }
    finally { setBuying(false); }
  }
  async function doSell(sym: string) {
    setSelling(true); setMessage(null);
    try {
      const res = await fetch("/api/sell", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: sym }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const word = data.realizedPl >= 0 ? "gain" : "perte";
      setMessage({ type: "ok", text: `Vendu ${data.symbol} à ${data.price.toFixed(2)} $ · ${word} de ${fcfa(Math.abs(data.realizedPl))}` });
      setConfirmSell(null);
      await reloadAll();
    } catch (e) { setMessage({ type: "err", text: e instanceof Error ? e.message : "Erreur" }); }
    finally { setSelling(false); }
  }
  async function handleReport() {
    setGenerating(true);
    try { const res = await fetch("/api/report", { method: "POST" }); const data = await res.json(); if (data.error) throw new Error(data.error); setReport(data.report); }
    catch (e) { setReport({ title: "Erreur", summary: e instanceof Error ? e.message : "Erreur", risk_level: "faible" }); }
    finally { setGenerating(false); }
  }
  async function askSuggestions() {
    setAskingSug(true);
    try { const res = await fetch("/api/suggestions", { method: "POST" }); const data = await res.json(); if (data.error) throw new Error(data.error); setSuggestions(data.suggestions ?? []); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setAskingSug(false); }
  }
  async function resolveSug(id: string, decision: "validate" | "reject") {
    setResolving(true);
    try {
      const res = await fetch("/api/suggestions/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, decision }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await loadSuggestions(); await reloadAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setResolving(false); }
  }

  const W = 600, H = 120;
  let spyPath = ""; let spyUp = true;
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
            {/* Portefeuille + gains/pertes */}
            <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
              <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold">Portefeuille (simulation)</p>
              <p className="text-3xl font-semibold mt-3">{fcfa(totalValue)}</p>
              <p className={`text-sm font-semibold mt-2 ${overallPl >= 0 ? "text-[#2F6B4F]" : "text-[#B0432E]"}`}>
                {overallPl >= 0 ? "▲" : "▼"} {signFcfa(overallPl)} ({overallPl >= 0 ? "+" : ""}{overallPlPct.toFixed(1)} %) depuis le départ
              </p>
              <p className="text-xs text-[#6E7268] mt-1">Liquidités : {fcfa(cash)} · investi : {fcfa(holdingsValue)} · départ : {fcfa(starting)}</p>
            </div>

            {/* Marché par risque */}
            {market && (
              <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
                <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold mb-2">Marché — par niveau de risque</p>
                {TIERS.map((tier) => (
                  <div key={tier} className="mb-2">
                    <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-full border ${TIER_STYLE[tier]}`}>{tier}</span>
                    {market.markets.filter((m) => m.tier === tier).map((m) => (
                      <div key={m.symbol} className="flex items-center justify-between py-2 border-b border-[#F3EFE4] last:border-b-0">
                        <div className="pr-2">
                          <p className="text-sm font-semibold">{m.name} <span className={`text-xs font-semibold ${m.changePct === null ? "text-[#9A9D92]" : m.changePct >= 0 ? "text-[#2F6B4F]" : "text-[#B0432E]"}`}>{m.changePct === null ? "" : `${m.changePct >= 0 ? "▲" : "▼"} ${Math.abs(m.changePct)}%`}</span></p>
                          <p className="text-xs text-[#6E7268] mt-0.5">{m.explain}</p>
                        </div>
                        <button onClick={() => selectForBuy(m.symbol)} className="flex-none text-xs font-semibold text-[#1F4D3A] bg-[#EAF1EC] border border-[#D4E2D7] px-3 py-2 rounded-xl hover:brightness-95 transition">Acheter</button>
                      </div>
                    ))}
                  </div>
                ))}
                {spyPath && (<><svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-2" style={{ height: 80 }} preserveAspectRatio="none"><path d={spyPath} fill="none" stroke={spyUp ? "#2F6B4F" : "#B0432E"} strokeWidth="2" /></svg><p className="text-xs text-[#9A9D92] mt-1">S&amp;P 500 · 90 jours</p></>)}
              </div>
            )}

            {/* Diversification */}
            <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
              <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold mb-2">Diversification &amp; risque</p>
              <p className={`text-sm font-medium ${diversGood === false ? "text-[#B0432E]" : diversGood === true ? "text-[#2F6B4F]" : "text-[#6E7268]"}`}>{diversNote}</p>
            </div>

            {/* Suggestions IA */}
            <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
              <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold mb-3">Suggestions de l'IA</p>
              {suggestions.length === 0 ? (
                <p className="text-sm text-[#6E7268]">Aucune suggestion en attente. Demande à l'IA d'analyser ta situation.</p>
              ) : (
                <div className="space-y-3">
                  {suggestions.map((s) => (
                    <div key={s.id} className="border border-[#EFEADD] rounded-xl p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm">{s.name || s.symbol} <span className="text-xs text-[#9A9D92]">({s.symbol})</span></p>
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${s.action === "buy" ? "text-[#1F4D3A] bg-[#EAF1EC] border-[#D4E2D7]" : "text-[#A9772A] bg-[#F4ECD8] border-[#E6CFa0]"}`}>{s.action === "buy" ? "Achat" : "À surveiller"}</span>
                      </div>
                      {s.amount ? <p className="text-xs text-[#6E7268] mt-1">Montant suggéré : {fcfa(s.amount)}</p> : null}
                      <p className="text-sm text-[#3A3E36] mt-2 leading-relaxed">{s.reason}</p>
                      <p className="text-xs text-[#9A9D92] mt-1">Confiance : {CONF[s.confidence] ?? s.confidence}</p>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => resolveSug(s.id, "validate")} disabled={resolving} className="flex-1 py-2 rounded-xl bg-[#1F4D3A] text-white text-sm font-semibold hover:bg-[#1a4232] transition disabled:opacity-50">{s.action === "buy" ? "Valider (simulation)" : "OK, noté"}</button>
                        <button onClick={() => resolveSug(s.id, "reject")} disabled={resolving} className="flex-1 py-2 rounded-xl bg-white border border-[#E6DFD0] text-sm font-semibold hover:bg-[#FCFAF4] transition disabled:opacity-50">Refuser</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={askSuggestions} disabled={askingSug} className="w-full mt-3 py-3 rounded-xl bg-[#1F4D3A] text-white font-semibold hover:bg-[#1a4232] transition disabled:opacity-50">{askingSug ? "L'IA analyse ta situation…" : "Demander des suggestions à l'IA"}</button>
            </div>

            {/* Rapport */}
            <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold">Le rapport du soir</p>
                {report?.risk_level && (<span className={`text-xs font-semibold px-3 py-1 rounded-full border ${RISK_STYLE[report.risk_level] ?? RISK_STYLE.faible}`}>Risque {report.risk_level}</span>)}
              </div>
              {report ? (<><h2 className="text-lg font-semibold">{report.title}</h2><p className="text-sm text-[#33372F] mt-2 leading-relaxed">{report.summary}</p></>) : (<p className="text-sm text-[#6E7268]">Aucun rapport encore.</p>)}
              <button onClick={handleReport} disabled={generating} className="w-full mt-4 py-3 rounded-xl bg-[#1F4D3A] text-white font-semibold hover:bg-[#1a4232] transition disabled:opacity-50">{generating ? "L'agent analyse…" : "Générer le rapport du soir"}</button>
            </div>

            {/* Achat */}
            <div ref={buyRef} className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
              <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold mb-3">Passer un achat (simulation)</p>
              <div className="space-y-2">
                <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Symbole (ex: SPY)" className="w-full px-4 py-3 rounded-xl border border-[#E6DFD0] outline-none focus:border-[#2F6B4F]" />
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="Montant en FCFA" className="w-full px-4 py-3 rounded-xl border border-[#E6DFD0] outline-none focus:border-[#2F6B4F]" />
                <button onClick={handleBuy} disabled={buying} className="w-full py-3 rounded-xl bg-[#1F4D3A] text-white font-semibold hover:bg-[#1a4232] transition disabled:opacity-50">{buying ? "Achat en cours…" : "Acheter (simulation)"}</button>
              </div>
              {message && (<p className={`mt-3 text-sm font-medium ${message.type === "ok" ? "text-[#2F6B4F]" : "text-[#B0432E]"}`}>{message.type === "ok" ? "✓ " : "⚠️ "}{message.text}</p>)}
            </div>

            {/* Positions avec gains/pertes + vente */}
            <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
              <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold mb-3">Mes positions</p>
              {positions.length === 0 ? (<p className="text-sm text-[#6E7268]">Aucune position pour l'instant.</p>) : (
                <div className="space-y-3">
                  {positions.map((p) => (
                    <div key={p.symbol} className="py-2 border-t border-[#EFEADD] first:border-t-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">{p.symbol}</p>
                          <p className="text-xs text-[#6E7268]">{p.quantity.toFixed(4)} parts · {fcfa(p.currentValueUsd)}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-semibold ${p.plUsd >= 0 ? "text-[#2F6B4F]" : "text-[#B0432E]"}`}>{p.plUsd >= 0 ? "▲" : "▼"} {p.plPct >= 0 ? "+" : ""}{p.plPct}%</p>
                          <p className={`text-xs ${p.plUsd >= 0 ? "text-[#2F6B4F]" : "text-[#B0432E]"}`}>{signFcfa(p.plUsd)}</p>
                        </div>
                      </div>
                      {confirmSell === p.symbol ? (
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => doSell(p.symbol)} disabled={selling} className="flex-1 py-2 rounded-xl bg-[#B0432E] text-white text-sm font-semibold hover:brightness-95 transition disabled:opacity-50">{selling ? "Vente…" : "Oui, vendre tout"}</button>
                          <button onClick={() => setConfirmSell(null)} disabled={selling} className="flex-1 py-2 rounded-xl bg-white border border-[#E6DFD0] text-sm font-semibold hover:bg-[#FCFAF4] transition">Annuler</button>
                        </div>
                      ) : (
                        <button onClick={() => { setConfirmSell(p.symbol); setMessage(null); }} className="w-full mt-2 py-2 rounded-xl bg-white border border-[#E6DFD0] text-sm font-semibold hover:bg-[#FCFAF4] transition">Vendre</button>
                      )}
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
