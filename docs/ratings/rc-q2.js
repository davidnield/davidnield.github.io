// Q2: what a rating in one time control is worth in the others of its category.
(() => {
  const tcColor = (s, tc) => dash.colors[Math.max(0, s.tcs.indexOf(tc)) % 8];
  const fy = (v) => (v === 0 ? '0' : d3.format('+')(v));

  dash.draw('q2-tc', (sel) => {
    const s = RC.q2();
    if (!s) { sel.replaceChildren(); return; }
    sel.replaceChildren(...s.tcs.map((t) => new Option(t, t)));
    sel.value = s.tc;
    sel.onchange = () => dash.setParams({q2tc: sel.value});
  });
  dash.draw('q2-year', (sel) => {
    const s = RC.q2();
    if (!s) { sel.replaceChildren(); return; }
    sel.replaceChildren(...s.years.map((y) => new Option(String(y), String(y))));
    sel.value = String(s.year);
    sel.onchange = () => dash.setParams({q2year: +sel.value});
  });

  // the same gaps by year, at the chosen rating band (or all ratings when that band is thin)
  function trendRows(s) {
    const pick = (band) => s.targets.map((t) => ({t, values: s.mine.filter((r) => r.to_tc === t && String(r.band) === band)
      .map((r) => ({...r, x: r.year})).sort((a, b) => a.x - b.x)})).filter((d) => d.values.length > 1);
    const byBand = pick(s.band);
    return byBand.length === s.targets.length ? {series: byBand, useAll: false} : {series: pick('all'), useAll: true};
  }

  dash.draw('q2-word', (el) => {
    const p = RC.params();
    const w = el.dataset.word;
    if (w === 'group') { el.textContent = p.q2group; return; }
    if (w === 'rating') { el.textContent = String(RC.snap(p.q2rating, 25)); return; }
    const s = RC.q2();
    if (!s) { el.textContent = w === 'tc' ? p.q2tc : '—'; return; }
    el.textContent = w === 'tc' ? s.tc : w === 'year' ? String(s.year)
      : w === 'trendband' ? (trendRows(s).useAll ? 'anywhere (all ratings together)' : `${s.band}–${+s.band + 99}`) : '—';
  });

  dash.draw('q2-msg', () => {
    const s = RC.q2();
    document.querySelectorAll('.rc-q2-all').forEach((n) => { n.hidden = !(s && s.useAll && s.rows.some(Boolean)); });
  });

  // one tile per other time control: the equivalent rating there
  dash.draw('q2-tiles', (el) => {
    if (!RC.ready(el, ['q2_equiv'])) return;
    const s = RC.q2();
    el.replaceChildren();
    if (!s.rows.some(Boolean)) return RC.empty(el, 'No players of both in this year.');
    const sig = d3.format('+.0f');
    s.targets.forEach((t, i) => {
      const r = s.rows[i];
      const tile = document.createElement('div');
      tile.className = 'rc-tile';
      const head = document.createElement('span');
      head.className = 'rc-tile-tc';
      const sw = document.createElement('span');
      sw.className = 'rc-sw';
      sw.style.background = tcColor(s, t);
      head.append(sw, t);
      const big = document.createElement('span');
      big.className = 'rc-tile-big';
      const delta = document.createElement('span');
      delta.className = 'rc-tile-delta';
      const ci = document.createElement('span');
      ci.className = 'rc-note';
      if (!r) {
        big.textContent = '—';
        delta.textContent = 'Too few players of both';
      } else {
        big.textContent = String(Math.round(s.rating + r.shift));
        const same = (r.lo95 <= 0 && r.hi95 >= 0) || Math.abs(r.shift) < 2;
        delta.textContent = same ? `${sig(r.shift)} points: about the same`
          : `${sig(r.shift)} points: ${r.shift > 0 ? 'easier' : 'tougher'} queue`;
        delta.classList.toggle('rc-up', !same && r.shift > 0);
        delta.classList.toggle('rc-down', !same && r.shift < 0);
        ci.textContent = `95% interval ${Math.round(s.rating + r.lo95)}–${Math.round(s.rating + r.hi95)}`;
      }
      tile.append(head, big, delta, ci);
      el.append(tile);
    });
  });

  function lineChart(el, s, series, opts) {
    const all = series.flatMap((d) => d.values);
    const H = 280, top = 12, bottom = opts.xTitle ? 40 : 28;
    const {svg, w} = RC.svg(el, H);
    const y = d3.scaleLinear([Math.min(0, d3.min(all, (d) => d.lo95)), Math.max(0, d3.max(all, (d) => d.hi95))], [H - bottom, top]).nice();
    const yt = y.ticks(5);
    const left = RC.textWidth(svg, yt.map(fy)) + 14;
    const labW = RC.textWidth(svg, series.map((d) => d.t), 'rc-lab');
    const right = w - labW - 16;
    const x = d3.scaleLinear(d3.extent(all, (d) => d.x), [left + 6, right]);
    RC.yAxis(svg, y, yt, left, right, fy);
    RC.xAxis(svg, x, opts.ticks(x, right - left), H - bottom, opts.xFmt);
    if (opts.xTitle) svg.append('text').attr('class', 'rc-tick').attr('x', right).attr('y', H - 6).attr('text-anchor', 'end').text(opts.xTitle);
    svg.append('line').attr('x1', left).attr('x2', right).attr('y1', y(0)).attr('y2', y(0)).style('stroke', 'var(--cds-chart-axis)');
    if (opts.mark >= x.domain()[0] && opts.mark <= x.domain()[1]) svg.append('line').attr('x1', x(opts.mark)).attr('x2', x(opts.mark))
      .attr('y1', top).attr('y2', H - bottom).style('stroke', 'var(--color-fg)').style('stroke-opacity', 0.4);
    for (const d of series) {
      const c = tcColor(s, d.t);
      svg.append('path').datum(d.values).attr('d', d3.area().x((v) => x(v.x)).y0((v) => y(v.lo95)).y1((v) => y(v.hi95))).style('fill', c).style('fill-opacity', 0.12);
      svg.append('path').datum(d.values).attr('d', d3.line().x((v) => x(v.x)).y((v) => y(v.shift)))
        .style('fill', 'none').style('stroke', c).style('stroke-width', 2).style('stroke-linejoin', 'round').style('stroke-linecap', 'round');
      if (opts.dots) svg.append('g').selectAll('circle').data(d.values).join('circle').attr('cx', (v) => x(v.x)).attr('cy', (v) => y(v.shift)).attr('r', 2.5).style('fill', c);
    }
    // end labels, pushed apart so they never touch
    const ends = series.map((d) => ({t: d.t, y: y(d.values[d.values.length - 1].shift)})).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    for (let i = ends.length - 1; i >= 0; i--) {
      const max = i === ends.length - 1 ? H - bottom - 4 : ends[i + 1].y - 14;
      if (ends[i].y > max) ends[i].y = max;
    }
    svg.append('g').selectAll('text').data(ends).join('text').attr('class', 'rc-lab').attr('x', right + 8).attr('y', (d) => d.y).attr('dy', '0.32em').text((d) => d.t);
    // hover: rule, dots and a tooltip listing every line at that x; click picks it
    const xs = [...new Set(all.map((v) => v.x))].sort((a, b) => a - b);
    const near = (mx) => xs[d3.bisector((v) => v).center(xs, x.invert(mx))];
    const rule = svg.append('line').attr('y1', top).attr('y2', H - bottom).style('stroke', 'var(--cds-chart-axis)').style('display', 'none');
    const dots = svg.append('g');
    const tt = RC.tip(el);
    svg.append('rect').attr('class', 'rc-hit').attr('x', left).attr('y', top).attr('width', right - left).attr('height', H - bottom - top).style('fill', 'transparent')
      .on('pointermove', (event) => {
        const xv = near(d3.pointer(event, svg.node())[0]);
        const hits = series.map((d) => [d.t, d.values.find((v) => v.x === xv)]).filter(([, v]) => v);
        if (!hits.length) { tt.hide(); return; }
        rule.style('display', null).attr('x1', x(xv)).attr('x2', x(xv));
        dots.selectAll('circle').data(hits).join('circle').attr('cx', x(xv)).attr('cy', ([, v]) => y(v.shift)).attr('r', 4)
          .style('fill', ([t]) => tcColor(s, t)).style('stroke', 'var(--color-panel)').style('stroke-width', 2);
        tt.show(event, opts.head(hits[0][1]), hits.sort((a, b) => b[1].shift - a[1].shift)
          .map(([t, v]) => [tcColor(s, t), t, `${d3.format('+.1f')(v.shift)} (${RC.fmt1(v.lo95)} to ${RC.fmt1(v.hi95)})`, 'rc-sw-line']));
      })
      .on('pointerleave', () => { rule.style('display', 'none'); dots.selectAll('circle').remove(); tt.hide(); })
      .on('click', (event) => opts.click(near(d3.pointer(event, svg.node())[0])));
  }

  // gap against rating, one line per other time control
  dash.draw('q2-by-rating', (el) => {
    if (!RC.ready(el, ['q2_equiv'])) return;
    const s = RC.q2();
    const series = s.targets.map((t) => ({t, values: s.mine.filter((r) => r.year === s.year && r.to_tc === t && String(r.band) !== 'all')
      .map((r) => ({...r, x: +r.band + 50})).sort((a, b) => a.x - b.x)})).filter((d) => d.values.length > 1);
    if (!series.length) return RC.empty(el, 'Too few players of both in this year to split by rating.');
    lineChart(el, s, series, {
      xTitle: `Your ${s.tc} rating`, xFmt: RC.fmtR, mark: s.rating, dots: false,
      ticks: (x, span) => x.ticks(Math.max(3, Math.floor(span / 80))),
      head: (v) => `${s.tc} rated ${v.band}–${+v.band + 99}, ${s.year}`,
      click: (xv) => dash.setParams({q2rating: xv - 50}),
    });
  });

  dash.draw('q2-trend', (el) => {
    if (!RC.ready(el, ['q2_equiv'])) return;
    const s = RC.q2();
    const {series, useAll} = trendRows(s);
    if (!series.length) return RC.empty(el, 'Too few years with players of both.');
    lineChart(el, s, series, {
      xFmt: String, mark: s.year, dots: true,
      ticks: (x, span) => {
        const years = d3.range(x.domain()[0], x.domain()[1] + 1);
        const step = Math.max(1, Math.ceil(years.length / Math.max(2, Math.floor(span / 48))));
        return years.filter((v, i) => i % step === 0);
      },
      head: (v) => `${s.tc}${useAll ? '' : ` rated ${s.band}–${+s.band + 99}`}, ${v.year}`,
      click: (xv) => dash.setParams({q2year: xv}),
    });
  });
})();
