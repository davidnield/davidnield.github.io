// Compact multi-select dropdown: a button that summarises the selection
// ("Speed: all", "Blitz + Rapid", "Rating: 1600–2199") and opens a checklist
// with All / None. Behaves like an Observable input: .value is the array of
// selected options, and an "input" event fires on every change.

export function multiSelect({ label, options, value = options, format = String, summary } = {}) {
  const root = document.createElement("div");
  root.className = "ms";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ms-btn";
  btn.setAttribute("aria-haspopup", "true");
  btn.setAttribute("aria-expanded", "false");
  const menu = document.createElement("div");
  menu.className = "ms-menu";
  menu.hidden = true;
  root.append(btn, menu);

  let sel = new Set(value);
  const tools = document.createElement("div");
  tools.className = "ms-tools";
  const mk = (txt, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = txt; b.addEventListener("click", fn); tools.appendChild(b); };
  mk("All", () => set(options));
  mk("None", () => set([]));
  menu.appendChild(tools);
  const boxes = options.map((o) => {
    const lab = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.addEventListener("change", () => { cb.checked ? sel.add(o) : sel.delete(o); update(true); });
    lab.append(cb, document.createTextNode(" " + format(o)));
    menu.appendChild(lab);
    return cb;
  });

  const defaultSummary = (vals) => {
    if (vals.length === options.length) return `${label}: all`;
    if (!vals.length) return `${label}: none`;
    return `${label}: ${vals.map(format).join(" + ")}`;
  };
  function update(notify) {
    const vals = options.filter((o) => sel.has(o));
    boxes.forEach((cb, i) => { cb.checked = sel.has(options[i]); });
    btn.textContent = (summary || defaultSummary)(vals, options) + " ▾";
    root.value = vals;
    if (notify) root.dispatchEvent(new Event("input", { bubbles: true }));
    if (!menu.hidden) place();
  }
  function set(vals) { sel = new Set(vals); update(true); }

  // The open menu is position: fixed, placed from the button's rect, so it
  // overlays the page instead of extending the scroll area of Quarto's
  // overflow: auto output-cell wrappers (scrollbars on desktop; on iOS, where
  // scrollbars are invisible overlays, the tap looked like it did nothing).
  const SHEET = window.matchMedia("(max-width: 575.98px)");
  const GAP = 4, EDGE = 8;
  function place() {
    const de = document.documentElement;
    const vw = de.clientWidth || window.innerWidth;
    const vh = de.clientHeight || window.innerHeight;
    const r = btn.getBoundingClientRect();
    const sheet = SHEET.matches;
    menu.classList.toggle("ms-sheet", sheet);
    menu.style.maxHeight = "";
    menu.style.width = "";
    menu.style.minWidth = "";
    if (sheet) {   // phone: a full-width sheet under (or over) the button
      menu.style.left = EDGE + "px";
      menu.style.width = (vw - 2 * EDGE) + "px";
    } else {
      menu.style.left = "0px";
      const w = Math.max(menu.offsetWidth, 0);
      menu.style.left = Math.max(EDGE, Math.min(r.left, vw - w - EDGE)) + "px";
    }
    const need = menu.offsetHeight;
    const below = vh - r.bottom - GAP - EDGE, above = r.top - GAP - EDGE;
    const up = need > below && above > below;     // flip only if it helps
    const room = Math.max(0, up ? above : below);
    if (need > room) menu.style.maxHeight = room + "px";   // scrolls inside itself
    const h = Math.min(need, room);
    menu.style.top = (up ? r.top - GAP - h : r.bottom + GAP) + "px";
  }
  const outside = (ev) => { if (!root.contains(ev.target)) close(); };
  // any scroll that is not the menu's own closes it (the button would move away)
  const onScroll = (ev) => { if (!menu.contains(ev.target)) close(); };
  // Escape closes from anywhere: Safari doesn't focus a button on tap, so the key
  // may not come from inside the menu
  const onKey = (ev) => { if (ev.key === "Escape") { close(); btn.focus(); } };
  function open() {
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    place();
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
  }
  function close() {
    if (menu.hidden) return;
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", place);
  }
  btn.addEventListener("click", () => (menu.hidden ? open() : close()));

  update(false);
  return root;
}

// "Rating: 1600–2199" for a contiguous run of bands, else a count.
export function bandSummary(bands, labels) {
  return (vals, options) => {
    if (vals.length === options.length) return "Rating: all";
    if (!vals.length) return "Rating: none";
    const idx = vals.map((v) => options.indexOf(v)).sort((a, b) => a - b);
    const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
    if (!contiguous) return `Rating: ${vals.length} bands`;
    const lo = labels[idx[0]], hi = labels[idx[idx.length - 1]];
    if (idx.length === 1) return `Rating: ${lo}`;
    const from = lo.startsWith("<") ? "<" : lo.split("–")[0];
    const to = hi.endsWith("+") ? "+" : hi.split("–")[1];
    if (from === "<") return `Rating: under ${+to + 1}`;
    if (to === "+") return `Rating: ${from}+`;
    return `Rating: ${from}–${to}`;
  };
}
