/* access.js — the access code screen.
   Only a scrambled version (a "hash") of the code is stored here, never the code itself.
   The browser scrambles whatever is typed in the same way and compares the results.

   Note: this is a "private" sign, not a lock. The website contains none of the spreadsheet data
   (that only ever lives on the device that opened it), so there is nothing here to protect beyond
   keeping casual visitors out.

   To change the code: run this in a terminal, replacing YOUR CODE, and paste the two outputs below.
     python3 -c "import hashlib,os; s=os.urandom(16).hex(); c=' '.join('YOUR CODE'.split()).lower(); print(s); print(hashlib.pbkdf2_hmac('sha256',c.encode(),bytes.fromhex(s),310000).hex())"
*/
(function () {
  'use strict';

  const ACCESS = {
    salt: '7ee089d73e8b744f086a4180cda6623e',
    iterations: 310000,
    hash: '1c4d397b3ed5ba543dbe0fc3e5ca00523106dea457e13351247a9fd6fcf7abde'
  };
  const UNLOCK_KEY = 'pd-unlocked';

  /** Capital letters and extra spaces don't matter. */
  const normalise = (code) => code.trim().split(/\s+/).join(' ').toLowerCase();

  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const fromHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));

  async function hashOf(code) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalise(code)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(ACCESS.salt), iterations: ACCESS.iterations }, key, 256);
    return hex(bits);
  }

  /** Remembered on this device. Storing the hash means changing the code asks for the new one. */
  function isUnlocked() {
    try { return localStorage.getItem(UNLOCK_KEY) === ACCESS.hash; } catch (e) { return false; }
  }
  function rememberUnlock() {
    try { localStorage.setItem(UNLOCK_KEY, ACCESS.hash); } catch (e) { /* will just ask again next time */ }
  }

  /** Shows the code screen if needed; calls onUnlocked() once the right code is entered (or straight away). */
  function require(onUnlocked) {
    if (isUnlocked()) { onUnlocked(); return; }
    const gate = document.getElementById('gate');
    const form = document.getElementById('gate-form');
    const input = document.getElementById('gate-code');
    const msg = document.getElementById('gate-msg');
    const btn = document.getElementById('gate-btn');
    gate.hidden = false;
    input.focus();

    if (!window.crypto || !crypto.subtle) {
      msg.textContent = 'This browser can’t check the code here. Please open the dashboard from its web address (starting with https://).';
      msg.hidden = false;
      btn.disabled = true;
      return;
    }

    input.addEventListener('input', () => { msg.hidden = true; input.removeAttribute('aria-invalid'); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!input.value.trim()) { input.focus(); return; }
      btn.disabled = true;
      btn.textContent = 'Checking…';
      const ok = (await hashOf(input.value)) === ACCESS.hash;
      btn.disabled = false;
      btn.textContent = 'Unlock';
      if (!ok) {
        msg.textContent = 'That code isn’t right. Please check it and try again.';
        msg.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.select();
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
        return;
      }
      rememberUnlock();
      input.value = '';
      gate.classList.add('granted');
      document.getElementById('gate-success').hidden = false;
      setTimeout(() => { gate.hidden = true; onUnlocked(); }, 1300);
    });
  }

  window.Access = { require };
})();
