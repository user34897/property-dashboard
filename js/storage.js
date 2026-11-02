/* storage.js — remembers the last loaded spreadsheet on THIS device only, using the browser's
   built-in database (IndexedDB). Nothing here is ever sent over the internet. */
(function () {
  'use strict';

  const DB_NAME = 'property-dashboard';
  const STORE = 'data';
  const KEY = 'current';

  function open() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('This browser cannot store data.'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function run(mode, action) {
    return open().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = action(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); resolve(req && req.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    }));
  }

  window.Store = {
    save: (data) => run('readwrite', (s) => s.put(data, KEY)),
    load: () => run('readonly', (s) => s.get(KEY)).catch(() => null),
    /** Removes the saved copy completely. */
    clear() {
      return run('readwrite', (s) => s.delete(KEY)).catch(() => null).then(() => new Promise((resolve) => {
        try {
          const req = indexedDB.deleteDatabase(DB_NAME);
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        } catch (e) { resolve(); }
      }));
    }
  };
})();
