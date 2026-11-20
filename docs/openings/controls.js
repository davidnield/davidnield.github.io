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

// ---------------------------------------------------------------- v2.0

let uid = 0;

// A labelled native <select> (Source, Plays as): keyboard, screen readers and the phone's own
// picker for free. .value is the chosen option's value; an "input" event fires on every change.
// options: [[value, text], ...]
export function selectBox({ label, options, value, className = "" } = {}) {
  const root = document.createElement("div");
  root.className = `sel ${className}`.trim();
  const id = `sel-${++uid}`;
  const lab = document.createElement("label");
  lab.className = "sel-label";
  lab.htmlFor = id;
  lab.textContent = label;
  const sel = document.createElement("select");
  sel.id = id;
  sel.className = "sel-box";
  for (const [v, t] of options) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    sel.appendChild(o);
  }
  sel.value = options.some(([v]) => v === value) ? value : options[0][0];
  root.append(lab, sel);
  root.value = sel.value;
  sel.addEventListener("change", (ev) => {
    ev.stopPropagation();
    root.value = sel.value;
    root.dispatchEvent(new Event("input", { bubbles: true }));
  });
  sel.addEventListener("input", (ev) => ev.stopPropagation());   // only the root's input event bubbles
  root.select = sel;
  root.set = (v, notify = true) => {
    if (!options.some(([x]) => x === v) || v === root.value) return;
    sel.value = v; root.value = v;
    if (notify) root.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return root;
}

