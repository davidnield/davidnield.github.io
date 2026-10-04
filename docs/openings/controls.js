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
  }
  function set(vals) { sel = new Set(vals); update(true); }

  const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute("aria-expanded", String(!menu.hidden));
  });
  menu.addEventListener("click", (ev) => ev.stopPropagation());
  document.addEventListener("click", close);
  root.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { close(); btn.focus(); } });

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
