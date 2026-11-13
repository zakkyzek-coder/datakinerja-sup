/* DataKinerja browser bootstrap. Only a publishable/anon key belongs here. */
(function () {
  'use strict';
  const SUPABASE_URL = 'https://qrdmphbpqgsymfzxgija.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Wx4nny_sjmrxJVAROFkFUA_MenvQT3f';

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('Supabase JS gagal dimuat. Periksa koneksi CDN.');
    return;
  }
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.dataKinerjaSupabase = client;
  const service = window.createDataKinerjaService(client, { timezone: 'Asia/Makassar', dailyStartMonth: '2026-11' });

  async function getActiveProfile(user) {
    if (!user) return { error: 'Sesi login tidak ditemukan.' };
    const { data, error } = await client.from('bks_pengguna').select('nama,aktif').eq('user_id', user.id).maybeSingle();
    if (error) return { error: error.message };
    if (!data || !data.aktif) return { error: 'Akun belum terdaftar atau dinonaktifkan untuk DataKinerja.' };
    return { profile: data, role: String(user.app_metadata?.role || user.user_metadata?.role || 'user').toLowerCase() };
  }

  function createRunner() {
    let successHandler = null, failureHandler = null;
    const runner = {
      withSuccessHandler(fn) { successHandler = fn; return runner; },
      withFailureHandler(fn) { failureHandler = fn; return runner; },
      _call(promise) {
        Promise.resolve(promise).then(value => { if (successHandler) successHandler(value); })
          .catch(error => { if (failureHandler) failureHandler({ message: error?.message || String(error) }); else console.error(error); });
      },
      checkLogin(email, password) {
        const cleanEmail = String(email || '').trim();
        if (!cleanEmail.includes('@')) {
          runner._call(Promise.resolve({ success: false, message: 'Masukkan email akun Supabase, bukan username GAS.' }));
          return runner;
        }
        runner._call((async () => {
          const { data, error } = await client.auth.signInWithPassword({ email: cleanEmail, password: String(password || '') });
          if (error) return { success: false, message: 'Login gagal: ' + error.message };
          const check = await getActiveProfile(data.user);
          if (check.error) { await client.auth.signOut(); return { success: false, message: check.error }; }
          return {
            success: true, token: data.session.access_token,
            expiresIn: Math.max(60, Math.floor((data.session.expires_at * 1000 - Date.now()) / 1000)),
            nama: check.profile.nama || data.user.email, role: check.role,
            inisial: String(check.profile.nama || data.user.email || 'U').charAt(0).toUpperCase()
          };
        })());
        return runner;
      },
      getDataBundle(token, sheetNames, force) {
        runner._call((async () => {
          const { data: { session } } = await client.auth.getSession();
          if (!session) return { success: false, expired: true, message: 'Sesi berakhir. Silakan login kembali.', sheets: {}, missing: [] };
          const { data: profile, error } = await client.from('bks_pengguna').select('aktif').eq('user_id', session.user.id).maybeSingle();
          if (error) return { success: false, message: error.message, sheets: {}, missing: [] };
          if (!profile?.aktif) return { success: false, expired: true, message: 'Akun tidak aktif.', sheets: {}, missing: [] };
          return service.getDataBundle(sheetNames, !!force);
        })());
        return runner;
      },
      logout() {
        runner._call(client.auth.signOut().then(({ error }) => error ? { success: false, message: error.message } : { success: true }));
        return runner;
      },
      listUsers() {
        runner._call(Promise.resolve({ success: false, users: [], message: 'Pengelolaan akun sedang dipindahkan ke Supabase Auth dan belum diaktifkan di dashboard.' }));
        return runner;
      },
      createBranchUser() {
        runner._call(Promise.resolve({ success: false, message: 'Pembuatan akun cabang belum diaktifkan pada tahap migrasi ini.' }));
        return runner;
      },
      deleteBranchUser() {
        runner._call(Promise.resolve({ success: false, message: 'Penghapusan akun cabang belum diaktifkan pada tahap migrasi ini.' }));
        return runner;
      }
    };
    return runner;
  }

  if (!window.google) window.google = {};
  window.google.script = { get run() { return createRunner(); } };

  window.addEventListener('load', async function () {
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session || typeof window.bukaDashboard !== 'function') return;
      const check = await getActiveProfile(session.user);
      if (check.error) { await client.auth.signOut(); return; }
      window.bukaDashboard({
        success: true, token: session.access_token,
        expiresIn: Math.max(60, Math.floor((session.expires_at * 1000 - Date.now()) / 1000)),
        nama: check.profile.nama || session.user.email, role: check.role,
        inisial: String(check.profile.nama || session.user.email || 'U').charAt(0).toUpperCase()
      });
    } catch (error) { console.error('Pemulihan sesi gagal:', error); }
  });
})();