// Case- and accent-insensitive matching ("car" finds Carlsen and Caruana; "dominguez" finds Domínguez).
export const fold = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// A type-ahead combobox (ARIA 1.2 "combobox with listbox popup", list autocomplete): a text input
// that filters a list of options by any part of their text. Keyboard: Down/Up move through the
// list (Alt+Down opens it), Enter chooses, Escape closes and restores the choice, Home/End stay in
// the text. Pointer/touch: tapping the field or the arrow opens the full list; tapping an option
// chooses it. .value is the chosen option's id; an "input" event fires on every change.
// options: [{ id, text, hint, match }] (match: extra searchable text); pinned options stay first.
// The list is position: fixed, placed from the field's rect, so Quarto's overflow: auto output
// cells never clip it (the v1.5 lesson). setOptions() fills or replaces the list later (the OTB
// roster loads only once OTB is chosen); until then the field shows `pendingText`.
export function combobox({ label, options = [], value, pendingText = "…", emptyText = "No match" } = {}) {
  const root = document.createElement("div");
  root.className = "cmb";
  const id = `cmb-${++uid}`;
  const lab = document.createElement("label");
  lab.className = "cmb-label";
  lab.htmlFor = id;
  lab.textContent = label;
  const field = document.createElement("div");
  field.className = "cmb-field";
  const input = document.createElement("input");
  Object.assign(input, { id, type: "text", autocomplete: "off", spellcheck: false });
  input.className = "cmb-input";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", `${id}-list`);
  input.setAttribute("autocapitalize", "off");
  const arrow = document.createElement("button");
  arrow.type = "button";
  arrow.className = "cmb-arrow";
  arrow.tabIndex = -1;
  arrow.setAttribute("aria-label", `Show all ${label} options`);
  arrow.textContent = "▾";
  field.append(input, arrow);
  const list = document.createElement("ul");
  list.className = "cmb-list";
  list.id = `${id}-list`;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", label);
  list.hidden = true;
  const status = document.createElement("span");
  status.className = "cmb-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  root.append(lab, field, list, status);

  let opts = [], shown = [], active = -1;
  root.value = value;
  const textOf = (v) => opts.find((o) => o.id === v)?.text;
  const showValue = () => { input.value = textOf(root.value) ?? (opts.length ? "" : pendingText); };

  function render(q) {
    const f = fold(q.trim());
    shown = f ? opts.filter((o) => fold(`${o.text} ${o.match || ""}`).includes(f)) : opts.slice();
    list.replaceChildren();
    shown.forEach((o, i) => {
      const li = document.createElement("li");
      li.id = `${id}-opt-${i}`;
      li.className = "cmb-opt";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(o.id === root.value));
      li.dataset.id = o.id;
      const t = document.createElement("span");
      t.className = "cmb-text";
      t.textContent = o.text;
      li.appendChild(t);
      if (o.hint) { const h = document.createElement("span"); h.className = "cmb-hint"; h.textContent = o.hint; li.appendChild(h); }
      // mousedown cancelled: the focus stays in the field (no blur-close before the click). Not pointerdown:
      // WebKit then drops a touch tap's click.
      li.addEventListener("mousedown", (ev) => { ev.preventDefault(); });
      li.addEventListener("click", () => choose(o.id));
      list.appendChild(li);
    });
    if (!shown.length) {
      const li = document.createElement("li");
      li.className = "cmb-empty";
      li.textContent = emptyText;
      list.appendChild(li);
    }
    status.textContent = f ? `${shown.length} ${shown.length === 1 ? "match" : "matches"}` : "";
    setActive(f && shown.length ? 0 : shown.findIndex((o) => o.id === root.value));
  }
  function setActive(i) {
    active = i;
    [...list.querySelectorAll(".cmb-opt")].forEach((li, j) => li.classList.toggle("active", j === i));
    if (i >= 0 && shown[i]) {
      input.setAttribute("aria-activedescendant", `${id}-opt-${i}`);
      const li = list.children[i];
      if (li && li.scrollIntoView) li.scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  }
  const GAP = 4, EDGE = 8;
  function place() {
    const de = document.documentElement;
    const vw = de.clientWidth || window.innerWidth;
    const vv = window.visualViewport;
    const vh = vv ? vv.height : (de.clientHeight || window.innerHeight);
    const r = field.getBoundingClientRect();
    list.style.maxHeight = "";
    const w = Math.min(Math.max(r.width, 260), vw - 2 * EDGE);
    list.style.width = w + "px";
    list.style.left = Math.max(EDGE, Math.min(r.left, vw - w - EDGE)) + "px";
    const need = list.offsetHeight;
    const below = vh - r.bottom - GAP - EDGE, above = r.top - GAP - EDGE;
    const up = need > below && above > below;
    const room = Math.max(120, up ? above : below);
    if (need > room) list.style.maxHeight = room + "px";
    const h = Math.min(need, room);
    list.style.top = (up ? r.top - GAP - h : r.bottom + GAP) + "px";
  }
  const isOpen = () => !list.hidden;
  const outside = (ev) => { if (!root.contains(ev.target) && !list.contains(ev.target)) close(true); };
  const onScroll = (ev) => { if (!list.contains(ev.target)) place(); };
  function open(q = "") {
    if (!opts.length) return;
    render(q);
    if (!isOpen()) {
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", outside, true);
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", place);
    }
    place();
  }
  function close(restore) {
    if (isOpen()) {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    }
    status.textContent = "";
    if (restore) showValue();
  }
  function choose(v) {
    const changed = v !== root.value;
    root.value = v;
    close(true);
    if (changed) root.dispatchEvent(new Event("input", { bubbles: true }));
  }
  input.addEventListener("focus", () => { input.select(); });
  input.addEventListener("click", () => { if (!isOpen()) open(""); });
  arrow.addEventListener("mousedown", (ev) => ev.preventDefault());
  arrow.addEventListener("click", () => { if (isOpen()) close(true); else { input.focus(); open(""); } });
  input.addEventListener("input", (ev) => { ev.stopPropagation(); open(input.value); });
  input.addEventListener("blur", () => close(true));
  input.addEventListener("keydown", (ev) => {
    const n = shown.length;
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      if (!isOpen()) { open(ev.altKey ? "" : ""); return; }
      if (n) setActive(active < 0 ? 0 : Math.min(n - 1, active + 1));
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      if (!isOpen()) { open(""); return; }
      if (n) setActive(active <= 0 ? 0 : active - 1);
    } else if (ev.key === "Enter") {
      if (isOpen()) {
        ev.preventDefault();
        if (active >= 0 && shown[active]) choose(shown[active].id);
        else if (n === 1) choose(shown[0].id);
      }
    } else if (ev.key === "Escape") {
      if (isOpen()) { ev.preventDefault(); close(true); input.select(); }
    } else if (ev.key === "Tab") {
      close(true);
    }
  });
  root.input = input;
  root.list = list;
  root.setOptions = (o, fallback) => {
    opts = o;
    if (!opts.some((x) => x.id === root.value) && fallback !== undefined) {
      root.value = fallback;
      showValue();
      root.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    showValue();
    if (isOpen()) render(input.value);
  };
  root.set = (v, notify = true) => {
    if (v === root.value) return;
    root.value = v; showValue();
    if (notify) root.dispatchEvent(new Event("input", { bubbles: true }));
  };
  showValue();
  return root;
}
