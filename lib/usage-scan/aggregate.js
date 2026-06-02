// lib/usage-scan/aggregate.js
const LABELS = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini', unknown: 'Other' };

export function byProviderFromRows(rows) {
  const byProv = new Map(); // provider -> { tokens, costUsd, models: Map }
  for (const r of rows) {
    if (r.kind !== 'usage') continue;
    let p = byProv.get(r.provider);
    if (!p) { p = { tokens: 0, costUsd: 0, models: new Map() }; byProv.set(r.provider, p); }
    const tok = (r.input || 0) + (r.output || 0);
    p.tokens += tok;
    p.costUsd += r.cost || 0;
    let m = p.models.get(r.model);
    if (!m) { m = { model: r.model, tokens: 0, costUsd: 0 }; p.models.set(r.model, m); }
    m.tokens += tok;
    m.costUsd += r.cost || 0;
  }
  return [...byProv.entries()]
    .map(([provider, p]) => ({
      provider,
      label: LABELS[provider] || provider,
      tokens: p.tokens,
      costUsd: p.costUsd,
      models: [...p.models.values()].sort((a, b) => b.tokens - a.tokens),
    }))
    .sort((a, b) => b.tokens - a.tokens);
}
