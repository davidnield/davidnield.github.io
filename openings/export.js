// One-button PNG export for the dashboard's charts. No external services:
// the chart (an Observable Plot SVG, rebuilt at a fixed export width), its
// title, subtitle, legend and footer are composed into one SVG, drawn onto a
// canvas at 2x over a white background, and saved as a PNG.
//
// SVG drawn as an image cannot load web fonts, so the export uses a system
// sans-serif stack throughout (measured with the same stack, so text wraps
// where it is drawn).

export const EXPORT_FONT = "Arial, Helvetica, 'Liberation Sans', sans-serif";
const NS = "http://www.w3.org/2000/svg";
const INK = "#0b0b0b", INK2 = "#52514e", MUTED = "#898781", GRID = "#e1e0d9";

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

// legend: [{ label, color, kind: "line" | "dashed" | "box" | "area" }]
function legendRow(svg, legend, { x, y, maxW }) {
  const px = 13, gap = 22, key = 22;
  let cx = x, cy = y, rows = 1;
  measureCtx ??= document.createElement("canvas").getContext("2d");
  measureCtx.font = `400 ${px}px ${EXPORT_FONT}`;
  for (const it of legend) {
    const w = key + 6 + measureCtx.measureText(it.label).width;
    if (cx > x && cx + w > x + maxW) { cx = x; cy += px * 1.7; rows++; }
    const my = cy + px * 0.65;
    if (it.kind === "box") el("rect", { x: cx, y: my - 6, width: 12, height: 12, rx: 2, fill: it.color }, svg);
    else if (it.kind === "area") el("rect", { x: cx, y: my - 6, width: 12, height: 12, rx: 2, fill: it.color, "fill-opacity": 0.25 }, svg);
    else el("line", { x1: cx, x2: cx + 18, y1: my, y2: my, stroke: it.color, "stroke-width": 2.5, ...(it.kind === "dashed" ? { "stroke-dasharray": "5,4" } : {}) }, svg);
    el("text", { x: cx + key + 2, y: cy + px, "font-family": EXPORT_FONT, "font-size": px, fill: INK2 }, svg, it.label);
    cx += w + gap;
  }
  return rows * px * 1.7;
}

// Compose one export. chart: an <svg> (or a <figure> holding one) built at
// the export width. Returns { svg, width, height }.
export function compose({ chart, title, subtitle, legend = [], footer, source }) {
  const plot = chart.tagName.toLowerCase() === "svg" ? chart : chart.querySelector("svg");
  const cw = +plot.getAttribute("width"), ch = +plot.getAttribute("height");
  const pad = 28, W = cw + 2 * pad, maxW = cw;
  const svg = el("svg", { xmlns: NS, width: W, viewBox: `0 0 ${W} 100` });
  const bg = el("rect", { x: 0, y: 0, width: W, height: 100, fill: "#ffffff" }, svg);
  let y = pad - 6;
  y += textBlock(svg, title, { x: pad, y, px: 22, weight: 700, fill: INK, maxW });
  y += 4;
  if (subtitle) y += textBlock(svg, subtitle, { x: pad, y, px: 15, fill: INK2, maxW, lineH: 1.35 });
  y += 12;
  if (legend.length) y += legendRow(svg, legend, { x: pad, y, maxW }) + 4;
  const c = plot.cloneNode(true);
  c.setAttribute("x", pad); c.setAttribute("y", y);
  c.setAttribute("width", cw); c.setAttribute("height", ch);
  if (!c.getAttribute("viewBox")) c.setAttribute("viewBox", `0 0 ${cw} ${ch}`);
  c.style.color = INK2;
  c.style.fontFamily = EXPORT_FONT;
  c.style.background = "transparent";
  for (const t of c.querySelectorAll("[aria-label='tip']")) t.remove();   // a hover tooltip, if one is showing
  svg.appendChild(c);
  y += ch + 10;
  el("line", { x1: pad, x2: W - pad, y1: y, y2: y, stroke: GRID }, svg);
  y += 6;
  if (footer) y += textBlock(svg, footer, { x: pad, y, px: 12, fill: MUTED, maxW, lineH: 1.35 });
  if (source) y += textBlock(svg, source, { x: pad, y: y + 2, px: 12, weight: 700, fill: INK2, maxW });
  const H = Math.ceil(y + pad - 6);
  svg.setAttribute("height", H);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  bg.setAttribute("height", H);
  return { svg, width: W, height: H };
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

// The page calls this from each chart's button; spec = { build(width), title,
// subtitle, legend, footer, source, filename }.
export async function exportChart(spec, { width = 1000, scale = 2, download = true } = {}) {
  const composed = compose({ ...spec, chart: spec.build(width) });
  const blob = await toPngBlob(composed, scale);
  if (download) saveBlob(blob, spec.filename);
  return { blob, filename: spec.filename, width: composed.width * scale, height: composed.height * scale };
}

// A chart with a small "Download" button in its top-right corner.
export function chartWithDownload(chart, getSpec, label = "Download this chart as a PNG image") {
  const box = document.createElement("div");
  box.className = "dash-chart";
  const b = document.createElement("button");
  b.type = "button";
  b.className = "dash-dl";
  b.setAttribute("aria-label", label);
  b.title = label;
  b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" width="12" height="12"><path d="M8 1v9m0 0L4.5 6.5M8 10l3.5-3.5M2 13.5h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Download</span>';
  b.addEventListener("click", async () => {
    b.disabled = true;
    try { await exportChart(getSpec()); } catch (e) { console.error(e); } finally { b.disabled = false; }
  });
  box.append(b, chart);
  return box;
}
