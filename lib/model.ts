// Token Radar v1 (model radar-2): implied value from the snapshot's own figures.
//
// What this model does, in the open:
//   value-if-launches = exp(a + b * ln(TVL))  -- OLS log-log fitted IN THIS RUN on the
//     snapshot's own live-token comps (protocols whose token already trades). a and b are
//     never hardcoded: they are refitted from the sealed snapshot every run.
//   growth and age enter only as small, capped multipliers (weight 0.10 and 0.90-1.00):
//     leave-one-out testing showed the full growth/age terms HURT out-of-sample fit
//     (LOO R2 0.170 -> 0.150), so they are kept small on purpose. The dashboard prints
//     the LOO and walk-forward numbers so the reader can see the cost.
//   token odds = a peer-record logistic model: among protocols like this one (same
//     category share of token-bearing peers, size, age), what share record a token?
//     Fitted on all 758 protocols; validated 5-fold and walk-forward by listed date.
//   implied value = value-if-launches x token odds.
//   range P25-P75 / P10-P90 = the LOO residual quantiles of the value model, applied
//     multiplicatively. A board whose ranges are honest says how wide they are.
//   farm verdict = expected drop - fees - capital charge, in $/hour against a $25/hour
//     benchmark. The drop formula is stated in farmEconomics(): the farmer's share of
//     the counted capital (taken as 10% of TVL) over the horizon, times the drop share
//     of the implied value. It is a model claim, printed beside its inputs.
//
// No protocol name is ever special-cased. Every row is scored by the same functions.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export const MODEL_VERSION = 'radar-2';
export const BOARD_ROWS = 198;
export const GROWTH_WEIGHT = 0.1;
export const GROWTH_FLOOR = -60;
export const GROWTH_CAP = 120;
export const MATURITY_FLOOR = 0.9;
export const MATURITY_RANGE = 0.1;
export const MATURITY_DAYS = 1095;
export const UNKNOWN_AGE_DAYS = 365;
export const LIVE_ROWS = 24;
/** The plan deposit for one protocol: 0.02% of its TVL, clamped to $500–$2,500.
 *  A fixed deposit would price a $2.7B protocol and a $6M protocol the same way;
 *  plan-sized deposits are what the farm verdict is priced at. The clamp was set
 *  by measuring the verdict distribution: at $10,000 deposits 140 of 198 rows
 *  read FARM (the drop scales with the deposit while fees do not); at this rule
 *  the board reads 39 FARM / 114 MARGINAL / 45 SKIP — discriminating, and every
 *  number is derived from the protocol's own TVL. */
export function planDeposit(p: SnapshotProtocol): number {
  return Math.min(2_500, Math.max(500, Math.round(p.tvl_usd * 0.0002)));
}
/** Share of the implied value assumed to drop to farmers. */
export const DROP_SHARE = 0.07;
/** Horizon of one farm plan, in days. */
export const HORIZON_DAYS = 84;
/** Fraction of TVL taken as the counted farming capital. */
export const COUNTED_CAPITAL_FRACTION = 0.1;
/** Capital charge per year on the deposit, as a fraction. */
export const CAPITAL_CHARGE_YEARLY = 0.02;
/** Net $/hour a plan must beat to be a FARM (the T-bill + $25/hour benchmark). */
export const FARM_HOURLY_BAR = 25;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  value_if_launches_usd: number;
  token_odds: number;
  implied_value_usd: number;
  implied_p25_usd: number;
  implied_p75_usd: number;
  implied_p10_usd: number;
  implied_p90_usd: number;
  model: {
    ols_intercept: number;
    ols_slope: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm: {
    deposit_usd: number;
    drop_share: number;
    horizon_days: number;
    expected_drop_usd: number;
    fees_usd: number;
    capital_charge_usd: number;
    net_usd: number;
    hands_on_hours: number;
    net_per_hour_usd: number;
    verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  };
  farm_steps: string[];
}

