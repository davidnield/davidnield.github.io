// Q3: queue sizes.
(() => {
  const monthDate = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 15));
  const monthName = d3.utcFormat('%b %Y');
  const compact = d3.format('~s');

  dash.draw('q3-word', (el) => {
    const p = RC.params();
    el.textContent = el.dataset.word === 'group' ? p.q3group : el.dataset.word === 'band' ? `${RC.snap(p.q3band, 100)}–${RC.snap(p.q3band, 100) + 99}` : '—';
  });

  // 100% stacked share by category
  dash.draw('q3-share', (el) => {
    if (!RC.ready(el, ['q3_share'])) return;
    const rows = RC.rows('q3_share');
    const keys = RC.CATS.filter((c) => rows.some((r) => r.group === c));
    const byMonth = d3.rollup(rows, (v) => Object.fromEntries(v.map((r) => [r.group, r.share])), (r) => r.month);
    const data = [...byMonth].sort((a, b) => d3.ascending(a[0], b[0]))
      .map(([m, o]) => ({month: m, date: monthDate(m), ...Object.fromEntries(keys.map((k) => [k, o[k] ?? 0]))}));
    const H = 300, top = 8, bottom = 28;
    const {svg, w} = RC.svg(el, H);
    const pct = d3.format('.0%');
    const y = d3.scaleLinear([0, 1], [H - bottom, top]);
    const yt = [0, 0.25, 0.5, 0.75, 1];
    const left = RC.textWidth(svg, yt.map(pct)) + 14;
    const x = d3.scaleUtc(d3.extent(data, (d) => d.date), [left, w - 12]);
    const span = x.domain()[1].getUTCFullYear() - x.domain()[0].getUTCFullYear();
    const every = Math.max(1, Math.ceil(span / Math.max(2, Math.floor((w - left) / 56))));
    RC.xAxis(svg, x, d3.utcYear.every(every).range(x.domain()[0], x.domain()[1]), H - bottom, d3.utcFormat('%Y'));
    const stack = d3.stack().keys(keys)(data);
    svg.append('g').selectAll('path').data(stack).join('path')
      .attr('d', d3.area().x((d) => x(d.data.date)).y0((d) => y(d[0])).y1((d) => y(d[1])))
      .style('fill', (d) => RC.catColor(d.key)).style('stroke', 'var(--color-panel)').style('stroke-width', 0.75);
    RC.yAxis(svg, y, yt, left, left, pct);
    const rule = svg.append('line').attr('y1', top).attr('y2', H - bottom).style('stroke', 'var(--color-fg)').style('stroke-opacity', 0.6).style('display', 'none');
    const tt = RC.tip(el);
    const bis = d3.bisector((d) => d.date).center;
    svg.append('rect').attr('x', left).attr('y', top).attr('width', w - 12 - left).attr('height', H - bottom - top).style('fill', 'transparent')
      .on('pointermove', (event) => {
        const [mx] = d3.pointer(event, svg.node());
        const d = data[bis(data, x.invert(mx))];
        rule.style('display', null).attr('x1', x(d.date)).attr('x2', x(d.date));
        const pf = d3.format('.1%');
        tt.show(event, monthName(d.date), keys.filter((k) => d[k] > 0).reverse().map((k) => [RC.catColor(k), k, pf(d[k])]));
      })
      .on('pointerleave', () => { rule.style('display', 'none'); tt.hide(); });
  });

  // games per day for each time control in the chosen category
  dash.draw('q3-monthly', (el) => {
    if (!RC.ready(el, ['q3_monthly'])) return;
    const p = RC.params();
    const rows = RC.rows('q3_monthly').filter((r) => r.group === p.q3group);
    if (!rows.length) return RC.empty(el, 'No games in this category.');
    const tcs = [...new Set(rows.map((r) => r.tc))].sort((a, b) => (a === 'other') - (b === 'other') || RC.tcDur(a) - RC.tcDur(b));
    const color = (tc) => (tc === 'other' ? 'var(--cds-chart-muted)' : dash.colors[tcs.indexOf(tc) % 8]);
    const series = tcs.map((tc) => ({tc, values: rows.filter((r) => r.tc === tc).map((r) => ({...r, date: monthDate(r.month)})).sort((a, b) => a.date - b.date)}));
    const H = 360, top = 10, bottom = 28;
    const {svg, w} = RC.svg(el, H);
    const y = d3.scaleLinear([0, d3.max(rows, (r) => r.games_per_day)], [H - bottom, top]).nice();
    const yt = y.ticks(6);
    const left = RC.textWidth(svg, yt.map(compact)) + 14;
    const labW = RC.textWidth(svg, tcs, 'rc-lab');
    const right = w - labW - 18;
    const x = d3.scaleUtc(d3.extent(rows, (r) => monthDate(r.month)), [left, right]);
    const span = x.domain()[1].getUTCFullYear() - x.domain()[0].getUTCFullYear();
    const every = Math.max(1, Math.ceil(span / Math.max(2, Math.floor((right - left) / 56))));
    RC.yAxis(svg, y, yt, left, right, compact);
    RC.xAxis(svg, x, d3.utcYear.every(every).range(x.domain()[0], d3.utcDay.offset(x.domain()[1], 1)), H - bottom, d3.utcFormat('%Y'));
    for (const s of series) {
      svg.append('path').datum(s.values).attr('d', d3.line().x((d) => x(d.date)).y((d) => y(d.games_per_day)))
        .style('fill', 'none').style('stroke', color(s.tc)).style('stroke-width', s.tc === 'other' ? 1.5 : 2)
        .style('stroke-linejoin', 'round').style('stroke-linecap', 'round');
    }
    // end labels, pushed apart so they never touch
    const ends = series.map((s) => { const l = s.values[s.values.length - 1]; return {tc: s.tc, x: x(l.date), y: y(l.games_per_day)}; })
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    for (let i = ends.length - 1; i >= 0; i--) {
      const max = i === ends.length - 1 ? H - bottom - 4 : ends[i + 1].y - 14;
      if (ends[i].y > max) ends[i].y = max;
    }
    svg.append('g').selectAll('text').data(ends).join('text').attr('class', 'rc-lab').attr('x', right + 6).attr('y', (d) => d.y).attr('dy', '0.32em').text((d) => d.tc);
    const rule = svg.append('line').attr('y1', top).attr('y2', H - bottom).style('stroke', 'var(--cds-chart-axis)').style('display', 'none');
    const tt = RC.tip(el);
    const months = series.flatMap((s) => s.values.map((v) => v.month));
    const uniq = [...new Set(months)].sort().map((m) => ({month: m, date: monthDate(m)}));
    const bis = d3.bisector((d) => d.date).center;
    svg.append('rect').attr('x', left).attr('y', top).attr('width', right - left).attr('height', H - bottom - top).style('fill', 'transparent')
      .on('pointermove', (event) => {
        const [mx] = d3.pointer(event, svg.node());
        const m = uniq[bis(uniq, x.invert(mx))];
        rule.style('display', null).attr('x1', x(m.date)).attr('x2', x(m.date));
        const lines = series.map((s) => [s.tc, s.values.find((v) => v.month === m.month)]).filter(([, v]) => v)
          .sort((a, b) => b[1].games_per_day - a[1].games_per_day)
          .map(([tc, v]) => [color(tc), tc, `${RC.fmtInt(Math.round(v.games_per_day))} a day`, 'rc-sw-line']);
        tt.show(event, monthName(m.date), lines);
      })
      .on('pointerleave', () => { rule.style('display', 'none'); tt.hide(); });
  });

  // hour-of-day heatmap
  const q3Year = () => {
    const rows = RC.rows('q3_hourly');
    if (!rows) return null;
    const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
    const p = RC.params();
    const year = years.includes(+p.q3year) ? +p.q3year : years.filter((y) => y <= RC.LATEST_FULL_YEAR).pop();
    return {rows, years, year};
  };
  dash.draw('q3-year', (sel) => {
    const s = q3Year();
    if (!s) { sel.replaceChildren(); return; }
    sel.replaceChildren(...s.years.map((y) => new Option(String(y), String(y))));
    sel.value = String(s.year);
    sel.onchange = () => dash.setParams({q3year: +sel.value});
  });
  dash.draw('q3-year-word', (el) => { const s = q3Year(); el.textContent = s ? String(s.year) : '—'; });

  dash.draw('q3-heat', (el) => {
    if (!RC.ready(el, ['q3_hourly'])) return;
    const s = q3Year();
    const rows = s.rows.filter((r) => r.year === s.year && r.tc !== 'other' && r.tc !== 'daily');
    const by = d3.group(rows, (r) => `${r.group}|${r.tc}`);
    const keys = [...by.keys()].sort((a, b) => {
      const [ga, ta] = a.split('|'), [gb, tb] = b.split('|');
      return RC.CATS.indexOf(ga) - RC.CATS.indexOf(gb) || RC.tcDur(ta) - RC.tcDur(tb);
    });
    if (!keys.length) return RC.empty(el, 'No hourly data for this year.');
    const rowH = 22, top = 22, bottom = 6;
    const H = top + rowH * keys.length + bottom;
    const {svg, w} = RC.svg(el, H);
    const label = (k) => k.replace('|', ' ').replace('Classical (pre-Nov 2017)', 'Classical (pre-2017)');
    const left = RC.textWidth(svg, keys.map(label), 'rc-lab') + 14;
    const ratioW = RC.textWidth(svg, ['×10.0']) + 12;
    const cw = (w - left - ratioW) / 24;
    // resolve two theme colors so the ramp can be interpolated
    const probe = document.createElement('span');
    el.append(probe);
    probe.style.color = 'var(--color-panel)';
    const c0 = getComputedStyle(probe).color;
    probe.style.color = dash.colors[2];
    const c1 = getComputedStyle(probe).color;
    probe.remove();
    const ramp = d3.interpolateRgb(c0, c1);
    svg.append('g').selectAll('text').data(d3.range(0, 24, cw < 18 ? 6 : 3)).join('text').attr('class', 'rc-tick')
      .attr('x', (h) => left + cw * h + cw / 2).attr('y', 12).attr('text-anchor', 'middle').text((h) => String(h).padStart(2, '0'));
    svg.append('text').attr('class', 'rc-tick').attr('x', w - 4).attr('y', 12).attr('text-anchor', 'end').text('peak ÷ low');
    const tt = RC.tip(el);
    keys.forEach((k, i) => {
      const vals = by.get(k).sort((a, b) => a.hour - b.hour);
      const max = d3.max(vals, (v) => v.games_per_hour), min = d3.min(vals, (v) => v.games_per_hour);
      const yy = top + rowH * i;
      svg.append('text').attr('class', 'rc-lab').attr('x', left - 8).attr('y', yy + rowH / 2).attr('dy', '0.32em').attr('text-anchor', 'end').text(label(k));
      svg.append('g').selectAll('rect').data(vals).join('rect')
        .attr('x', (v) => left + cw * v.hour + 0.5).attr('y', yy + 1).attr('width', Math.max(1, cw - 1)).attr('height', rowH - 2).attr('rx', 2)
        .style('fill', (v) => ramp(0.08 + 0.92 * (v.games_per_hour / max)))
        .on('pointermove', (event, v) => tt.show(event, `${label(k)}, ${String(v.hour).padStart(2, '0')}:00–${String(v.hour + 1).padStart(2, '0')}:00 UTC`, [
          [null, 'Games per hour', RC.fmtInt(Math.round(v.games_per_hour))],
          [null, 'Share of busiest hour', d3.format('.0%')(v.games_per_hour / max)],
        ]))
        .on('pointerleave', () => tt.hide());
      svg.append('text').attr('class', 'rc-tick').attr('x', w - 4).attr('y', yy + rowH / 2).attr('dy', '0.32em').attr('text-anchor', 'end')
        .text(min > 0 ? `×${(max / min).toFixed(1)}` : '');
    });
  });

  // games per hour near a rating
  const bandState = () => {
    const rows = RC.rows('q3_band');
    if (!rows) return null;
    const p = RC.params();
    const tcs = [...new Set(rows.map((r) => `${r.group}|${r.tc}`))].sort((a, b) => {
      const [ga, ta] = a.split('|'), [gb, tb] = b.split('|');
      return RC.CATS.indexOf(ga) - RC.CATS.indexOf(gb) || RC.tcDur(ta) - RC.tcDur(tb);
    });
    const tc = tcs.includes(p.q3tc) ? p.q3tc : tcs[0];
    const [group, t] = tc.split('|');
    const band = RC.snap(p.q3band, 100);
    const data = rows.filter((r) => r.group === group && r.tc === t && r.band === band).sort((a, b) => a.hour - b.hour);
    const peak = data.length ? data.reduce((a, b) => (b.games_per_hour > a.games_per_hour ? b : a)) : null;
    const low = data.length ? data.reduce((a, b) => (b.games_per_hour < a.games_per_hour ? b : a)) : null;
    return {tcs, tc, group, t, band, data, peak, low};
  };
  dash.draw('q3-tc', (sel) => {
    const s = bandState();
    if (!s) { sel.replaceChildren(); return; }
    sel.replaceChildren(...s.tcs.map((k) => new Option(k.replace('|', ' '), k)));
    sel.value = s.tc;
    sel.onchange = () => dash.setParams({q3tc: sel.value});
  });
  dash.draw('q3-band-stat', (el) => {
    const s = bandState();
    const r = s && (el.dataset.stat === 'peak' ? s.peak : s.low);
    const f = el.dataset.field;
    if (!r) { el.removeAttribute('data-where'); el.textContent = '—'; return; }
    el.dataset.where = RC.where({year: r.year, group: r.group, tc: r.tc, band: r.band, hour: r.hour});
    el.textContent = f === 'hour' ? String(r.hour).padStart(2, '0') : f === 'games_per_hour' ? d3.format(',.1f')(r[f]) : String(r[f]);
  });
  dash.draw('q3-band', (el) => {
    if (!RC.ready(el, ['q3_band'])) return;
    const s = bandState();
    if (!s.data.length) return RC.empty(el, 'No games at this rating in this time control.');
    const H = 240, top = 12, bottom = 40;
    const {svg, w} = RC.svg(el, H);
    const y = d3.scaleLinear([0, d3.max(s.data, (d) => d.games_per_hour)], [H - bottom, top]).nice();
    const yt = y.ticks(5);
    const fy = d3.format(',~f');
    const left = RC.textWidth(svg, yt.map(fy)) + 14;
    const x = d3.scaleBand(d3.range(24), [left, w - 8]).padding(0.18);
    RC.yAxis(svg, y, yt, left, w - 8, fy);
    svg.append('g').selectAll('text').data(d3.range(0, 24, x.bandwidth() < 16 ? 6 : 3)).join('text').attr('class', 'rc-tick')
      .attr('x', (h) => x(h) + x.bandwidth() / 2).attr('y', H - bottom + 16).attr('text-anchor', 'middle').text((h) => String(h).padStart(2, '0'));
    svg.append('text').attr('class', 'rc-tick').attr('x', w - 8).attr('y', H - 6).attr('text-anchor', 'end').text('Hour of day, UTC');
    const col = RC.catColor(s.group);
    const tt = RC.tip(el);
    svg.append('g').selectAll('path').data(s.data).join('path')
      .attr('d', (d) => {
        const x0 = x(d.hour), bw = x.bandwidth(), y0 = y(0), y1 = y(d.games_per_hour), r = Math.min(4, bw / 2, y0 - y1);
        return `M${x0},${y0}V${y1 + r}Q${x0},${y1} ${x0 + r},${y1}H${x0 + bw - r}Q${x0 + bw},${y1} ${x0 + bw},${y1 + r}V${y0}Z`;
      })
      .style('fill', col).style('fill-opacity', (d) => (d === s.peak ? 1 : 0.6))
      .on('pointermove', (event, d) => tt.show(event, `${s.t} ${s.group}, ${String(d.hour).padStart(2, '0')}:00 UTC`, [
        [col, 'Games per hour', d3.format(',.1f')(d.games_per_hour)],
        [null, 'Rating band', `${s.band}–${s.band + 99}`],
      ]))
      .on('pointerleave', () => tt.hide());
  });
})();

// Method: total games counted, from the monthly queue table.
dash.draw('corpus', (el) => {
  const rows = RC.rows('q3_monthly');
  if (!rows) { el.textContent = '—'; return; }
  const months = rows.map((r) => r.month).sort();
  const f = el.dataset.field;
  el.textContent = f === 'games' ? d3.format(',')(d3.sum(rows, (r) => r.games))
    : RC.monthName(f === 'first' ? months[0] : months[months.length - 1]);
});
