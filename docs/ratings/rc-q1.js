// Q1: conversion between categories, smoothed across rating and month.
(() => {
  const pid = () => { const p = RC.params(); return RC.pairId(p.from, p.to); };
  const monthDate = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 15));
  const windowText = (r) => `±${r.hx} points, ±${r.ht} months`;

  // same-percentile link: yearly, joined on (year, rating)
  function equiFor(s) {
    const m = RC.group('q1_equi', 'k', (r) => `${r.year}|${r.from}|${r.to}`);
    if (!m || !s) return new Map();
    return new Map((m.get(`${s.year}|${s.from}|${s.to}`) || []).map((r) => [r.rating, r]));
  }

  const words = {
    'p-from': () => RC.params().from,
    'p-to': () => RC.params().to,
    'p-rating': () => String(RC.snap(RC.params().rating, 25)),
    'p-rating100': () => String(RC.snap(RC.params().rating, 100)),
  };
  for (const [name, fn] of Object.entries(words)) dash.draw(name, (el) => { el.textContent = fn(); });
  dash.draw('p-month', (el) => { const s = RC.q1(); el.textContent = s && s.month ? RC.monthName(s.month) : '—'; });
  dash.draw('p-year', (el) => { const s = RC.q1(); el.textContent = s && s.year ? String(s.year) : '—'; });

  dash.draw('q1-month', (input) => {
    const s = RC.q1();
    if (!s || !s.months.length) { input.disabled = true; return; }
    input.disabled = false;
    input.min = '0';
    input.max = String(s.months.length - 1);
    input.value = String(s.months.indexOf(s.month));
    input.oninput = () => {
      const i = +input.value;
      dash.setParams({month: i === s.months.length - 1 ? 'latest' : s.months[i]});
    };
  });
  dash.draw('q1-month-label', (el) => {
    const s = RC.q1();
    el.textContent = s && s.month ? `${RC.monthName(s.month)}${s.latest ? ' (latest)' : ''}` : '—';
  });

  dash.draw('c-val', (el) => {
    const s = RC.q1();
    const f = el.dataset.field;
    const r = s && s.row;
    if (!r) { el.textContent = '—'; return; }
    if (f === 'equi' || f === 'pct') {
      const e = equiFor(s).get(s.rating);
      el.textContent = e && e[f] != null ? String(e[f]) : '—';
      return;
    }
    el.textContent = f === 'n' ? RC.fmtInt(r[f]) : f === 'window' ? windowText(r) : r[f] == null ? '—' : String(r[f]);
  });

  dash.draw('q1-msg', () => {
    const s = RC.q1();
    const thin = !!s && !s.row;
    const rough = !!s && !!s.row && RC.rough(s.row);
    document.querySelectorAll('.rc-q1-thin').forEach((n) => { n.hidden = !thin; });
    document.querySelectorAll('.rc-q1-rough').forEach((n) => { n.hidden = !rough; });
  });

  // the conversion curve for the chosen month
  dash.draw('q1-curve', (el) => {
    if (!RC.ready(el, [pid()])) return;
    const s = RC.q1();
    const eqm = equiFor(s);
    const data = s.rows.filter((r) => r.mean != null).map((r) => ({...r, equi: eqm.get(r.rating)?.equi ?? null}));
    if (data.length < 2) return RC.empty(el, 'Too few players held both ratings in this month to draw the curve.');
    const H = 360, top = 26, bottom = 44;
    const {svg, w} = RC.svg(el, H);
    const col = RC.catColor(s.to);
    const lo = d3.min(data, (d) => Math.min(d.q10, d.equi ?? Infinity));
    const hi = d3.max(data, (d) => Math.max(d.q90, d.equi ?? -Infinity));
    const y = d3.scaleLinear([lo, hi], [H - bottom, top]).nice();
    const yt = y.ticks(6);
    const left = RC.textWidth(svg, yt.map(RC.fmtR)) + 14;
    const x = d3.scaleLinear(d3.extent(data, (d) => d.rating), [left, w - 14]);
    const xt = x.ticks(Math.max(3, Math.floor((w - left) / 90)));
    RC.yAxis(svg, y, yt, left, w - 14, RC.fmtR);
    RC.xAxis(svg, x, xt, H - bottom, RC.fmtR);
    svg.append('text').attr('class', 'rc-tick').attr('x', left).attr('y', 12).text(`${s.to} rating`);
    svg.append('text').attr('class', 'rc-tick').attr('x', w - 14).attr('y', H - 6).attr('text-anchor', 'end').text(`${s.from} rating`);

    const clip = 'q1c' + Math.random().toString(36).slice(2, 8);
    svg.append('clipPath').attr('id', clip).append('rect').attr('x', left).attr('y', top).attr('width', w - 14 - left).attr('height', H - bottom - top);
    const plot = svg.append('g').attr('clip-path', `url(#${clip})`);
    const area = (a, b) => d3.area().x((d) => x(d.rating)).y0((d) => y(d[a])).y1((d) => y(d[b]));
    plot.append('path').datum(data).attr('d', area('q10', 'q90')).style('fill', col).style('fill-opacity', 0.12);
    plot.append('path').datum(data).attr('d', area('q25', 'q75')).style('fill', col).style('fill-opacity', 0.2);
    const [x0, x1] = x.domain(), [y0, y1] = y.domain();
    const e0 = Math.max(x0, y0), e1 = Math.min(x1, y1);
    if (e1 > e0) plot.append('line').attr('x1', x(e0)).attr('y1', y(e0)).attr('x2', x(e1)).attr('y2', y(e1))
      .style('stroke', 'var(--cds-chart-reference)').style('stroke-width', 1).style('stroke-dasharray', '4 3');
    const eq = data.filter((d) => d.equi != null);
    if (eq.length > 1) plot.append('path').datum(eq).attr('d', d3.line().x((d) => x(d.rating)).y((d) => y(d.equi)))
      .style('fill', 'none').style('stroke', 'var(--color-fg-muted)').style('stroke-width', 1.5).style('stroke-dasharray', '5 3');
    plot.append('path').datum(data).attr('d', area('lo95', 'hi95')).style('fill', col).style('fill-opacity', 0.3);
    plot.append('path').datum(data).attr('d', d3.line().x((d) => x(d.rating)).y((d) => y(d.mean)))
      .style('fill', 'none').style('stroke', col).style('stroke-width', 2).style('stroke-dasharray', '4 3');
    plot.append('path').datum(data).attr('d', d3.line().defined((d) => !RC.rough(d)).x((d) => x(d.rating)).y((d) => y(d.mean)))
      .style('fill', 'none').style('stroke', col).style('stroke-width', 2).style('stroke-linejoin', 'round').style('stroke-linecap', 'round');

    if (s.row && s.rating >= x0 && s.rating <= x1) {
      svg.append('line').attr('x1', x(s.rating)).attr('x2', x(s.rating)).attr('y1', top).attr('y2', H - bottom)
        .style('stroke', 'var(--color-fg)').style('stroke-width', 1).style('stroke-opacity', 0.5);
      svg.append('circle').attr('cx', x(s.rating)).attr('cy', y(s.row.mean)).attr('r', 5)
        .style('fill', col).style('stroke', 'var(--color-panel)').style('stroke-width', 2);
    }

    const hover = svg.append('g').style('display', 'none');
    const hl = hover.append('line').attr('y1', top).attr('y2', H - bottom).style('stroke', 'var(--cds-chart-axis)');
    const hd = hover.append('circle').attr('r', 4).style('fill', col).style('stroke', 'var(--color-panel)').style('stroke-width', 2);
    const tt = RC.tip(el);
    const bis = d3.bisector((d) => d.rating).center;
    svg.append('rect').attr('class', 'rc-hit').attr('x', left).attr('y', top).attr('width', w - 14 - left).attr('height', H - bottom - top)
      .style('fill', 'transparent')
      .on('pointermove', (event) => {
        const [mx] = d3.pointer(event, svg.node());
        const d = data[bis(data, x.invert(mx))];
        hover.style('display', null);
        hl.attr('x1', x(d.rating)).attr('x2', x(d.rating));
        hd.attr('cx', x(d.rating)).attr('cy', y(d.mean));
        tt.show(event, `${s.from} ${d.rating}, ${RC.monthName(s.month)}`, [
          [col, RC.rough(d) ? 'Average (rough)' : 'Average', RC.fmtR(d.mean), 'rc-sw-line'],
          [null, '95% interval', `${d.lo95}–${d.hi95}`],
          [null, 'Middle half', `${d.q25}–${d.q75}`],
          [null, 'Middle 80%', `${d.q10}–${d.q90}`],
          [null, `Same percentile (${s.year})`, RC.fmtR(d.equi)],
          [null, 'Player-months', RC.fmtInt(d.n)],
          [null, 'Smoothing window', windowText(d)],
        ]);
      })
      .on('pointerleave', () => { hover.style('display', 'none'); tt.hide(); })
      .on('click', (event) => {
        const [mx] = d3.pointer(event, svg.node());
        dash.setParams({rating: data[bis(data, x.invert(mx))].rating});
      });
  });

  // month-by-month drift at the chosen rating
  dash.draw('q1-trend', (el) => {
    if (!RC.ready(el, [pid()])) return;
    const s = RC.q1();
    const byRating = RC.group(s.id, 'rating', (r) => r.rating);
    const data = (byRating.get(s.rating) || []).map((d) => ({...d, date: monthDate(d.month)})).sort((a, b) => a.date - b.date);
    if (data.length < 2) return RC.empty(el, 'Too few players held both ratings at this level to show a trend.');
    const H = 260, top = 12, bottom = 28;
    const {svg, w} = RC.svg(el, H);
    const col = RC.catColor(s.to);
    const y = d3.scaleLinear([d3.min(data, (d) => d.lo95), d3.max(data, (d) => d.hi95)], [H - bottom, top]).nice();
    const yt = y.ticks(5);
    const left = RC.textWidth(svg, yt.map(RC.fmtR)) + 14;
    const x = d3.scaleUtc(d3.extent(data, (d) => d.date), [left, w - 12]);
    const span = x.domain()[1].getUTCFullYear() - x.domain()[0].getUTCFullYear();
    const every = Math.max(1, Math.ceil(span / Math.max(2, Math.floor((w - left) / 60))));
    const xt = d3.utcYear.every(every).range(x.domain()[0], d3.utcDay.offset(x.domain()[1], 1));
    RC.yAxis(svg, y, yt, left, w - 12, RC.fmtR);
    RC.xAxis(svg, x, xt, H - bottom, d3.utcFormat('%Y'));
    // gaps of more than a month break the line rather than bridging them
    const defined = (d, i, arr) => i === 0 || (d.date - arr[i - 1].date) < 40 * 864e5;
    const segs = [];
    data.forEach((d, i) => { if (!defined(d, i, data)) segs.push([]); (segs[segs.length - 1] || segs[segs.push([]) - 1]).push(d); });
    for (const seg of segs) {
      svg.append('path').datum(seg).attr('d', d3.area().x((d) => x(d.date)).y0((d) => y(d.lo95)).y1((d) => y(d.hi95)))
        .style('fill', col).style('fill-opacity', 0.18);
      svg.append('path').datum(seg).attr('d', d3.line().x((d) => x(d.date)).y((d) => y(d.mean)))
        .style('fill', 'none').style('stroke', col).style('stroke-width', 2).style('stroke-linejoin', 'round').style('stroke-linecap', 'round');
    }
    const cur = data.find((d) => d.month === s.month);
    if (cur) {
      svg.append('line').attr('x1', x(cur.date)).attr('x2', x(cur.date)).attr('y1', top).attr('y2', H - bottom)
        .style('stroke', 'var(--color-fg)').style('stroke-opacity', 0.4);
      svg.append('circle').attr('cx', x(cur.date)).attr('cy', y(cur.mean)).attr('r', 4.5).style('fill', col)
        .style('stroke', 'var(--color-panel)').style('stroke-width', 2);
    }
    const hover = svg.append('circle').attr('r', 4).style('fill', col).style('stroke', 'var(--color-panel)').style('stroke-width', 2).style('display', 'none');
    const tt = RC.tip(el);
    const bis = d3.bisector((d) => d.date).center;
    const pick = (event) => data[bis(data, x.invert(d3.pointer(event, svg.node())[0]))];
    svg.append('rect').attr('class', 'rc-hit').attr('x', left).attr('y', top).attr('width', w - 12 - left).attr('height', H - bottom - top).style('fill', 'transparent')
      .on('pointermove', (event) => {
        const d = pick(event);
        hover.style('display', null).attr('cx', x(d.date)).attr('cy', y(d.mean));
        tt.show(event, RC.monthName(d.month), [[col, RC.rough(d) ? 'Average (rough)' : 'Average', RC.fmtR(d.mean), 'rc-sw-line'],
          [null, '95% interval', `${d.lo95}–${d.hi95}`], [null, 'Player-months', RC.fmtInt(d.n)]]);
      })
      .on('pointerleave', () => { hover.style('display', 'none'); tt.hide(); })
      .on('click', (event) => {
        const d = pick(event);
        dash.setParams({month: d.month === s.months[s.months.length - 1] ? 'latest' : d.month});
      });
  });

  // sensitivity variants (yearly)
  const VARIANTS = ['Main estimate', 'Each player-month counts once', 'Weight by games played, no cap', 'Ratings up to RD 110 allowed', 'Other rating at most 7 days old'];
  dash.draw('q1-sens', (el) => {
    if (!RC.ready(el, ['q1_sensitivity', pid()])) return;
    const s = RC.q1();
    const m = RC.group('q1_sensitivity', 'k', (r) => `${r.year}|${r.from}|${r.to}|${r.rating}`);
    const data = (m.get(`${s.year}|${s.from}|${s.to}|${s.rating100}`) || []).filter((d) => d.mean != null && d.lo95 != null)
      .sort((a, b) => VARIANTS.indexOf(a.variant) - VARIANTS.indexOf(b.variant));
    if (!data.length) return RC.empty(el, 'No estimate at this rating in this year.');
    const rowH = 34, top = 6, bottom = 28;
    const H = top + rowH * data.length + bottom;
    const {svg, w} = RC.svg(el, H);
    const col = RC.catColor(s.to);
    const labW = RC.textWidth(svg, data.map((d) => d.variant), 'rc-lab');
    const valW = RC.textWidth(svg, data.map((d) => RC.fmtR(d.mean)));
    const narrow = labW + valW + 140 > w;
    const left = narrow ? 8 : labW + 16;
    const right = w - valW - 14;
    const rowY = (i) => top + rowH * i + (narrow ? rowH * 0.68 : rowH / 2);
    const x = d3.scaleLinear([d3.min(data, (d) => d.lo95) - 3, d3.max(data, (d) => d.hi95) + 3], [left + 6, right - 6]).nice();
    const xt = x.ticks(Math.max(2, Math.floor((right - left) / 70)));
    svg.append('g').selectAll('line').data(xt).join('line').attr('x1', (d) => x(d)).attr('x2', (d) => x(d)).attr('y1', top).attr('y2', H - bottom)
      .style('stroke', 'var(--cds-chart-grid)');
    RC.xAxis(svg, x, xt, H - bottom, RC.fmtR);
    const tt = RC.tip(el);
    data.forEach((d, i) => {
      const main = d.variant === VARIANTS[0];
      const c = main ? col : 'var(--color-fg-muted)';
      const yy = rowY(i);
      const g = svg.append('g');
      g.append('text').attr('class', 'rc-lab').attr('x', narrow ? left : left - 10).attr('y', narrow ? yy - 11 : yy).attr('dy', '0.32em')
        .attr('text-anchor', narrow ? 'start' : 'end').style('fill', main ? 'var(--color-fg)' : 'var(--color-fg-muted)').text(d.variant);
      g.append('line').attr('x1', x(d.lo95)).attr('x2', x(d.hi95)).attr('y1', yy).attr('y2', yy).style('stroke', c).style('stroke-width', 2).style('stroke-linecap', 'round');
      g.append('circle').attr('cx', x(d.mean)).attr('cy', yy).attr('r', main ? 5 : 4).style('fill', c).style('stroke', 'var(--color-panel)').style('stroke-width', 1.5);
      g.append('text').attr('class', 'rc-tick').attr('x', w - 6).attr('y', yy).attr('dy', '0.32em').attr('text-anchor', 'end').text(RC.fmtR(d.mean));
      g.append('rect').attr('x', 0).attr('y', top + rowH * i).attr('width', w).attr('height', rowH).style('fill', 'transparent')
        .on('pointermove', (event) => tt.show(event, d.variant, [[c, 'Average', RC.fmtR(d.mean), 'rc-sw-dot'], [null, '95% interval', `${d.lo95}–${d.hi95}`]]))
        .on('pointerleave', () => tt.hide());
    });
  });

  // lookup table for the chosen month: every other category at 100-point ratings
  dash.draw('q1-grid', (tb) => {
    const table = tb.closest('table');
    const s = RC.q1();
    const p = RC.params();
    const g = RC.group(`q1g:${dash.fileSafe(p.from)}`, 'month', (r) => r.month);
    if (!s || !g) { tb.replaceChildren(); return; }
    const byRating = d3.group(g.get(s.month) || [], (r) => r.rating);
    const ratings = [...byRating.keys()].sort((a, b) => a - b);
    const heads = table ? [...table.querySelectorAll('thead th[data-field]')] : [];
    const cols = heads.map((th) => th.dataset.field).filter((f) => f !== 'rating');
    const present = new Set([...byRating.values()].flat().map((r) => r.to));
    heads.forEach((th) => {
      const f = th.dataset.field;
      th.hidden = f !== 'rating' && !present.has(f);
      th.classList.toggle('rc-col-on', f === s.to);
    });
    tb.replaceChildren(...ratings.map((rating) => {
      const cells = new Map(byRating.get(rating).map((r) => [r.to, r]));
      const tr = document.createElement('tr');
      tr.dataset.rating = String(rating);
      if (rating === s.rating100) tr.classList.add('rc-row-on');
      const td0 = document.createElement('td');
      td0.textContent = String(rating);
      tr.append(td0);
      for (const c of cols) {
        const td = document.createElement('td');
        const r = cells.get(c);
        td.hidden = !present.has(c);
        td.className = [c === s.to ? 'rc-col-on' : '', r && r.rough ? 'rc-rough' : ''].join(' ').trim();
        td.textContent = r ? String(r.mean) : '';
        tr.append(td);
      }
      return tr;
    }));
    tb.onclick = (e) => {
      const tr = e.target.closest('tr[data-rating]');
      if (tr) dash.setParams({rating: +tr.dataset.rating});
    };
  });
})();
