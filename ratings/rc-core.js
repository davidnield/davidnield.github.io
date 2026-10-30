// Shared helpers for every drawing on the page. Loaded before rc-runtime.js, which reads the defaults.
window.RC = (() => {
  const DEFAULTS = {tab: 'convert', from: 'Rapid', to: 'Blitz', month: 'latest', rating: 1500,
    q2group: 'Blitz', q2tc: '3+0', q2month: 'latest', q2rating: 1500, q3group: 'Blitz', q3year: 2025, q3tc: 'Blitz|3+0', q3band: 1500};
  window.RC_DEFAULTS = DEFAULTS;
  const LATEST_FULL_YEAR = 2025;
  const MIN_N = 30;
  const CATS = ['UltraBullet', 'Bullet', 'Blitz', 'Rapid', 'Classical (pre-Nov 2017)', 'Classical', 'Correspondence'];
  const DEFAULT_TC = {Bullet: '1+0', Blitz: '3+0', Rapid: '10+0', Classical: '30+0', 'Classical (pre-Nov 2017)': '10+0'};
  const TEXT_COLS = new Set(['from', 'to', 'group', 'tc', 'tc1', 'tc2', 'pair', 'spec', 'subset', 'variant', 'quarter', 'month', 'id', 'cat_a', 'cat_b', 'from_tc', 'to_tc']);

  const params = () => ({...DEFAULTS, ...dash.params()});
  const ROUGH = 50;   // a conversion whose 95% interval is wider than +-ROUGH is shown as rough
  const rough = (r) => r.hi95 - r.lo95 > 2 * ROUGH;
  const cache = new Map();
  function rows(id) {
    const d = dash.data(id);
    if (d.status !== 'ok' || !Array.isArray(d.data)) return null;
    const c = cache.get(id);
    if (c && c.src === d.data) return c.rows;
    const out = d.data.map((r) => {
      const o = {};
      for (const k in r) {
        const v = r[k];
        if (v === null || v === undefined || v === '') o[k] = null;
        else if (TEXT_COLS.has(k) || typeof v !== 'string') o[k] = v;
        else o[k] = isNaN(+v) ? v : +v;
      }
      return o;
    });
    cache.set(id, {src: d.data, rows: out});
    return out;
  }
  const groups = new Map();
  function group(id, name, keyFn) {
    const r = rows(id);
    if (!r) return null;
    const k = id + '|' + name;
    const c = groups.get(k);
    if (c && c.src === r) return c.map;
    const m = d3.group(r, keyFn);
    groups.set(k, {src: r, map: m});
    return m;
  }
  const enc = (s) => String(s).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D');
  const where = (o) => Object.entries(o).map(([k, v]) => enc(k) + '=' + enc(v)).join('&');
  const snap = (v, step, lo = 400, hi = 3000) => Math.min(hi, Math.max(lo, Math.round((+v || 0) / step) * step));

  // tc "3+2" -> estimated seconds, for ordering
  const tcDur = (tc) => {
    const m = /^([¼½¾\d.]+)\+(\d+)$/.exec(tc || '');
    if (!m) return 1e9;
    const base = {'¼': 0.25, '½': 0.5, '¾': 0.75}[m[1]] ?? +m[1];
    return base * 60 + 40 * +m[2];
  };

  const catColor = (c) => { const i = CATS.indexOf(c); return dash.colors[i < 0 ? 7 : i]; };
  function swatch(key, p) {
    if (key === 'to') return catColor(p.to);
    if (key.startsWith('cat:')) return catColor(key.slice(4));
    return dash.colors[+key] ?? 'var(--cds-chart-muted)';
  }

  // status guard for a chart box: true when every dataset is ready
  function ready(el, ids) {
    for (const id of ids) {
      const st = dash.data(id).status;
      if (st === 'ok') continue;
      el.replaceChildren();
      if (st === 'loading') { el.classList.add('dash-skeleton'); return false; }
      el.classList.remove('dash-skeleton');
      const f = document.createElement('div');
      f.className = 'rc-failed';
      f.textContent = 'Failed to load';
      el.append(f);
      return false;
    }
    el.classList.remove('dash-skeleton');
    return true;
  }
  function empty(el, text) {
    el.replaceChildren();
    const p = document.createElement('div');
    p.className = 'rc-empty';
    p.textContent = text;
    el.append(p);
  }
  function svg(el, h) {
    el.replaceChildren();
    const w = Math.max(260, Math.floor(el.clientWidth || 600));
    const s = d3.select(el).append('svg').attr('class', 'rc-svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`)
      .attr('preserveAspectRatio', 'xMinYMin meet');
    return {svg: s, w, h};
  }
  function textWidth(s, strings, cls = 'rc-tick') {
    const t = s.append('text').attr('class', cls);
    let m = 0;
    for (const str of strings) { t.text(str); m = Math.max(m, t.node().getComputedTextLength()); }
    t.remove();
    return m;
  }
  function tip(el) {
    const t = document.createElement('div');
    t.className = 'rc-tip';
    t.hidden = true;
    el.append(t);
    return {
      show(event, head, lines) {
        t.replaceChildren();
        const h = document.createElement('div');
        h.className = 'rc-tip-head';
        h.textContent = head;
        t.append(h);
        for (const [color, label, value, cls] of lines) {
          const row = document.createElement('div');
          row.className = 'rc-tip-row';
          if (color) {
            const sw = document.createElement('span');
            sw.className = 'rc-sw ' + (cls || '');
            sw.style.background = color;
            sw.style.color = color;
            row.append(sw);
          }
          const l = document.createElement('span');
          l.textContent = label;
          const v = document.createElement('b');
          v.textContent = value;
          row.append(l, v);
          t.append(row);
        }
        t.hidden = false;
        const [x, y] = d3.pointer(event, el);
        const W = el.clientWidth, H = el.clientHeight, tw = t.offsetWidth, th = t.offsetHeight;
        let left = x + 16;
        if (left + tw > W) left = x - tw - 16;
        left = Math.max(0, Math.min(left, W - tw));
        const top = Math.max(0, Math.min(y - th / 2, H - th));
        t.style.left = left + 'px';
        t.style.top = top + 'px';
      },
      hide() { t.hidden = true; },
    };
  }
  // y-axis gridlines + labels, x ticks at the bottom
  function yAxis(s, y, ticks, left, right, fmt) {
    const g = s.append('g');
    g.selectAll('line').data(ticks).join('line').attr('x1', left).attr('x2', right)
      .attr('y1', (d) => y(d)).attr('y2', (d) => y(d)).style('stroke', 'var(--cds-chart-grid)').style('stroke-width', 1);
    g.selectAll('text').data(ticks).join('text').attr('class', 'rc-tick').attr('x', left - 8).attr('y', (d) => y(d))
      .attr('dy', '0.32em').attr('text-anchor', 'end').text(fmt);
  }
  function xAxis(s, x, ticks, yPos, fmt) {
    const g = s.append('g');
    g.append('line').attr('x1', x.range()[0]).attr('x2', x.range()[1]).attr('y1', yPos).attr('y2', yPos).style('stroke', 'var(--cds-chart-axis)');
    g.selectAll('text').data(ticks).join('text').attr('class', 'rc-tick').attr('x', (d) => x(d)).attr('y', yPos + 16)
      .attr('text-anchor', 'middle').text(fmt);
  }

  const fmtInt = d3.format(',');
  const fmtSigned = d3.format('+.1f');
  const fmt1 = d3.format('.1f');
  const fmtR = (v) => (v == null ? '—' : String(Math.round(v)));

  // ---- Q1 state: the chosen pair (one file per direction), month (default: the latest) and rating
  const pairId = (from, to) => `q1p:${dash.fileSafe(from)}__${dash.fileSafe(to)}`;
  const hourName = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`;
  const monthName = (m) => d3.utcFormat('%b %Y')(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1)));
  function q1() {
    const p = params();
    const id = pairId(p.from, p.to);
    const byMonth = group(id, 'month', (r) => r.month);
    if (!byMonth) return null;
    const months = [...byMonth.keys()].sort();
    const month = months.includes(p.month) ? p.month : months[months.length - 1];
    const cur = month ? byMonth.get(month) : [];
    const rating = snap(p.rating, 25);
    const row = cur.find((r) => r.rating === rating) || null;
    return {id, from: p.from, to: p.to, months, month, year: month ? +month.slice(0, 4) : null, rows: cur,
      rating, rating100: snap(rating, 100), row, latest: month === months[months.length - 1]};
  }
  // ---- Q2 state: your time control, month (default: the latest), rating, and for each other time
  // control of the category the rating equivalence. Each file row is one pair, faster tc1 vs slower
  // tc2, with d = rating in tc1 minus rating in tc2 (the pool effect); both directions come from it.
  const q2Cache = new Map();
  function q2Index(id) {
    const r = rows(id);
    if (!r) return null;
    const c = q2Cache.get(id);
    if (c && c.src === r) return c.index;
    const byKey = new Map();      // `${from}|${to}` -> rows, each {month, rating, shift, lo95, hi95, n}
    const add = (from, to, v) => { const k = `${from}|${to}`; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(v); };
    for (const x of r) {
      const base = {month: x.month, rating: x.rating, n: x.n};
      add(x.tc2, x.tc1, {...base, shift: x.d, lo95: x.lo95, hi95: x.hi95});
      add(x.tc1, x.tc2, {...base, shift: -x.d, lo95: -x.hi95, hi95: -x.lo95});
    }
    const tcs = [...new Set(r.flatMap((x) => [x.tc1, x.tc2]))].sort((a, b) => tcDur(a) - tcDur(b));
    const months = [...new Set(r.map((x) => x.month))].sort();
    const index = {byKey, tcs, months};
    q2Cache.set(id, {src: r, index});
    return index;
  }
  function q2() {
    const p = params();
    const id = `q2m:${dash.fileSafe(p.q2group)}`;
    const ix = q2Index(id);
    if (!ix) return null;
    const tc = ix.tcs.includes(p.q2tc) ? p.q2tc : ix.tcs.includes(DEFAULT_TC[p.q2group]) ? DEFAULT_TC[p.q2group] : ix.tcs[0];
    const month = ix.months.includes(p.q2month) ? p.q2month : ix.months[ix.months.length - 1];
    const rating = snap(p.q2rating, 25);
    const targets = ix.tcs.filter((t) => t !== tc);
    const series = (t) => ix.byKey.get(`${tc}|${t}`) || [];
    const rows = targets.map((t) => series(t).find((r) => r.month === month && r.rating === rating) || null);
    return {id, group: p.q2group, tcs: ix.tcs, tc, months: ix.months, month, latest: month === ix.months[ix.months.length - 1],
      rating, targets, series, rows};
  }

  return {DEFAULTS, LATEST_FULL_YEAR, MIN_N, CATS, params, rough, rows, group, where, snap, tcDur, catColor, swatch,
    ready, empty, svg, textWidth, tip, yAxis, xAxis, fmtInt, fmtSigned, fmt1, fmtR, q1, q2, pairId, monthName, hourName};
})();
