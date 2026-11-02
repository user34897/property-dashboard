/* charts.js — draws the charts (using the Chart.js library) in colours that match light or dark mode. */
(function () {
  'use strict';

  const instances = {};

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function theme() {
    return {
      text: css('--text-2'),
      grid: css('--grid'),
      surface: css('--surface'),
      s1: css('--series-1'),
      s2: css('--series-2'),
      above: css('--above'),
      below: css('--below'),
      neutral: css('--neutral')
    };
  }

  function baseOptions(t, { horizontal, format, tooltipLabel, zero }) {
    const valueAxis = {
      beginAtZero: zero !== false,
      grid: { color: t.grid, drawTicks: false },
      border: { display: false },
      ticks: { color: t.text, padding: 6, callback: (v) => format(v), maxTicksLimit: 6 }
    };
    const catAxis = {
      grid: { display: false },
      border: { color: t.grid },
      ticks: { color: t.text, autoSkip: !horizontal, maxRotation: 0 }
    };
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      indexAxis: horizontal ? 'y' : 'x',
      interaction: { mode: 'index', intersect: false, axis: horizontal ? 'y' : 'x' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: t.surface,
          titleColor: css('--text'),
          bodyColor: css('--text'),
          borderColor: t.grid,
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: { label: tooltipLabel || ((ctx) => format(ctx.parsed[horizontal ? 'x' : 'y'])) }
        }
      },
      scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis }
    };
  }

  function make(canvasId, config) {
    if (instances[canvasId]) instances[canvasId].destroy();
    const el = document.getElementById(canvasId);
    if (!el || typeof Chart === 'undefined') return;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 13;
    instances[canvasId] = new Chart(el, config);
  }

  const Charts = {
    /**
     * Bar chart with one colour (or a colour per bar via opts.colors).
     * opts: labels, values, format, horizontal, tooltipLabel, colors, zero (false = don't force the axis to start at 0)
     */
    bar(canvasId, opts) {
      const t = theme();
      const options = baseOptions(t, opts);
      make(canvasId, {
        type: 'bar',
        data: {
          labels: opts.labels,
          datasets: [{
            data: opts.values,
            backgroundColor: opts.colors || t.s1,
            borderRadius: 4,
            borderSkipped: 'start',
            maxBarThickness: opts.horizontal ? 22 : 36,
            categoryPercentage: 0.8,
            barPercentage: 0.9
          }]
        },
        options
      });
    },

    /** Line chart, one series. Gaps (null) are left as gaps. */
    line(canvasId, opts) {
      const t = theme();
      const options = baseOptions(t, opts);
      make(canvasId, {
        type: 'line',
        data: {
          labels: opts.labels,
          datasets: [{
            data: opts.values,
            borderColor: opts.color || t.s1,
            backgroundColor: opts.color || t.s1,
            borderWidth: 2,
            pointRadius: opts.values.length > 30 ? 0 : 3,
            pointHoverRadius: 5,
            tension: 0.25,
            spanGaps: false
          }]
        },
        options
      });
    },

    colors: theme,

    destroyAll() {
      Object.keys(instances).forEach((k) => { instances[k].destroy(); delete instances[k]; });
    }
  };

  window.Charts = Charts;
})();
