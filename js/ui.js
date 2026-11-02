/* ui.js — reusable pieces of the page: headline figure tiles, sortable tables,
   tick-box dropdowns and chart boxes. */
(function () {
  'use strict';

  const esc = F.esc;

  // ---------- headline figure tiles ----------
  /** opts.dot: a sale method key ("auction" etc.) to show its coloured dot before the label. */
  function kpi(label, value, sub, opts = {}) {
    const dot = opts.dot ? `<span class="mb-key m-${opts.dot}" aria-hidden="true"></span> ` : '';
    return `<div class="kpi"><div class="kpi-label">${dot}${esc(label)}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
  }
  const kpis = (items) => `<div class="kpi-grid">${items.join('')}</div>`;

  // ---------- section card with a title and plain-English explanation ----------
  function card(title, body, explain, extraClass) {
    return `<section class="card ${extraClass || ''}"><h3>${esc(title)}</h3>${body}${explain ? `<p class="explain">${explain}</p>` : ''}</section>`;
  }

  /** A box for a chart. Height grows with the number of bars for sideways bar charts. */
  function chartBox(id, height) {
    return `<div class="chart-box" style="height:${Math.round(height || 260)}px"><canvas id="${id}" role="img"></canvas></div>`;
  }
  const barsHeight = (n) => Math.max(160, n * 30 + 40);

  /** A friendly message when a needed column is missing from the spreadsheet. */
  function missingNotice(ds, keys, what) {
    const miss = keys.filter((k) => !ds.has(k));
    if (!miss.length) return '';
    const names = miss.map((k) => `“${DataReader.COLUMNS[k].label}”`).join(' and ');
    return `<div class="notice">ℹ️ Couldn’t find the ${names} column${miss.length > 1 ? 's' : ''} in your spreadsheet, so ${what} can’t be shown. Everything else still works.</div>`;
  }

  const empty = (msg) => `<p class="empty">${esc(msg || 'Nothing matches the current filters.')}</p>`;

  function link(r, text) {
    const url = F.safeUrl(r.link);
    const t = esc(text || r.address || '(no address)');
    return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${t}</a>` : t;
  }

  // ---------- sortable tables ----------
  // Columns look like: { key, label, value: row => value used for sorting, html: row => cell content, num: true, wide: true }
  const tables = {};

  function renderTable(container, id, cols, rows, opts = {}) {
    tables[id] = { container, cols, rows, opts };
    const sort = (opts.sortState || (opts.sortState = { key: opts.sortKey || cols[0].key, dir: opts.sortDir || 'desc' }));
    const col = cols.find((c) => c.key === sort.key) || cols[0];
    const val = col.value || ((r) => r[col.key]);
    const sorted = [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      const xn = x == null || x === '', yn = y == null || y === '';
      if (xn || yn) return xn && yn ? 0 : xn ? 1 : -1;        // blanks always at the bottom
      const c = typeof x === 'string' ? x.localeCompare(y, 'en-AU', { numeric: true }) : x - y;
      return sort.dir === 'asc' ? c : -c;
    });
    const limit = opts.showAll ? Infinity : (opts.limit || Infinity);
    const shown = sorted.slice(0, limit);

    const head = cols.map((c) => {
      const active = c.key === sort.key;
      const aria = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
      return `<th scope="col" class="${c.num ? 'num' : ''}" aria-sort="${aria}"><button type="button" data-table="${id}" data-sort="${c.key}">${esc(c.label)}<span class="sort-mark" aria-hidden="true">${active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span></button></th>`;
    }).join('');
    const body = shown.map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? 'num' : ''}${c.wide ? ' wide' : ''}">${c.html ? c.html(r) : esc(val(r) ?? '–')}</td>`).join('')}</tr>`).join('');
    const more = sorted.length > shown.length
      ? `<p class="table-more">Showing ${F.num(shown.length)} of ${F.num(sorted.length)}. <button type="button" class="btn btn-small" data-table-all="${id}">Show all</button></p>` : '';

    container.innerHTML = rows.length
      ? `<div class="table-wrap"><table class="data-table ${opts.compact ? 'compact' : ''}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${more}`
      : empty(opts.emptyText);
  }

  document.addEventListener('click', (e) => {
    const sortBtn = e.target.closest('button[data-sort]');
    if (sortBtn) {
      const t = tables[sortBtn.dataset.table];
      if (!t) return;
      const key = sortBtn.dataset.sort;
      const s = t.opts.sortState;
      if (s.key === key) s.dir = s.dir === 'asc' ? 'desc' : 'asc';
      else {
        s.key = key;
        const col = t.cols.find((c) => c.key === key);
        s.dir = col && col.num ? 'desc' : 'asc';
      }
      renderTable(t.container, sortBtn.dataset.table, t.cols, t.rows, t.opts);
      const again = t.container.querySelector(`button[data-sort="${key}"]`);
      if (again) again.focus();
    }
    const allBtn = e.target.closest('button[data-table-all]');
    if (allBtn) {
      const t = tables[allBtn.dataset.tableAll];
      t.opts.showAll = true;
      renderTable(t.container, allBtn.dataset.tableAll, t.cols, t.rows, t.opts);
    }
  });

  // ---------- tick-box dropdown (pick several suburbs, etc.) ----------
  // Nothing ticked means "all".
  function multiSelect(container, { label, allText, options, selected, onChange }) {
    const id = 'ms-' + Math.random().toString(36).slice(2, 8);
    container.innerHTML = `
      <span class="field-label" id="${id}-l">${esc(label)}</span>
      <details class="ms">
        <summary aria-labelledby="${id}-l ${id}-v"><span class="ms-value" id="${id}-v"></span><span class="ms-caret" aria-hidden="true">▾</span></summary>
        <div class="ms-panel">
          ${options.length > 8 ? `<input type="search" class="ms-search" placeholder="Type to find…" aria-label="Search ${esc(label)}">` : ''}
          <div class="ms-list">
            ${options.map((o) => `<label class="ms-opt"><input type="checkbox" value="${esc(o.value)}" ${selected.has(o.value) ? 'checked' : ''}><span>${esc(o.value)}</span>${o.count != null ? `<span class="ms-count">${F.num(o.count)}</span>` : ''}</label>`).join('')}
          </div>
          <div class="ms-actions"><button type="button" class="btn btn-small" data-ms="clear">Clear (show all)</button></div>
        </div>
      </details>`;
    const valueEl = container.querySelector('.ms-value');
    const update = () => {
      valueEl.textContent = selected.size === 0 ? allText : selected.size === 1 ? [...selected][0] : `${selected.size} selected`;
    };
    update();
    container.querySelectorAll('.ms-opt input').forEach((cb) => cb.addEventListener('change', () => {
      if (cb.checked) selected.add(cb.value); else selected.delete(cb.value);
      update(); onChange();
    }));
    container.querySelector('[data-ms="clear"]').addEventListener('click', () => {
      selected.clear();
      container.querySelectorAll('.ms-opt input').forEach((cb) => { cb.checked = false; });
      update(); onChange();
    });
    const search = container.querySelector('.ms-search');
    if (search) search.addEventListener('input', () => {
      const q = search.value.toLowerCase();
      container.querySelectorAll('.ms-opt').forEach((o) => { o.hidden = !o.textContent.toLowerCase().includes(q); });
    });
  }

  // Close any open dropdown when clicking elsewhere.
  document.addEventListener('click', (e) => {
    document.querySelectorAll('details.ms[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('details.ms[open]').forEach((d) => { d.open = false; d.querySelector('summary').focus(); });
  });

  // ---------- how a property sold ----------
  const METHOD_KEYS = ['auction', 'before', 'private'];
  const PASSED_TIP = 'Failed at auction, then sold privately';
  const passedBadge = `<span class="badge-passed" tabindex="0" role="note" data-tip="${PASSED_TIP}" aria-label="Passed in: ${PASSED_TIP}">Passed in</span>`;

  /** "Sold privately [Passed in]" for one property. */
  function method(r) {
    if (!r.method) return '<span class="muted">–</span>';
    return `<span class="method"><span class="method-label"><span class="mb-key m-${r.method}" aria-hidden="true"></span>${esc(DataReader.METHODS[r.method])}</span>${r.passedIn ? passedBadge : ''}</span>`;
  }

  /** Counts each way of selling for a group of properties. Percentages are of the three sold categories. */
  function methodCounts(recs) {
    const c = { auction: 0, before: 0, private: 0, passedIn: 0, notsold: 0, unknown: 0 };
    recs.forEach((r) => {
      if (r.method) c[r.method]++; else c.unknown++;
      if (r.passedIn) c.passedIn++;
    });
    c.sold = c.auction + c.before + c.private;
    c.share = (k) => (c.sold ? c[k] / c.sold : null);
    return c;
  }

  /** A short split bar for each row (e.g. each agency), sharing one key. rows: [{ label, counts }] */
  function methodRows(rows) {
    const key = METHOD_KEYS.map((k) => `<span class="mb-legend-item"><span class="mb-key m-${k}" aria-hidden="true"></span>${DataReader.METHODS[k]}</span>`).join('');
    return `<div class="mb-key-row">${key}</div>
      <div class="mr">${rows.map(({ label, counts: c }) => {
        const tip = METHOD_KEYS.map((k) => `${DataReader.METHODS[k]}: ${c[k]} (${F.pct(c.share(k), 0)})`).join(' · ') + (c.passedIn ? ` · ${c.passedIn} passed in first` : '');
        return `<div class="mr-row" tabindex="0" data-tip="${esc(tip)}">
          <span class="mr-label">${esc(label)}</span>
          <span class="mb-bar mb-bar-sm" role="img" aria-label="${esc(label + ': ' + tip)}">${METHOD_KEYS.filter((k) => c[k]).map((k) => `<span class="mb-seg m-${k}" style="flex-grow:${c[k]}"></span>`).join('')}</span>
          <span class="mr-pcts">${METHOD_KEYS.map((k) => F.pct(c.share(k), 0)).join(' / ')}</span>
        </div>`;
      }).join('')}</div>`;
  }

  // ---------- small tooltip for badges (works with mouse hover, keyboard and tapping on a phone) ----------
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  let tipFor = null;
  function showTip(el) {
    if (!tip.isConnected) document.body.appendChild(tip);
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    tipFor = el;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    const top = r.top - h - 6 < 4 ? r.bottom + 6 : r.top - h - 6;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function hideTip() { tip.hidden = true; tipFor = null; }
  document.addEventListener('mouseover', (e) => { const el = e.target.closest('[data-tip]'); if (el) showTip(el); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest('[data-tip]') && !e.target.contains(document.activeElement)) hideTip(); });
  document.addEventListener('focusin', (e) => { const el = e.target.closest('[data-tip]'); if (el) showTip(el); });
  document.addEventListener('focusout', (e) => { if (e.target.closest('[data-tip]')) hideTip(); });
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-tip]');
    if (el) showTip(el); else hideTip();
  });
  window.addEventListener('scroll', hideTip, true);

  window.UI = { kpi, kpis, card, chartBox, barsHeight, missingNotice, empty, link, renderTable, multiSelect, method, methodCounts, methodRows };
})();
