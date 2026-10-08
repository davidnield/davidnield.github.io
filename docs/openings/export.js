// One-button PNG export for the dashboard's charts. No external services:
// the chart (an Observable Plot SVG, rebuilt at the preset's width and height),
// its title, subtitle, legend and footer are composed into one SVG, drawn onto
// a canvas at the preset's scale over a white background, and saved as a PNG.
//
// Presets (design px, rendered at `scale`):
//   phone   600 x 750 (4:5)  x3 = 1800 x 2250   default; text >= 9 px on a 375 px screen
//   square  600 x 600 (1:1)  x3 = 1800 x 1800
//   wide    960 x 540 (16:9) x2 = 1920 x 1080
//   banner  the v1.4/v1.5 export: 1000 px plot + 28 px padding, plot 300/280 high, x2
// For a preset with a height, the text blocks are laid out first and the plot
// gets what is left, so the whole image hits the aspect ratio. If that would
// leave the plot under minPlot px the image grows taller instead ("grew").
//
// SVG drawn as an image cannot load web fonts, so the export uses a system
// sans-serif stack throughout (measured with the same stack, so text wraps
// where it is drawn).

export const EXPORT_FONT = "Arial, Helvetica, 'Liberation Sans', sans-serif";
const NS = "http://www.w3.org/2000/svg";
const INK = "#0b0b0b", INK2 = "#52514e", MUTED = "#898781", GRID = "#e1e0d9";

// f: font px in design units. Phone-readable means >= 9 px when the image is
// shown full width on a 375 px screen: px >= 9 * W / 375 (14.4 at W=600, 23.04 at W=960).
export const PRESETS = {
  phone:  { id: "phone",  label: "Phone (4:5)",  suffix: "4x5",  W: 600,  H: 750,  scale: 3, pad: 22, minPlot: 180,
            f: { title: 26, sub: 16, legend: 16, foot: 15, axis: 16 } },
  square: { id: "square", label: "Square (1:1)", suffix: "1x1",  W: 600,  H: 600,  scale: 3, pad: 22, minPlot: 180,
            f: { title: 26, sub: 16, legend: 16, foot: 15, axis: 16 } },
  wide:   { id: "wide",   label: "Wide (16:9)",  suffix: "16x9", W: 960,  H: 540,  scale: 2, pad: 32, minPlot: 240,
            f: { title: 30, sub: 24, legend: 24, foot: 24, axis: 24 } },
  banner: { id: "banner", label: "Banner (2:1)", suffix: "2x1",  W: 1056, H: null, scale: 2, pad: 28, minPlot: 0, legacy: true,
            f: { title: 22, sub: 15, legend: 13, foot: 12, axis: 13 } },
};
export const DEFAULT_PRESET = "phone";
const STORE_KEY = "dash.export.preset";
let current = (() => {
  try { const v = sessionStorage.getItem(STORE_KEY) ?? localStorage.getItem(STORE_KEY); if (PRESETS[v]) return v; } catch (e) { /* no storage: fine */ }
  return DEFAULT_PRESET;
})();
const listeners = new Set();
function setPreset(id) {
  if (!PRESETS[id]) return;
  current = id;
  for (const k of ["sessionStorage", "localStorage"]) { try { window[k].setItem(STORE_KEY, id); } catch (e) { /* ignore */ } }
  for (const fn of listeners) fn(id);
}

export function slug(s) {
  return String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "x";
}

