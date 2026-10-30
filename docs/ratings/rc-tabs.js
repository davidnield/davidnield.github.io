// Tabs and the controls whose choices are fixed.
(() => {
  const TABS = ['convert', 'timecontrols', 'queues', 'method'];
  const tab = () => (TABS.includes(RC.params().tab) ? RC.params().tab : 'convert');
  const all = (sel) => document.querySelectorAll(sel);

  all('.rc-tabs [data-tab]').forEach((b) => b.addEventListener('click', () => dash.setParams({tab: b.dataset.tab})));

  all('.rc-from').forEach((s) => s.addEventListener('change', () => {
    const p = RC.params();
    dash.setParams(s.value === p.to ? {from: s.value, to: p.from} : {from: s.value});
  }));
  all('.rc-to').forEach((s) => s.addEventListener('change', () => {
    const p = RC.params();
    dash.setParams(s.value === p.from ? {to: s.value, from: p.to} : {to: s.value});
  }));
  all('#q1-swap').forEach((b) => b.addEventListener('click', () => {
    const p = RC.params();
    dash.setParams({from: p.to, to: p.from});
  }));
  all('.rc-rating-range').forEach((r) => r.addEventListener('input', () => dash.setParams({rating: RC.snap(r.value, 25)})));
  all('.rc-rating-num').forEach((n) => {
    n.addEventListener('change', () => { if (n.value !== '') dash.setParams({rating: RC.snap(n.value, 25)}); });
    n.addEventListener('blur', () => { n.value = RC.snap(RC.params().rating, 25); });
  });
  all('.rc-q2group').forEach((s) => s.addEventListener('change', () => dash.setParams({q2group: s.value})));
  all('.rc-q2rating-range').forEach((r) => r.addEventListener('input', () => dash.setParams({q2rating: RC.snap(r.value, 25)})));
  all('.rc-q2rating-num').forEach((n) => {
    n.addEventListener('change', () => { if (n.value !== '') dash.setParams({q2rating: RC.snap(n.value, 25)}); });
    n.addEventListener('blur', () => { n.value = RC.snap(RC.params().q2rating, 25); });
  });
  all('.rc-q3group').forEach((s) => s.addEventListener('change', () => dash.setParams({q3group: s.value})));
  all('.rc-q3band').forEach((n) => {
    n.addEventListener('change', () => { if (n.value !== '') dash.setParams({q3band: RC.snap(n.value, 100)}); });
    n.addEventListener('blur', () => { n.value = RC.snap(RC.params().q3band, 100); });
  });

  dash.onData(() => {
    const t = tab();
    const p = RC.params();
    all('.rc-tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    all('section.rc-page').forEach((s) => { s.hidden = s.id !== t; });
    all('.rc-from').forEach((s) => { s.value = p.from; });
    all('.rc-to').forEach((s) => { s.value = p.to; });
    all('.rc-rating-range').forEach((r) => { r.value = RC.snap(p.rating, 25); });
    all('.rc-rating-num').forEach((n) => { if (n !== document.activeElement) n.value = RC.snap(p.rating, 25); });
    all('.rc-q2group').forEach((s) => { s.value = p.q2group; });
    all('.rc-q2rating-range').forEach((r) => { r.value = RC.snap(p.q2rating, 25); });
    all('.rc-q2rating-num').forEach((n) => { if (n !== document.activeElement) n.value = RC.snap(p.q2rating, 25); });
    all('.rc-q3group').forEach((s) => { s.value = p.q3group; });
    all('.rc-q3band').forEach((n) => { if (n !== document.activeElement) n.value = RC.snap(p.q3band, 100); });
    all('[data-swatch]').forEach((s) => { s.style.background = RC.swatch(s.dataset.swatch, p); });
    all('[data-swatch-color]').forEach((s) => { s.style.color = RC.swatch(s.dataset.swatchColor, p); });
  });
})();
