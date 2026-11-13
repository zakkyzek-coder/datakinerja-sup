/**
 * DataKinerja transport adapter.
 * Keeps the legacy google.script.run call pattern so dashboard logic is unchanged.
 */
(function () {
  'use strict';

  // Set this to the deployed Cloudflare Worker URL, not the Apps Script URL.
  const API_BRIDGE_URL = 'https://datakinerja-api.zakkyzek.workers.dev';

  function createRunner() {
    let successHandler = null;
    let failureHandler = null;
    const runner = {
      withSuccessHandler(fn) { successHandler = fn; return runner; },
      withFailureHandler(fn) { failureHandler = fn; return runner; },
      _call(method, args) {
        if (!API_BRIDGE_URL || API_BRIDGE_URL.includes('PASTE_CLOUDFLARE')) {
          const error = { message: 'API belum dikonfigurasi. Deploy Cloudflare Worker lalu isi API_BRIDGE_URL di gas-api-client.js.' };
          if (failureHandler) failureHandler(error);
          else console.error(error.message);
          return runner;
        }
        fetch(API_BRIDGE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method, args })
        })
          .then(async response => {
            const text = await response.text();
            let data;
            try { data = JSON.parse(text); }
            catch (_) { throw new Error('Respons API tidak valid (HTTP ' + response.status + ').'); }
            if (!response.ok) throw new Error(data.message || ('HTTP ' + response.status));
            return data;
          })
          .then(value => { if (successHandler) successHandler(value); })
          .catch(error => {
            const result = { message: error && error.message ? error.message : String(error) };
            if (failureHandler) failureHandler(result);
            else console.error('DataKinerja API:', result.message);
          });
        return runner;
      },
      checkLogin(username, password) { return runner._call('checkLogin', [username, password]); },
      logout(token) { return runner._call('logout', [token]); },
      getDataBundle(token, sheetNames, force) { return runner._call('getDataBundle', [token, sheetNames, force]); },
      listUsers(token) { return runner._call('listUsers', [token]); },
      createBranchUser(token, username, password) { return runner._call('createBranchUser', [token, username, password]); },
      deleteBranchUser(token, username) { return runner._call('deleteBranchUser', [token, username]); }
    };
    return runner;
  }

  if (!window.google) window.google = {};
  if (!window.google.script) window.google.script = {};
  Object.defineProperty(window.google.script, 'run', {
    configurable: true,
    get: createRunner
  });
})();
