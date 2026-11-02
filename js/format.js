/* format.js — small helpers for showing numbers, money and dates the Australian way,
   plus basic maths (average, median) used throughout the dashboard. */
(function () {
  'use strict';

  const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
  const whole = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });
  const dateFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const monthFmt = new Intl.DateTimeFormat('en-AU', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const DAY = 86400000;

  const isNum = (v) => typeof v === 'number' && isFinite(v);

  const F = {
    DAY,
    isNum,

    /** $1,265,000 */
    money: (v) => (isNum(v) ? money.format(v) : '–'),

    /** $1.27m or $850k — for chart axes and tight spaces */
    moneyShort(v) {
      if (!isNum(v)) return '–';
      const a = Math.abs(v);
      if (a >= 1e6) return (v < 0 ? '-$' : '$') + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'm';
      if (a >= 1e3) return (v < 0 ? '-$' : '$') + Math.round(a / 1e3) + 'k';
      return money.format(v);
    },

    num: (v) => (isNum(v) ? whole.format(v) : '–'),

    /** 0.123 → "12.3%" */
    pct(v, digits = 1) {
      if (!isNum(v)) return '–';
      return (v * 100).toFixed(digits).replace(/\.0$/, '') + '%';
    },

    /** 0.123 → "+12.3%" */
    signedPct(v, digits = 1) {
      if (!isNum(v)) return '–';
      return (v > 0 ? '+' : '') + F.pct(v, digits);
    },

    days: (v) => (isNum(v) ? (Math.round(v) === 1 ? '1 day' : Math.round(v) + ' days') : '–'),

    /** Dates are stored as "milliseconds at midnight UTC" so they never shift with time zones. */
    date: (ms) => (isNum(ms) ? dateFmt.format(new Date(ms)) : '–'),
    monthLabel: (key) => monthFmt.format(new Date(key + '-01T00:00:00Z')),
    monthKey: (ms) => new Date(ms).toISOString().slice(0, 7),
    toInputDate: (ms) => (isNum(ms) ? new Date(ms).toISOString().slice(0, 10) : ''),
    fromInputDate: (s) => (s ? Date.parse(s + 'T00:00:00Z') : null),
    todayUTC() {
      const n = new Date();
      return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
    },

    /** Make text safe to put inside HTML (stops odd characters in the data breaking the page). */
    esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    /** Only allow real web links. */
    safeUrl(u) {
      if (!u) return null;
      const s = String(u).trim();
      return /^https?:\/\//i.test(s) ? s : null;
    },

    // ---- maths ----
    sum: (xs) => xs.reduce((a, b) => a + b, 0),
    mean: (xs) => (xs.length ? F.sum(xs) / xs.length : null),
    median(xs) {
      if (!xs.length) return null;
      const s = [...xs].sort((a, b) => a - b);
      const m = s.length >> 1;
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    },
    ratio: (a, b) => (b ? a / b : null),
    vals: (rows, fn) => rows.map(fn).filter(isNum),

    groupBy(rows, keyFn) {
      const m = new Map();
      rows.forEach((r) => {
        const k = keyFn(r);
        if (k == null) return;
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(r);
      });
      return m;
    },

    plural: (n, one, many) => `${F.num(n)} ${n === 1 ? one : many || one + 's'}`
  };

  window.F = F;
})();
