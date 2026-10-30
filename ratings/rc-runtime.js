// Page runtime for the rating-conversion dashboard on a static site.
//
// The page's drawing code was written against a small "dash" interface; this file provides
// it for GitHub Pages:
//   dash.data(id)        -> {status: "loading" | "ok" | "error", data: rows}; the first call
//                           fetches data/<file>.csv?v=<release> and parses it with d3.csvParse
//   dash.draw(name, fn)  -> fn(el) for every visible [data-draw=name] element, on each redraw
//   dash.onData(fn)      -> fn() before the drawings, on each redraw
//   dash.params()        -> the current selections, also kept in the page URL (#key=value&...)
//   dash.setParams(obj)  -> change selections (null removes one) and redraw
//   dash.colors          -> the categorical palette, in slot order
// A redraw follows any data arriving, any selection change and any change of page width.
(() => {
  const VERSION = document.querySelector('meta[name="rc-version"]')?.content || "dev";
  const DEFAULTS = window.RC_DEFAULTS || {};

  // dataset id -> file. Pair and grid files are named by their categories.
  function fileFor(id) {
    if (id.startsWith("q1p:")) return `data/q1/${id.slice(4)}.csv`;
    if (id.startsWith("q1g:")) return `data/q1_grid/${id.slice(4)}.csv`;
    if (id.startsWith("q2m:")) return `data/q2/${id.slice(4)}.csv`;
    return `data/${id}.csv`;
  }
  const url = (path) => new URL(`${path}?v=${VERSION}`, document.baseURI).href;
  const fileSafe = (s) => s.replace(/[^A-Za-z0-9]+/g, "_");

  const sources = new Map();
  function data(id) {
    let s = sources.get(id);
    if (!s) {
      s = {status: "loading", data: []};
      sources.set(id, s);
      fetch(url(fileFor(id)))
        .then((r) => { if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.text(); })
        .then((text) => { s.data = d3.csvParse(text); s.status = "ok"; })
        .catch((e) => { s.status = "error"; s.message = String(e); console.error(`rating dashboard: ${id}:`, e); })
        .finally(schedule);
    }
    return s;
  }

  // selections: defaults, overridden by the URL hash
  const typed = (k, v) => (typeof DEFAULTS[k] === "number" && v !== "" && !isNaN(+v) ? +v : v);
  let state = {...DEFAULTS};
  function readHash() {
    const q = new URLSearchParams(location.hash.slice(1));
    state = {...DEFAULTS};
    for (const [k, v] of q) if (k in DEFAULTS) state[k] = typed(k, v);
  }
  function writeHash() {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(state)) if (v !== DEFAULTS[k] && v != null) q.set(k, v);
    const h = q.toString();
    history.replaceState(null, "", h ? `#${h}` : location.pathname + location.search);
  }
  readHash();
  window.addEventListener("hashchange", () => { readHash(); schedule(); });

  const draws = new Map();
  const listeners = [];
  let pending = false;
  // A zero-delay timer batches every change made in the same moment into one redraw. (Not
  // requestAnimationFrame: it never fires in a tab that isn't painting, which left a page
  // opened in the background blank.)
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(run, 0);
  }
  function run() {
    pending = false;
    for (const fn of listeners) safely(fn);
    for (const [name, fn] of draws) {
      document.querySelectorAll(`[data-draw="${name}"]`).forEach((el) => {
        if (!el.closest("[hidden]")) safely(() => fn(el));
      });
    }
  }
  function safely(fn) {
    try { fn(); } catch (e) { console.error("rating dashboard:", e); }
  }

  window.dash = {
    data,
    draw(name, fn) { draws.set(name, fn); schedule(); },
    onData(fn) { listeners.push(fn); schedule(); },
    params: () => ({...state}),
    setParams(obj) {
      for (const [k, v] of Object.entries(obj)) {
        if (v === null || v === undefined) state[k] = DEFAULTS[k];
        else state[k] = v;
      }
      writeHash();
      schedule();
    },
    setLink() {},
    colors: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
    fileSafe,
  };

  let lastWidth = 0;
  new ResizeObserver((entries) => {
    const w = Math.round(entries[0].contentRect.width);
    if (w !== lastWidth) { lastWidth = w; schedule(); }
  }).observe(document.documentElement);
})();
