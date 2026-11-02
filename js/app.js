/* app.js — the main controller: loading the file, remembering it on this device,
   the filters, switching tabs and light/dark mode. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = {
    dataset: null,
    filtered: [],
    tab: 'overview',
    stale: new Set(),     // tabs that need redrawing next time they're opened
    filters: null
  };

  const blankFilters = () => ({ suburbs: new Set(), outcomes: new Set(), agencies: new Set(), dateFrom: null, dateTo: null, areaMin: null, areaMax: null, priceMin: null, priceMax: null });

  // ---------- loading ----------

  function showScreen(which) {
    $('welcome').hidden = which !== 'welcome';
    $('loading').hidden = which !== 'loading';
    $('dashboard').hidden = which !== 'dashboard';
    const loaded = which === 'dashboard';
    $('load-btn').hidden = !loaded;
    $('forget-btn').hidden = !loaded;
    $('file-info').hidden = !loaded;
  }

  function showError(msg) {
    showScreen('welcome');
    const box = $('load-error');
    box.textContent = msg;
    box.hidden = !msg;
  }

  function notice(msg) {
    const bar = $('notice-bar');
    bar.textContent = msg || '';
    bar.hidden = !msg;
  }

  async function loadFile(file) {
    if (!file) return;
    if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) { showError('That doesn’t look like an Excel file. Please choose a file ending in .xlsx.'); return; }
    loadFromArrayBuffer(await file.arrayBuffer(), file.name);
  }

  async function loadFromArrayBuffer(buffer, fileName) {
    showScreen('loading');
    await new Promise((r) => setTimeout(r, 30));   // let the "Reading…" message appear
    let stored;
    try {
      stored = DataReader.readWorkbook(buffer, fileName);
      start(stored);
    } catch (e) {
      console.error(e);
      showError(e instanceof DataReader.UserError ? e.message : 'Something went wrong reading this file. Please check it is the right spreadsheet and try again.');
      return;
    }
    try {
      await Store.save(stored);
    } catch (e) {
      notice('Note: this browser wouldn’t let the dashboard remember your data, so you’ll need to choose the file again next time.');
    }
  }

  /** Builds the dashboard from the raw rows (fresh from a file, or remembered on this device). */
  function start(stored, fromMemory) {
    const ds = DataReader.process(stored);
    if (!ds.records.length) throw new DataReader.UserError('The spreadsheet was opened, but no rows with a suburb were found.');
    state.dataset = ds;
    state.filters = blankFilters();
    $('load-error').hidden = true;
    const when = new Date(ds.meta.loadedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    $('file-info').textContent = `${ds.meta.fileName} · ${F.plural(ds.records.length, 'property', 'properties')} · loaded ${when}${fromMemory ? ' (remembered on this device)' : ''}`;
    notice('');
    showScreen('dashboard');
    buildFilters();
    Tabs.datacheck($('tab-datacheck'), ds);
    applyFilters();
  }

  async function forget() {
    if (!confirm('Remove the saved copy of your data from this device?\n\nYour Excel file itself is not affected.')) return;
    await Store.clear();
    Charts.destroyAll();
    state.dataset = null;
    ['overview', 'suburbs', 'predictions', 'agents', 'comparables', 'properties', 'datacheck'].forEach((t) => { $('tab-' + t).innerHTML = ''; });
    showError('');
    $('file-input').value = '';
  }

  // ---------- filters ----------

  function countOptions(key) {
    const m = F.groupBy(state.dataset.records, (r) => r[key]);
    return [...m].map(([value, list]) => ({ value, count: list.length }));
  }

  function buildFilters() {
    const f = state.filters;
    UI.multiSelect($('f-suburbs'), { label: 'Suburb', allText: 'All suburbs', options: countOptions('suburb').sort((a, b) => a.value.localeCompare(b.value)), selected: f.suburbs, onChange: applyFilters });
    const recs = state.dataset.records;
    const outcomeOptions = OUTCOME_OPTIONS.map((o) => ({ value: o.label, count: recs.filter(o.test).length }));
    UI.multiSelect($('f-outcomes'), { label: 'Sale outcome', allText: 'All outcomes', options: outcomeOptions, selected: f.outcomes, onChange: applyFilters });
    UI.multiSelect($('f-agencies'), { label: 'Agency', allText: 'All agencies', options: countOptions('company').sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)), selected: f.agencies, onChange: applyFilters });
    ['f-date-from', 'f-date-to', 'f-area-min', 'f-area-max', 'f-price-min', 'f-price-max'].forEach((id) => { $(id).value = ''; });
    const dates = state.dataset.records.map((r) => r.soldDate).filter(F.isNum);
    if (dates.length) {
      ['f-date-from', 'f-date-to'].forEach((id) => { $(id).min = F.toInputDate(Math.min(...dates)); $(id).max = F.toInputDate(Math.max(...dates)); });
    }
    // Open the filter panel on big screens; keep it tucked away on phones.
    $('filters').open = window.matchMedia('(min-width: 800px)').matches;
  }

  function readInputs() {
    const f = state.filters;
    const n = (id) => { const v = $(id).value; return v === '' || isNaN(Number(v)) ? null : Number(v); };
    f.dateFrom = F.fromInputDate($('f-date-from').value);
    f.dateTo = F.fromInputDate($('f-date-to').value);
    f.areaMin = n('f-area-min'); f.areaMax = n('f-area-max');
    f.priceMin = n('f-price-min'); f.priceMax = n('f-price-max');
  }

  // Sale outcome choices, from the Status column. "Passed in at auction" is the part of
  // "Sold privately" that failed at auction first. Ticking several shows properties matching any of them.
  const OUTCOME_OPTIONS = [
    { label: 'Sold at auction', test: (r) => r.method === 'auction' },
    { label: 'Sold before auction', test: (r) => r.method === 'before' },
    { label: 'Sold privately', test: (r) => r.method === 'private' },
    { label: 'Passed in at auction', test: (r) => r.passedIn },
    { label: 'Not sold yet', test: (r) => r.method === 'notsold' }
  ];
  const outcomeMatches = (r, chosen) => OUTCOME_OPTIONS.some((o) => chosen.has(o.label) && o.test(r));

  function matches(r, f) {
    const inRange = (v, lo, hi) => (lo === null || (v !== null && v >= lo)) && (hi === null || (v !== null && v <= hi));
    return (!f.suburbs.size || f.suburbs.has(r.suburb))
      && (!f.outcomes.size || outcomeMatches(r, f.outcomes))
      && (!f.agencies.size || f.agencies.has(r.company))
      && inRange(r.soldDate, f.dateFrom, f.dateTo)
      && inRange(r.area, f.areaMin, f.areaMax)
      && inRange(r.isSold ? r.sold : null, f.priceMin, f.priceMax);
  }

  function applyFilters() {
    if (!state.dataset) return;
    readInputs();
    const f = state.filters;
    state.filtered = state.dataset.records.filter((r) => matches(r, f));

    const active = [];
    if (f.suburbs.size) active.push(f.suburbs.size === 1 ? [...f.suburbs][0] : `${f.suburbs.size} suburbs`);
    if (f.outcomes.size) active.push(f.outcomes.size === 1 ? [...f.outcomes][0] : `${f.outcomes.size} outcomes`);
    if (f.agencies.size) active.push(f.agencies.size === 1 ? [...f.agencies][0] : `${f.agencies.size} agencies`);
    if (f.dateFrom !== null || f.dateTo !== null) active.push('sold date');
    if (f.areaMin !== null || f.areaMax !== null) active.push('land size');
    if (f.priceMin !== null || f.priceMax !== null) active.push('price');
    const total = state.dataset.records.length;
    $('filters-active').textContent = active.length
      ? `${active.join(' · ')} — showing ${F.num(state.filtered.length)} of ${F.num(total)}`
      : `Showing all ${F.num(total)} properties`;
    $('reset-btn').disabled = !active.length;

    ['overview', 'suburbs', 'predictions', 'agents', 'comparables', 'properties'].forEach((t) => state.stale.add(t));
    renderTab();
  }

  function resetFilters() {
    state.filters = blankFilters();
    buildFilters();
    $('filters').open = true;
    applyFilters();
  }

  // ---------- tabs ----------

  function renderTab() {
    const t = state.tab;
    if (!state.dataset || !state.stale.has(t)) return;
    state.stale.delete(t);
    if (t === 'datacheck') return;
    Tabs[t]($('tab-' + t), state.dataset, state.filtered);
  }

  function selectTab(name) {
    state.tab = name;
    document.querySelectorAll('.tabs [role="tab"]').forEach((b) => {
      const on = b.dataset.tab === name;
      b.setAttribute('aria-selected', on);
      b.tabIndex = on ? 0 : -1;
      $('tab-' + b.dataset.tab).hidden = !on;
    });
    renderTab();
    try { history.replaceState(null, '', '#' + name); } catch (e) { /* not important */ }
  }

  // ---------- light / dark ----------

  const THEMES = ['auto', 'light', 'dark'];
  function currentTheme() { return document.documentElement.dataset.theme || 'auto'; }
  function setTheme(t) {
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    try { if (t === 'auto') localStorage.removeItem('pd-theme'); else localStorage.setItem('pd-theme', t); } catch (e) { /* fine */ }
    $('theme-label').textContent = t[0].toUpperCase() + t.slice(1);
    redrawCharts();
  }
  function redrawCharts() {
    if (!state.dataset) return;
    ['overview', 'suburbs', 'predictions', 'agents'].forEach((x) => state.stale.add(x));
    renderTab();
  }

  // ---------- wiring it all up ----------

  function init() {
    $('theme-label').textContent = currentTheme()[0].toUpperCase() + currentTheme().slice(1);
    $('theme-btn').addEventListener('click', () => setTheme(THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length]));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (currentTheme() === 'auto') redrawCharts(); });

    const input = $('file-input');
    $('choose-btn').addEventListener('click', () => input.click());
    $('load-btn').addEventListener('click', () => input.click());
    input.addEventListener('change', () => { loadFile(input.files[0]); input.value = ''; });
    $('forget-btn').addEventListener('click', forget);

    const drop = $('drop-zone');
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('dragging'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('dragging'); }));
    drop.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));

    let timer;
    ['f-date-from', 'f-date-to', 'f-area-min', 'f-area-max', 'f-price-min', 'f-price-max'].forEach((id) =>
      $(id).addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(applyFilters, 250); }));
    $('reset-btn').addEventListener('click', resetFilters);

    const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
    tabs.forEach((b, i) => {
      b.addEventListener('click', () => selectTab(b.dataset.tab));
      b.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        const next = tabs[(i + d + tabs.length) % tabs.length];
        next.focus(); selectTab(next.dataset.tab);
      });
    });
    const fromHash = location.hash.slice(1);
    if (tabs.some((b) => b.dataset.tab === fromHash)) state.tab = fromHash;
    selectTab(state.tab);

    // Ask for the access code first (skipped once unlocked on this device).
    Access.require(openDashboard);
  }

  /** Opens the remembered data straight away if there is any; otherwise shows "Choose Excel file". */
  function openDashboard() {
    showScreen('loading');
    Promise.all([retryLibrary('XLSX', 'sheetjs'), retryLibrary('Chart', 'chart.js')]).then(() => {
      const broken = typeof XLSX === 'undefined' || typeof Chart === 'undefined';
      return Store.load().then((stored) => {
        if (stored && stored.rows) {
          try {
            start(stored, true);
            if (broken) notice('Part of the dashboard didn’t download (charts or the Excel reader). Please check the internet connection and refresh the page.');
            return;
          } catch (e) { console.error(e); }
        }
        if (broken) showError('Part of the dashboard didn’t download. Please check the internet connection and refresh the page.');
        else showScreen('welcome');
      });
    });
  }

  /** If a library didn't download (e.g. a brief internet hiccup), try once more. */
  function retryLibrary(globalName, srcPart) {
    if (typeof window[globalName] !== 'undefined') return Promise.resolve();
    const original = document.querySelector(`script[src*="${srcPart}"]`);
    if (!original) return Promise.resolve();
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = original.src;
      s.integrity = original.integrity;
      s.crossOrigin = 'anonymous';
      s.onload = s.onerror = () => resolve();
      document.head.appendChild(s);
    });
  }

  // Used by the file picker, and handy for testing.
  window.PropertyDashboard = { loadFromArrayBuffer, state };

  document.addEventListener('DOMContentLoaded', init);
})();
