"use client";

import { useEffect, useState } from "react";

type Portfolio = { id: string; starting_capital: number; cash_balance: number };
type Settings = { max_per_trade: number; agents_paused: boolean; usd_to_xof: number };
type Holding = { symbol: string; quantity: number; avg_price: number };
type Report = { title: string; summary: string; risk_level: string; date?: string };

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [symbol, setSymbol] = useState("AAPL");
  const [amount, setAmount] = useState("15000");
  const [buying, setBuying] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [generating, setGenerating] = useState(false);

  async function loadPortfolio() {
    const res = await fetch("/api/portfolio");
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setPortfolio(data.portfolio);
    setSettings(data.settings);
    setHoldings(data.holdings ?? []);
  }

  async function loadReport() {
    const res = await fetch("/api/report");
    const data = await res.json();
    if (data.report) setReport(data.report);
  }

  useEffect(() => {
    (async () => {
      try { await loadPortfolio(); await loadReport(); }
      catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
      finally { setLoading(false); }
    })();
  }, []);

  const rate = settings?.usd_to_xof ?? 600;
  const fcfa = (usd: number) => Math.round(usd * rate).toLocaleString("fr-FR") + " FCFA";

  async function handleBuy() {
    setBuying(true); setMessage(null);
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, amountXof: Number(amount) }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessage({ type: "ok", text: `Acheté ${data.quantity.toFixed(4)} ${data.symbol} à ${data.price.toFixed(2)} $ · liquidités : ${fcfa(data.newCash)}` });
      await loadPortfolio();
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Erreur" });
    } finally { setBuying(false); }
  }

  async function handleReport() {
    setGenerating(true);
    try {
      const res = await fetch("/api/report", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setReport(data.report);
    } catch (e) {
      setReport({ title: "Erreur", summary: e instanceof Error ? e.message : "Erreur", risk_level: "faible" });
    } finally { setGenerating(false); }
  }

  return (
    <main className="min-h-screen bg-[#F6F2E9] text-[#1B1E1A] flex justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <div>
          <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold">Naya · Copilote Marché</p>
          <h1 className="text-2xl font-semibold mt-1">Tableau de bord</h1>
        </div>

        {loading && <p className="text-[#6E7268]">Chargement…</p>}
        {error && <p className="text-[#B0432E] font-medium">⚠️ {error}</p>}

        {portfolio && settings && !loading && (
          <>
            {/* Rapport du soir */}
            <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold">Le rapport du soir</p>
                {report?.risk_level && (
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${RISK_STYLE[report.risk_level] ?? RISK_STYLE.faible}`}>
                    Risque {report.risk_level}
                  </span>
                )}
              </div>
              {report ? (
                <>
                  <h2 className="text-lg font-semibold">{report.title}</h2>
                  <p className="text-sm text-[#33372F] mt-2 leading-relaxed">{report.summary}</p>
                </>
              ) : (
                <p className="text-sm text-[#6E7268]">Aucun rapport encore. Génère-le ci-dessous.</p>
              )}
              <button
                onClick={handleReport}
                disabled={generating}
                className="w-full mt-4 py-3 rounded-xl bg-[#1F4D3A] text-white font-semibold hover:bg-[#1a4232] transition disabled:opacity-50"
              >
                {generating ? "L'agent analyse…" : "Générer le rapport du soir"}
              </button>
            </div>

            {/* Liquidités */}
            <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
              <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold">Liquidités disponibles</p>
              <p className="text-3xl font-semibold mt-3">{fcfa(portfolio.cash_balance)}</p>
              <p className="text-sm text-[#6E7268] mt-2">Capital de départ : {fcfa(portfolio.starting_capital)}</p>
            </div>

            {/* Achat */}
            <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
              <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold mb-3">Passer un achat (simulation)</p>
              <div className="space-y-2">
                <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Symbole (ex: AAPL)" className="w-full px-4 py-3 rounded-xl border border-[#E6DFD0] outline-none focus:border-[#2F6B4F]" />
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="Montant en FCFA" className="w-full px-4 py-3 rounded-xl border border-[#E6DFD0] outline-none focus:border-[#2F6B4F]" />
                <button onClick={handleBuy} disabled={buying} className="w-full py-3 rounded-xl bg-[#1F4D3A] text-white font-semibold hover:bg-[#1a4232] transition disabled:opacity-50">
                  {buying ? "Achat en cours…" : "Acheter (simulation)"}
                </button>
              </div>
              {message && (
                <p className={`mt-3 text-sm font-medium ${message.type === "ok" ? "text-[#2F6B4F]" : "text-[#B0432E]"}`}>
                  {message.type === "ok" ? "✓ " : "⚠️ "}{message.text}
                </p>
              )}
            </div>

            {/* Positions */}
            <div className="bg-white border border-[#E6DFD0] rounded-2xl p-6 shadow-sm">
              <p className="text-xs tracking-widest uppercase text-[#9A9D92] font-semibold mb-3">Mes positions</p>
              {holdings.length === 0 ? (
                <p className="text-sm text-[#6E7268]">Aucune position pour l'instant.</p>
              ) : (
                <div className="space-y-2">
                  {holdings.map((h) => (
                    <div key={h.symbol} className="flex items-center justify-between py-2 border-t border-[#EFEADD] first:border-t-0">
                      <div>
                        <p className="font-semibold text-sm">{h.symbol}</p>
                        <p className="text-xs text-[#6E7268]">{h.quantity.toFixed(4)} parts · prix moyen {fcfa(h.avg_price)}</p>
                      </div>
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
