type Counter = { inc: (n?: number, labels?: Record<string, string>) => void; value: () => number };
type Gauge = { set: (v: number) => void; value: () => number };
type Series = { name: string; samples: { labels: Record<string, string>; value: number }[] };

function counter(name: string): Counter & { series: Series } {
  const series: Series = { name, samples: [] };
  return {
    inc: (n = 1, labels = {}) => {
      const s = series.samples.find(s => eqLabels(s.labels, labels));
      if (s) { s.value += n; } else { series.samples.push({ labels, value: n }); }
    },
    value: () => series.samples.reduce((a, b) => a + b.value, 0),
    series
  } as Counter & { series: Series };
}

function histogram(name: string) {
  const obs: number[] = [];
  return {
    observe: (n: number) => { obs.push(n); },
    quantile: (q: number) => {
      if (obs.length === 0) return 0;
      const s = [...obs].sort((a, b) => a - b);
      const idx = Math.floor(q * (s.length - 1));
      return s[idx];
    }
  };
}

function gauge(name: string): Gauge & { series: Series } {
  const series: Series = { name, samples: [{ labels: {}, value: 0 }] };
  return {
    set: (v) => series.samples[0].value = v,
    value: () => series.samples[0].value,
    series
  } as Gauge & { series: Series };
}

function eqLabels(a: Record<string, string>, b: Record<string, string>) {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}

export const metrics = {
  runsTotal: counter("deepthink_runs_total"),
  passFailuresTotal: counter("deepthink_pass_failures_total"),
  cacheHitsTotal: counter("deepthink_cache_hits_total"),
  budgetBreachTotal: counter("deepthink_budget_breach_total"),
  earlyExitTotal: counter("deepthink_early_exit_total"),
  tokensTotal: counter("deepthink_tokens_total"),
  costUsdTotal: counter("deepthink_cost_usd_total"),
  p95LatencyMs: histogram("deepthink_latency_ms_p95"),
  verifyScoreGauge: gauge("deepthink_verification_score_gauge")
};

export function metricsResponse(lane = "v2.5"): Response {
  const lines: string[] = [];
  const dumpSeries = (s: Series, type: "counter" | "gauge") => {
    lines.push(`# TYPE ${s.name} ${type}`);
    for (const sample of s.samples) {
      const labels = Object.entries({ ...sample.labels, lane }).map(([k, v]) => `${k}="${v}"`).join(",");
      lines.push(`${s.name}{${labels}} ${sample.value}`);
    }
  };
  dumpSeries(metrics.runsTotal.series, "counter");
  dumpSeries(metrics.passFailuresTotal.series, "counter");
  dumpSeries(metrics.cacheHitsTotal.series, "counter");
  dumpSeries(metrics.budgetBreachTotal.series, "counter");
  dumpSeries(metrics.earlyExitTotal.series, "counter");
  dumpSeries(metrics.tokensTotal.series, "counter");
  dumpSeries(metrics.costUsdTotal.series, "counter");
  lines.push(`# TYPE deepthink_latency_ms_p95 gauge`);
  lines.push(`deepthink_latency_ms_p95{lane="${lane}"} ${metrics.p95LatencyMs.quantile(0.95)}`);
  lines.push(`# TYPE deepthink_verification_score_gauge gauge`);
  lines.push(`deepthink_verification_score_gauge{lane="${lane}"} ${metrics.verifyScoreGauge.value()}`);
  return new Response(lines.join("\n") + "\n", { headers: { "Content-Type": "text/plain; version=0.0.4" } });
}