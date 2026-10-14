/**
 * Calibrated rain probability from several deterministic models (model output statistics): a logistic
 * regression turns model agreement and amounts, plus how often it rains at the station, into a probability.
 * Also the scores used to judge probabilities: Brier score, Brier skill and reliability.
 */

export type Sample = { p: number; wet: boolean };

export const brier = (s: Sample[]) => s.reduce((a, x) => a + (x.p - (x.wet ? 1 : 0)) ** 2, 0) / s.length;

/** 1 = perfect, 0 = no better than the reference, negative = worse. */
export const brierSkill = (s: Sample[], reference: Sample[]) => 1 - brier(s) / brier(reference);

export function reliability(s: Sample[], bins = 10): Array<{ from: number; to: number; n: number; forecast: number; observed: number }> {
  return Array.from({ length: bins }, (_, b) => {
    const from = b / bins;
    const to = (b + 1) / bins;
    const inBin = s.filter((x) => x.p >= from && (b === bins - 1 ? x.p <= to : x.p < to));
    return {
      from, to, n: inBin.length,
      forecast: inBin.length ? inBin.reduce((a, x) => a + x.p, 0) / inBin.length : NaN,
      observed: inBin.length ? inBin.filter((x) => x.wet).length / inBin.length : NaN,
    };
  });
}

const clampP = (p: number) => Math.min(0.995, Math.max(0.005, p));
export const logit = (p: number) => Math.log(clampP(p) / (1 - clampP(p)));
export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/**
 * Predictors for one day: [1, share of models at or above the threshold, log(1 + mean amount), log(1 + max amount),
 * logit(station climatology)]. `totals` are each model's daily total in mm.
 */
export function features(totals: number[], threshold: number, climatology: number): number[] {
  const n = totals.length;
  const share = totals.filter((t) => t >= threshold).length / n;
  const mean = totals.reduce((a, b) => a + b, 0) / n;
  return [1, share, Math.log1p(mean), Math.log1p(Math.max(...totals)), logit(climatology)];
}

/** Logistic regression by iteratively reweighted least squares with a small ridge penalty (intercept unpenalised). */
export function fitLogistic(X: number[][], y: number[], { ridge = 0.01, iterations = 30 } = {}): number[] {
  const k = X[0].length;
  let w = new Array(k).fill(0);
  for (let it = 0; it < iterations; it++) {
    const H = Array.from({ length: k }, () => new Array(k).fill(0));
    const g = new Array(k).fill(0);
    X.forEach((x, i) => {
      const p = sigmoid(x.reduce((a, v, j) => a + v * w[j], 0));
      const r = p * (1 - p);
      for (let a = 0; a < k; a++) {
        g[a] += (p - y[i]) * x[a];
        for (let b = 0; b < k; b++) H[a][b] += r * x[a] * x[b];
      }
    });
    for (let a = 1; a < k; a++) { g[a] += ridge * X.length * w[a]; H[a][a] += ridge * X.length; }
    const step = solve(H, g);
    w = w.map((v, j) => v - step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-7) break;
  }
  return w;
}

export const predict = (w: number[], x: number[]) => sigmoid(x.reduce((a, v, j) => a + v * w[j], 0));

/** Gaussian elimination with partial pivoting for the small k×k Newton step. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) M[c][c] = 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}
