// Compute core for the opening dashboard: count files -> W, B, reach, edge,
// attribution. Mirrors python/build_opening_series.py operation for operation
// (same sums, same product order), which is what gate 4 checks to 1e-9.
//
// Data (python/build_site_data.py, format 2):
//   data/index.json      months, slices, N, root node, named openings
//   data/nodes/<id>.json one position: T (games continuing), D = A - T (or A),
//                        in [[parent, SAN, n]] (edges into it), out [[SAN,
//                        child, all-time results]] (edges out of it)
//   data/positions.json  lazy: FEN-prefix key -> node, for re-entering the tree
// A series is sparse runs [slice, firstMonth, code].

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

// Run codes for a short tuple (the all-time results [w, d, b]).
function decodeTuple(code) {
  const out = new Float64Array(8);
  const k = addRun(code, out, 0);
  return Array.from(out.slice(0, k));
}

// The key positions.json uses: FEN placement, side to move, castling (and the
// en-passant field only for the few S positions that differ in nothing else).
export const posKey3 = (fen) => fen.split(" ").slice(0, 3).join(" ");
export const posKey4 = (fen) => fen.split(" ").slice(0, 4).join(" ");

export function makeStore(base) {
  const cache = new Map();
  let positions = null;
  const getJSON = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); });
  const store = {
    index: null,
    async loadIndex() {
      if (!store.index) {
        const ix = await getJSON(`${base}/index.json`);
        // Stored as [eco, name, prefix, "extra SAN", rank, final node]; expand to
        // objects whose moves = prefix's moves + extra.
        const raw = ix.openings, moves = new Array(raw.length);
        const mv = (i) => {
          if (!moves[i]) { const [, , pre, extra] = raw[i]; moves[i] = (pre >= 0 ? mv(pre) : []).concat(extra ? extra.split(" ") : []); }
          return moves[i];
        };
        ix.openings = raw.map((o, i) => ({ id: i, eco: o[0], name: o[1], moves: mv(i), rank: o[4], final: o[5] }));
        ix.byId = new Map(ix.openings.map((o) => [o.id, o]));
        // named openings ending at each node (a position can carry several names)
        ix.namesAt = new Map();
        for (const o of ix.openings) {
          if (!ix.namesAt.has(o.final)) ix.namesAt.set(o.final, []);
          ix.namesAt.get(o.final).push(o);
        }
        ix.pgn = (moves) => moves.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ` : "") + m).join(" ");
        store.index = ix;
      }
      return store.index;
    },
    node(id) {
      if (!cache.has(id)) cache.set(id, getJSON(`${base}/nodes/${id}.json`));
      return cache.get(id);
    },
    async positions() {
      if (!positions) positions = getJSON(`${base}/positions.json`);
      return positions;
    },
    // Position key (from a FEN) -> node id, or null when outside the tree.
    async nodeOfFen(fen) {
      const p = await store.positions();
      return p[posKey4(fen)] ?? p[posKey3(fen)] ?? null;
    },
    // Follow SAN moves from the start along tree edges. inTree = how many of
    // the moves stay in the tree; panels use exactly that prefix (the Python
    // reference, build_opening_series.line_edges, does the same).
    async resolve(moves) {
      const ix = await store.loadIndex();
      let v = ix.root;
      const edges = [];
      for (const m of moves) {
        const nd = await store.node(v);
        const hit = (nd.out || []).find((o) => o[0] === m);
        if (!hit) break;
        edges.push({ parent: v, san: m, child: hit[1] });
        v = hit[1];
      }
      return { edges, node: v, inTree: edges.length };
    },
    // Summed counts along an in-tree chain of edges for a slice selection.
    async countsFor(edges, speeds, bands) {
      const ix = await store.loadIndex();
      const mask = sliceMask(ix, speeds, bands);
      const M = ix.n_months;
      const parents = await Promise.all(edges.map((e) => store.node(e.parent)));
      const kids = await Promise.all(edges.map((e) => store.node(e.child)));
      const fin = kids[kids.length - 1];
      const Tfin = sumRuns(fin.T, mask, M);
      let A;
      if (fin.A) A = sumRuns(fin.A, mask, M);
      else { const D = sumRuns(fin.D, mask, M); A = new Float64Array(M); for (let m = 0; m < M; m++) A[m] = Tfin[m] + D[m]; }
      return {
        N: sumRuns(ix.N, mask, M),
        T: parents.map((nd) => sumRuns(nd.T, mask, M)),
        n: edges.map((e, i) => sumRuns(kids[i].in.find((r) => r[0] === e.parent && r[1] === e.san)[2], mask, M)),
        A,
        edges,
      };
    },
    // Everything the panels show for a line; null when no move is in the tree.
    async compute(moves, speeds, bands, m0, m1, smooth) {
      const line = await store.resolve(moves);
      if (!line.inTree) return { line, cnt: null };
      const cnt = await store.countsFor(line.edges, speeds, bands);
      const ser = monthly(cnt, smooth);
      return { line, cnt, ser, att: attribution(ser, m0, m1), win: windowSummary(cnt, m0, m1) };
    },
    // The explorer table at one position over months m0..m1 (selected slices):
    // each tree edge out of it with games and share of T, "other moves" =
    // T minus the stored edges, and all-time results for the selected slices.
    async explorer(nodeId, speeds, bands, m0, m1) {
      const ix = await store.loadIndex();
      const mask = sliceMask(ix, speeds, bands);
      const M = ix.n_months;
      const nd = await store.node(nodeId);
      const win = (x) => { let t = 0; for (let m = m0; m <= m1; m++) t += x[m]; return t; };
      const T = win(sumRuns(nd.T, mask, M));
      const outs = nd.out || [];
      const kids = await Promise.all(outs.map((o) => store.node(o[1])));
      const rows = outs.map((o, i) => {
        const n = win(sumRuns(kids[i].in.find((r) => r[0] === nodeId && r[1] === o[0])[2], mask, M));
        const wdl = [0, 0, 0];
        for (const [sl, code] of o[2]) if (mask[sl]) { const t = decodeTuple(code); wdl[0] += t[0]; wdl[1] += t[1]; wdl[2] += t[2]; }
        return { san: o[0], child: o[1], n, share: T ? n / T : NaN, wdl };
      });
      const other = T - rows.reduce((a, r) => a + r.n, 0);
      return { T, rows, other, other_share: T ? other / T : NaN };
    },
  };
  return store;
}

export function toPlain(res, m0, m1) {
  const f = (x) => (Number.isFinite(x) ? x : null);
  if (!res.cnt) return { inTree: 0, series: null, attribution: null, window: null };
  const series = {};
  for (const k of SERIES_KEYS) series[k] = Array.from(res.ser[k].slice(m0, m1 + 1), f);
  const win = {};
  for (const k of SERIES_KEYS) win[k] = f(res.win[k]);
  win.c = res.win.c.map(f);
  return { inTree: res.line.inTree, series, attribution: { c_W: res.att.c_W.map(f), c_B: res.att.c_B.map(f), c_total: res.att.c_total.map(f) }, window: win };
}
