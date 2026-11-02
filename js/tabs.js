/* tabs.js — builds each of the seven tabs from the (filtered) list of properties. */
(function () {
  'use strict';

  const { esc, money, moneyShort, pct, signedPct, num, days, date, mean, median, vals, groupBy, plural } = F;
  const { kpi, kpis, card, chartBox, barsHeight, missingNotice, empty, link, renderTable, method, methodCounts, methodRows } = UI;
  const SMALL = 5;   // groups with fewer sales than this are marked "small sample"

  // ---------- shared sums ----------

  /** The headline numbers for any group of properties. */
  function summarise(recs) {
    const sold = recs.filter((r) => r.isSold);
    const prices = sold.map((r) => r.sold);
    const preds = sold.filter((r) => r.predErr !== null);
    const guided = sold.filter((r) => r.guideErr !== null);
    return {
      count: recs.length,
      sold,
      soldCount: sold.length,
      total: F.sum(prices),
      median: median(prices),
      mean: mean(prices),
      ppsqm: mean(vals(sold, (r) => r.ppsqm)),
      dom: mean(vals(sold, (r) => r.dom)),
      methods: methodCounts(recs),   // how properties sold, from the Status column
      preds,
      mape: mean(preds.map((r) => Math.abs(r.predErr))),
      bias: mean(preds.map((r) => r.predErr)),
      guided,
      aboveGuide: guided.length ? guided.filter((r) => r.guideErr > 0).length / guided.length : null,
      guideAvg: mean(guided.map((r) => r.guideErr))
    };
  }

  /** Every month from the first to the last, so quiet months show as zero instead of disappearing. */
  function monthRange(keys) {
    if (!keys.length) return [];
    const sorted = [...keys].sort();
    let [y, m] = sorted[0].split('-').map(Number);
    const last = sorted[sorted.length - 1];
    const out = [];
    for (let guard = 0; guard < 600; guard++) {
      const k = `${y}-${String(m).padStart(2, '0')}`;
      out.push(k);
      if (k >= last) break;
      m++; if (m > 12) { m = 1; y++; }
    }
    return out;
  }

  /** Table columns for the three ways of selling: "55% (70)". Rows need an "m" (from methodCounts) and pAuction/pBefore/pPrivate. */
  const methodCell = (r, k) => (r.m.sold ? `${pct(r.m.share(k), 0)} <span class="muted small">(${num(r.m[k])})</span>` : '–');
  const METHOD_COLS = [
    { key: 'pAuction', label: 'At auction', num: true, html: (r) => methodCell(r, 'auction') },
    { key: 'pBefore', label: 'Before auction', num: true, html: (r) => methodCell(r, 'before') },
    { key: 'pPrivate', label: 'Privately', num: true, html: (r) => methodCell(r, 'private') + (r.m.passedIn ? `<div class="muted small">${num(r.m.passedIn)} passed in</div>` : '') }
  ];

  const small = (n) => (n < SMALL ? ' <span class="badge-small" title="Fewer than 5 sales — treat with caution">small sample</span>' : '');

  // ---------- 1. Overview ----------

  function overview(panel, ds, recs) {
    const s = summarise(recs);
    if (!recs.length) { panel.innerHTML = empty(); return; }

    const m = s.methods;
    const tiles = kpis([
      kpi('Properties', num(s.count), 'matching the filters'),
      kpi('Sold', num(s.soldCount), `worth ${moneyShort(s.total)} in total`),
      kpi('Sold rate', pct(s.soldCount / s.count, 0), 'of these properties have sold'),
      kpi('Median sold price', money(s.median), 'the middle price — half sold for more, half for less'),
      kpi('Average sold price', money(s.mean), 'all sold prices added up ÷ number sold'),
      kpi('Average $ per m²', money(s.ppsqm), 'sold price ÷ land size'),
      kpi('Average days on market', days(s.dom), 'from listing date to sold date'),
      kpi('Prediction accuracy', s.mape !== null ? pct(1 - s.mape) : '–', s.mape !== null ? `your guesses were ${pct(s.mape)} away on average` : 'no predictions to compare'),
      ...['auction', 'before', 'private'].map((k) => kpi(DataReader.METHODS[k], num(m[k]),
        `${m.sold ? pct(m.share(k), 0) : '–'} of sold${k === 'private' && m.passedIn ? `<br>(${num(m.passedIn)} passed in at auction first)` : ''}`, { dot: k }))
    ]);
    // Small print under the tiles: what the three "how sold" tiles count, and why they can differ from "Sold".
    const gap = m.sold - s.soldCount;
    const tilesNote = `How sold follows the Status column; “% of sold” is out of the ${num(m.sold)} properties it marks as sold. Not sold yet: ${num(m.notsold)}.`
      + (gap > 0 ? ` The “Sold” tile shows ${num(s.soldCount)} because it counts sold prices: ${plural(gap, 'property has', 'properties have')} a sold Status but no sold price (see Data Check).` : '')
      + (gap < 0 ? ` The “Sold” tile shows ${num(s.soldCount)} because it counts sold prices, and ${plural(-gap, 'property has', 'properties have')} a sold price but an unrecognised Status (see Data Check).` : '');

    // Monthly
    const withMonth = s.sold.filter((r) => r.soldMonth);
    const byMonth = groupBy(withMonth, (r) => r.soldMonth);
    const months = monthRange([...byMonth.keys()]);
    const monthCounts = months.map((k) => (byMonth.get(k) || []).length);
    const monthAvg = months.map((k) => (byMonth.has(k) ? mean(byMonth.get(k).map((r) => r.sold)) : null));

    panel.innerHTML = `
      ${missingNotice(ds, ['sold'], 'sold prices')}
      ${missingNotice(ds, ['listingDate'], 'days on market')}
      ${tiles}
      <p class="tiles-note">${tilesNote}</p>
      ${card('Key insights', `<ul class="insights">${insights(recs, s).map((t) => `<li>${t}</li>`).join('')}</ul>`, '', 'card-insights')}
      ${months.length ? `<div class="grid-2">
        ${card('Sales per month', chartBox('ch-month-count', 240), 'Each bar is the number of properties sold that month. Taller bars mean a busier month.')}
        ${card('Average sold price per month', chartBox('ch-month-price', 240), 'The average price of the properties sold each month. A gap means nothing sold that month. Months with only a few sales can jump around a lot.')}
      </div>` : missingNotice(ds, ['soldDate'], 'the monthly charts')}
    `;

    if (months.length) {
      const labels = months.map(F.monthLabel);
      Charts.bar('ch-month-count', { labels, values: monthCounts, format: (v) => num(v), tooltipLabel: (c) => plural(c.parsed.y, 'sale') });
      Charts.line('ch-month-price', { labels, values: monthAvg, format: moneyShort, zero: false,
        tooltipLabel: (c) => `${money(c.parsed.y)} (${plural(monthCounts[c.dataIndex], 'sale')})` });
    }
  }

  /** Writes a few plain-English sentences about the filtered data. */
  function insights(recs, s) {
    const out = [];
    if (!s.soldCount) return ['No sold properties match the current filters.'];
    out.push(`<strong>${plural(s.soldCount, 'property', 'properties')}</strong> sold for a total of <strong>${moneyShort(s.total)}</strong>. The typical (median) price was <strong>${money(s.median)}</strong>.`);

    const subs = [...groupBy(s.sold, (r) => r.suburb)].map(([k, v]) => ({ k, n: v.length, med: median(v.map((r) => r.sold)), dom: mean(vals(v, (r) => r.dom)) }));
    if (subs.length > 1) {
      const busiest = [...subs].sort((a, b) => b.n - a.n)[0];
      out.push(`<strong>${esc(busiest.k)}</strong> had the most sales (${busiest.n}, or ${pct(busiest.n / s.soldCount, 0)} of all sales).`);
      const solid = subs.filter((x) => x.n >= SMALL);
      if (solid.length > 1) {
        const bySub = [...solid].sort((a, b) => b.med - a.med);
        const hi = bySub[0], lo = bySub[bySub.length - 1];
        out.push(`The most expensive suburb was <strong>${esc(hi.k)}</strong> (median ${moneyShort(hi.med)}); the most affordable was <strong>${esc(lo.k)}</strong> (median ${moneyShort(lo.med)}). <span class="muted">(Suburbs with at least ${SMALL} sales.)</span>`);
        const fast = solid.filter((x) => x.dom !== null).sort((a, b) => a.dom - b.dom)[0];
        if (fast) out.push(`Homes sold fastest in <strong>${esc(fast.k)}</strong>, averaging ${days(fast.dom)} on the market.`);
      }
    }

    // Recent price trend: last 6 months of data compared with the 6 months before.
    const dated = s.sold.filter((r) => r.soldDate !== null);
    if (dated.length) {
      const latest = Math.max(...dated.map((r) => r.soldDate));
      const d = new Date(latest);
      const cut1 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 5, 1);
      const cut0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 11, 1);
      const recent = dated.filter((r) => r.soldDate >= cut1).map((r) => r.sold);
      const before = dated.filter((r) => r.soldDate >= cut0 && r.soldDate < cut1).map((r) => r.sold);
      if (recent.length >= SMALL && before.length >= SMALL) {
        const change = median(recent) / median(before) - 1;
        const word = Math.abs(change) < 0.01 ? 'about the same as' : change > 0 ? `up ${pct(change)} on` : `down ${pct(-change)} on`;
        out.push(`In the 6 months to ${F.monthLabel(F.monthKey(latest))}, the median price was <strong>${money(median(recent))}</strong> — ${word} the 6 months before (${money(median(before))}).`);
      }
    }
    const m = s.methods;
    if (m.sold >= SMALL) out.push(`<strong>${pct(m.share('auction'), 0)}</strong> sold at auction, <strong>${pct(m.share('before'), 0)}</strong> before auction and <strong>${pct(m.share('private'), 0)}</strong> privately${m.passedIn ? ` (${num(m.passedIn)} of those after being passed in at auction)` : ''}.`);
    if (s.aboveGuide !== null && s.guided.length >= SMALL) out.push(`<strong>${pct(s.aboveGuide, 0)}</strong> of properties sold above the top of the agent’s price guide, by ${signedPct(s.guideAvg)} on average.`);
    if (s.preds.length >= SMALL) {
      const within10 = s.preds.filter((r) => Math.abs(r.predErr) <= 0.1).length / s.preds.length;
      const lean = Math.abs(s.bias) < 0.005 ? 'with no clear lean high or low'
        : s.bias < 0 ? `and you tend to guess <strong>high</strong> (properties sold ${pct(-s.bias)} below your guess on average)`
          : `and you tend to guess <strong>low</strong> (properties sold ${pct(s.bias)} above your guess on average)`;
      out.push(`Your predictions were within 10% of the sold price <strong>${pct(within10, 0)}</strong> of the time, ${lean}.`);
    }
    return out;
  }

  // ---------- 2. Suburbs ----------

  const SUBURB_METRICS = {
    median: { label: 'Median sold price', format: moneyShort, tip: money },
    sold: { label: 'Number of sales', format: num, tip: (v) => plural(v, 'sale') },
    ppsqm: { label: 'Average $ per m²', format: (v) => '$' + num(v), tip: money },
    dom: { label: 'Average days on market', format: num, tip: days },
    pAuction: { label: '% sold at auction', format: (v) => pct(v, 0), tip: (v) => pct(v, 0) },
    pBefore: { label: '% sold before auction', format: (v) => pct(v, 0), tip: (v) => pct(v, 0) },
    pPrivate: { label: '% sold privately', format: (v) => pct(v, 0), tip: (v) => pct(v, 0) }
  };
  let suburbMetric = 'median';

  function suburbRows(recs) {
    return [...groupBy(recs, (r) => r.suburb)].map(([suburb, list]) => {
      const s = summarise(list);
      const m = s.methods;
      return { suburb, listings: s.count, sold: s.soldCount, median: s.median, mean: s.mean, ppsqm: s.ppsqm, dom: s.dom,
        m, pAuction: m.share('auction'), pBefore: m.share('before'), pPrivate: m.share('private') };
    });
  }

  function suburbs(panel, ds, recs) {
    if (!recs.length) { panel.innerHTML = empty(); return; }
    const rows = suburbRows(recs);
    panel.innerHTML = `
      ${card('Compare suburbs', `
        <label class="inline-field">Show: <select id="suburb-metric">${Object.entries(SUBURB_METRICS).map(([k, m]) => `<option value="${k}" ${k === suburbMetric ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
        <div id="suburb-chart"></div>`,
        'Pick what to compare from the list. Suburbs with only a few sales can give unreliable numbers, so check the “Sales” column in the table below.')}
      ${card('Suburb table', '<div id="suburb-table"></div>',
        `Click a column heading to sort. The last three columns show how properties sold (from the Status column), as a % of sold properties with the number in brackets; “passed in” counts properties that failed at auction before selling privately. <span class="badge-small">small sample</span> means fewer than ${SMALL} sales.`)}
    `;
    const drawChart = () => {
      const m = SUBURB_METRICS[suburbMetric];
      const list = rows.filter((r) => r[suburbMetric] !== null && (suburbMetric === 'sold' || r.sold > 0)).sort((a, b) => b[suburbMetric] - a[suburbMetric]);
      document.getElementById('suburb-chart').innerHTML = list.length ? chartBox('ch-suburb', barsHeight(list.length)) : empty('No data for this measure.');
      if (list.length) Charts.bar('ch-suburb', { labels: list.map((r) => r.suburb), values: list.map((r) => r[suburbMetric]), horizontal: true, format: m.format,
        tooltipLabel: (c) => `${m.tip(c.parsed.x)} · ${plural(list[c.dataIndex].sold, 'sale')}` });
    };
    drawChart();
    document.getElementById('suburb-metric').addEventListener('change', (e) => { suburbMetric = e.target.value; drawChart(); });

    renderTable(document.getElementById('suburb-table'), 'suburbs', [
      { key: 'suburb', label: 'Suburb', html: (r) => esc(r.suburb) + small(r.sold) },
      { key: 'listings', label: 'Properties', num: true, html: (r) => num(r.listings) },
      { key: 'sold', label: 'Sales', num: true, html: (r) => num(r.sold) },
      { key: 'median', label: 'Median price', num: true, html: (r) => money(r.median) },
      { key: 'mean', label: 'Average price', num: true, html: (r) => money(r.mean) },
      { key: 'ppsqm', label: '$ per m²', num: true, html: (r) => money(r.ppsqm) },
      { key: 'dom', label: 'Days on market', num: true, html: (r) => (r.dom !== null ? num(r.dom) : '–') },
      ...METHOD_COLS
    ], rows, { sortKey: 'sold', sortDir: 'desc' });
  }

  // ---------- 3. My Predictions ----------

  const ERR_BUCKETS = [
    { lo: -Infinity, hi: -0.15, label: 'Sold 15%+ below' },
    { lo: -0.15, hi: -0.10, label: '10–15% below' },
    { lo: -0.10, hi: -0.05, label: '5–10% below' },
    { lo: -0.05, hi: 0, label: '0–5% below' },
    { lo: 0, hi: 0.05, label: '0–5% above' },
    { lo: 0.05, hi: 0.10, label: '5–10% above' },
    { lo: 0.10, hi: 0.15, label: '10–15% above' },
    { lo: 0.15, hi: Infinity, label: 'Sold 15%+ above' }
  ];

  function predictions(panel, ds, recs) {
    const need = missingNotice(ds, ['predicted', 'sold'], 'prediction accuracy');
    if (need) { panel.innerHTML = need; return; }
    const s = summarise(recs);
    const preds = s.preds;
    if (!preds.length) { panel.innerHTML = empty('No sold properties with a prediction match the current filters.'); return; }
    const abs = (r) => Math.abs(r.predErr);
    const within = (x) => preds.filter((r) => abs(r) <= x).length / preds.length;
    const tooHigh = preds.filter((r) => r.predErr < 0).length;
    const left = s.sold.filter((r) => r.predicted && r.predErr === null).length;
    const tendency = Math.abs(s.bias) < 0.005 ? 'No clear lean'
      : s.bias < 0 ? 'You tend to guess high' : 'You tend to guess low';

    // Over time
    const dated = preds.filter((r) => r.soldMonth);
    const byMonth = groupBy(dated, (r) => r.soldMonth);
    const months = monthRange([...byMonth.keys()]);
    const monthErr = months.map((k) => (byMonth.has(k) ? mean(byMonth.get(k).map(abs)) : null));
    let trend = '';
    if (dated.length >= SMALL * 2) {
      const sorted = [...dated].sort((a, b) => a.soldDate - b.soldDate);
      const half = Math.floor(sorted.length / 2);
      const early = mean(sorted.slice(0, half).map(abs)), late = mean(sorted.slice(half).map(abs));
      const since = date(sorted[half].soldDate);
      const verdict = late < early - 0.005 ? '<strong>you are getting more accurate</strong> 👍'
        : late > early + 0.005 ? '<strong>accuracy has slipped a little</strong> recently' : 'your accuracy has stayed about the same';
      trend = `Your more recent half of predictions (sold since ${since}) were ${pct(late)} away on average, compared with ${pct(early)} for the earlier half — ${verdict}.`;
    }

    const buckets = ERR_BUCKETS.map((b) => preds.filter((r) => r.predErr >= b.lo && r.predErr < b.hi).length);
    // edge case: exactly 0 counts as "0–5% above" (sold at the predicted price)
    const c = Charts.colors();

    // By suburb
    const subRows = [...groupBy(preds, (r) => r.suburb)].map(([suburb, list]) => ({
      suburb, n: list.length, mape: mean(list.map(abs)), bias: mean(list.map((r) => r.predErr)),
      w10: list.filter((r) => abs(r) <= 0.1).length / list.length
    }));

    panel.innerHTML = `
      ${kpis([
        kpi('Predictions compared', num(preds.length), left ? `${left} left out as likely typos (see Data Check)` : 'sold properties with a prediction'),
        kpi('Average error', pct(s.mape), 'how far off a guess was, on average, either way'),
        kpi('Within 5%', pct(within(0.05), 0), 'of guesses were within 5% of the sold price'),
        kpi('Within 10%', pct(within(0.10), 0), 'of guesses were within 10% of the sold price'),
        kpi(tendency, signedPct(s.bias), `sold ${s.bias < 0 ? 'below' : 'above'} your guess on average · too high ${tooHigh} times, too low ${preds.length - tooHigh}`)
      ])}
      <div class="grid-2">
        ${card('Is my accuracy improving?', months.length ? chartBox('ch-pred-time', 260) : empty('No sold dates to chart.'),
          `Each point is the average error for properties sold that month — <strong>lower is better</strong>. ${trend}`)}
        ${card('Did I guess high or low?', chartBox('ch-pred-hist', 260),
          `How many properties sold below or above your predicted price. <span class="swatch" style="background:${c.below}"></span> red bars = sold below your guess (you guessed high). <span class="swatch" style="background:${c.above}"></span> blue bars = sold above your guess (you guessed low).`)}
      </div>
      ${card('Accuracy by suburb', '<div id="pred-suburbs"></div>', '“Average error” ignores direction. “Lean” shows whether properties sold above (+) or below (−) your guess on average.')}
      <div class="grid-2">
        ${card('Best calls', '<div id="pred-best"></div>', 'The 10 predictions closest to the sold price.')}
        ${card('Worst calls', '<div id="pred-worst"></div>', 'The 10 predictions furthest from the sold price.')}
      </div>
    `;

    if (months.length) Charts.line('ch-pred-time', { labels: months.map(F.monthLabel), values: monthErr, format: (v) => pct(v, 0),
      tooltipLabel: (x) => `${pct(x.parsed.y)} average error (${plural(byMonth.get(months[x.dataIndex]).length, 'sale')})` });
    Charts.bar('ch-pred-hist', { labels: ERR_BUCKETS.map((b) => b.label), values: buckets, format: num,
      colors: ERR_BUCKETS.map((b) => (b.hi <= 0 ? c.below : c.above)), tooltipLabel: (x) => plural(x.parsed.y, 'property', 'properties') });

    renderTable(document.getElementById('pred-suburbs'), 'pred-suburbs', [
      { key: 'suburb', label: 'Suburb', html: (r) => esc(r.suburb) + small(r.n) },
      { key: 'n', label: 'Predictions', num: true, html: (r) => num(r.n) },
      { key: 'mape', label: 'Average error', num: true, html: (r) => pct(r.mape) },
      { key: 'w10', label: 'Within 10%', num: true, html: (r) => pct(r.w10, 0) },
      { key: 'bias', label: 'Lean', num: true, html: (r) => signedPct(r.bias) }
    ], subRows, { sortKey: 'n', sortDir: 'desc' });

    const callCols = [
      { key: 'address', wide: true, label: 'Property', value: (r) => r.address, html: (r) => `${link(r)}<div class="muted small">${esc(r.suburb)} · ${date(r.soldDate)}</div><div class="small">${method(r)}</div>` },
      { key: 'predicted', label: 'Predicted', num: true, html: (r) => money(r.predicted) },
      { key: 'sold', label: 'Sold', num: true, html: (r) => money(r.sold) },
      { key: 'err', label: 'Off by', num: true, value: (r) => Math.abs(r.predErr), html: (r) => signedPct(r.predErr) }
    ];
    const byAbs = [...preds].sort((a, b) => abs(a) - abs(b));
    renderTable(document.getElementById('pred-best'), 'pred-best', callCols, byAbs.slice(0, 10), { sortKey: 'err', sortDir: 'asc', compact: true });
    renderTable(document.getElementById('pred-worst'), 'pred-worst', callCols, byAbs.slice(-10).reverse(), { sortKey: 'err', sortDir: 'desc', compact: true });
  }

  // ---------- 4. Agents & Price Guides ----------

  function agents(panel, ds, recs) {
    if (!recs.length) { panel.innerHTML = empty(); return; }
    const need = missingNotice(ds, ['company'], 'agency comparisons');
    const s = summarise(recs);

    const agencyRows = [...groupBy(recs, (r) => r.company)].map(([agency, list]) => {
      const a = summarise(list);
      const m = a.methods;
      return { agency, listings: a.count, sold: a.soldCount, total: a.total, median: a.median, dom: a.dom,
        m, pAuction: m.share('auction'), pBefore: m.share('before'), pPrivate: m.share('private'),
        guideN: a.guided.length, above: a.aboveGuide, guideAvg: a.guideAvg };
    });
    const top = [...agencyRows].filter((r) => r.sold > 0).sort((a, b) => b.sold - a.sold || b.total - a.total).slice(0, 10);
    const aboveList = agencyRows.filter((r) => r.guideN >= SMALL).sort((a, b) => b.above - a.above);

    // Individual agents (a sale with two agents counts for both)
    const agentMap = new Map();
    s.sold.forEach((r) => r.agents.forEach((name) => {
      const key = name.toLowerCase();
      if (!agentMap.has(key)) agentMap.set(key, { name, agencies: new Map(), sales: [] });
      const a = agentMap.get(key);
      a.sales.push(r.sold);
      a.agencies.set(r.company, (a.agencies.get(r.company) || 0) + 1);
    }));
    const agentRows = [...agentMap.values()].map((a) => ({
      name: a.name, agency: [...a.agencies].sort((x, y) => y[1] - x[1]).map((x) => x[0]).join(', '),
      sales: a.sales.length, total: F.sum(a.sales), median: median(a.sales)
    })).sort((a, b) => b.sales - a.sales || b.total - a.total).slice(0, 20);

    panel.innerHTML = `
      ${need}
      ${missingNotice(ds, ['priceHigh'], 'price guide comparisons')}
      ${kpis([
        kpi('Sold above the price guide', pct(s.aboveGuide, 0), s.guided.length ? `of ${plural(s.guided.length, 'sale')} with a price guide` : 'no price guides'),
        kpi('Sold vs top of guide', signedPct(s.guideAvg), 'on average, compared with the top of the price guide'),
        kpi('Agencies', num(agencyRows.length), `with properties matching the filters`)
      ])}
      <div class="grid-2">
        ${card('Top 10 agencies by sales', top.length ? chartBox('ch-agency-top', barsHeight(top.length)) : empty(), 'The agencies that sold the most properties.')}
        ${card('How often each agency sells above its price guide', aboveList.length ? chartBox('ch-agency-above', barsHeight(aboveList.length)) : empty(`No agency has ${SMALL} or more sales with a price guide.`),
          `The share of each agency’s sales that went for more than the top of their quoted price guide (only agencies with at least ${SMALL} such sales). A high number can mean the agency quotes low guides.`)}
      </div>
      ${card('How the top 10 agencies sold', top.length ? methodRows(top.map((r) => ({ label: r.agency, counts: r.m }))) : empty(),
        'Each bar shows how that agency’s properties sold, from the Status column. The numbers on the right are the % sold at auction / before auction / privately. Hover over or tap a bar for the counts.')}
      ${card('All agencies', '<div id="agency-table"></div>',
        '“At auction”, “Before auction” and “Privately” are the % of the agency’s sold properties (number in brackets). “Above guide” is the share of sales above the top of the price guide; “vs guide” is how far above (+) or below (−) the guide they sold on average. Click a heading to sort.')}
      ${card('Top agents', '<div id="agent-table"></div>',
        'Individual agents ranked by number of sales. When two agents are named on one sale, it counts for both.')}
    `;
    if (top.length) Charts.bar('ch-agency-top', { labels: top.map((r) => r.agency), values: top.map((r) => r.sold), horizontal: true, format: num,
      tooltipLabel: (c) => `${plural(c.parsed.x, 'sale')} · ${moneyShort(top[c.dataIndex].total)} total` });
    if (aboveList.length) Charts.bar('ch-agency-above', { labels: aboveList.map((r) => r.agency), values: aboveList.map((r) => r.above), horizontal: true, format: (v) => pct(v, 0),
      tooltipLabel: (c) => `${pct(c.parsed.x, 0)} of ${aboveList[c.dataIndex].guideN} sales above guide` });

    renderTable(document.getElementById('agency-table'), 'agencies', [
      { key: 'agency', label: 'Agency', html: (r) => esc(r.agency) + small(r.sold) },
      { key: 'listings', label: 'Properties', num: true, html: (r) => num(r.listings) },
      { key: 'sold', label: 'Sales', num: true, html: (r) => num(r.sold) },
      { key: 'total', label: 'Total sold', num: true, html: (r) => moneyShort(r.total) },
      { key: 'median', label: 'Median price', num: true, html: (r) => money(r.median) },
      { key: 'dom', label: 'Days on market', num: true, html: (r) => (r.dom !== null ? num(r.dom) : '–') },
      ...METHOD_COLS,
      { key: 'above', label: 'Above guide', num: true, html: (r) => (r.above !== null ? `${pct(r.above, 0)} <span class="muted small">of ${r.guideN}</span>` : '–') },
      { key: 'guideAvg', label: 'vs guide', num: true, html: (r) => signedPct(r.guideAvg) }
    ], agencyRows, { sortKey: 'sold', sortDir: 'desc' });

    renderTable(document.getElementById('agent-table'), 'agents', [
      { key: 'name', label: 'Agent', html: (r) => esc(r.name) },
      { key: 'agency', label: 'Agency', html: (r) => esc(r.agency) },
      { key: 'sales', label: 'Sales', num: true, html: (r) => num(r.sales) },
      { key: 'total', label: 'Total sold', num: true, html: (r) => moneyShort(r.total) },
      { key: 'median', label: 'Median price', num: true, html: (r) => money(r.median) }
    ], agentRows, { sortKey: 'sales', sortDir: 'desc', emptyText: missingNotice(ds, ['agent'], 'top agents') ? 'No agent names in the spreadsheet.' : undefined });
  }

  // ---------- 5. Comparables ----------

  const comp = { suburbs: new Set(), land: '', plusMinus: '100', months: '6' };

  function comparables(panel, ds, recs) {
    const need = missingNotice(ds, ['sold', 'soldDate'], 'comparable sales');
    if (need) { panel.innerHTML = need; return; }
    const suburbCounts = [...groupBy(recs.filter((r) => r.isSold), (r) => r.suburb)].map(([value, l]) => ({ value, count: l.length })).sort((a, b) => a.value.localeCompare(b.value));
    [...comp.suburbs].forEach((x) => { if (!suburbCounts.some((o) => o.value === x)) comp.suburbs.delete(x); });

    panel.innerHTML = `
      ${card('Find comparable sales', `
        <div class="comp-controls">
          <div class="field" id="comp-suburbs"></div>
          <div class="field"><label class="field-label" for="comp-land">Land size (m²)</label><input type="number" inputmode="numeric" min="0" id="comp-land" placeholder="e.g. 650" value="${esc(comp.land)}"></div>
          <div class="field"><label class="field-label" for="comp-pm">Plus or minus (m²)</label><input type="number" inputmode="numeric" min="0" step="10" id="comp-pm" value="${esc(comp.plusMinus)}"></div>
          <div class="field"><label class="field-label" for="comp-months">Sold in the last</label>
            <select id="comp-months">${[['3', '3 months'], ['6', '6 months'], ['12', '12 months'], ['24', '2 years'], ['all', 'Any time']].map(([v, l]) => `<option value="${v}" ${comp.months === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>`, 'Choose the suburbs and land size of the property you’re interested in. Leave land size empty to include any size. The filters at the top of the page also apply here.')}
      <div id="comp-results"></div>
    `;
    UI.multiSelect(document.getElementById('comp-suburbs'), { label: 'Suburbs', allText: 'Any suburb', options: suburbCounts, selected: comp.suburbs, onChange: () => drawComps(recs) });
    const bind = (id, key) => document.getElementById(id).addEventListener('input', (e) => { comp[key] = e.target.value; drawComps(recs); });
    bind('comp-land', 'land'); bind('comp-pm', 'plusMinus'); bind('comp-months', 'months');
    drawComps(recs);
  }

  function drawComps(recs) {
    const out = document.getElementById('comp-results');
    if (!out) return;
    const land = Number(comp.land) > 0 ? Number(comp.land) : null;
    const pm = Math.max(0, Number(comp.plusMinus) || 0);
    const today = F.todayUTC();
    const since = comp.months === 'all' ? null : (() => { const d = new Date(today); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - Number(comp.months), d.getUTCDate()); })();
    const list = recs.filter((r) => r.isSold && r.soldDate !== null
      && (since === null || r.soldDate >= since)
      && (!comp.suburbs.size || comp.suburbs.has(r.suburb))
      && (land === null || (r.area !== null && r.area >= land - pm && r.area <= land + pm)));
    const prices = list.map((r) => r.sold);
    const ppsqmMed = median(vals(list, (r) => r.ppsqm));
    const where = comp.suburbs.size ? [...comp.suburbs].join(', ') : 'any suburb';
    const desc = `${where}${land ? `, ${num(land - pm)}–${num(land + pm)} m²` : ''}${since ? `, sold since ${date(since)}` : ''}`;

    if (!list.length) { out.innerHTML = card('Results', empty(`No sold properties found for ${desc}. Try a wider land size range or a longer time period.`)); return; }
    out.innerHTML = `
      ${kpis([
        kpi('Comparable sales', num(list.length), esc(desc)),
        kpi('Median sold price', money(median(prices)), 'the middle price of these sales'),
        kpi('Price range', `${moneyShort(Math.min(...prices))} – ${moneyShort(Math.max(...prices))}`, 'lowest to highest'),
        kpi('Median $ per m²', money(ppsqmMed), land && ppsqmMed ? `× ${num(land)} m² ≈ <strong>${money(ppsqmMed * land)}</strong> (rough guide only)` : 'sold price ÷ land size')
      ])}
      ${card('Matching properties', '<div id="comp-table"></div>', 'Newest sales first. Click an address to open the listing. Click a heading to sort.')}
    `;
    renderTable(document.getElementById('comp-table'), 'comps', [
      { key: 'address', wide: true, label: 'Address', value: (r) => r.address, html: (r) => link(r) },
      { key: 'suburb', label: 'Suburb', html: (r) => esc(r.suburb) },
      { key: 'soldDate', label: 'Sold', num: true, html: (r) => date(r.soldDate) },
      { key: 'area', label: 'Land m²', num: true, html: (r) => num(r.area) },
      { key: 'sold', label: 'Sold price', num: true, html: (r) => money(r.sold) },
      { key: 'ppsqm', label: '$ per m²', num: true, html: (r) => money(r.ppsqm) },
      { key: 'method', label: 'How sold', value: methodLabel, html: method },
      { key: 'company', label: 'Agency', html: (r) => esc(r.company) }
    ], list, { sortKey: 'soldDate', sortDir: 'desc' });
  }

  // ---------- 6. All Properties ----------

  const methodLabel = (r) => (r.method ? DataReader.METHODS[r.method] + (r.passedIn ? ' (passed in)' : '') : null);

  let search = '';
  const PROPERTY_COLS = [
    { key: 'no', label: 'No', num: true, html: (r) => esc(r.no ?? '–') },
    { key: 'address', wide: true, label: 'Address', value: (r) => r.address, html: (r) => link(r) },
    { key: 'suburb', label: 'Suburb', html: (r) => esc(r.suburb) },
    { key: 'method', label: 'How sold', value: methodLabel, html: method },
    { key: 'area', label: 'Land m²', num: true, html: (r) => num(r.area) },
    { key: 'listingDate', label: 'Listed', num: true, html: (r) => date(r.listingDate) },
    { key: 'soldDate', label: 'Sold date', num: true, html: (r) => date(r.soldDate) },
    { key: 'priceHigh', label: 'Guide (top)', num: true, html: (r) => money(r.priceHigh) },
    { key: 'predicted', label: 'My prediction', num: true, html: (r) => money(r.predicted) },
    { key: 'sold', label: 'Sold price', num: true, html: (r) => (r.isSold ? money(r.sold) : '–') },
    { key: 'ppsqm', label: '$ per m²', num: true, html: (r) => money(r.ppsqm) },
    { key: 'dom', label: 'Days on market', num: true, html: (r) => num(r.dom) },
    { key: 'company', label: 'Agency', html: (r) => esc(r.company) },
    { key: 'agentText', label: 'Agent', html: (r) => esc(r.agentText || '–') }
  ];
  const propTableOpts = { sortKey: 'soldDate', sortDir: 'desc', limit: 200 };

  function searched(recs) {
    const q = search.trim().toLowerCase();
    if (!q) return recs;
    return recs.filter((r) => [r.no, r.address, r.suburb, r.company, r.agentText, r.status, r.outcome, methodLabel(r)].some((v) => v != null && String(v).toLowerCase().includes(q)));
  }

  function properties(panel, ds, recs) {
    panel.innerHTML = `
      ${card('All properties', `
        <div class="toolbar">
          <input type="search" id="prop-search" placeholder="Search address, suburb, agency or agent…" value="${esc(search)}" aria-label="Search properties">
          <button type="button" class="btn" id="csv-btn">⬇ Download these rows (CSV)</button>
        </div>
        <p class="muted small" id="prop-count"></p>
        <div id="prop-table"></div>`,
        'Every property matching the filters (and the search box). Click a heading to sort, or an address to open the listing. The download is made on this computer and opens in Excel.')}
    `;
    const draw = () => {
      const list = searched(recs);
      document.getElementById('prop-count').textContent = `${plural(list.length, 'property', 'properties')}${search ? ` matching “${search}”` : ''}`;
      propTableOpts.showAll = false;
      renderTable(document.getElementById('prop-table'), 'properties', PROPERTY_COLS, list, propTableOpts);
    };
    draw();
    let timer;
    document.getElementById('prop-search').addEventListener('input', (e) => { search = e.target.value; clearTimeout(timer); timer = setTimeout(draw, 150); });
    document.getElementById('csv-btn').addEventListener('click', () => downloadCSV(searched(recs)));
  }

  function downloadCSV(list) {
    const cols = [
      ['No', (r) => r.no], ['Address', (r) => r.address], ['Suburb', (r) => r.suburb], ['HowSold', (r) => (r.method ? DataReader.METHODS[r.method] : null)], ['PassedInAtAuction', (r) => (r.passedIn ? 'Yes' : '')],
      ['Outcome', (r) => r.outcome], ['Status', (r) => r.status],
      ['LandSqM', (r) => r.area], ['ListingDate', (r) => F.toInputDate(r.listingDate)], ['AuctionDate', (r) => F.toInputDate(r.auctionDate)],
      ['SoldDate', (r) => F.toInputDate(r.soldDate)], ['PriceGuideTop', (r) => r.priceHigh], ['MyPredictedPrice', (r) => r.predicted],
      ['FinalReservePrice', (r) => r.reserve], ['SoldPrice', (r) => (r.isSold ? r.sold : null)], ['PricePerSqM', (r) => (r.ppsqm !== null ? Math.round(r.ppsqm) : null)],
      ['DaysOnMarket', (r) => r.dom], ['PredictionErrorPct', (r) => (r.predErr !== null ? +(r.predErr * 100).toFixed(2) : null)],
      ['VsPriceGuidePct', (r) => (r.guideErr !== null ? +(r.guideErr * 100).toFixed(2) : null)],
      ['Agency', (r) => r.company], ['Agent', (r) => r.agentText], ['Link', (r) => r.link]
    ];
    const cell = (v) => {
      if (v == null) return '';
      let s = String(v);
      if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = "'" + s;   // stops Excel treating text as a formula
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = '﻿' + [cols.map((c) => c[0]).join(','), ...list.map((r) => cols.map((c) => cell(c[1](r))).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `properties-${F.toInputDate(F.todayUTC())}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- 7. Data Check ----------

  const SEVERITY = {
    excluded: { icon: '⛔', label: 'Left out of some averages', open: true },
    check: { icon: '⚠️', label: 'Worth checking', open: true },
    fixed: { icon: '🔧', label: 'Fixed automatically', open: false },
    info: { icon: 'ℹ️', label: 'For information', open: false }
  };

  function datacheck(panel, ds) {
    const types = DataReader.ISSUE_TYPES;
    const byType = groupBy(ds.issues, (i) => i.type);
    const order = Object.keys(SEVERITY);
    const typeKeys = Object.keys(types).filter((t) => byType.has(t)).sort((a, b) => order.indexOf(types[a].sev) - order.indexOf(types[b].sev));
    const sevCount = (sev) => new Set(ds.issues.filter((i) => types[i.type].sev === sev).map((i) => i.recId)).size;
    const found = Object.keys(DataReader.COLUMNS).length - ds.missing.length;

    panel.innerHTML = `
      <p class="lead">This tab lists anything in the spreadsheet that looks wrong or unusual, so you can fix it in Excel. It always checks <strong>all</strong> ${plural(ds.records.length, 'property', 'properties')} (the filters don’t apply here). After fixing, click “Load new file” to reload.</p>
      ${kpis(order.map((sev) => kpi(`${SEVERITY[sev].icon} ${SEVERITY[sev].label}`, num(sevCount(sev)), 'properties')))}
      ${card('Columns', ds.missing.length
        ? `<p>Found ${found} of ${Object.keys(DataReader.COLUMNS).length} expected columns in the “${esc(ds.meta.sheetName)}” sheet. Missing:</p><ul>${ds.missing.map((k) => `<li><strong>${esc(DataReader.COLUMNS[k].label)}</strong> — needed for ${esc(DataReader.COLUMNS[k].usedFor)}.</li>`).join('')}</ul>`
        : `<p>✅ All ${found} expected columns were found in the “${esc(ds.meta.sheetName)}” sheet.</p>`)}
      ${ds.notes.length ? card('Tidied up automatically', `<ul class="notes">${ds.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`, 'These were fixed quietly while reading the file. Nothing in your spreadsheet was changed.') : ''}
      ${typeKeys.length ? typeKeys.map((t) => {
        const def = types[t], sev = SEVERITY[def.sev], list = byType.get(t);
        return `<details class="issue-group sev-${def.sev}" ${sev.open ? 'open' : ''}>
          <summary><span class="sev-tag">${sev.icon} ${sev.label}</span> <strong>${esc(def.title)}</strong> <span class="count-pill">${list.length}</span></summary>
          <p class="explain">${esc(def.help)}</p>
          <div id="issues-${t}"></div>
        </details>`;
      }).join('') : card('Issues', '<p>✅ No data problems found.</p>')}
    `;
    const recById = new Map(ds.records.map((r) => [r.id, r]));
    typeKeys.forEach((t) => renderTable(document.getElementById(`issues-${t}`), `issues-${t}`, [
      { key: 'no', label: 'No', num: true, html: (i) => esc(i.no ?? '–') },
      { key: 'address', wide: true, label: 'Address', html: (i) => link(recById.get(i.recId) || {}, i.address) },
      { key: 'suburb', label: 'Suburb', html: (i) => esc(i.suburb) },
      { key: 'method', label: 'How sold', value: (i) => methodLabel(recById.get(i.recId) || {}), html: (i) => method(recById.get(i.recId) || {}) },
      { key: 'detail', label: 'Details', html: (i) => esc(i.detail || '') }
    ], byType.get(t), { sortKey: 'no', sortDir: 'asc', compact: true, limit: 100 }));

    const badge = document.getElementById('issue-badge');
    const n = sevCount('excluded') + sevCount('check');
    badge.hidden = !n;
    badge.textContent = n;
  }

  window.Tabs = { overview, suburbs, predictions, agents, comparables, properties, datacheck, summarise, suburbRows };
})();