function el(tag, attrs = {}, parent, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

let measureCtx = null;
function wrap(text, px, weight, maxW) {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  measureCtx.font = `${weight} ${px}px ${EXPORT_FONT}`;
  const words = String(text).split(/\s+/).filter(Boolean), lines = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (measureCtx.measureText(t).width <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return { lines, width: (s) => measureCtx.measureText(s).width };
}

function textBlock(svg, text, { x, y, px, weight = 400, fill = INK, maxW, lineH = 1.3 }) {
  const { lines } = wrap(text, px, weight, maxW);
  lines.forEach((ln, i) => el("text", { x, y: y + px + i * px * lineH, "font-family": EXPORT_FONT, "font-size": px, "font-weight": weight, fill }, svg, ln));
  return lines.length * px * lineH;
}

function blockHeight(text, px, weight, maxW, lineH) {
  return wrap(text, px, weight, maxW).lines.length * px * lineH;
}

// legend: [{ label, color, kind: "line" | "dashed" | "box" | "area" }]. px = 13 is
// the banner's size; the keys and gaps scale with the text.
function legendRows(legend, px, maxW) {
  const r = px / 13, gap = 22 * r, key = 22 * r, rowH = px * 1.7;
  measureCtx ??= document.createElement("canvas").getContext("2d");
  measureCtx.font = `400 ${px}px ${EXPORT_FONT}`;
  const placed = [];
  let cx = 0, row = 0;
  for (const it of legend) {
    const w = key + 6 * r + measureCtx.measureText(it.label).width;
    if (cx > 0 && cx + w > maxW) { cx = 0; row++; }
    placed.push({ it, cx, row });
    cx += w + gap;
  }
  return { placed, height: (row + 1) * rowH, r, key, rowH };
}

function legendRow(svg, legend, { x, y, px, maxW }) {
  const { placed, height, r, key, rowH } = legendRows(legend, px, maxW);
  for (const { it, cx, row } of placed) {
    const X = x + cx, cy = y + row * rowH, my = cy + px * 0.65;
    if (it.kind === "box") el("rect", { x: X, y: my - 6 * r, width: 12 * r, height: 12 * r, rx: 2 * r, fill: it.color }, svg);
    else if (it.kind === "area") el("rect", { x: X, y: my - 6 * r, width: 12 * r, height: 12 * r, rx: 2 * r, fill: it.color, "fill-opacity": 0.25 }, svg);
    else el("line", { x1: X, x2: X + 18 * r, y1: my, y2: my, stroke: it.color, "stroke-width": 2.5 * r, ...(it.kind === "dashed" ? { "stroke-dasharray": `${5 * r},${4 * r}` } : {}) }, svg);
    el("text", { x: X + key + 2 * r, y: cy + px, "font-family": EXPORT_FONT, "font-size": px, fill: INK2 }, svg, it.label);
  }
  return height;
}

// Compose one export for preset P. build(w, h, P) returns the chart: an <svg> (or a
// <figure> holding one) w px wide and h high (h undefined = the chart's own height).
// Returns { svg, width, height, plotHeight, grew }.
export function compose({ build, title, subtitle, legend = [], footer, source }, P) {
  const { W, pad, f } = P, cw = W - 2 * pad, maxW = cw;
  const g = f.title / 22;                       // spacing grows with the type
  const svg = el("svg", { xmlns: NS, width: W, viewBox: `0 0 ${W} 100` });
  const bg = el("rect", { x: 0, y: 0, width: W, height: 100, fill: "#ffffff" }, svg);
  let y = pad - 6 * g;
  y += textBlock(svg, title, { x: pad, y, px: f.title, weight: 700, fill: INK, maxW });
  y += 4 * g;
  if (subtitle) y += textBlock(svg, subtitle, { x: pad, y, px: f.sub, fill: INK2, maxW, lineH: 1.35 });
  y += 12 * g;
  if (legend.length) y += legendRow(svg, legend, { x: pad, y, px: f.legend, maxW }) + 4 * g;
  const plotY = y;
  // what sits under the plot: gap, rule, gap, footer, source, bottom padding
  const footH = footer ? blockHeight(footer, f.foot, 400, maxW, 1.35) : 0;
  const srcH = source ? blockHeight(source, f.foot, 700, maxW, 1.3) : 0;
  const below = 10 * g + 6 * g + footH + srcH + pad - 6 * g;
  let plotH, grew = false;
  if (P.H) {
    plotH = P.H - plotY - below;
    if (plotH < P.minPlot) { plotH = P.minPlot; grew = true; }
  }
  const chart = build(cw, plotH, P);
  const plot = chart.tagName.toLowerCase() === "svg" ? chart : chart.querySelector("svg");
  const ch = +plot.getAttribute("height");
  const c = plot.cloneNode(true);
  c.setAttribute("x", pad); c.setAttribute("y", plotY);
  c.setAttribute("width", cw); c.setAttribute("height", ch);
  if (!c.getAttribute("viewBox")) c.setAttribute("viewBox", `0 0 ${cw} ${ch}`);
  c.style.color = INK2;
  c.style.fontFamily = EXPORT_FONT;
  c.style.background = "transparent";
  for (const t of c.querySelectorAll("[aria-label='tip']")) t.remove();   // a hover tooltip, if one is showing
  svg.appendChild(c);
  y = plotY + ch + 10 * g;
  el("line", { x1: pad, x2: W - pad, y1: y, y2: y, stroke: GRID }, svg);
  y += 6 * g;
  if (footer) y += textBlock(svg, footer, { x: pad, y, px: f.foot, fill: MUTED, maxW, lineH: 1.35 });
  if (source) y += textBlock(svg, source, { x: pad, y: y + 2, px: f.foot, weight: 700, fill: INK2, maxW });
  const H = P.H && !grew ? P.H : Math.ceil(y + pad - 6 * g);
  svg.setAttribute("height", H);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  bg.setAttribute("height", H);
  return { svg, width: W, height: H, plotHeight: ch, grew };
}

export async function toPngBlob({ svg, width, height }, scale = 2) {
  const xml = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("export: SVG did not render")); img.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob(res, "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function saveBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// The page calls this from each chart's button; spec = { build(w, h, P), title,
// subtitle, legend, footer, source, filename }. The filename gets the preset's
// suffix (..._4x5.png). A "dash-export" event carries the composed SVG (tests).
export async function exportChart(spec, { preset = current, download = true } = {}) {
  const P = PRESETS[preset] ?? PRESETS[DEFAULT_PRESET];
  const composed = compose(spec, P);
  const blob = await toPngBlob(composed, P.scale);
  const filename = spec.filename.replace(/\.png$/i, "") + `_${P.suffix}.png`;
  document.dispatchEvent(new CustomEvent("dash-export", { detail: { composed, preset: P.id, filename, scale: P.scale } }));
  if (download) saveBlob(blob, filename);
  return { blob, filename, preset: P.id, grew: composed.grew, plotHeight: composed.plotHeight,
           width: Math.round(composed.width * P.scale), height: Math.round(composed.height * P.scale) };
}

// A chart with a size choice and a "Download" button above it, right-aligned. The
// size is a native <select>: keyboard and touch work as everywhere else and its
// menu is the browser's own, so no page container can clip it.
export function chartWithDownload(chart, getSpec, label = "Download this chart as a PNG image") {
  const box = document.createElement("div");
  box.className = "dash-chart";
  const bar = document.createElement("div");
  bar.className = "dash-dlbar";
  const sel = document.createElement("select");
  sel.className = "dash-size";
  sel.setAttribute("aria-label", "Image size for the PNG download");
  sel.title = "Image size for the PNG download";
  for (const P of Object.values(PRESETS)) sel.add(new Option(P.label, P.id));
  sel.value = current;
  sel.addEventListener("change", () => setPreset(sel.value));
  listeners.add((id) => { if (sel.value !== id) sel.value = id; });
  const b = document.createElement("button");
  b.type = "button";
  b.className = "dash-dl";
  b.setAttribute("aria-label", label);
  b.title = label;
  b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" width="12" height="12"><path d="M8 1v9m0 0L4.5 6.5M8 10l3.5-3.5M2 13.5h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Download</span>';
  b.addEventListener("click", async () => {
    b.disabled = true;
    try { await exportChart(getSpec(), { preset: sel.value }); } catch (e) { console.error(e); } finally { b.disabled = false; }
  });
  bar.append(sel, b);
  box.append(bar, chart);
  return box;
}