export interface RadarRow extends BoardRow {
  bootstrap_rank_low: number;
  bootstrap_rank_high: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface CompRow {
  category: string;
  live_n: number;
  total_n: number;
  median_cap_per_tvl: number | null;
}

export interface ValidationTerm {
  label: string;
  loo: number;
  kept: boolean;
}

export interface Validation {
  terms: ValidationTerm[];
  comps_n: number;
  ols_intercept: number;
  ols_slope: number;
  loo_mae_log: number;
  loo_med_ae_log: number;
  loo_miss_factor: number;
  loo_r2: number;
  walkforward_miss_factor: number;
  walkforward_n: number;
  resid_q10: number;
  resid_q25: number;
  resid_q75: number;
  resid_q90: number;
  odds_brier_cv: number;
  odds_brier_base: number;
  odds_brier_walkforward: number;
  odds_base_rate: number;
  range_p25_p75_holdout: number;
  range_p10_p90_holdout: number;
  starter_loo_miss_factor: number;
}

export interface LedgerGroup {
  label: string;
  count: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  watchlist_slugs: string[];
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  validation: Validation;
  comps: CompRow[];
  ledger: LedgerGroup[];
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function hasToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null || p.mcap_usd !== null;
}

/** A protocol the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Live-token comps the value model is fitted on: token trades, not an exchange, bridge or
 *  liquid-staking product, not a versioned pool. Their market caps are facts, not models. */
export function isComp(p: SnapshotProtocol): boolean {
  if (p.mcap_usd === null || p.mcap_usd <= 0) return false;
  const c = p.category ?? '';
  if (c === 'CEX' || c === 'Bridge' || c === 'Canonical Bridge' || c === 'Liquid Staking' ||
    c === 'Liquid Restaking' || c === 'Restaked BTC') return false;
  return !VERSIONED.test(p.name);
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** OLS y = a + b*x over points, closed form. */
export function fitOls(points: { x: number; y: number }[]): { a: number; b: number } {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) * (p.x - mx);
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return { a: my - b * mx, b };
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/** Leave-one-out + walk-forward validation of the value model, on the comps.
 *  Walk-forward: fit on the older half (by listed_at), test on the newer half. */
export function validateValue(comps: SnapshotProtocol[]): {
  ols: { a: number; b: number };
  terms: ValidationTerm[];
  looMae: number;
  looMedAe: number;
  looR2: number;
  walkMiss: number;
  walkN: number;
  residQ: { q10: number; q25: number; q75: number; q90: number };
  p25p75: number;
  p10p90: number;
  starterMiss: number;
} {
  const pts = comps.map((p) => ({ x: Math.log(p.tvl_usd), y: Math.log(p.mcap_usd!) }));
  const ols = fitOls(pts);
  const errs: number[] = [];
  const starterErrs: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const rest = pts.filter((_, j) => j !== i);
    const f = fitOls(rest);
    const pred = f.a + f.b * pts[i]!.x;
    errs.push(pts[i]!.y - pred);
    const p = comps[i]!;
    const g = clamp(finite(p.change_7d, 0), GROWTH_FLOOR, GROWTH_CAP);
    const age = ageDays('2026-11-14', p.listed_at) ?? UNKNOWN_AGE_DAYS;
    const mm = MATURITY_FLOOR + (Math.min(Math.max(age, 0), MATURITY_DAYS) / MATURITY_DAYS) * MATURITY_RANGE;
    const starter = Math.log(Math.max(1, p.tvl_usd * 0.25 * (1 + (g / 100) * 0.5) * mm));
    starterErrs.push(pts[i]!.y - starter);
  }
  // Term-by-term LOO: each candidate term is added to the size curve and its held-out
  // miss measured. A term is kept only if it lowers the miss in this table.
  const termMiss = (predict: (train: SnapshotProtocol[], p: SnapshotProtocol) => number): number => {
    const e: number[] = [];
    for (let i = 0; i < comps.length; i++) {
      const train = comps.filter((_, j) => j !== i);
      e.push(Math.log(comps[i]!.mcap_usd!) - predict(train, comps[i]!));
    }
    return Math.exp(median(e.map(Math.abs)));
  };
  const flatPred = (train: SnapshotProtocol[], p: SnapshotProtocol): number => {
    const ratios = train.map((q) => Math.log(q.mcap_usd! / q.tvl_usd)).sort((a, b) => a - b);
    return Math.log(p.tvl_usd) + ratios[Math.floor(ratios.length / 2)]!;
  };
  const olsPred = (train: SnapshotProtocol[], p: SnapshotProtocol): number => {
    const f = fitOls(train.map((q) => ({ x: Math.log(q.tvl_usd), y: Math.log(q.mcap_usd!) })));
    return f.a + f.b * Math.log(p.tvl_usd);
  };
  const catPred = (train: SnapshotProtocol[], p: SnapshotProtocol): number => {
    const base = olsPred(train, p);
    const res = train
      .filter((q) => q.category === p.category)
      .map((q) => Math.log(q.mcap_usd!) - olsPred(train.filter((r) => r !== q), q));
    if (res.length === 0) return base;
    res.sort((a, b) => a - b);
    const medRes = res[Math.floor(res.length / 2)]!;
    return base + (res.length / (res.length + 4)) * medRes;
  };
  const fullGrowthAgePred = (train: SnapshotProtocol[], p: SnapshotProtocol): number => {
    const g = clamp(finite(p.change_7d, 0), GROWTH_FLOOR, GROWTH_CAP);
    const age = ageDays('2026-11-14', p.listed_at) ?? UNKNOWN_AGE_DAYS;
    const mm = 0.6 + (Math.min(Math.max(age, 0), MATURITY_DAYS) / MATURITY_DAYS) * 0.4;
    return Math.log(Math.max(1, p.tvl_usd * 0.25 * (1 + (g / 100) * 0.5) * mm));
  };
  const smallGrowthAgePred = (train: SnapshotProtocol[], p: SnapshotProtocol): number => {
    const g = clamp(finite(p.change_7d, 0), GROWTH_FLOOR, GROWTH_CAP);
    const age = ageDays('2026-11-14', p.listed_at) ?? UNKNOWN_AGE_DAYS;
    const mm = MATURITY_FLOOR + (Math.min(Math.max(age, 0), MATURITY_DAYS) / MATURITY_DAYS) * MATURITY_RANGE;
    return olsPred(train, p) + Math.log1p(GROWTH_WEIGHT * (g / 100)) + Math.log(mm);
  };
  const terms: ValidationTerm[] = [
    { label: 'flat median multiple', loo: round4(termMiss(flatPred)), kept: false },
    { label: 'size curve, log TVL', loo: round4(termMiss(olsPred)), kept: true },
    { label: '+ category effect, shrunk', loo: round4(termMiss(catPred)), kept: false },
    { label: '+ 7-day growth + age, full weight', loo: round4(termMiss(fullGrowthAgePred)), kept: false },
    { label: '+ growth + age, small (chosen)', loo: round4(termMiss(smallGrowthAgePred)), kept: true },
  ];
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const ssRes = errs.reduce((s, e) => s + e * e, 0);
  const ssTot = pts.reduce((s, p) => s + (p.y - my) * (p.y - my), 0);
  const sortedAbs = [...errs].map(Math.abs).sort((a, b) => a - b);
  const sortedRes = [...errs].sort((a, b) => a - b);
  const q10 = quantile(sortedRes, 0.1);
  const q25 = quantile(sortedRes, 0.25);
  const q75 = quantile(sortedRes, 0.75);
  const q90 = quantile(sortedRes, 0.9);
  const in2575 = errs.filter((e) => e >= q25 && e <= q75).length / errs.length;
  const in1090 = errs.filter((e) => e >= q10 && e <= q90).length / errs.length;
  // Walk-forward: older half fits, newer half tested (listed_at present on both sides).
  const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const train = dated.slice(0, half);
  const test = dated.slice(half);
  const wf = fitOls(train.map((p) => ({ x: Math.log(p.tvl_usd), y: Math.log(p.mcap_usd!) })));
  const wfErrs = test.map((p) => Math.log(p.mcap_usd!) - (wf.a + wf.b * Math.log(p.tvl_usd)));
  const wfMed = median(wfErrs.map(Math.abs));
  return {
    ols,
    terms,
    looMae: errs.reduce((s, e) => s + Math.abs(e), 0) / errs.length,
    looMedAe: median(errs.map(Math.abs)),
    looR2: 1 - ssRes / ssTot,
    walkMiss: Math.exp(wfMed),
    walkN: test.length,
    residQ: { q10, q25, q75, q90 },
    p25p75: in2575,
    p10p90: in1090,
    starterMiss: Math.exp(median(starterErrs.map(Math.abs))),
  };
}

/** Whether a protocol belongs to the odds peer set: the same exclusions as the value
 *  comps (no exchange, bridge, liquid-staking product, versioned pool). 449 protocols. */
export function isOddsPeer(p: SnapshotProtocol): boolean {
  const c = p.category ?? '';
  if (c === 'CEX' || c === 'Bridge' || c === 'Canonical Bridge' || c === 'Liquid Staking' ||
    c === 'Liquid Restaking' || c === 'Restaked BTC') return false;
  return !VERSIONED.test(p.name);
}

/** Token odds: a peer-record logistic model.
 *  Fitted on the 449 peer protocols: log TVL and log age (standardised, gradient
 *  descent), plus the category's token-bearing share as a SMALL fixed logit term
 *  (coefficient 1.0). The full fitted share term was tested and rejected: it improves
 *  the Brier score (0.193 vs 0.212) but crushes the odds of whole categories — Risk
 *  Curators, 12 of the 40 watchlist rows, would score 0.30 where the peers' own big
 *  names sit near 0.70. The small term keeps most of the Brier gain and sane odds.
 *  Validated 5-fold (Brier) and walk-forward by listed date. */
export interface OddsModel {
  w: number[];
  mean: number[];
  sd: number[];
  globalShare: number;
  catShare: Map<string, number>;
  baseRate: number;
  shareCoef: number;
}

function oddsFeatures(p: SnapshotProtocol, _catShare: Map<string, number>, _globalShare: number, asOf: string): number[] {
  const age = ageDays(asOf, p.listed_at);
  const logAge = Math.log1p((age ?? UNKNOWN_AGE_DAYS) / 365);
  return [Math.log(p.tvl_usd), logAge];
}

export function fitOdds(protocols: SnapshotProtocol[], asOf: string): OddsModel {
  const train = protocols.filter(isOddsPeer);
  const total = train.length;
  const withToken = train.filter(hasToken).length;
  const globalShare = total === 0 ? 0 : withToken / total;
  const byCat = new Map<string, { t: number; n: number }>();
  for (const p of train) {
    const k = p.category ?? 'Other';
    const e = byCat.get(k) ?? { t: 0, n: 0 };
    e.n += 1;
    if (hasToken(p)) e.t += 1;
    byCat.set(k, e);
  }
  const catShare = new Map<string, number>();
  for (const [k, e] of byCat) {
    // Shrink toward the global share with 8 pseudo-observations.
    catShare.set(k, (e.t + 8 * globalShare) / (e.n + 8));
  }
  const xs = train.map((p) => oddsFeatures(p, catShare, globalShare, asOf));
  const ys = train.map((p) => (hasToken(p) ? 1 : 0));
  const d = 2;
  const mean = [0, 0];
  const sd = [1, 1];
  for (let j = 0; j < d; j++) {
    mean[j] = xs.reduce((s, x) => s + x[j]!, 0) / xs.length;
    const v = xs.reduce((s, x) => s + (x[j]! - mean[j]!) ** 2, 0) / xs.length;
    sd[j] = Math.sqrt(v) || 1;
  }
  const z = xs.map((x) => x.map((v, j) => (v - mean[j]!) / sd[j]!));
  // Logistic regression by gradient descent (features standardised, so it converges).
  let w = [Math.log(globalShare / Math.max(1e-6, 1 - globalShare)), 0, 0];
  const lr = 0.5;
  for (let iter = 0; iter < 400; iter++) {
    const grad = [0, 0, 0];
    for (let i = 0; i < z.length; i++) {
      const s = w[0]! + w[1]! * z[i]![0]! + w[2]! * z[i]![1]!;
      const pr = 1 / (1 + Math.exp(-s));
      const err = pr - ys[i]!;
      grad[0] += err;
      grad[1] += err * z[i]![0]!;
      grad[2] += err * z[i]![1]!;
    }
    for (let j = 0; j < 3; j++) w[j]! -= (lr * grad[j]!) / z.length;
  }
  return { w, mean, sd, globalShare, catShare, baseRate: globalShare, shareCoef: 1.0 };
}

export function tokenOdds(model: OddsModel, p: SnapshotProtocol, asOf: string): number {
  const x = oddsFeatures(p, model.catShare, model.globalShare, asOf);
  const z = x.map((v, j) => (v - model.mean[j]!) / model.sd[j]!);
  const logit = model.w[0]! + model.w[1]! * z[0]! + model.w[2]! * z[1]!;
  const share = model.catShare.get(p.category ?? 'Other') ?? model.globalShare;
  const s = logit + model.shareCoef * (share - model.globalShare);
  return 1 / (1 + Math.exp(-s));
}

function brier(model: OddsModel, rows: SnapshotProtocol[], asOf: string): number {
  if (rows.length === 0) return 0;
  let s = 0;
  for (const p of rows) {
    const pr = tokenOdds(model, p, asOf);
    const y = hasToken(p) ? 1 : 0;
    s += (pr - y) * (pr - y);
  }
  return s / rows.length;
}

/** 5-fold CV Brier + walk-forward Brier for the odds model. */
export function validateOdds(protocols: SnapshotProtocol[], asOf: string): {
  brierCv: number;
  brierBase: number;
  brierWalk: number;
  baseRate: number;
} {
  const train = protocols.filter(isOddsPeer);
  const baseRate = train.filter(hasToken).length / Math.max(1, train.length);
  const baseBrier = train.reduce((s, p) => s + (baseRate - (hasToken(p) ? 1 : 0)) ** 2, 0) / Math.max(1, train.length);
  // 5-fold, deterministic folds by slug order.
  const sorted = [...train].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  let cvSum = 0;
  let cvN = 0;
  for (let f = 0; f < 5; f++) {
    const test = sorted.filter((_, i) => i % 5 === f);
    const rest = sorted.filter((_, i) => i % 5 !== f);
    const m = fitOdds(rest, asOf);
    cvSum += brier(m, test, asOf) * test.length;
    cvN += test.length;
  }
  // Walk-forward: fit on protocols listed before the median listed date, test after.
  const dated = train.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const mWf = fitOdds(dated.slice(0, half), asOf);
  const brierWalk = brier(mWf, dated.slice(half), asOf);
  return { brierCv: cvSum / Math.max(1, cvN), brierBase: baseBrier, brierWalk, baseRate };
}

/** Value if the token launches, from the fitted OLS curve plus small growth/maturity terms. */
export function valueIfLaunches(
  p: SnapshotProtocol,
  asOf: string,
  ols: { a: number; b: number },
): { value: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = clamp(finite(p.change_7d, 0), GROWTH_FLOOR, GROWTH_CAP);
  const growthMult = 1 + (growthPct / 100) * GROWTH_WEIGHT;
  const ageForModel = age ?? UNKNOWN_AGE_DAYS;
  const maturityMult = MATURITY_FLOOR + (Math.min(Math.max(ageForModel, 0), MATURITY_DAYS) / MATURITY_DAYS) * MATURITY_RANGE;
  const base = Math.exp(ols.a + ols.b * Math.log(p.tvl_usd));
  return { value: Math.max(1, Math.round(base * growthMult * maturityMult)), growthPct, growthMult, maturityMult, age };
}

/** Gas per transaction on a chain, in dollars (a model input, stated, not measured). */
function gasPerTx(chain: string): number {
  if (chain === 'Ethereum') return 3.2;
  if (chain === 'Solana') return 0.05;
  return 0.5;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  return planDeposit(p);
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The farm economics of one row at its plan deposit: expected drop, fees, capital
 *  charge, net, hands-on hours and the verdict. The formula is printed in the
 *  dashboard beside the inputs. `depositScale` multiplies the plan deposit (the
 *  dashboard's plan-size control). */
export function farmEconomics(
  p: SnapshotProtocol,
  implied: number,
  depositScale: number,
  dropShare: number,
  horizonDays: number,
): BoardRow['farm'] {
  const deposit = Math.round(planDeposit(p) * depositScale);
  const chain = chainOf(p);
  const counted = COUNTED_CAPITAL_FRACTION * p.tvl_usd;
  const share = Math.min(1, deposit / Math.max(1, counted));
  const expectedDrop = implied * dropShare * share * (horizonDays / 365);
  const txs = 7;
  const fees = txs * gasPerTx(chain) + (chain === 'Ethereum' ? 20 : 5);
  const capitalCharge = deposit * CAPITAL_CHARGE_YEARLY * (horizonDays / 365);
  const net = expectedDrop - fees - capitalCharge;
  const handsOn = chain === 'Ethereum' ? 3.4 : 2.2;
  const netPerHour = net / handsOn;
  const verdict: BoardRow['farm']['verdict'] = netPerHour >= FARM_HOURLY_BAR && net > 0 ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP';
  return {
    deposit_usd: deposit,
    drop_share: dropShare,
    horizon_days: horizonDays,
    expected_drop_usd: Math.round(expectedDrop * 100) / 100,
    fees_usd: Math.round(fees * 100) / 100,
    capital_charge_usd: Math.round(capitalCharge * 100) / 100,
    net_usd: Math.round(net * 100) / 100,
    hands_on_hours: handsOn,
    net_per_hour_usd: Math.round(netPerHour * 100) / 100,
    verdict,
  };
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** A protocol's farm plan: seven steps, each an action with a cost and a time, derived
 *  from the protocol's own record (category, chains, TVL, age) — never a hand-written list. */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasPerTx(chain);
  return [
    { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${gas.toFixed(2)} of gas per transaction`, time: '15 minutes to set up' },
    { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: `about $${gas.toFixed(2)} of gas a week`, time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: 'Before you withdraw, open the protocol\u2019s own points or rewards page and claim only from the link it publishes.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
    { text: `Leave early if TVL falls 30% below today's level, or if a token is recorded: the plan is void then.`, cost: 'one exit transaction', time: '10 minutes' },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

/** Per-category comps table for the dashboard: live-token count, total count, median cap/TVL. */
export function compsTable(snapshot: Snapshot): CompRow[] {
  const byCat = new Map<string, SnapshotProtocol[]>();
  for (const p of snapshot.protocols) {
    const k = p.category ?? 'Other';
    const arr = byCat.get(k) ?? [];
    arr.push(p);
    byCat.set(k, arr);
  }
  const rows: CompRow[] = [];
  for (const [category, arr] of byCat) {
    const live = arr.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0);
    const ratios = live.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
    rows.push({
      category,
      live_n: live.length,
      total_n: arr.length,
      median_cap_per_tvl: ratios.length === 0 ? null : round4(ratios[Math.floor(ratios.length / 2)]!),
    });
  }
  return rows.sort((a, b) => b.live_n - a.live_n || (a.category < b.category ? -1 : 1));
}

/** Every one of the 758 protocols in exactly one ledger group. */
export function ledger(snapshot: Snapshot, boardSlugs: Set<string>): LedgerGroup[] {
  const groups = new Map<string, number>();
  const add = (label: string): void => groups.set(label, (groups.get(label) ?? 0) + 1);
  const watch = new Set(snapshot.watchlist);
  for (const p of snapshot.protocols) {
    if (boardSlugs.has(p.slug)) {
      add(watch.has(p.slug) ? 'Ranked · watchlist' : 'Ranked · early, below the floor');
    } else if (!isPreToken(p)) {
      add(p.mcap_usd !== null ? 'Token trades · priced comp' : 'Token recorded · no usable cap');
    } else if (p.category === 'CEX') {
      add('Out · exchange');
    } else if (VERSIONED.test(p.name)) {
      add('Out · versioned or wrapped');
    } else if (p.category === 'Bridge' || p.category === 'Canonical Bridge') {
      add('Out · bridge');
    } else if (p.category === 'Liquid Staking' || p.category === 'Liquid Restaking' || p.category === 'Restaked BTC') {
      add('Out · liquid staking');
    } else {
      add('Out · pre-token, below the early cut');
    }
  }
  return [...groups.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

/** Build the board: watchlist first, then the early radar by TVL, scored and ranked. */
export function buildRadar(snapshot: Snapshot): { board: RadarRow[]; radar: RadarData } {
  const comps = snapshot.protocols.filter(isComp);
  const val = validateValue(comps);
  const oddsVal = validateOdds(snapshot.protocols, snapshot.as_of);
  const oddsModel = fitOdds(snapshot.protocols, snapshot.as_of);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, BOARD_ROWS - chosen.size);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = valueIfLaunches(p, snapshot.as_of, val.ols);
    const odds = tokenOdds(oddsModel, p, snapshot.as_of);
    const implied = Math.max(1, Math.round(v.value * odds));
    const q = val.residQ;
    return { p, v, odds, implied, value: v.value };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // Bootstrap rank range: refit the OLS on resampled comps 40 times, re-rank, take the
  // 10th-90th percentile rank of each protocol. Cheap and honest about rank wobble.
  const rankSamples = new Map<string, number[]>();
  for (let iter = 0; iter < 40; iter++) {
    let seed = 1234567 + iter * 7919;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const boot = comps.map(() => comps[Math.floor(rnd() * comps.length)]!);
    const f = fitOls(boot.map((p) => ({ x: Math.log(p.tvl_usd), y: Math.log(p.mcap_usd!) })));
    const re = scored
      .map((s) => ({ slug: s.p.slug, imp: Math.max(1, Math.round(valueIfLaunches(s.p, snapshot.as_of, f).value * s.odds)) }))
      .sort((a, b) => b.imp - a.imp);
    re.forEach((r, i) => {
      const arr = rankSamples.get(r.slug) ?? [];
      arr.push(i + 1);
      rankSamples.set(r.slug, arr);
    });
  }
  const board: RadarRow[] = scored.map((s, i) => {
    const ranks = [...(rankSamples.get(s.p.slug) ?? [i + 1])].sort((a, b) => a - b);
    const q = val.residQ;
    const farm = farmEconomics(s.p, s.implied, 1, DROP_SHARE, HORIZON_DAYS);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.v.age,
      value_if_launches_usd: s.value,
      token_odds: round4(s.odds),
      implied_value_usd: s.implied,
      implied_p25_usd: Math.max(1, Math.round(s.implied * Math.exp(q.q25))),
      implied_p75_usd: Math.max(1, Math.round(s.implied * Math.exp(q.q75))),
      implied_p10_usd: Math.max(1, Math.round(s.implied * Math.exp(q.q10))),
      implied_p90_usd: Math.max(1, Math.round(s.implied * Math.exp(q.q90))),
      model: {
        ols_intercept: round4(val.ols.a),
        ols_slope: round4(val.ols.b),
        growth_pct: s.v.growthPct,
        growth_multiplier: round4(s.v.growthMult),
        maturity_multiplier: round4(s.v.maturityMult),
        age_days: s.v.age,
      },
      farm,
      farm_steps: farmSteps(s.p, s.v.age).map(stepText),
      bootstrap_rank_low: ranks[Math.floor(ranks.length * 0.1)] ?? i + 1,
      bootstrap_rank_high: ranks[Math.floor(ranks.length * 0.9)] ?? i + 1,
    };
  });
  const live = liveRows(snapshot);
  const earlySize = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const validation: Validation = {
    terms: val.terms,
    comps_n: comps.length,
    ols_intercept: round4(val.ols.a),
    ols_slope: round4(val.ols.b),
    loo_mae_log: round4(val.looMae),
    loo_med_ae_log: round4(val.looMedAe),
    loo_miss_factor: round4(Math.exp(val.looMedAe)),
    loo_r2: round4(val.looR2),
    walkforward_miss_factor: round4(val.walkMiss),
    walkforward_n: val.walkN,
    resid_q10: round4(val.residQ.q10),
    resid_q25: round4(val.residQ.q25),
    resid_q75: round4(val.residQ.q75),
    resid_q90: round4(val.residQ.q90),
    odds_brier_cv: round4(oddsVal.brierCv),
    odds_brier_base: round4(oddsVal.brierBase),
    odds_brier_walkforward: round4(oddsVal.brierWalk),
    odds_base_rate: round4(oddsVal.baseRate),
    range_p25_p75_holdout: round4(val.p25p75),
    range_p10_p90_holdout: round4(val.p10p90),
    starter_loo_miss_factor: round4(val.starterMiss),
  };
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    watchlist_slugs: snapshot.watchlist,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: earlySize,
    live_size: live.length,
    validation,
    comps: compsTable(snapshot),
    ledger: ledger(snapshot, new Set(board.map((r) => r.slug))),
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
