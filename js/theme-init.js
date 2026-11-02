// Apply the saved light/dark choice before the page draws, to avoid a flash of the wrong colours.
try {
  var savedTheme = localStorage.getItem('pd-theme');
  if (savedTheme === 'light' || savedTheme === 'dark') document.documentElement.dataset.theme = savedTheme;
} catch (e) { /* storage blocked: just follow the device setting */ }
