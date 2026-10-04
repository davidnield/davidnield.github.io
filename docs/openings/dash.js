// Compute core for the opening dashboard: count files -> W, B, reach, edge,
// attribution. Mirrors python/build_opening_series.py operation for operation
// (same sums, same product order), which is what gate 4 checks to 1e-9.
//
// Data (python/build_site_data.py):
//   data/index.json      months, slices, N, path edges, openings
//   data/nodes/<id>.json T (games continuing), A (arrivals), in {edge: n}
// A series is sparse runs [slice, firstMonth, v0, v1, ...].

export const Z95 = 1.959963984540054;
export const MIN_T = 30;

export function monthLabel(index, i) {
  const [y0, m0] = index.first_month.split("-").map(Number);
  const k = (m0 - 1) + i;
  const y = y0 + Math.floor(k / 12), m = (k % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function monthDate(index, i) {
  const [y, m] = monthLabel(index, i).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

// Run codes (python/build_site_data.py): variable-length base-32 numerals,
// CONT digits then one TERM digit; "z"<k> is k zero months.
const TERM = "0123456789abcdefghijklmnopqrstuv";
const CONT = "ABCDEFGHIJKLMNOPQRSTUVWXYZ-_.~!*";
const DIGIT = new Int8Array(128).fill(-1), IS_TERM = new Uint8Array(128);
for (let i = 0; i < 32; i++) {
  DIGIT[TERM.charCodeAt(i)] = i; IS_TERM[TERM.charCodeAt(i)] = 1;
  DIGIT[CONT.charCodeAt(i)] = i;
}
const ZERO_RUN = "z".charCodeAt(0);

// Add one coded run into out[m0..]; returns the number of months covered.
export function addRun(code, out, m0) {
  let m = m0, acc = 0, zeroNext = false;
  for (let j = 0; j < code.length; j++) {
    const ch = code.charCodeAt(j);
    if (ch === ZERO_RUN) { zeroNext = true; continue; }
    acc = acc * 32 + DIGIT[ch];
    if (!IS_TERM[ch]) continue;
    if (zeroNext) { m += acc; zeroNext = false; } else { out[m] += acc; m += 1; }
    acc = 0;
  }
  return m - m0;
}

// Sum the selected slices of a sparse series into one Float64Array(nMonths).
// Counts are integers well below 2^53, so the sum is exact in any order.
export function sumRuns(runs, sliceMask, nMonths) {
  const out = new Float64Array(nMonths);
  if (!runs) return out;
  for (const r of runs) if (sliceMask[r[0]]) addRun(r[2], out, r[1]);
  return out;
}

export function sliceMask(index, speeds, bands) {
  // speeds / bands: arrays of names / band floors to include
  return index.slices.map(([s, b]) => speeds.includes(index.speeds[s]) && bands.includes(index.bands[b]));
}

// Centered 3-month count pooling, clipped at the ends of the data range.
export function pool(x, smooth) {
  if (smooth === 1) return x;
  const n = x.length, y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    y[i] = x[i];
    if (i > 0) y[i] += x[i - 1];
    if (i < n - 1) y[i] += x[i + 1];
  }
  return y;
}

// Metrics for one month (scalars): N, A numbers; T, n arrays over plies.
export function metricsAt(N, T, n, A) {
  const L = T.length;
  let valid = true;
  for (let i = 0; i < L; i++) if (!(T[i] >= MIN_T) || !(n[i] >= 1)) valid = false;
  const c = new Array(L);
  let W = 1, B = 1, vW = 0, vB = 0;
  for (let i = 0; i < L; i++) {
    c[i] = n[i] / T[i];
    const v = 1 / n[i] - 1 / T[i];
    if (i % 2 === 0) { W = W * c[i]; vW = vW + v; } else { B = B * c[i]; vB = vB + v; }
  }
  const WxB = W * B;
  const rvalid = N >= MIN_T && A >= 1;
  const reach = A / N, vR = 1 / A - 1 / N;
  const P = (x) => (valid ? x : NaN), R = (x) => (rvalid ? x : NaN), PR = (x) => (valid && rvalid ? x : NaN);
  return {
    valid, reach_valid: rvalid, c,
    W: P(W), B: P(B), WxB: P(WxB),
    reach: R(reach), gap: PR(WxB / reach),
    E_white: P(B), E_black: P(W), edge_white: P(1 / W), edge_black: P(1 / B),
    edge_white_reach: PR(B / reach), edge_black_reach: PR(W / reach),
    W_lo: P(Math.exp(Math.log(W) - Z95 * Math.sqrt(vW))), W_hi: P(Math.exp(Math.log(W) + Z95 * Math.sqrt(vW))),
    B_lo: P(Math.exp(Math.log(B) - Z95 * Math.sqrt(vB))), B_hi: P(Math.exp(Math.log(B) + Z95 * Math.sqrt(vB))),
    reach_lo: R(Math.exp(Math.log(reach) - Z95 * Math.sqrt(vR))),
    reach_hi: R(Math.exp(Math.log(reach) + Z95 * Math.sqrt(vR))),
  };
}

export const SERIES_KEYS = ["W", "B", "WxB", "reach", "gap", "E_white", "E_black", "edge_white", "edge_black",
  "edge_white_reach", "edge_black_reach", "W_lo", "W_hi", "B_lo", "B_hi", "reach_lo", "reach_hi"];

// Monthly series over the whole data range (pooling sees the neighbours
// outside the visible window, exactly as the Python does).
export function monthly(cnt, smooth) {
  const N = pool(cnt.N, smooth), A = pool(cnt.A, smooth);
  const T = cnt.T.map((x) => pool(x, smooth)), n = cnt.n.map((x) => pool(x, smooth));
  const M = N.length, out = { valid: new Array(M), reach_valid: new Array(M), c: [] };
  for (const k of SERIES_KEYS) out[k] = new Float64Array(M);
  for (let m = 0; m < M; m++) {
    const r = metricsAt(N[m], T.map((x) => x[m]), n.map((x) => x[m]), A[m]);
    for (const k of SERIES_KEYS) out[k][m] = r[k];
    out.valid[m] = r.valid; out.reach_valid[m] = r.reach_valid; out.c.push(r.c);
  }
  return out;
}

// Raw counts pooled over months m0..m1 inclusive.
export function windowSummary(cnt, m0, m1) {
  const s = (x) => { let t = 0; for (let m = m0; m <= m1; m++) t += x[m]; return t; };
  const r = metricsAt(s(cnt.N), cnt.T.map(s), cnt.n.map(s), s(cnt.A));
  r.T = cnt.T.map(s); r.n = cnt.n.map(s); r.N = s(cnt.N); r.A = s(cnt.A);
  return r;
}

// Log-space attribution over the window (python/attribution.py): baseline =
// geometric mean over the window's first 12 unsuppressed months.
export function attribution(ser, m0, m1, baselineMonths = 12) {
  const idx = [];
  for (let m = m0; m <= m1; m++) idx.push(m);
  const ok = idx.filter((m) => Number.isFinite(ser.W[m]) && Number.isFinite(ser.B[m]));
  const base = ok.slice(0, baselineMonths);
  const out = { months: idx, c_W: [], c_B: [], c_total: [] };
  if (base.length === 0) { for (const _ of idx) { out.c_W.push(NaN); out.c_B.push(NaN); out.c_total.push(NaN); } return out; }
  let sw = 0, sb = 0;
  for (const m of base) { sw += Math.log(ser.W[m]); sb += Math.log(ser.B[m]); }
  const lw0 = sw / base.length, lb0 = sb / base.length;
  for (const m of idx) {
    const cw = Math.log(ser.W[m]) - lw0, cb = Math.log(ser.B[m]) - lb0;
    out.c_W.push(cw); out.c_B.push(cb); out.c_total.push(cw + cb);
  }
  out.base_months = base.length;
  return out;
}

// ---------------------------------------------------------------- loading

export function makeStore(base) {
  const cache = new Map();
  const getJSON = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); });
  const store = {
    index: null,
    async loadIndex() {
      if (!store.index) {
        const ix = await getJSON(`${base}/index.json`);
        // Stored as [eco, name, prefix, extra edges, rank]; expand to
        // [id, eco, name, edge ids, rank] with each path = prefix path + extra.
        const raw = ix.openings, full = new Array(raw.length);
        const path = (i) => {
          if (!full[i]) { const [, , pre, extra] = raw[i]; full[i] = (pre >= 0 ? path(pre) : []).concat(extra); }
          return full[i];
        };
        ix.openings = raw.map((o, i) => [i, o[0], o[1], path(i), o[4]]);
        ix.byId = new Map(ix.openings.map((o) => [o[0], o]));
        ix.pgn = (o) => o[3].map((e, i) => (i % 2 === 0 ? `${i / 2 + 1}. ` : "") + ix.edges[e][2]).join(" ");
        store.index = ix;
      }
      return store.index;
    },
    node(id) {
      if (!cache.has(id)) cache.set(id, getJSON(`${base}/nodes/${id}.json`));
      return cache.get(id);
    },
    // Summed counts for one opening and slice selection.
    async counts(openingId, speeds, bands) {
      const ix = await store.loadIndex();
      const o = ix.byId.get(openingId);
      const eids = o[3];
      const mask = sliceMask(ix, speeds, bands);
      const M = ix.n_months;
      const parents = eids.map((e) => ix.edges[e][0]);
      const children = eids.map((e) => ix.edges[e][1]);
      const nodes = await Promise.all([...parents, children[children.length - 1]].map((v) => store.node(v)));
      const kids = await Promise.all(children.map((v) => store.node(v)));
      return {
        N: sumRuns(ix.N, mask, M),
        T: nodes.slice(0, eids.length).map((nd) => sumRuns(nd.T, mask, M)),
        n: eids.map((e, i) => sumRuns(kids[i].in[String(e)], mask, M)),
        A: sumRuns(nodes[eids.length].A, mask, M),
        edges: eids.map((e) => ix.edges[e]),
      };
    },
    // Everything the page shows; also the gate-4 hook (NaN -> null for JSON).
    async compute(openingId, speeds, bands, m0, m1, smooth) {
      const cnt = await store.counts(openingId, speeds, bands);
      const ser = monthly(cnt, smooth);
      return { cnt, ser, att: attribution(ser, m0, m1), win: windowSummary(cnt, m0, m1) };
    },
  };
  return store;
}

export function toPlain(res, m0, m1) {
  const f = (x) => (Number.isFinite(x) ? x : null);
  const series = {};
  for (const k of SERIES_KEYS) series[k] = Array.from(res.ser[k].slice(m0, m1 + 1), f);
  const win = {};
  for (const k of SERIES_KEYS) win[k] = f(res.win[k]);
  win.c = res.win.c.map(f);
  return { series, attribution: { c_W: res.att.c_W.map(f), c_B: res.att.c_B.map(f), c_total: res.att.c_total.map(f) }, window: win };
}
