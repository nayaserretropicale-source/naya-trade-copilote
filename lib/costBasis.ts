export type CostBasisTx = { symbol: string; side: string; quantity: number; price: number };

export function replayCostBasis<T extends CostBasisTx>(txs: T[]): { tx: T; realizedPl: number | null }[] {
  const cost: Record<string, { qty: number; avg: number }> = {};
  const events: { tx: T; realizedPl: number | null }[] = [];
  for (const tx of txs) {
    const c = cost[tx.symbol] || { qty: 0, avg: 0 };
    if (tx.side === "buy") {
      const newQty = c.qty + tx.quantity;
      cost[tx.symbol] = { qty: newQty, avg: newQty > 0 ? (c.qty * c.avg + tx.quantity * tx.price) / newQty : tx.price };
      events.push({ tx, realizedPl: null });
    } else {
      const avg = c.qty > 0 ? c.avg : tx.price;
      const realizedPl = (tx.price - avg) * tx.quantity;
      cost[tx.symbol] = { qty: c.qty - tx.quantity, avg };
      events.push({ tx, realizedPl });
    }
  }
  return events;
}
