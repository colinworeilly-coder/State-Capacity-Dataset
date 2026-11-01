/* Index of State Capacity explorer.
 * Data: data/meta.json (vintages, loadings, labels) and data/<vintage>.json
 * (one record per polity with annual arrays starting at y0), both written by
 * pipeline/build.py. Libraries: d3 v7, topojson-client v3 (vendored). */
(() => {
  'use strict';

  const INDEX = {
    c_nar: { name: 'Narrow index', short: 'Narrow' },
    c_fisc: { name: 'Narrow index with fiscal capacity', short: 'Narrow + fiscal' },
    c_comp: { name: 'Comprehensive index', short: 'Comprehensive' },
  };
  const INPUTS = ['v2x_rule', 'v2svstterr', 'v2clrspct', 'v2dlencmps', 'v2stfisccap', 'v2peedueq'];
  const DEFAULT_CODES = ['GBR', 'USA', 'JPN', 'RUS', 'CHN'];
  const MAX_SEL = 8;
  const VIEWS = ['explore', 'map', 'rankings', 'components', 'data', 'about'];
  const STORE_KEY = 'statecap-explorer-v1';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const fmt = d3.format('.2f');
  const fmtSigned = d3.format('+.2f');
  const fmtInt = d3.format(',');
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const slotColor = (i) => cssVar(`--s${i + 1}`);
  const ord = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const el = (tag, attrs = {}, text) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    return e;
  };

  const state = {
    meta: null, data: {}, vintage: null, index: 'c_nar', selected: [], year: null, baseYear: 2000,
    range: 'all', band: true, view: 'explore', compCountry: null, compScale: 'raw',
    sort: { key: 'rank', dir: 1 }, filter: '', hoverYear: null,
  };

  // ------------------------------------------------------------------ data
  function val(c, k, y) {
    const i = y - c.y0;
    if (i < 0) return null;
    const a = c[k];
    return i < a.length ? a[i] : null;
  }

  function prepare(raw) {
    const d = { ...raw, byId: new Map(), byCode: new Map(), first: {}, last: {}, extent: {}, stats: {}, mom: {} };
    let maxYear = 0;
    for (const c of d.countries) {
      d.byId.set(c.id, c);
      if (!d.byCode.has(c.code)) d.byCode.set(c.code, c);
      maxYear = Math.max(maxYear, c.y0 + c.c_nar.length - 1);
    }
    for (const k of [...Object.keys(INDEX), ...INPUTS]) {
      let lo = Infinity, hi = -Infinity, f = Infinity, l = -Infinity, s = 0, s2 = 0, n = 0;
      const byYear = new Map();
      for (const c of d.countries) {
        c[k].forEach((v, i) => {
          if (v == null) return;
          const y = c.y0 + i;
          lo = Math.min(lo, v); hi = Math.max(hi, v); f = Math.min(f, y); l = Math.max(l, y);
          s += v; s2 += v * v; n++;
          (byYear.get(y) || byYear.set(y, []).get(y)).push(v);
        });
      }
      d.extent[k] = [lo, hi]; d.first[k] = f; d.last[k] = l;
      const mean = s / n;
      d.mom[k] = { mean, sd: Math.sqrt((s2 - n * mean * mean) / (n - 1)) };
      const st = new Map();
      for (const [y, arr] of byYear) {
        arr.sort(d3.ascending);
        st.set(y, { n: arr.length, med: d3.quantileSorted(arr, 0.5), q1: d3.quantileSorted(arr, 0.25), q3: d3.quantileSorted(arr, 0.75) });
      }
      d.stats[k] = st;
    }
    d.maxYear = maxYear;
    return d;
  }

  async function loadVintage(key) {
    if (!state.data[key]) {
      const r = await fetch(`data/${key}.json`);
      if (!r.ok) throw new Error(`Could not load data/${key}.json (${r.status})`);
      state.data[key] = prepare(await r.json());
    }
    return state.data[key];
  }
  const D = () => state.data[state.vintage];
  const vintageMeta = () => state.meta.vintages.find((v) => v.key === state.vintage);

  function coverageFor(c, k) {
    let f = null, l = null;
    c[k].forEach((v, i) => { if (v != null) { if (f == null) f = c.y0 + i; l = c.y0 + i; } });
    return [f, l];
  }

  // ------------------------------------------------------------ persistence
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        sel: state.selected.map((s) => s.id), index: state.index, vintage: state.vintage,
      }));
    } catch (e) { /* storage unavailable: ignore */ }
  }
  function restore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch (e) { return null; }
  }

  // ------------------------------------------------------------- selection
  function isSelected(id) { return state.selected.some((s) => s.id === id); }
  function colorOf(id) { const s = state.selected.find((x) => x.id === id); return s ? slotColor(s.slot) : null; }
  function addCountry(id, quiet) {
    const c = D().byId.get(id);
    if (!c || isSelected(id)) return;
    if (state.selected.length >= MAX_SEL) { toast(`You can compare up to ${MAX_SEL} countries. Remove one first.`); return; }
    const used = new Set(state.selected.map((s) => s.slot));
    let slot = 0; while (used.has(slot)) slot++;
    state.selected.push({ id, slot });
    if (!quiet) toast(`Added ${c.name} to the comparison`);
    save();
  }
  function removeCountry(id) {
    state.selected = state.selected.filter((s) => s.id !== id);
    save();
  }

  // ---------------------------------------------------------------- toast
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
  }

  // -------------------------------------------------------------- tooltip
  const tip = $('#tooltip');
  function showTip(nodes, x, y) {
    tip.replaceChildren(...nodes);
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let left = x + 16, top = y + 12;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 16;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 12;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  }
  function hideTip() { tip.hidden = true; }
  function tipRow(color, value, name) {
    const row = el('div', { class: 'tt-row' });
    const key = el('span', { class: 'tt-key' });
    if (color) key.style.borderTopColor = color; else key.style.borderTop = '0';
    row.append(key, el('span', { class: 'tt-val' }, value), el('span', { class: 'tt-name' }, name));
    return row;
  }

  // ------------------------------------------------------------ controls
  function renderControls() {
    const sel = $('#vintage');
    if (!sel.options.length) {
      for (const v of state.meta.vintages) sel.append(el('option', { value: v.key }, v.label));
    }
    sel.value = state.vintage;
    for (const b of $$('#index-seg button')) b.setAttribute('aria-checked', String(b.dataset.index === state.index));
    const s = vintageMeta().summary[state.index];
    $('#coverage').textContent = `${INDEX[state.index].name} (${state.index}) · ${s.first_year}–${s.last_year} · ${fmtInt(s.N)} country-years · ${s.n} polities`;
    $('#eyebrow').textContent = `Panel dataset · 1789–${D().last.c_nar} · ${D().countries.length} polities`;
    for (const a of $$('.tabs a')) a.setAttribute('aria-selected', String(a.dataset.view === state.view));
    for (const v of VIEWS) $(`#view-${v}`).hidden = v !== state.view;
  }

  // ------------------------------------------------------------ explore
  function xDomain() {
    const d = D(), k = state.index;
    const start = state.range === 'all' ? d.first[k] : Math.max(+state.range, d.first[k]);
    return [Math.min(start, d.last[k] - 5), d.last[k]];
  }

  function renderPicker() {
    const ul = $('#chips');
    ul.replaceChildren();
    for (const s of state.selected) {
      const c = D().byId.get(s.id);
      if (!c) continue;
      const li = el('li', { class: 'chip' });
      const key = el('span', { class: 'key', 'aria-hidden': 'true' });
      key.style.borderTopColor = slotColor(s.slot);
      const b = el('button', { type: 'button', 'aria-label': `Remove ${c.name}` }, '×');
      b.addEventListener('click', () => { removeCountry(s.id); renderView(); });
      const [f, l] = coverageFor(c, state.index);
      li.append(key, el('span', {}, c.name));
      if (f == null) li.append(el('span', { class: 'muted small' }, '(no data)'));
      else if (f > xDomain()[0] + 1 || l < xDomain()[1] - 1) li.append(el('span', { class: 'muted small' }, `${f}–${l}`));
      li.append(b);
      ul.append(li);
    }
  }

  function renderExplore() {
    renderPicker();
    const box = $('#line-chart');
    const d = D(), k = state.index;
    const W = Math.max(300, box.clientWidth || 800);
    const narrow = W < 560;
    const H = Math.round(Math.max(280, Math.min(460, W * 0.5)));
    const sel = state.selected.map((s) => ({ ...s, c: d.byId.get(s.id) })).filter((s) => s.c);
    const labelled = !narrow && sel.length <= 4;
    const m = { t: 14, r: labelled ? Math.min(150, 16 + 7 * d3.max(sel, (s) => s.c.name.length) || 16) : 16, b: 28, l: 38 };
    const [x0, x1] = xDomain();
    const x = d3.scaleLinear([x0, x1], [m.l, W - m.r]);
    const y = d3.scaleLinear(d.extent[k], [H - m.b, m.t]).nice();
    const years = d3.range(x0, x1 + 1);

    const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img')
      .attr('aria-label', `${INDEX[k].name}, ${x0}–${x1}: ${sel.map((s) => s.c.name).join(', ') || 'no countries selected'}`);
    svg.append('g').selectAll('line').data(y.ticks(6)).join('line').attr('class', (t) => (t === 0 ? 'zero-line' : 'gridline'))
      .attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y);
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(6).tickSize(0).tickPadding(8)).call((g) => g.select('.domain').remove());
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(W / 90))).tickFormat(d3.format('d')).tickSizeOuter(0).tickSize(4));

    const st = d.stats[k];
    if (state.band) {
      const pts = years.map((yr) => ({ yr, s: st.get(yr) })).filter((p) => p.s && p.s.n >= 5);
      svg.append('path').attr('class', 'band').datum(pts)
        .attr('d', d3.area().defined((p) => p.s).x((p) => x(p.yr)).y0((p) => y(p.s.q1)).y1((p) => y(p.s.q3)));
      svg.append('path').attr('class', 'median-line').datum(pts)
        .attr('d', d3.line().x((p) => x(p.yr)).y((p) => y(p.s.med)));
    }

    const line = d3.line().defined((p) => p[1] != null).x((p) => x(p[0])).y((p) => y(p[1]));
    const labels = [];
    for (const s of sel) {
      const pts = years.map((yr) => [yr, val(s.c, k, yr)]);
      const color = slotColor(s.slot);
      svg.append('path').attr('class', 'series').attr('stroke', color).attr('d', line(pts));
      // isolated single-year points would be invisible as a path: mark them
      pts.forEach((p, i) => {
        if (p[1] != null && (pts[i - 1]?.[1] == null) && (pts[i + 1]?.[1] == null)) {
          svg.append('circle').attr('cx', x(p[0])).attr('cy', y(p[1])).attr('r', 2.5).attr('fill', color);
        }
      });
      const last = [...pts].reverse().find((p) => p[1] != null);
      if (labelled && last) labels.push({ y: y(last[1]), x: x(last[0]), text: s.c.name, color });
    }
    if (labels.length) {
      labels.sort((a, b) => a.y - b.y);
      for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 15);
      const over = labels[labels.length - 1].y - (H - m.b);
      if (over > 0) labels.forEach((l) => { l.y -= over; });
      svg.append('g').selectAll('text').data(labels).join('text').attr('class', 'direct-label')
        .attr('x', (l) => l.x + 6).attr('y', (l) => l.y).attr('dy', '0.35em').text((l) => l.text);
    }
    if (!sel.length) {
      svg.append('text').attr('class', 'empty-msg').attr('x', (m.l + W - m.r) / 2).attr('y', H / 2).attr('text-anchor', 'middle')
        .text('Add a country above to draw its series.');
    }

    // crosshair + tooltip
    const cross = svg.append('g').style('display', 'none').attr('pointer-events', 'none');
    cross.append('line').attr('class', 'crosshair').attr('y1', m.t).attr('y2', H - m.b);
    const dots = cross.append('g');
    function setYear(yr, cx, cy) {
      state.hoverYear = yr;
      cross.style('display', null).attr('transform', `translate(${x(yr)},0)`);
      const rows = sel.map((s) => ({ s, v: val(s.c, k, yr) })).sort((a, b) => (b.v ?? -99) - (a.v ?? -99));
      dots.selectAll('circle').data(rows.filter((r) => r.v != null)).join('circle').attr('class', 'hover-dot')
        .attr('r', 4).attr('cy', (r) => y(r.v)).attr('fill', (r) => slotColor(r.s.slot));
      const nodes = [el('div', { class: 'tt-head' }, String(yr))];
      for (const r of rows) nodes.push(tipRow(slotColor(r.s.slot), r.v == null ? '–' : fmt(r.v), r.s.c.name));
      const s = st.get(yr);
      if (state.band && s) nodes.push(tipRow(cssVar('--median'), fmt(s.med), `World median (${s.n} polities)`));
      showTip(nodes, cx, cy);
    }
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b)
      .attr('fill', 'transparent').style('touch-action', 'pan-y')
      .on('pointermove', (ev) => {
        const [px] = d3.pointer(ev);
        setYear(Math.max(x0, Math.min(x1, Math.round(x.invert(px)))), ev.clientX, ev.clientY);
      })
      .on('pointerleave', () => { cross.style('display', 'none'); hideTip(); state.hoverYear = null; });

    box.onkeydown = (ev) => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      ev.preventDefault();
      const yr = Math.max(x0, Math.min(x1, (state.hoverYear ?? x1) + (ev.key === 'ArrowLeft' ? -1 : 1)));
      const r = box.getBoundingClientRect();
      setYear(yr, r.left + (x(yr) / W) * r.width, r.top + 20);
    };
    box.onblur = () => { cross.style('display', 'none'); hideTip(); };

    box.replaceChildren(svg.node());
    $('#line-caption').textContent = `${INDEX[k].short} (${k}), ${vintageMeta().short}. 0 is the mean over all country-years; higher means more capacity.`;
  }

  // Combobox
  function setupCombo() {
    const input = $('#country-search'), list = $('#country-list');
    let active = -1, items = [];
    function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; }
    function open() {
      const q = input.value.trim().toLowerCase();
      const k = state.index;
      items = D().countries
        .filter((c) => !isSelected(c.id) && (!q || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q))
        .map((c) => ({ c, cov: coverageFor(c, k) }))
        .filter((r) => r.cov[0] != null)
        .sort((a, b) => (q ? (a.c.name.toLowerCase().startsWith(q) ? 0 : 1) - (b.c.name.toLowerCase().startsWith(q) ? 0 : 1) : 0) || a.c.name.localeCompare(b.c.name))
        .slice(0, 40);
      list.replaceChildren();
      if (!items.length) list.append(el('li', { class: 'empty' }, 'No matching country with data for this index'));
      items.forEach((r, i) => {
        const li = el('li', { role: 'option', id: `opt-${r.c.id}`, 'aria-selected': 'false' });
        li.append(el('span', {}, r.c.name), el('span', { class: 'yrs' }, `${r.cov[0]}–${r.cov[1]}`));
        li.addEventListener('pointerdown', (ev) => { ev.preventDefault(); choose(i); });
        list.append(li);
      });
      list.hidden = false; input.setAttribute('aria-expanded', 'true');
    }
    function highlight(i) {
      const lis = $$('li[role="option"]', list);
      lis.forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
      if (lis[i]) { lis[i].scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', lis[i].id); }
      active = i;
    }
    function choose(i) {
      const r = items[i];
      if (!r) return;
      addCountry(r.c.id, true);
      input.value = '';
      close();
      renderView();
      input.focus();
    }
    input.addEventListener('input', open);
    input.addEventListener('focus', open);
    input.addEventListener('blur', () => setTimeout(close, 120));
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); if (list.hidden) open(); highlight(Math.min(items.length - 1, active + 1)); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); highlight(Math.max(0, active - 1)); }
      else if (ev.key === 'Enter') { ev.preventDefault(); choose(active >= 0 ? active : 0); }
      else if (ev.key === 'Escape') { close(); }
    });
  }

  function downloadView() {
    const d = D(), k = state.index, [x0, x1] = xDomain();
    const rows = [['country_name', 'country_text_id', 'country_id', 'year', k]];
    for (const s of state.selected) {
      const c = d.byId.get(s.id);
      for (let yr = x0; yr <= x1; yr++) { const v = val(c, k, yr); if (v != null) rows.push([c.name, c.code, c.id, yr, v]); }
    }
    const csv = rows.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n');
    const a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `statecap_${k}_${state.vintage}_selection.csv` });
    document.body.append(a); a.click(); a.remove();
    toast('Downloaded the selected series. Cite the paper and V-Dem when you use them.');
  }

  // ------------------------------------------------------------------ map
  let world = null, mapCache = null, playTimer = null;
  async function loadWorld() {
    if (world) return world;
    const t = await (await fetch('assets/world-50m.json')).json();
    world = topojson.feature(t, t.objects.countries).features.filter((f) => f.id !== '010');
    return world;
  }
  function featureCountry(f) {
    const d = D();
    if (!d.byNum) {
      d.byNum = new Map(); d.byMapName = new Map();
      for (const c of d.countries) {
        if (c.num) d.byNum.set(c.num, c);
        if (c.mapName) d.byMapName.set(c.mapName, c);
      }
    }
    return (f.id && d.byNum.get(f.id)) || d.byMapName.get(f.properties.name) || null;
  }
  function mapColor() {
    const ext = D().extent[state.index];
    return d3.scaleQuantize(ext, d3.range(1, 8).map((i) => cssVar(`--q${i}`)));
  }
  function rankTable(k, yr) {
    const rows = D().countries.map((c) => ({ c, v: val(c, k, yr) })).filter((r) => r.v != null).sort((a, b) => b.v - a.v);
    const rank = new Map(rows.map((r, i) => [r.c.id, i + 1]));
    return { rows, rank };
  }

  async function renderMap() {
    await loadWorld();
    const box = $('#map-chart');
    const W = Math.max(300, box.clientWidth || 900);
    const key = `${W}|${state.vintage}`;
    if (!mapCache || mapCache.key !== key) {
      const proj = d3.geoEqualEarth().fitWidth(W, { type: 'FeatureCollection', features: world });
      const path = d3.geoPath(proj);
      const [[, y0], [, y1]] = path.bounds({ type: 'FeatureCollection', features: world });
      const H = Math.ceil(y1 - y0) + 2;
      const svg = d3.create('svg').attr('viewBox', `0 ${Math.floor(y0) - 1} ${W} ${H}`).attr('role', 'img');
      const defs = svg.append('defs');
      const pat = defs.append('pattern').attr('id', 'hatch').attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 5).attr('height', 5).attr('patternTransform', 'rotate(45)');
      pat.append('rect').attr('width', 5).attr('height', 5).attr('class', 'hatch-bg');
      pat.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 5).attr('stroke-width', 2).attr('class', 'hatch-line');
      const paths = svg.append('g').selectAll('path').data(world).join('path')
        .attr('class', 'country').attr('d', path)
        .on('pointermove', (ev, f) => {
          const c = featureCountry(f);
          const yr = state.year, k = state.index;
          const v = c ? val(c, k, yr) : null;
          const nodes = [el('div', { class: 'tt-head' }, c ? c.name : f.properties.name)];
          if (v != null) {
            const { rows, rank } = rankTable(k, yr);
            nodes.push(tipRow(null, fmt(v), `${INDEX[k].short}, ${yr}`));
            nodes.push(el('div', { class: 'tt-sub' }, `Ranked ${ord(rank.get(c.id))} of ${rows.length}`));
          } else {
            nodes.push(el('div', { class: 'tt-sub' }, c ? `No score in ${yr}` : 'Not covered by V-Dem'));
          }
          if (c) nodes.push(el('div', { class: 'tt-sub' }, isSelected(c.id) ? 'Click to remove from comparison' : 'Click to add to comparison'));
          showTip(nodes, ev.clientX, ev.clientY);
        })
        .on('pointerleave', hideTip)
        .on('click', (ev, f) => {
          const c = featureCountry(f);
          if (!c) return;
          if (isSelected(c.id)) { removeCountry(c.id); toast(`Removed ${c.name} from the comparison`); }
          else addCountry(c.id);
          updateMapFills();
        });
      mapCache = { key, svg, paths };
      box.replaceChildren(svg.node());
    }
    updateMapFills();
  }

  function updateMapFills() {
    if (!mapCache) return;
    const k = state.index, yr = state.year, color = mapColor();
    mapCache.svg.select('.hatch-bg').attr('fill', cssVar('--nodata'));
    mapCache.svg.select('.hatch-line').attr('stroke', cssVar('--hatch'));
    mapCache.paths
      .attr('fill', (f) => { const c = featureCountry(f); const v = c ? val(c, k, yr) : null; return v == null ? 'url(#hatch)' : color(v); })
      .classed('hl', (f) => { const c = featureCountry(f); return !!c && isSelected(c.id); });
    mapCache.svg.attr('aria-label', `World map of the ${INDEX[k].name.toLowerCase()} in ${yr}`);
    $('#map-year-title').textContent = yr;
    $('#year-out').textContent = yr;
    const sl = $('#year-slider');
    sl.min = D().first[k]; sl.max = D().last[k]; sl.value = yr;
    // legend
    const lg = $('#map-legend');
    const th = color.thresholds();
    const ext = D().extent[k];
    const sw = el('div', { class: 'swatches' });
    color.range().forEach((c, i) => {
      const s = el('span', { class: 'sw', title: `${fmt(i ? th[i - 1] : ext[0])} to ${fmt(i < th.length ? th[i] : ext[1])}` });
      s.style.background = c; sw.append(s);
    });
    const nd = el('span', { class: 'sw nd', 'aria-hidden': 'true' });
    lg.replaceChildren(el('span', {}, `Lower ${fmt(ext[0])}`), sw, el('span', {}, `${fmt(ext[1])} Higher`), nd, el('span', {}, 'No data'));
  }

  function setYear(yr) {
    const d = D(), k = state.index;
    state.year = Math.max(d.first[k], Math.min(d.last[k], yr));
  }

  function togglePlay(force) {
    const btn = $('#play');
    const playing = force ?? !playTimer;
    clearInterval(playTimer); playTimer = null;
    btn.textContent = playing ? 'Pause' : 'Play';
    btn.setAttribute('aria-pressed', String(playing));
    if (!playing) return;
    const d = D(), k = state.index;
    if (state.year >= d.last[k]) state.year = d.first[k];
    playTimer = setInterval(() => {
      if (state.year >= d.last[k]) { togglePlay(false); return; }
      state.year++;
      updateMapFills();
    }, 140);
  }

  // ------------------------------------------------------------- rankings
  function renderRankings() {
    const d = D(), k = state.index;
    const yi = $('#rank-year'), bi = $('#rank-base');
    yi.min = bi.min = d.first[k]; yi.max = bi.max = d.last[k];
    yi.value = state.year; bi.value = state.baseYear;
    const cur = rankTable(k, state.year), base = rankTable(k, state.baseYear);
    const bv = new Map(base.rows.map((r) => [r.c.id, r.v]));
    let rows = cur.rows.map((r, i) => {
      const b = bv.get(r.c.id);
      return { c: r.c, rank: i + 1, name: r.c.name, value: r.v,
        dv: b == null ? null : r.v - b, dr: b == null ? null : base.rank.get(r.c.id) - (i + 1) };
    });
    const q = state.filter.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    const { key, dir } = state.sort;
    rows.sort((a, b) => {
      const A = a[key], B = b[key];
      if (A == null && B == null) return 0;
      if (A == null) return 1;
      if (B == null) return -1;
      return (typeof A === 'string' ? A.localeCompare(B) : A - B) * dir;
    });
    for (const th of $$('#rank-table th[data-sort]')) {
      th.setAttribute('aria-sort', th.dataset.sort === key ? (dir > 0 ? 'ascending' : 'descending') : 'none');
    }
    const ext = d.extent[k], span = ext[1] - ext[0];
    const pos = (v) => ((v - ext[0]) / span) * 100;
    const tb = $('#rank-table tbody');
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const tr = el('tr', { tabindex: '0' });
      if (isSelected(r.c.id)) tr.classList.add('is-selected');
      const bar = el('td', { class: 'bar-col' });
      const track = el('div', { class: 'bar-track' });
      const fill = el('div', { class: 'bar-fill' });
      const z = pos(Math.max(ext[0], Math.min(0, ext[1]))), p = pos(r.value);
      fill.style.left = `${Math.min(z, p)}%`; fill.style.width = `${Math.max(0.6, Math.abs(p - z))}%`;
      const zero = el('div', { class: 'bar-zero' }); zero.style.left = `${z}%`;
      track.append(fill, zero); bar.append(track);
      const dv = el('td', { class: 'num' });
      if (r.dv == null) dv.textContent = '–';
      else { dv.textContent = fmtSigned(r.dv); dv.classList.add(r.dv > 0.005 ? 'up' : r.dv < -0.005 ? 'down' : 'flat'); }
      const dr = el('td', { class: 'num' });
      if (r.dr == null) dr.textContent = 'new';
      else if (r.dr === 0) dr.textContent = '0';
      else { dr.textContent = `${r.dr > 0 ? '▲' : '▼'} ${Math.abs(r.dr)}`; dr.classList.add(r.dr > 0 ? 'up' : 'down'); }
      tr.append(el('td', { class: 'num' }, String(r.rank)), el('td', {}, r.name), el('td', { class: 'num' }, fmt(r.value)), bar, dv, dr);
      const act = () => {
        if (isSelected(r.c.id)) { removeCountry(r.c.id); toast(`Removed ${r.name} from the comparison`); }
        else addCountry(r.c.id);
        tr.classList.toggle('is-selected', isSelected(r.c.id));
      };
      tr.addEventListener('click', act);
      tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); act(); } });
      frag.append(tr);
    }
    tb.replaceChildren(frag);
    $('#rank-note').textContent = `${cur.rows.length} polities scored in ${state.year}; ${base.rows.length} in ${state.baseYear}. Rank change compares positions in the two years' full rankings ("new" means no score in ${state.baseYear}). Differences of a few hundredths are within the measurement error of the V-Dem inputs.`;
  }

  // ----------------------------------------------------------- components
  function renderComponents() {
    const d = D(), k = state.index;
    const sel = $('#comp-country');
    const opts = d.countries.filter((c) => INPUTS.some((i) => c[i].some((v) => v != null)));
    if (sel.dataset.vintage !== state.vintage) {
      sel.replaceChildren(...opts.map((c) => el('option', { value: c.id }, c.name)));
      sel.dataset.vintage = state.vintage;
    }
    if (!state.compCountry || !d.byId.has(state.compCountry)) {
      state.compCountry = state.selected[0]?.id ?? d.byCode.get('GBR')?.id ?? opts[0].id;
    }
    sel.value = state.compCountry;
    $('#comp-scale').value = state.compScale;
    const c = d.byId.get(state.compCountry);
    const color = colorOf(c.id) || slotColor(0);
    const L = state.meta.loadings[k];
    const [x0, x1] = [state.range === 'all' ? 1789 : +state.range, d.maxYear];
    const box = $('#multiples');
    box.replaceChildren();
    const maxW = d3.max(Object.values(state.meta.loadings).flatMap((l) => l.loadings));
    for (const inp of INPUTS) {
      const info = state.meta.inputs[inp];
      const li = L.inputs.indexOf(inp);
      const card = el('div', { class: `mini${li < 0 ? ' out' : ''}` });
      card.append(el('h4', {}, info.name), el('p', { class: 'q' }, info.question));
      const meta = el('div', { class: 'meta' });
      const wt = el('span', { class: 'weight' });
      if (li >= 0) {
        const bar = el('i'); bar.style.width = `${(L.loadings[li] / maxW) * 40}px`;
        wt.append(bar, document.createTextNode(`weight ${L.loadings[li].toFixed(3)}`));
      } else wt.textContent = `not in ${k}`;
      meta.append(el('span', {}, inp), wt);
      card.append(meta);
      const chart = el('div', { class: 'chart' });
      card.append(chart);
      box.append(card);

      const W = Math.max(220, chart.clientWidth || 300), H = 130, m = { t: 8, r: 8, b: 20, l: 34 };
      const z = state.compScale === 'z';
      const mom = d.mom[inp];
      const tf = (v) => (v == null ? null : z ? (v - mom.mean) / mom.sd : v);
      const ext = z ? [(d.extent[inp][0] - mom.mean) / mom.sd, (d.extent[inp][1] - mom.mean) / mom.sd] : d.extent[inp];
      const x = d3.scaleLinear([x0, x1], [m.l, W - m.r]);
      const y = d3.scaleLinear(ext, [H - m.b, m.t]).nice();
      const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img')
        .attr('aria-label', `${info.name} for ${c.name} and the world median`);
      svg.append('g').selectAll('line').data(y.ticks(3)).join('line').attr('class', 'gridline')
        .attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y);
      svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`)
        .call(d3.axisLeft(y).ticks(3).tickSize(0).tickPadding(6)).call((g) => g.select('.domain').remove());
      svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
        .call(d3.axisBottom(x).ticks(4).tickFormat(d3.format('d')).tickSizeOuter(0).tickSize(3));
      const years = d3.range(x0, x1 + 1);
      const st = d.stats[inp];
      svg.append('path').attr('class', 'median-line')
        .attr('d', d3.line().defined((yr) => st.get(yr)?.n >= 5).x(x).y((yr) => y(tf(st.get(yr).med)))(years));
      svg.append('path').attr('class', 'series').attr('stroke', color)
        .attr('d', d3.line().defined((yr) => val(c, inp, yr) != null).x(x).y((yr) => y(tf(val(c, inp, yr))))(years));
      const cross = svg.append('line').attr('class', 'crosshair').attr('y1', m.t).attr('y2', H - m.b).style('display', 'none');
      svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b)
        .attr('fill', 'transparent').style('touch-action', 'pan-y')
        .on('pointermove', (ev) => {
          const yr = Math.max(x0, Math.min(x1, Math.round(x.invert(d3.pointer(ev)[0]))));
          cross.style('display', null).attr('x1', x(yr)).attr('x2', x(yr));
          const v = tf(val(c, inp, yr)), s = st.get(yr);
          showTip([el('div', { class: 'tt-head' }, `${info.name}, ${yr}`),
            tipRow(color, v == null ? '–' : fmt(v), c.name),
            tipRow(cssVar('--median'), s ? fmt(tf(s.med)) : '–', 'World median')], ev.clientX, ev.clientY);
        })
        .on('pointerleave', () => { cross.style('display', 'none'); hideTip(); });
      chart.append(svg.node());
    }
  }

  // ----------------------------------------------------------------- data
  const fmtSize = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);
  function dlCard(tag, title, text, file, sizes) {
    const card = el('div', { class: 'dl-card' });
    card.append(el('span', { class: 'tag' }, tag), el('h3', {}, title), el('p', {}, text));
    const links = el('div', { class: 'dl-links' });
    for (const [ext, label] of [['csv', 'CSV'], ['dta', 'Stata'], ['xlsx', 'Excel']]) {
      const a = el('a', { href: `downloads/${file}.${ext}`, download: '' });
      a.append(document.createTextNode(label), el('span', {}, sizes ? fmtSize(sizes[ext]) : ''));
      links.append(a);
    }
    card.append(links);
    return card;
  }
  function renderData() {
    const box = $('#downloads');
    if (box.childElementCount) return;
    const [latest, original] = [state.meta.vintages[0], state.meta.vintages.find((v) => v.key === 'v9')];
    const s = latest.summary;
    if (latest.key !== 'v9') {
      box.append(dlCard('Latest', latest.label,
        `${s.c_nar.first_year}–${s.c_nar.last_year}. Fixed loadings from the paper applied to V-Dem v${latest.vdem}. Includes re-estimated pca_* columns for robustness.`,
        latest.file, latest.sizes));
    }
    const so = original.summary;
    box.append(dlCard('Replication', original.label,
      `${so.c_nar.first_year}–${so.c_nar.last_year}. The series used in the published paper. Use this to replicate its results.`,
      original.file, original.sizes));
    for (const a of state.meta.archive.slice().reverse()) {
      box.append(dlCard('Archive', `Earlier update (V-Dem v${a.vdem})`,
        'Previously released update, kept so earlier work can be reproduced exactly.', a.file, a.sizes));
    }
    const tb = $('#codebook tbody');
    for (const [k, v] of Object.entries(state.meta.labels)) {
      const tr = el('tr');
      tr.append(el('td', {}, k), el('td', {}, v));
      tb.append(tr);
    }
  }

  // ---------------------------------------------------------------- about
  function renderAbout() {
    const lt = $('#loadings-table');
    if (!lt.childElementCount) {
      const L = state.meta.loadings;
      const head = el('tr');
      head.append(el('th', { scope: 'col' }, 'V-Dem input'));
      for (const k of ['c_comp', 'c_fisc', 'c_nar']) head.append(el('th', { scope: 'col', class: 'num' }, k));
      lt.append(Object.assign(el('thead')), el('tbody'));
      lt.tHead.append(head);
      for (const inp of INPUTS) {
        const tr = el('tr');
        tr.append(el('td', {}, `${state.meta.inputs[inp].name} (${inp})`));
        for (const k of ['c_comp', 'c_fisc', 'c_nar']) {
          const i = L[k].inputs.indexOf(inp);
          tr.append(el('td', { class: 'num' }, i < 0 ? '' : L[k].loadings[i].toFixed(4)));
        }
        lt.tBodies[0].append(tr);
      }
      const tr = el('tr');
      tr.append(el('td', {}, 'Share of variance explained'));
      for (const k of ['c_comp', 'c_fisc', 'c_nar']) tr.append(el('td', { class: 'num' }, `${Math.round(L[k].share * 100)}%`));
      lt.tBodies[0].append(tr);

      const stt = $('#stats-table');
      stt.append(el('thead'), el('tbody'));
      const h = el('tr');
      for (const t of ['Vintage', 'Index', 'Years', 'Country-years', 'Polities', 'SD', 'Min', 'Max']) h.append(el('th', { scope: 'col', class: t === 'Vintage' || t === 'Index' || t === 'Years' ? '' : 'num' }, t));
      stt.tHead.append(h);
      for (const v of state.meta.vintages) {
        for (const k of Object.keys(INDEX)) {
          const s = v.summary[k];
          const r = el('tr');
          r.append(el('td', {}, v.short), el('td', {}, k), el('td', {}, `${s.first_year}–${s.last_year}`),
            el('td', { class: 'num' }, fmtInt(s.N)), el('td', { class: 'num' }, String(s.n)), el('td', { class: 'num' }, fmt(s.sd)),
            el('td', { class: 'num' }, fmt(s.min)), el('td', { class: 'num' }, fmt(s.max)));
          stt.tBodies[0].append(r);
        }
      }
      const ul = $('#vdem-cites');
      const all = [...state.meta.vintages.map((v) => ({ vdem: v.vdem, cite: v.cite, label: v.short })),
        ...state.meta.archive.map((a) => ({ vdem: a.vdem, cite: a.cite, label: `Archive · V-Dem v${a.vdem}` }))]
        .sort((a, b) => b.vdem - a.vdem);
      for (const c of all) {
        const li = el('li');
        li.append(el('strong', {}, `${c.label}: `), document.createTextNode(`${c.cite.text} `));
        if (c.cite.doi) li.append(el('a', { href: c.cite.doi, target: '_blank', rel: 'noopener' }, c.cite.doi));
        ul.append(li);
      }
    }
  }

  // ---------------------------------------------------------------- routing
  function renderView() {
    renderControls();
    hideTip();
    if (state.view !== 'map') togglePlay(false);
    const v = state.view;
    if (v === 'explore') renderExplore();
    else if (v === 'map') renderMap();
    else if (v === 'rankings') renderRankings();
    else if (v === 'components') renderComponents();
    else if (v === 'data') renderData();
    else if (v === 'about') renderAbout();
  }

  function route() {
    const h = location.hash.slice(1);
    let target = null;
    if (VIEWS.includes(h)) state.view = h;
    else if (h && document.getElementById(h)) {
      target = document.getElementById(h);
      const sec = target.closest('.view');
      if (sec) state.view = sec.id.replace('view-', '');
    }
    renderView();
    if (target) target.scrollIntoView({ block: 'start' });
  }

  // ------------------------------------------------------------------ init
  function bind() {
    $('#vintage').addEventListener('change', async (e) => {
      const wasLatest = state.year === D().last[state.index];
      state.vintage = e.target.value;
      await loadVintage(state.vintage);
      mapCache = null;
      state.selected = state.selected.filter((s) => D().byId.has(s.id));
      if (wasLatest || state.year > D().last[state.index]) setYear(D().last[state.index]);
      save();
      renderView();
    });
    for (const b of $$('#index-seg button')) {
      b.addEventListener('click', () => {
        const wasLatest = state.year === D().last[state.index];
        state.index = b.dataset.index;
        setYear(wasLatest ? D().last[state.index] : state.year);
        state.baseYear = Math.max(D().first[state.index], state.baseYear);
        save();
        renderView();
      });
    }
    $('#index-seg').addEventListener('keydown', (ev) => {
      const keys = Object.keys(INDEX);
      const i = keys.indexOf(state.index);
      const n = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
      if (!n) return;
      ev.preventDefault();
      const b = $(`#index-seg button[data-index="${keys[(i + n + keys.length) % keys.length]}"]`);
      b.click(); b.focus();
    });
    $('#range').addEventListener('change', (e) => { state.range = e.target.value; renderView(); });
    $('#show-band').addEventListener('change', (e) => { state.band = e.target.checked; renderView(); });
    $('#dl-view').addEventListener('click', downloadView);
    $('#year-slider').addEventListener('input', (e) => { togglePlay(false); setYear(+e.target.value); updateMapFills(); });
    $('#play').addEventListener('click', () => togglePlay());
    $('#rank-year').addEventListener('change', (e) => { setYear(+e.target.value || state.year); renderRankings(); });
    $('#rank-base').addEventListener('change', (e) => {
      const d = D(), k = state.index;
      state.baseYear = Math.max(d.first[k], Math.min(d.last[k], +e.target.value || state.baseYear));
      renderRankings();
    });
    $('#rank-filter').addEventListener('input', (e) => { state.filter = e.target.value; renderRankings(); });
    for (const th of $$('#rank-table th[data-sort]')) {
      th.tabIndex = 0;
      const go = () => {
        const k = th.dataset.sort;
        state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: k === 'name' || k === 'rank' ? 1 : -1 };
        renderRankings();
      };
      th.addEventListener('click', go);
      th.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
    }
    $('#comp-country').addEventListener('change', (e) => { state.compCountry = +e.target.value; renderComponents(); });
    $('#comp-scale').addEventListener('change', (e) => { state.compScale = e.target.value; renderComponents(); });
    for (const b of $$('.copy')) {
      b.addEventListener('click', () => {
        const src = document.getElementById(b.dataset.copy);
        const text = src.textContent.trim();
        const fallback = () => {
          const r = document.createRange(); r.selectNodeContents(src);
          const s = getSelection(); s.removeAllRanges(); s.addRange(r);
          toast('Selected. Press Ctrl+C or ⌘C to copy.');
        };
        try { navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard'), fallback); } catch (e) { fallback(); }
      });
    }
    window.addEventListener('hashchange', route);
    let rt;
    new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { mapCache = null; if (state.view !== 'data' && state.view !== 'about') renderView(); }, 150); })
      .observe($('main'));
    const retheme = () => { mapCache = null; renderView(); };
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme);
    new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  async function init() {
    try {
      const r = await fetch('data/meta.json');
      if (!r.ok) throw new Error(`Could not load data/meta.json (${r.status})`);
      state.meta = await r.json();
      const saved = restore();
      const keys = state.meta.vintages.map((v) => v.key);
      state.vintage = saved && keys.includes(saved.vintage) ? saved.vintage : keys[0];
      if (saved && INDEX[saved.index]) state.index = saved.index;
      await loadVintage(state.vintage);
      const ids = saved?.sel?.length ? saved.sel : DEFAULT_CODES.map((c) => D().byCode.get(c)?.id);
      for (const id of ids) if (id != null) addCountry(id, true);
      setYear(D().last[state.index]);
      $('#loading').hidden = true;
      setupCombo();
      bind();
      route();
    } catch (err) {
      const p = $('#loading');
      p.textContent = `The data could not be loaded: ${err.message}. If you opened index.html straight from disk, serve the folder instead (for example: python -m http.server) and reload.`;
    }
  }
  init();
})();
