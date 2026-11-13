/* ======================= KONFIGURASI ======================= */
    const ENTITAS_UUS = 'Unit Usaha Syariah';
    const KONSOL_BJM = 'KCS Banjarmasin Konsolidasi';
    const KONSOL_KDG = 'KCS Kandangan Konsolidasi';
    const UUS_KP = 'UUS KP';
    const ENTITAS_KONSOLIDASI = [ENTITAS_UUS, UUS_KP, KONSOL_BJM, KONSOL_KDG];

    // Dipakai bila data sheet belum memuat kolom "Kelompok Unit Kerja".
    const DEFAULT_ANGGOTA = {
      [KONSOL_BJM]: ['Zonasi KCS Banjarmasin', 'Zonasi KCS Batulicin', 'Zonasi KCPS Banjarbaru Q Mall', 'Zonasi KCPS Gatot Subroto', 'Zonasi KCPS Handil Bakti', 'Zonasi KCPS Martapura', 'Zonasi KCPS Pelaihari'],
      [KONSOL_KDG]: ['Zonasi KCS Kandangan', 'Zonasi KCPS Amuntai', 'Zonasi KCPS Paringin', 'Zonasi KCPS Barabai', 'Zonasi KCPS Tanjung', 'Zonasi KCPS Rantau']
    };

    const WARNA = {
      hijau: '#0a7340', teal: '#0b8793', ungu: '#6343c6', oranye: '#ea8010', biru: '#1d4ed8', merah: '#dc2626',
      palet: ['#0a7340', '#0b8793', '#ea8010', '#6343c6', '#1d4ed8']
    };

    const NAMA_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];

    // fmt: 'rp' = nominal Rupiah, 'num' = jumlah rekening (NOA), 'pct' = rasio
    // Menu sidebar (MENU_CONFIG) diatur di navigation.html.

    /* ======================= STATE ======================= */
    const PAGES = {};          // diisi oleh file halaman: PAGES.hldpk = {...}
    const DATA = {};           // nama sheet -> array baris ternormalisasi
    const DATA_RAW = {};
    const MONTH_IDX = {};
    const SOURCE_ERRORS = {};
    const DATA_IDX = {};       // nama sheet -> Map("unit|periode" -> baris)
    const MISSING = new Set(); // sheet yang tidak ditemukan di Spreadsheet
    const CHARTS = {};         // id canvas -> instance Chart.js
    const KELOMPOK_UNIT = new Map(); // unit kerja -> kelompok konsolidasi

    const STATE = {
      token: null,
      role: '',
      page: 'home',
      activeMenuId: 'highlight',
      lastUpdated: '',
      mode: 'Bulanan',
      periods: { Bulanan: '', Harian: '' },
      settings: { dailyStartMonth: '2026-11', today: '' }
    };

    let countdownInterval = null, autoSyncInterval = null, permintaanKe = 0;

    /* ======================= FORMAT ======================= */
    function esc(str) {
      return (str === null || str === undefined ? '' : str.toString())
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function fmtRp(n) {
      return n === null || n === undefined ? '-' : 'Rp ' + Math.round(n).toLocaleString('id-ID');
    }

    function fmtNum(n) {
      return n === null || n === undefined ? '-' : Math.round(n).toLocaleString('id-ID');
    }

    function fmtPct(d, digit = 2) {
      if (d === null || d === undefined || !isFinite(d)) return '-';
      return (d * 100).toLocaleString('id-ID', { minimumFractionDigits: digit, maximumFractionDigits: digit }) + '%';
    }

    function fmtNilai(n, fmt) {
      if (fmt === 'pct') return fmtPct(n);
      if (fmt === 'num') return fmtNum(n);
      return fmtRp(n);
    }

    function fmtSumbu(v, fmt) {
      if (fmt === 'pct') return (v * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%';
      return Number(v).toLocaleString('id-ID');
    }

    function arahIndikator(sheet) {
      if (/NPF|BOPO|By BagHas|By Opr/i.test(sheet || '')) return 'rendah';
      if (/FDR|FAR/i.test(sheet || '')) return 'rentang';
      return 'tinggi';
    }

    function statusGrowth(d, sheet) {
      if (d === null || d === undefined || !isFinite(d)) return { cls: 'badge-neutral', label: 'Pembanding belum tersedia' };
      const arah = arahIndikator(sheet), naik = d > 0;
      if (!d || arah === 'rentang') return { cls: 'badge-neutral', label: d ? (naik ? 'Naik; penilaian mengikuti rentang target' : 'Turun; penilaian mengikuti rentang target') : 'Tetap' };
      const baik = arah === 'rendah' ? !naik : naik;
      return { cls: baik ? 'badge-pos' : 'badge-neg', label: (naik ? 'Naik, ' : 'Turun, ') + (baik ? 'membaik' : 'memburuk') };
    }

    function statusTarget(sheet, v, t) {
      if (v === null || v === undefined || t === null || t === undefined || t <= 0) return { cls: 'badge-neutral', label: 'Target belum tersedia', color: WARNA.teal };
      const arah = arahIndikator(sheet);
      if (arah === 'rentang') return { cls: 'badge-neutral', label: 'Penilaian memerlukan rentang target', color: WARNA.teal };
      const baik = arah === 'rendah' ? v <= t : v >= t;
      return { cls: baik ? 'badge-pos' : 'badge-neg', label: arah === 'rendah' ? (baik ? 'Dalam batas target' : 'Di atas batas target') : (baik ? 'Target tercapai' : 'Di bawah target'), color: baik ? WARNA.hijau : WARNA.merah };
    }

    function badgeGrowth(d, sheet) {
      if (d === null || d === undefined || !isFinite(d)) return '<span class="badge-growth badge-neutral">-</span>';
      const status = statusGrowth(d, sheet);
      return `<span class="badge-growth ${status.cls}" title="${esc(status.label)}" aria-label="${esc(status.label)}: ${fmtPct(d)}">${fmtPct(d)}<span class="growth-note">${esc(status.label)}</span></span>`;
    }

    function namaPendek(unit) {
      return (unit || '').replace(/^Zonasi\s+/i, '');
    }

    /* ======================= PERIODE ======================= */
    function labelPeriode(p) {
      if (!p) return '-';
      const [y, m, d] = p.split('-');
      return d
        ? `${Number(d)} ${NAMA_BULAN[Number(m) - 1]} ${y}`
        : `${NAMA_BULAN[Number(m) - 1]} ${y}`;
    }

    function geserPeriode(p, deltaBulan) {
      const [y, m] = p.split('-').map(Number);
      const total = y * 12 + (m - 1) + deltaBulan;
      return `${Math.floor(total / 12)}-${('0' + (total % 12 + 1)).slice(-2)}`;
    }

    function daftarPeriode(sheet) {
      return [...new Set((DATA[sheet] || []).map(r => r.p))].sort();
    }

    function hariIni() {
      return STATE.settings.today || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Makassar' });
    }

    function barisBulanan(rows) {
      const akhir = new Map();
      rows.forEach(r => {
        const m = r.m || r.p.slice(0, 7), d = r.d || m + '-01';
        if (m > hariIni().slice(0, 7) || d > hariIni()) return;
        if (!akhir.has(m) || d > akhir.get(m)) akhir.set(m, d);
      });
      return rows.filter(r => akhir.get(r.m || r.p.slice(0, 7)) === (r.d || r.p.slice(0, 7) + '-01'))
        .map(r => Object.assign({}, r, { p: r.m || r.p.slice(0, 7) }));
    }

    function semuaPeriode() {
      return [...new Set(Object.values(DATA).flatMap(rows => rows.map(r => r.p)))].sort();
    }

    /* ======================= AKSES DATA ======================= */
    function simpanSheet(nama, rows) {
      DATA_RAW[nama] = rows;
      const bulanan = barisBulanan(rows);
      const monthly = new Map();
      bulanan.forEach(r => monthly.set(r.u + '|' + r.p, r));
      MONTH_IDX[nama] = monthly;
      const current = hariIni().slice(0, 7);
      DATA[nama] = STATE.mode === 'Bulanan' ? bulanan : rows.filter(r => r.daily && r.d && r.d.slice(0, 7) === current && r.d <= hariIni()).map(r => Object.assign({}, r, { p: r.d }));
      const idx = new Map();
      DATA[nama].forEach(r => {
        const key = r.u + '|' + r.p;
        if (!r.c && idx.has(key) && JSON.stringify(idx.get(key)) !== JSON.stringify(r)) throw new Error('Duplikat data ' + nama + ': ' + r.u + ' / ' + r.p);
        idx.set(r.u + '|' + r.p, r);
        if (r.k && !ENTITAS_KONSOLIDASI.includes(r.u) && !KELOMPOK_UNIT.has(r.u)) KELOMPOK_UNIT.set(r.u, r.k);
      });
      DATA_IDX[nama] = idx;
    }

    function sheetAda(sheet) {
      return !!DATA[sheet];
    }

    function baris(sheet, unit, p) {
      const idx = p && p.length === 7 ? MONTH_IDX[sheet] : DATA_IDX[sheet];
      return idx ? (idx.get(unit + '|' + p) || null) : null;
    }

    function nilai(sheet, unit, p) {
      const r = baris(sheet, unit, p);
      return r ? r.v : null;
    }

    function tumbuh(a, b) {
      return (a === null || a === undefined || !b) ? null : (a - b) / Math.abs(b);
    }

    /**
     * Nilai + pertumbuhan satu unit pada satu periode. Memakai angka YoY/Ytd/Mtm/RBB/C
     * dari sheet; bila kosong dihitung dari data periode pembanding.
     */
    function kinerja(sheet, unit, p) {
      const r = baris(sheet, unit, p);
      const v = r ? r.v : null;
      const vY = nilai(sheet, unit, geserPeriode(p, -12));
      const vD = nilai(sheet, unit, `${Number(p.slice(0, 4)) - 1}-12`);
      const vM = nilai(sheet, unit, geserPeriode(p, -1));
      const t = r ? r.t : null;
      const pilih = (dariSheet, hitung) => (dariSheet !== null && dariSheet !== undefined) ? dariSheet : hitung;
      return {
        v, t, vY, vD, vM,
        yoy: pilih(r && r.yoy, tumbuh(v, vY)),
        ytd: pilih(r && r.ytd, tumbuh(v, vD)),
        mtm: pilih(r && r.mtm, tumbuh(v, vM)),
        rbb: t !== null && t > 0 ? pilih(r && r.rbb, v !== null ? v / t : null) : null
      };
    }

    function anggotaKonsolidasi(konsol) {
      if (konsol === UUS_KP) return [UUS_KP];
      if (konsol === ENTITAS_UUS) return [...anggotaKonsolidasi(KONSOL_BJM), ...anggotaKonsolidasi(KONSOL_KDG), UUS_KP];
      const dariData = [...KELOMPOK_UNIT.entries()].filter(([u, k]) => k === konsol).map(([u]) => u);
      return dariData.length ? dariData : (DEFAULT_ANGGOTA[konsol] || []);
    }

    /* ======================= PEMUATAN DATA ======================= */
    function setBadge(teks, isWarning) {
      const badge = document.getElementById('syncBadge');
      badge.textContent = teks;
      badge.classList.toggle('fallback', !!isWarning);
    }

    function muatData(force) {
      const page = PAGES[STATE.page];
      if (!page) return;
      const dibutuhkan = page.sheets();
      const diambil = force ? dibutuhkan : dibutuhkan.filter(n => !DATA[n] && !MISSING.has(n));

      if (!diambil.length) {
        renderHalamanAktif();
        return;
      }

      if (typeof google === 'undefined' || !google.script) {
        setBadge('Mode Lokal: buka lewat URL Web App', true);
        renderHalamanAktif();
        return;
      }

      const btnSync = document.getElementById('btnSync');
      btnSync.classList.add('spinning');
      setBadge('Menyinkronkan Sheet...');
      const nomor = ++permintaanKe;
      const tokenPermintaan = STATE.token;

      google.script.run
        .withSuccessHandler(function(res) {
          if (nomor !== permintaanKe || tokenPermintaan !== STATE.token) return;
          btnSync.classList.remove('spinning');
          if (!res || !res.success) {
            if (res && res.expired) { prosesLogout(res.message); return; }
            setBadge((res && res.message) || 'Gagal memuat Sheet', true);
            if (nomor === permintaanKe) renderHalamanAktif();
            return;
          }
          if (res.settings) STATE.settings = res.settings;
          Object.keys(res.sheets).forEach(n => {
            MISSING.delete(n);
            try { simpanSheet(n, res.sheets[n]); delete SOURCE_ERRORS[n]; }
            catch (e) { SOURCE_ERRORS[n] = e.message; delete DATA[n]; delete DATA_IDX[n]; delete MONTH_IDX[n]; }
          });
          (res.missing || []).forEach(n => { MISSING.add(n); delete DATA[n]; delete DATA_RAW[n]; delete DATA_IDX[n]; delete MONTH_IDX[n]; });
          STATE.lastUpdated = res.lastUpdated;
          const infoMissing = res.missing && res.missing.length ? ` • ${res.missing.length} sheet belum ada` : '';
          // Tanggal dari sheet "Update Data" sel B1; bila kosong pakai waktu sinkron terakhir.
          const ket = res.updateData ? `Update Data: ${res.updateData}` : `Live Sheet • ${res.lastUpdated}`;
          setBadge(`${ket}${infoMissing}`, !!infoMissing);
          if (nomor === permintaanKe) renderHalamanAktif();
        })
        .withFailureHandler(function(err) {
          if (nomor !== permintaanKe || tokenPermintaan !== STATE.token) return;
          btnSync.classList.remove('spinning');
          setBadge('Gagal memuat Sheet: ' + (err && err.message ? err.message : err), true);
          if (nomor === permintaanKe) renderHalamanAktif();
        })
        .getDataBundle(tokenPermintaan, diambil, !!force);
    }

    function sinkronkanDataSheet() {
      muatData(true);
    }

    function renderHalamanAktif() {
      const page = PAGES[STATE.page];
      if (!page) return;
      perbaruiOpsiFilter(page.primary(), page); // filter.html
      const ctx = bangunKonteks(page);
      const notice = document.getElementById('periodNotice');
      const rows = DATA[page.primary()] || [];
      const absent = ctx.p && !rows.some(r => r.p === ctx.p);
      const problem = SOURCE_ERRORS[page.primary()];
      const msg = STATE.page === 'users' ? '' : problem || (!ctx.p ? (STATE.mode === 'Harian' ? 'Belum ada data harian bulan berjalan. Pilih Bulanan untuk histori.' : 'Belum ada periode data yang tersedia.') : absent ? 'Data indikator ini untuk ' + ctx.label + ' belum tersedia. Pilihan periode tetap dipertahankan.' : '');
      if (notice) { notice.textContent = msg; notice.hidden = !msg; }
      try {
        page.render(ctx);
      } catch (e) {
        console.error(e);
        setBadge('Gagal menampilkan halaman: ' + e.message, true);
      }
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    /* ======================= PINDAH HALAMAN =======================
       Menu sidebar & fungsi cariMenu / perbaruiHighlightSidebar ada di navigation.html. */
    function bukaHalaman(pageId) {
      if (!PAGES[pageId]) return;
      if (pageId === 'users' && STATE.role.toLowerCase() !== 'admin') return;
      const lokasi = cariMenu(pageId);
      STATE.page = pageId;
      STATE.activeMenuId = lokasi ? lokasi.menu.id : 'highlight';

      document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === 'page-' + pageId));
      document.getElementById('breadcrumb').textContent = PAGES[pageId].title();
      aturFilterHalaman(PAGES[pageId]); // filter.html
      perbaruiHighlightSidebar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      muatData(false);
    }

    function bukaHalamanHighlight() { bukaHalaman('home'); }
    function bukaHalamanHlAset() { bukaHalaman('hlaset'); }
    function bukaHalamanHlDpk() { bukaHalaman('hldpk'); }
    function bukaHalamanHlPembiayaan() { bukaHalaman('hlpembiayaan'); }

    /* ======================= KARTU KPI ======================= */
    /**
     * Membangun 5 kartu KPI dari elemen <div class="kpi-grid-5" data-kpi="prefix" ...>.
     * Atribut: data-label (judul kartu utama), data-icon, data-theme (kelas warna).
     */
    function inisialisasiKpi() {
      document.querySelectorAll('[data-kpi]').forEach(el => {
        const id = el.dataset.kpi;
        const label = el.dataset.label || 'Nominal';
        const kartu = (cls, judul, icon, key) => `
          <div class="kpi-box ${cls}">
            <div class="kpi-head"><span id="${id}-${key}-lbl">${esc(judul)}</span><i data-lucide="${icon}" style="width:16px;height:16px;"></i></div>
            <div class="kpi-main-val" id="${id}-${key}">-</div>
            <div class="kpi-sub-caption" id="${id}-${key}-sub">-</div>
          </div>`;
        el.innerHTML =
          kartu(el.dataset.theme || 'bg-main', label, el.dataset.icon || 'wallet', 'val') +
          kartu('bg-yoy', 'YoY', 'trending-up', 'yoy') +
          kartu('bg-ytd', 'Ytd', 'calendar-check', 'ytd') +
          kartu('bg-mtm', 'Mtm', 'activity', 'mtm') +
          kartu('bg-rbb', 'RBB/C', 'target', 'rbb');
      });
    }

    function setTeks(id, teks) {
      const el = document.getElementById(id);
      if (el) el.textContent = teks;
    }

    function renderKpi(prefix, sheet, ctx, fmt = 'rp') {
      const k = kinerja(sheet, ctx.entity, ctx.p);
      const ada = sheetAda(sheet);
      setTeks(`${prefix}-val`, fmtNilai(k.v, fmt));
      const sumber = baris(sheet, ctx.entity, ctx.p);
      const posisi = STATE.mode === 'Bulanan' && sumber && sumber.daily && sumber.d ? ' · posisi ' + labelPeriode(sumber.d) : '';
      setTeks(`${prefix}-val-sub`, ada ? `${ctx.entity} (${ctx.label})${posisi}` : `Sheet "${sheet}" belum tersedia`);
      setTeks(`${prefix}-yoy`, fmtPct(k.yoy));
      setTeks(`${prefix}-yoy-sub`, `Tahun lalu: ${fmtNilai(k.vY, fmt)}`);
      setTeks(`${prefix}-ytd`, fmtPct(k.ytd));
      setTeks(`${prefix}-ytd-sub`, `Des tahun lalu: ${fmtNilai(k.vD, fmt)}`);
      setTeks(`${prefix}-mtm`, fmtPct(k.mtm));
      setTeks(`${prefix}-mtm-sub`, `Bulan lalu: ${fmtNilai(k.vM, fmt)}`);
      setTeks(`${prefix}-rbb`, fmtPct(k.rbb));
      setTeks(`${prefix}-rbb-sub`, `Target: ${fmtNilai(k.t, fmt)}`);
      ['yoy', 'ytd', 'mtm'].forEach(key => {
        const el = document.getElementById(`${prefix}-${key}`), status = statusGrowth(k[key], sheet);
        if (el) { el.classList.remove('metric-good', 'metric-bad', 'metric-neutral'); el.classList.add(status.cls === 'badge-pos' ? 'metric-good' : status.cls === 'badge-neg' ? 'metric-bad' : 'metric-neutral'); el.title = status.label; }
      });
      const status = statusTarget(sheet, k.v, k.t), targetEl = document.getElementById(`${prefix}-rbb`);
      if (targetEl) { targetEl.title = status.label; targetEl.classList.remove('metric-good', 'metric-bad', 'metric-neutral'); targetEl.classList.add(status.cls === 'badge-pos' ? 'metric-good' : status.cls === 'badge-neg' ? 'metric-bad' : 'metric-neutral'); }
      setTeks(`${prefix}-rbb-sub`, `${status.label} · Target: ${fmtNilai(k.t, fmt)}`);
      return k;
    }

    /* ======================= HELPER CHART ======================= */
    if (typeof Chart !== 'undefined') {
      Chart.defaults.font.family = "'Poppins', sans-serif";
      Chart.defaults.color = '#64748b';
    }

    function buatChart(canvasId, config) {
      if (CHARTS[canvasId]) CHARTS[canvasId].destroy();
      const canvas = document.getElementById(canvasId);
      if (!canvas || typeof Chart === 'undefined') return null;
      sesuaikanChartTheme(config);
      CHARTS[canvasId] = new Chart(canvas.getContext('2d'), config);
      return CHARTS[canvasId];
    }

    /** Menampilkan/menghapus pesan "data belum tersedia" di atas canvas. */
    function setKosong(canvasId, pesan) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const wrap = canvas.parentElement;
      let el = wrap.querySelector('.chart-empty');
      if (!pesan) { if (el) el.remove(); return; }
      if (!el) {
        el = document.createElement('div');
        el.className = 'chart-empty';
        wrap.appendChild(el);
      }
      el.textContent = pesan;
    }

    function semuaKosong(arr) {
      return !arr.some(v => v !== null && v !== undefined && Number.isFinite(v));
    }

    function pesanSheetHilang(sheets) {
      const hilang = sheets.filter(s => !sheetAda(s));
      return hilang.length ? `Data belum tersedia — tambahkan sheet: ${hilang.join(', ')}` : null;
    }

    /** Line chart dua sumbu: a = sumbu kiri, b = sumbu kanan (opsional). */
    function renderTrendGanda(canvasId, ctx, a, b) {
      const labels = ctx.seriesLabels;
      const ds = (cfg, axis) => ({
        label: cfg.label,
        data: ctx.seriesPeriods.map(p => nilai(cfg.sheet, ctx.entity, p)),
        borderColor: cfg.color,
        backgroundColor: cfg.color + '1f',
        pointBackgroundColor: '#ffffff',
        pointBorderColor: cfg.color,
        pointBorderWidth: 2,
        pointRadius: 3.5,
        borderWidth: 2.5,
        fill: axis === 'y',
        tension: 0.3,
        yAxisID: axis,
        fmt: cfg.fmt || 'rp'
      });
      const datasets = [ds(a, 'y')];
      if (b) datasets.push(ds(b, 'y1'));

      setKosong(canvasId, pesanSheetHilang([a.sheet].concat(b ? [b.sheet] : [])));
      const scales = {
        y: { position: 'left', title: { display: true, text: a.label }, ticks: { callback: v => fmtSumbu(v, a.fmt) } }
      };
      if (b) scales.y1 = { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: b.label }, ticks: { callback: v => fmtSumbu(v, b.fmt) } };

      buatChart(canvasId, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top' },
            tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmtNilai(c.parsed.y, c.dataset.fmt)}` } }
          },
          scales
        }
      });
    }

    /** Bulan awal periode series yang memuat p (mis. Triwulanan, Agt 2026 -> Jul 2026). */
    function awalPeriodeSeries(p, series) {
      const [y, m] = p.split('-').map(Number);
      const panjang = { Bulanan: 1, Triwulanan: 3, Semester: 6, Tahunan: 12 }[series] || 1;
      const mAwal = Math.floor((m - 1) / panjang) * panjang + 1;
      return `${y}-${('0' + mAwal).slice(-2)}`;
    }

    /**
     * Nilai arus (flow) seperti ekspansi / run off: jumlah bulanan dari awal periode
     * series sampai p. Bulanan = nilai bulan itu saja.
     */
    function nilaiAlir(sheet, unit, p, series) {
      const month = p.slice(0, 7);
      if (series === 'Bulanan') return nilai(sheet, unit, p);
      let total = null;
      for (let q = awalPeriodeSeries(p, series); q <= month; q = geserPeriode(q, 1)) {
        const v = nilai(sheet, unit, q === month ? p : q);
        if (v === null || v === undefined) return null;
        total = (total || 0) + v;
      }
      return total;
    }

    /**
     * Line chart beberapa garis sepanjang periode series.
     * garis: [{ sheet, label, color, fmt, axis: 'y' | 'y1' | 'y2' }]
     *   y = sumbu kiri, y1 = sumbu kanan, y2 = sumbu kanan kedua.
     * opsi.alir = true -> nilai dijumlahkan per periode series (lihat nilaiAlir).
     */
    function renderTrendMulti(canvasId, ctx, garis, opsi = {}) {
      const ambil = (sheet, p) => opsi.alir ? nilaiAlir(sheet, ctx.entity, p, ctx.series) : nilai(sheet, ctx.entity, p);
      const datasets = garis.map(g => ({
        label: g.label,
        data: ctx.seriesPeriods.map(p => ambil(g.sheet, p)),
        borderColor: g.color,
        backgroundColor: g.color + '1f',
        pointBackgroundColor: '#ffffff',
        pointBorderColor: g.color,
        pointBorderWidth: 2,
        pointRadius: 3.5,
        borderWidth: 2.5,
        fill: false,
        tension: 0.3,
        yAxisID: g.axis || 'y',
        fmt: g.fmt || 'rp'
      }));
      setKosong(canvasId, pesanSheetHilang(garis.map(g => g.sheet)));

      const scales = {};
      garis.forEach(g => {
        const ax = g.axis || 'y';
        if (scales[ax]) return;
        scales[ax] = {
          position: ax === 'y' ? 'left' : 'right',
          grid: { drawOnChartArea: ax === 'y' },
          title: { display: !!g.judulSumbu, text: g.judulSumbu || '' },
          ticks: { callback: v => fmtSumbu(v, g.fmt || 'rp') }
        };
      });

      buatChart(canvasId, {
        type: 'line',
        data: { labels: ctx.seriesLabels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top' },
            tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmtNilai(c.parsed.y, c.dataset.fmt)}` } }
          },
          scales
        }
      });
    }

    /** Bar Aktual vs Target per periode series + garis % RBB/C. */
    function renderRealisasiTarget(canvasId, sheet, ctx, fmt = 'rp') {
      const ps = ctx.seriesPeriods;
      const kin = ps.map(p => kinerja(sheet, ctx.entity, p));
      const noaFlpp = sheet === 'NOA Eks FLPP 1';
      setKosong(canvasId, pesanSheetHilang([sheet]));
      buatChart(canvasId, {
        type: 'bar',
        data: {
          labels: ctx.seriesLabels,
          datasets: [
            { label: noaFlpp ? 'Realisasi NOA' : 'Aktual', data: kin.map(k => k.v), backgroundColor: WARNA.hijau, borderRadius: 6, order: 2 },
            { label: noaFlpp ? 'Target NOA' : 'Target RBB/C', data: kin.map(k => k.t), backgroundColor: WARNA.oranye, borderRadius: 6, order: 3 },
            { label: noaFlpp ? 'Pencapaian NOA' : '% RBB/C', type: 'line', data: kin.map(k => k.rbb), borderColor: WARNA.biru, backgroundColor: WARNA.biru, yAxisID: 'y1', tension: 0.3, pointRadius: 3, order: 1 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top' },
            tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.dataset.yAxisID === 'y1' ? fmtPct(c.parsed.y) : fmtNilai(c.parsed.y, fmt)}` } }
          },
          scales: {
            y: { beginAtZero: true, ticks: { callback: v => fmtSumbu(v, fmt) } },
            y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => fmtPct(v, 0) } }
          }
        }
      });
    }

    /**
     * Horizontal bar realisasi unit kerja dalam konsolidasi terpilih.
     * opsi.urut: 'desc' (default, terbesar dulu), 'asc', atau 'unit' (sesuai urutan unit kerja).
     */
    function renderLeaderboard(canvasId, sheet, ctx, fmt = 'rp', opsi = {}) {
      const items = ctx.anggota
        .map(u => Object.assign({ unit: u }, kinerja(sheet, u, ctx.p)))
        .filter(i => i.v !== null);
      if (opsi.urut === 'asc') items.sort((x, y) => x.v - y.v);
      else if (opsi.urut !== 'unit') items.sort((x, y) => y.v - x.v);

      setKosong(canvasId, pesanSheetHilang([sheet]) || (items.length ? null : 'Tidak ada data unit kerja untuk periode ini'));
      buatChart(canvasId, {
        type: 'bar',
        data: {
          labels: items.map(i => namaPendek(i.unit)),
          datasets: [{
            label: 'Realisasi',
            data: items.map(i => i.v),
            backgroundColor: items.map(i => i.unit === ctx.entity ? WARNA.oranye : statusTarget(sheet, i.v, i.t).color),
            borderRadius: 5
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: c => ` ${fmtNilai(c.parsed.x, fmt)}`,
                afterLabel: c => ` Capaian RBB/C: ${fmtPct(items[c.dataIndex].rbb)}`
              }
            }
          },
          scales: {
            x: { beginAtZero: true, ticks: { callback: v => fmtSumbu(v, fmt) } },
            y: { ticks: { font: { size: 10.5 }, autoSkip: false } }
          }
        }
      });
    }

    /** Donut komposisi nilai beberapa sheet untuk entitas & periode terpilih. */
    function renderDonut(canvasId, ctx, parts, fmt = 'rp') {
      const values = parts.map(pt => nilai(pt.sheet, ctx.entity, ctx.p));
      const incomplet = values.some(v => v === null || v === undefined);
      const total = incomplet ? null : values.reduce((s, v) => s + v, 0);
      const pesan = pesanSheetHilang(parts.map(pt => pt.sheet)) || (semuaKosong(values) ? 'Data komposisi bernilai 0 / kosong pada periode ini' : null);
      setKosong(canvasId, pesan);
      buatChart(canvasId, {
        type: 'doughnut',
        data: {
          labels: parts.map(pt => pt.label),
          datasets: [{ data: values.map(v => v || 0), backgroundColor: parts.map((pt, i) => pt.color || WARNA.palet[i % WARNA.palet.length]), borderWidth: 2, borderColor: '#ffffff' }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '62%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                boxWidth: 10, font: { size: 10.5 },
                generateLabels: chart => chart.data.labels.map((l, i) => ({
                  text: `${l}: ${incomplet ? 'komposisi belum lengkap' : total ? fmtPct(values[i] / total, 1) : '0'}`,
                  fillStyle: chart.data.datasets[0].backgroundColor[i],
                  strokeStyle: '#ffffff',
                  hidden: !chart.getDataVisibility(i),
                  index: i
                }))
              }
            },
            tooltip: { callbacks: { label: c => ` ${c.label}: ${fmtNilai(c.parsed, fmt)} (${total ? fmtPct(c.parsed / total, 1) : '-'})` } }
          }
        }
      });
    }

    /** Bar kecil rasio (persentase) sepanjang periode series. */
    function renderRasioMini(canvasId, sheet, ctx, badgeId, warna = WARNA.hijau) {
      const ps = ctx.seriesPeriods;
      const data = ps.map(p => nilai(sheet, ctx.entity, p));
      const terakhir = nilai(sheet, ctx.entity, ctx.p);
      const badge = document.getElementById(badgeId);
      if (badge) badge.textContent = fmtPct(terakhir);
      setKosong(canvasId, pesanSheetHilang([sheet]) || (semuaKosong(data) ? 'Data rasio masih kosong / 0 di sheet' : null));
      buatChart(canvasId, {
        type: 'bar',
        data: {
          labels: ctx.seriesLabels,
          datasets: [{ label: sheet, data, backgroundColor: ps.map(p => p === ctx.p ? WARNA.oranye : warna), borderRadius: 4 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fmtPct(c.parsed.y)}` } } },
          scales: {
            x: { ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: true } },
            y: { beginAtZero: true, ticks: { font: { size: 9 }, callback: v => fmtPct(v, 0) } }
          }
        }
      });
    }

    /* ======================= TABEL REALISASI ======================= */
    /** Daftar baris tabel hierarki sesuai konsolidasi terpilih. */
    function barisTabelKonsolidasi(konsol) {
      const grup = g => [{ unit: g, tipe: 'group' }].concat(anggotaKonsolidasi(g).map(u => ({ unit: u, tipe: 'child' })));
      if (konsol === ENTITAS_UUS) {
        return grup(KONSOL_BJM).concat(grup(KONSOL_KDG), [{ unit: UUS_KP, tipe: 'group' }, { unit: ENTITAS_UUS, tipe: 'total' }]);
      }
      if (konsol === UUS_KP) return [{ unit: UUS_KP, tipe: 'group' }];
      return grup(konsol);
    }

    /**
     * Mengisi tbody tabel realisasi. opsi: { sheet, fmt, noaSheet (opsional),
     * ekstra (opsional): [{ sheet, fmt }] kolom tambahan setelah Aktual }.
     * Kolom: No | Unit Kerja | Aktual | [NOA / ekstra] | Target RBB/C | YoY | Ytd | Mtm | % RBB/C
     */
    function renderTabelRealisasi(tbodyId, ctx, opsi) {
      const tbody = document.getElementById(tbodyId);
      if (!tbody) return;
      const fmt = opsi.fmt || 'rp';
      const ekstra = (opsi.ekstra || []).concat(opsi.noaSheet ? [{ sheet: opsi.noaSheet, fmt: 'num' }] : []);
      const kolom = 8 + ekstra.length;

      if (!sheetAda(opsi.sheet)) {
        tbody.innerHTML = `<tr><td colspan="${kolom}" class="table-empty">Sheet "${esc(opsi.sheet)}" belum tersedia di Spreadsheet.</td></tr>`;
        return;
      }

      let no = 0;
      tbody.innerHTML = barisTabelKonsolidasi(ctx.konsol).map(item => {
        const k = kinerja(opsi.sheet, item.unit, ctx.p);
        const cls = ['row-' + item.tipe];
        if (item.unit === ctx.entity) cls.push('row-selected');
        const noa = ekstra.map(e => `<td class="num-col">${fmtNilai(nilai(e.sheet, item.unit, ctx.p), e.fmt || 'rp')}</td>`).join('');
        return `
          <tr class="${cls.join(' ')}">
            <td>${++no}</td>
            <td class="${item.tipe === 'child' ? 'indent' : ''}">${esc(item.unit)}</td>
            <td class="num-col"><strong>${fmtNilai(k.v, fmt)}</strong></td>
            ${noa}
            <td class="num-col">${fmtNilai(k.t, fmt)}</td>
            <td class="num-col">${badgeGrowth(k.yoy, opsi.sheet)}</td>
            <td class="num-col">${badgeGrowth(k.ytd, opsi.sheet)}</td>
            <td class="num-col">${badgeGrowth(k.mtm, opsi.sheet)}</td>
            <td class="num-col"><strong class="${statusTarget(opsi.sheet, k.v, k.t).cls}" title="${esc(statusTarget(opsi.sheet, k.v, k.t).label)}">${fmtPct(k.rbb)}</strong></td>
          </tr>`;
      }).join('');
    }

    /* ======================= HALAMAN INDIKATOR ======================= */
    /**
     * Membuat definisi halaman satu indikator (aset.html, giro.html, roa.html, dst).
     * cfg: { page, metric, sheet, fmt, warna }. ID elemen di HTML memakai awalan cfg.page:
     * <page>-info, <page>-trend, <page>-target, <page>-leader, <page>-table, <page>-badge-*.
     */
    function halamanIndikator(cfg) {
      const fmt = cfg.fmt || 'rp';
      const id = cfg.page;
      return {
        title: () => {
          const lokasi = cariMenu(id);
          const judul = lokasi ? `${lokasi.menu.title} / ${lokasi.sub.name}` : cfg.metric;
          return `${judul.toUpperCase()} (SHEET: ${cfg.sheet})`;
        },
        primary: () => cfg.sheet,
        sheets: () => [cfg.sheet],

        render(ctx) {
          setTeks(`${id}-info`, ctx.info);
          renderKpi(id, cfg.sheet, ctx, fmt);

          setTeks(`${id}-badge-trend`, `Series: ${ctx.seriesLabel || ctx.series}`);
          renderTrendGanda(`${id}-trend`, ctx, { sheet: cfg.sheet, label: cfg.metric, color: cfg.warna || WARNA.hijau, fmt });

          setTeks(`${id}-badge-target`, `Series: ${ctx.seriesLabel || ctx.series}`);
          renderRealisasiTarget(`${id}-target`, cfg.sheet, ctx, fmt);
          renderLeaderboard(`${id}-leader`, cfg.sheet, ctx, fmt);

          setTeks(`${id}-badge-table`, `Periode: ${ctx.label}`);
          renderTabelRealisasi(`${id}-table`, ctx, { sheet: cfg.sheet, fmt });
        }
      };
    }

    /* ======================= HALAMAN NPF ======================= */
    /**
     * Membuat definisi halaman NPF (npftotal.html, npfumkm.html, dst).
     * cfg: { page, nama, sheet, warna }. Sheet NPF punya 3 kolom nilai:
     * "% NPF", "NPF Nom", "NOA" -> diminta sebagai "<sheet>|<kolom>".
     * ID elemen: <page>-pct / <page>-nom / <page>-noa (KPI), <page>-trend, <page>-target,
     * <page>-leader, <page>-table, <page>-info, <page>-badge-*.
     */
    function halamanNpf(cfg) {
      const id = cfg.page;
      const sh = {
        pct: `${cfg.sheet}|% NPF`,
        nom: `${cfg.sheet}|NPF Nom`,
        noa: `${cfg.sheet}|NOA`
      };
      return {
        title: () => `NPF / ${cfg.nama.toUpperCase()} (SHEET: ${cfg.sheet})`,
        primary: () => sh.pct,
        sheets: () => [sh.pct, sh.nom, sh.noa],

        render(ctx) {
          setTeks(`${id}-info`, ctx.info);
          renderKpi(`${id}-pct`, sh.pct, ctx, 'pct');
          renderKpi(`${id}-nom`, sh.nom, ctx, 'rp');
          renderKpi(`${id}-noa`, sh.noa, ctx, 'num');

          setTeks(`${id}-badge-trend`, `Series: ${ctx.seriesLabel || ctx.series}`);
          renderTrendMulti(`${id}-trend`, ctx, [
            { sheet: sh.nom, label: 'Nom NPF', color: cfg.warna || WARNA.merah, fmt: 'rp', axis: 'y', judulSumbu: 'Nominal' },
            { sheet: sh.noa, label: 'NOA NPF', color: WARNA.oranye, fmt: 'num', axis: 'y1', judulSumbu: 'NOA' },
            { sheet: sh.pct, label: '% NPF', color: WARNA.biru, fmt: 'pct', axis: 'y2', judulSumbu: '% NPF' }
          ]);

          setTeks(`${id}-badge-target`, `Series: ${ctx.seriesLabel || ctx.series}`);
          renderRealisasiTarget(`${id}-target`, sh.pct, ctx, 'pct');
          renderLeaderboard(`${id}-leader`, sh.pct, ctx, 'pct', { urut: 'unit' });

          setTeks(`${id}-badge-table`, `Periode: ${ctx.label}`);
          renderTabelRealisasi(`${id}-table`, ctx, {
            sheet: sh.pct, fmt: 'pct',
            ekstra: [{ sheet: sh.nom, fmt: 'rp' }, { sheet: sh.noa, fmt: 'num' }]
          });
        }
      };
    }

    /* ======================= SESI ======================= */
    function bukaDashboard(userData) {
      STATE.token = userData.token;
      STATE.role = (userData.role || '').toString().trim().toLowerCase();
      setTeks('userName', userData.nama);
      setTeks('userRole', userData.role);
      setTeks('userInisial', userData.inisial);

      document.getElementById('login-page').style.display = 'none';
      document.getElementById('dashboard-page').style.display = 'block';

      inisialisasiKpi();
      bangunSidebar();
      perbaruiOpsiUnit();
      bukaHalamanHighlight();
      mulaiTimerSesi(userData.expiresIn || 3600);

      clearInterval(autoSyncInterval);
      autoSyncInterval = setInterval(() => muatData(true), 5 * 60 * 1000);
    }

    function prosesLogout(pesan) {
      permintaanKe++;
      clearInterval(countdownInterval);
      clearInterval(autoSyncInterval);
      if (STATE.token && typeof google !== 'undefined' && google.script) google.script.run.logout(STATE.token);
      STATE.token = null;
      STATE.role = '';
      Object.keys(DATA).forEach(k => { delete DATA[k]; delete DATA_IDX[k]; });
      Object.keys(DATA_RAW).forEach(k => { delete DATA_RAW[k]; delete MONTH_IDX[k]; delete SOURCE_ERRORS[k]; });
      STATE.periods = { Bulanan: '', Harian: '' };
      MISSING.clear();

      document.getElementById('dashboard-page').style.display = 'none';
      document.getElementById('login-page').style.display = 'flex';
      document.getElementById('password').value = '';
      const err = document.getElementById('loginError');
      if (typeof pesan === 'string' && pesan) {
        err.textContent = pesan;
        err.style.display = 'block';
      } else {
        err.style.display = 'none';
      }
    }

    function mulaiTimerSesi(durasiDetik) {
      clearInterval(countdownInterval);
      let sisa = durasiDetik;
      const el = document.getElementById('timer');
      const tampil = () => {
        const m = Math.floor(sisa / 60), d = sisa % 60;
        el.textContent = (m < 10 ? '0' + m : m) + ':' + (d < 10 ? '0' + d : d);
      };
      tampil();
      countdownInterval = setInterval(() => {
        sisa--;
        if (sisa < 0) { prosesLogout('Sesi berakhir, silakan login kembali.'); return; }
        tampil();
      }, 1000);
    }
;
function prosesLogin() {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value;
    const btn = document.getElementById('btnLogin');
    const err = document.getElementById('loginError');

    function selesai() {
      btn.textContent = 'Masuk';
      btn.disabled = false;
    }
    function tampilkanError(pesan) {
      err.textContent = pesan;
      err.style.display = 'block';
    }

    if (!user || !pass) {
      tampilkanError('Username dan password wajib diisi.');
      return;
    }

    btn.textContent = 'Memeriksa...';
    btn.disabled = true;
    err.style.display = 'none';

    if (typeof google === 'undefined' || !google.script) {
      selesai();
      tampilkanError('Dashboard harus dibuka melalui URL Web App Google Apps Script.');
      return;
    }

    google.script.run
      .withSuccessHandler(function(res) {
        selesai();
        if (res && res.success) {
          bukaDashboard(res);
        } else {
          tampilkanError((res && res.message) || 'Email atau password salah!');
        }
      })
      .withFailureHandler(function(e) {
        selesai();
        tampilkanError('Gagal menghubungi server: ' + (e && e.message ? e.message : e));
      })
      .checkLogin(user, pass);
  }
;
/* ======================= DAFTAR MENU SIDEBAR =======================
   * Atur menu di sini: urutan array = urutan tampil di sidebar.
   *
   * Menu utama : { id, title, icon, items: [...] }
   *   id    : kode unik menu (huruf kecil, tanpa spasi)
   *   title : judul yang tampil
   *   icon  : nama ikon Lucide (lihat https://lucide.dev/icons, versi 0.344.0)
   * Sub-menu  : { name, page }
   *   name  : teks yang tampil
   *   page  : id halaman = nama file HTML-nya (page: 'giro' -> giro.html;
   *           'home' = Ringkasan Eksekutif di Index.html)
   * Opsional  : hidden: true  -> sembunyikan menu / sub-menu tanpa menghapusnya,
   *             mis. { name: 'FAR', page: 'far', hidden: true }
   *
   * Menambah halaman baru: buat file HTML-nya, tambahkan baris include('namafile')
   * di Index.html, lalu tambahkan sub-menu di bawah ini.
   */
  const MENU_CONFIG = [
    {
      id: 'highlight', title: 'Highlight Kinerja', icon: 'sparkles',
      items: [
        { name: 'Ringkasan Eksekutif', page: 'home' },
        { name: 'Aset & Laba', page: 'hlaset' },
        { name: 'DPK', page: 'hldpk' },
        { name: 'Pembiayaan', page: 'hlpembiayaan' },
        { name: 'Ekspansi & Run Off', page: 'hlekspansi' },
        { name: 'Peringkat Unit Kerja & AO', page: 'hlperingkat' }
      ]
    },
    {
      id: 'aset_laba', title: 'Aset & Laba', icon: 'trending-up',
      items: [
        { name: 'Aset', page: 'aset' },
        { name: 'Laba', page: 'laba' },
        { name: 'Pendapatan Operasional', page: 'pendopr' },
        { name: 'Biaya Operasional', page: 'byopr' },
        { name: 'Pendapatan Penyaluran Dana', page: 'penydana' },
        { name: 'Biaya Bagi Hasil & Bonus', page: 'bybaghas' },
        { name: 'Pendapatan Fee Based Income', page: 'fbi' }
      ]
    },
    {
      id: 'dpk', title: 'Dana Pihak Ketiga', icon: 'wallet',
      items: [
        { name: 'Total DPK', page: 'dpk' },
        { name: 'Giro', page: 'giro' },
        { name: 'Tabungan', page: 'tabungan' },
        { name: 'Deposito', page: 'deposito' },
        { name: 'NOA DPK', page: 'noadpk' }
      ]
    },
    {
      id: 'pembiayaan', title: 'Pembiayaan', icon: 'hand-coins',
      items: [
        { name: 'Total Pembiayaan', page: 'pembiayaan' },
        { name: 'Korporate', page: 'korporate' },
        { name: 'UMKM', page: 'umkm' },
        { name: 'Konsumer', page: 'konsumer' },
        { name: 'Modal Kerja', page: 'modalkerja' },
        { name: 'Investasi', page: 'investasi' },
        { name: 'NOA Pembiayaan', page: 'noapby' },
        { name: 'Ekspansi KUR', page: 'ekskur' },
        { name: 'Posisi KUR', page: 'poskur' },
        { name: 'Ekspansi FLPP', page: 'eksflpp' },
        { name: 'Posisi FLPP', page: 'posflpp' }
      ]
    },
    {
      id: 'npf', title: 'NPF', icon: 'alert-triangle',
      items: [
        { name: 'NPF Total Pembiayaan', page: 'npftotal' },
        { name: 'NPF Korporate', page: 'npfkorp' },
        { name: 'NPF UMKM', page: 'npfumkm' },
        { name: 'NPF Konsumer', page: 'npfkons' },
        { name: 'NPF KUR', page: 'npfkur' },
        { name: 'NPF FLPP', page: 'npfflpp' }
      ]
    },
    {
      id: 'rasio', title: 'Rasio', icon: 'pie-chart',
      items: [
        { name: 'ROA', page: 'roa' },
        { name: 'NI', page: 'ni' },
        { name: 'FDR', page: 'fdr' },
        { name: 'BOPO', page: 'bopo' },
        { name: 'NPF', page: 'npf' },
        { name: 'CASA', page: 'casa' },
        { name: 'FAR', page: 'far' },
        { name: '% FBI', page: 'pctfbi' },
        { name: '% UMKM', page: 'pctumkm' }
      ]    },
    {
      id: 'user_management', title: 'Manajemen User', icon: 'users', adminOnly: true,
      items: [{ name: 'Kelola User', page: 'users' }]
    }
  ];

  /* ======================= LOGIKA SIDEBAR ======================= */
  function menuTampil() {
    return MENU_CONFIG.filter(m => !m.hidden && (!m.adminOnly || STATE.role === 'admin') && subMenuTampil(m).length);
  }

  function subMenuTampil(menu) {
    return menu.items.filter(s => !s.hidden);
  }

  /** Mencari menu sidebar yang memuat halaman tertentu. */
  function cariMenu(pageId) {
    for (const menu of MENU_CONFIG) {
      const sub = menu.items.find(s => s.page === pageId);
      if (sub) return { menu, sub };
    }
    return null;
  }

  function klikMenuUtama(menuId) {
    const sb = document.getElementById('sidebar');
    if (sb.classList.contains('collapsed')) sb.classList.remove('collapsed');

    if (STATE.activeMenuId === menuId) {
      document.getElementById('sub-' + menuId).classList.toggle('open');
      document.getElementById('nav-' + menuId).classList.toggle('open-menu');
      return;
    }
    const menu = MENU_CONFIG.find(m => m.id === menuId);
    const pertama = menu && subMenuTampil(menu)[0];
    if (pertama) bukaHalaman(pertama.page);
  }

  function bangunSidebar() {
    const container = document.getElementById('sidebarMenuContainer');
    container.innerHTML = '';

    menuTampil().forEach(menu => {
      const li = document.createElement('li');
      li.className = 'nav-item';
      li.id = 'nav-' + menu.id;
      li.title = menu.title;
      li.innerHTML = `
        <div class="nav-item-left">
          <i data-lucide="${menu.icon}" class="nav-icon"></i>
          <span class="nav-label">${esc(menu.title)}</span>
        </div>
        <i data-lucide="chevron-down" class="chevron-icon"></i>`;
      li.onclick = () => klikMenuUtama(menu.id);
      container.appendChild(li);

      const ulSub = document.createElement('ul');
      ulSub.className = 'submenu-list';
      ulSub.id = 'sub-' + menu.id;
      subMenuTampil(menu).forEach(sub => {
        const liSub = document.createElement('li');
        liSub.className = 'submenu-item';
        liSub.id = 'subitem-' + menu.id + '-' + sub.page;
        liSub.innerHTML = `<span class="submenu-dot"></span><span>${esc(sub.name)}</span>`;
        liSub.onclick = (e) => { e.stopPropagation(); bukaHalaman(sub.page); };
        ulSub.appendChild(liSub);
      });
      container.appendChild(ulSub);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function perbaruiHighlightSidebar() {
    MENU_CONFIG.forEach(m => {
      const navEl = document.getElementById('nav-' + m.id);
      const subUl = document.getElementById('sub-' + m.id);
      if (!navEl || !subUl) return;
      const aktif = m.id === STATE.activeMenuId;
      navEl.classList.toggle('active', aktif);
      navEl.classList.toggle('open-menu', aktif);
      subUl.classList.toggle('open', aktif);
      m.items.forEach(s => {
        const el = document.getElementById('subitem-' + m.id + '-' + s.page);
        if (el) el.classList.toggle('active-sub', aktif && s.page === STATE.page);
      });
    });
  }

  function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
    setTimeout(() => Object.values(CHARTS).forEach(c => c.resize()), 360);
  }
;
// Bulan akhir periode untuk tiap series. Posisi bulan pada "Tanggal Data" selalu
  // ikut ditampilkan sebagai titik terakhir walaupun bukan akhir periode.
  const SERIES_BULAN = {
    Bulanan: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
    Triwulanan: ['03', '06', '09', '12'],
    Semester: ['06', '12'],
    Tahunan: ['12']
  };

  const FILTER = {
    tahunTersedia: [],          // tahun yang ada di sheet utama halaman aktif (terbaru dulu)
    tahunDipilih: new Set(),    // tahun yang dicentang
    tahunDikenal: new Set()     // tahun yang pernah muncul (tahun baru otomatis dicentang)
  };

  /* ---------- Periode series ---------- */
  function periodeSesuaiSeries(semua, pTerpilih, series, tahun) {
    if (STATE.mode === 'Harian') return semua.filter(p => p <= pTerpilih && p.slice(0, 7) === pTerpilih.slice(0, 7));
    const bulan = SERIES_BULAN[series] || SERIES_BULAN.Bulanan;
    return semua.filter(p => p <= pTerpilih && tahun.has(p.slice(0, 4)) && (bulan.includes(p.slice(5, 7)) || p === pTerpilih));
  }

  function gantiModePeriode() {
    const old = STATE.periods[STATE.mode];
    STATE.mode = document.getElementById('filterMode').value;
    if (STATE.mode === 'Bulanan' && old) STATE.periods.Bulanan = old.slice(0, 7);
    KELOMPOK_UNIT.clear();
    Object.keys(DATA_RAW).forEach(n => simpanSheet(n, DATA_RAW[n]));
    renderHalamanAktif();
  }

  /* ---------- Tanggal Data ---------- */
  function perbaruiOpsiTanggal(sheetUtama) {
    const sel = document.getElementById('filterTanggal');
    const periode = semuaPeriode().reverse();
    let lama = STATE.periods[STATE.mode];
    if (!lama && periode.length) { lama = periode[0]; STATE.periods[STATE.mode] = lama; }
    if (lama && !periode.includes(lama)) periode.push(lama);
    periode.sort().reverse();
    const kunciBaru = periode.join(',');
    if (sel.dataset.kunci !== kunciBaru) {
      sel.innerHTML = periode.map(p => `<option value="${p}">${labelPeriode(p)}</option>`).join('');
      sel.dataset.kunci = kunciBaru;
    }
    sel.value = lama || '';
  }

  /* ---------- Tahun (checkbox) ---------- */
  function perbaruiOpsiTahun(sheetUtama) {
    const tahun = [...new Set(semuaPeriode().map(p => p.slice(0, 4)).concat(STATE.periods[STATE.mode] ? [STATE.periods[STATE.mode].slice(0, 4)] : []))].sort().reverse();
    tahun.forEach(t => {
      if (!FILTER.tahunDikenal.has(t)) {
        FILTER.tahunDikenal.add(t);
        FILTER.tahunDipilih.add(t);
      }
    });
    FILTER.tahunTersedia = tahun;

    const list = document.getElementById('filterTahunList');
    const kunci = tahun.join(',');
    if (list.dataset.kunci !== kunci) {
      list.innerHTML = tahun.length
        ? tahun.map(t => `<label class="tahun-opsi"><input type="checkbox" value="${t}" onchange="onTahunChange(this)">${t}</label>`).join('')
        : '<div class="tahun-catatan">Belum ada data periode.</div>';
      list.dataset.kunci = kunci;
    }
    const aktif = tahunAktif();
    list.querySelectorAll('input').forEach(cb => { cb.checked = aktif.has(cb.value); });
    setTeks('filterTahunRingkas', ringkasTahun());
  }

  /** Tahun yang dicentang & tersedia; bila tidak ada yang cocok, pakai semua tahun tersedia. */
  function tahunAktif() {
    const dipilih = FILTER.tahunTersedia.filter(t => FILTER.tahunDipilih.has(t));
    return new Set(dipilih.length ? dipilih : FILTER.tahunTersedia);
  }

  function ringkasTahun() {
    const aktif = [...tahunAktif()].sort();
    if (!FILTER.tahunTersedia.length) return '-';
    if (aktif.length === FILTER.tahunTersedia.length) return 'Semua Tahun';
    return aktif.join(', ');
  }

  function onTahunChange(cb) {
    const catatan = document.getElementById('filterTahunCatatan');
    if (!cb.checked && tahunAktif().size <= 1) {
      cb.checked = true;
      catatan.classList.add('peringatan');
      setTimeout(() => catatan.classList.remove('peringatan'), 1500);
      return;
    }
    if (cb.checked) FILTER.tahunDipilih.add(cb.value);
    else FILTER.tahunDipilih.delete(cb.value);
    renderHalamanAktif();
  }

  function pilihSemuaTahun() {
    FILTER.tahunTersedia.forEach(t => FILTER.tahunDipilih.add(t));
    renderHalamanAktif();
  }

  function pilihTahunTerakhir() {
    if (!FILTER.tahunTersedia.length) return;
    FILTER.tahunTersedia.forEach(t => FILTER.tahunDipilih.delete(t));
    FILTER.tahunDipilih.add(FILTER.tahunTersedia[0]);
    renderHalamanAktif();
  }

  function toggleTahunDropdown(e) {
    e.stopPropagation();
    document.getElementById('filterTahun').classList.toggle('open');
  }

  document.addEventListener('click', () => {
    const el = document.getElementById('filterTahun');
    if (el) el.classList.remove('open');
  });

  /* ---------- Konsolidasi & Unit Kerja ---------- */
  function perbaruiOpsiUnit() {
    const konsol = document.getElementById('filterKonsolidasi').value;
    const sel = document.getElementById('filterUnitKerja');
    const lama = sel.value;
    const labelSemua = {
      [ENTITAS_UUS]: 'Semua Unit Kerja (Konsolidasi UUS)',
      [KONSOL_BJM]: 'Semua Zonasi KCS Banjarmasin',
      [KONSOL_KDG]: 'Semua Zonasi KCS Kandangan',
      [UUS_KP]: 'UUS KP'
    };
    const opsi = [{ v: konsol, l: labelSemua[konsol] }];
    if (konsol !== UUS_KP) anggotaKonsolidasi(konsol).forEach(u => opsi.push({ v: u, l: u }));
    sel.innerHTML = opsi.map(o => `<option value="${esc(o.v)}">${esc(o.l)}</option>`).join('');
    if (opsi.some(o => o.v === lama)) sel.value = lama;
  }

  function onKonsolidasiChange() {
    perbaruiOpsiUnit();
    renderHalamanAktif();
  }

  function terapkanFilter() {
    STATE.periods[STATE.mode] = document.getElementById('filterTanggal').value;
    renderHalamanAktif();
  }

  /* ---------- Filter yang tampil per halaman ---------- */
  /**
   * page.filter (opsional): daftar kunci filter yang ditampilkan; tanpa properti ini semua tampil.
   * Kartu ber-atribut data-halaman hanya tampil di halaman tersebut.
   */
  function aturFilterHalaman(page) {
    const grid = document.querySelector('.filter-grid');
    if (!grid) return;
    const tampil = page && page.filter;
    let jumlah = 0;
    grid.querySelectorAll('.filter-card').forEach(el => {
      const kunci = el.dataset.filter;
      const halaman = el.dataset.halaman;
      let lihat = halaman ? halaman === STATE.page : (!tampil || tampil.includes(kunci));
      if (kunci === 'mode') lihat = STATE.page !== 'users';
      if (STATE.mode === 'Harian' && (kunci === 'tahun' || kunci === 'series')) lihat = false;
      el.style.display = lihat ? '' : 'none';
      if (lihat) jumlah++;
    });
    grid.style.setProperty('--kolom-filter', Math.max(jumlah, 1));
    grid.classList.toggle('filter-ringkas', jumlah <= 3);
  }

  /* ---------- Dipanggil Index.html sebelum halaman dirender ---------- */
  function perbaruiOpsiFilter(sheetUtama, page) {
    aturFilterHalaman(page);
    perbaruiOpsiTanggal(sheetUtama);
    perbaruiOpsiTahun(sheetUtama);
    perbaruiOpsiUnit();
  }

  /**
   * Konteks filter untuk render halaman:
   * p (Tanggal Data), series, tahun (Set), konsol, entity, seriesPeriods + seriesLabels (untuk grafik).
   */
  function bangunKonteks(page) {
    const semua = daftarPeriode(page.primary());
    const p = STATE.periods[STATE.mode] || '';
    const series = STATE.mode === 'Harian' ? 'Bulanan' : document.getElementById('filterSeries').value;
    const tahun = tahunAktif();
    const konsol = document.getElementById('filterKonsolidasi').value;
    const entity = document.getElementById('filterUnitKerja').value || konsol;
    const seriesPeriods = p ? periodeSesuaiSeries(semua, p, series, tahun) : [];
    return {
      p, series, seriesLabel: STATE.mode === 'Harian' ? 'Harian' : series, tahun, konsol, entity,
      label: labelPeriode(p),
      periods: semua,
      seriesPeriods,
      seriesLabels: seriesPeriods.map(labelPeriode),   // nama periode real, mis. Mar 2025, Jun 2025
      anggota: anggotaKonsolidasi(konsol),
      info: `${entity} · ${labelPeriode(p)} · ${STATE.mode}${STATE.mode === 'Bulanan' ? ' · Series ' + series : ''}`
    };
  }
;
const HLA_RASIO = [
    { kode: 'ROA', sheet: 'ROA 1' },
    { kode: 'FDR', sheet: 'FDR 1' },
    { kode: 'BOPO', sheet: 'BOPO 1' },
    { kode: 'NPF', sheet: 'NPF 1' },
    { kode: 'NI', sheet: 'NI 1' },
    { kode: 'CASA', sheet: 'CASA 1' }
  ];

  PAGES.hlaset = {
    title: () => 'HIGHLIGHT KINERJA / ASET & LABA',
    primary: () => 'Aset 1',
    sheets: () => ['Aset 1', 'Laba 1'].concat(HLA_RASIO.map(r => r.sheet)),

    render(ctx) {
      setTeks('hla-info', ctx.info);
      renderKpi('hla-aset', 'Aset 1', ctx);
      renderKpi('hla-laba', 'Laba 1', ctx);

      setTeks('hla-badge-trend', `Series: ${ctx.seriesLabel || ctx.series}`);
      renderTrendGanda('hlaTrendChart', ctx,
        { sheet: 'Aset 1', label: 'Aset', color: WARNA.hijau },
        { sheet: 'Laba 1', label: 'Laba', color: WARNA.oranye });

      // Rasio keuangan: kartu kecil dibangun sekali, lalu diisi ulang
      const grid = document.getElementById('hla-rasio-grid');
      if (!grid.children.length) {
        grid.innerHTML = HLA_RASIO.map(r => `
          <div class="mini-card">
            <div class="mini-card-head"><strong>${r.kode}</strong><span class="badge-growth badge-neutral" id="hla-rasio-val-${r.kode}">-</span></div>
            <div class="canvas-mini-wrap"><canvas id="hlaRasio${r.kode}"></canvas></div>
          </div>`).join('');
      }
      setTeks('hla-badge-rasio', `${ctx.entity} • Series ${ctx.seriesLabel || ctx.series}`);
      HLA_RASIO.forEach((r, i) => renderRasioMini(`hlaRasio${r.kode}`, r.sheet, ctx, `hla-rasio-val-${r.kode}`, WARNA.palet[i % WARNA.palet.length]));

      setTeks('hla-badge-target-aset', `Series: ${ctx.seriesLabel || ctx.series}`);
      renderRealisasiTarget('hlaTargetAsetChart', 'Aset 1', ctx);
      renderLeaderboard('hlaLeaderAsetChart', 'Aset 1', ctx);
      setTeks('hla-badge-table-aset', `Periode: ${ctx.label}`);
      renderTabelRealisasi('hlaTableAset', ctx, { sheet: 'Aset 1' });

      setTeks('hla-badge-target-laba', `Series: ${ctx.seriesLabel || ctx.series}`);
      renderRealisasiTarget('hlaTargetLabaChart', 'Laba 1', ctx);
      renderLeaderboard('hlaLeaderLabaChart', 'Laba 1', ctx);
      setTeks('hla-badge-table-laba', `Periode: ${ctx.label}`);
      renderTabelRealisasi('hlaTableLaba', ctx, { sheet: 'Laba 1' });
    }
  };
;
// Nama sheet sumber data DPK. Sheet akad (Mudharabah/Wadiah) belum ada di data mentah;
  // tambahkan sheet dengan nama berikut (format kolom sama dengan "DPK 1") agar donut akad terisi.
  const HLD_SHEET = {
    nom: 'DPK 1',
    noa: 'NOA DPK 1',
    instrumenNom: [{ label: 'Giro', sheet: 'Gir 1' }, { label: 'Tabungan', sheet: 'Tab 1' }, { label: 'Deposito', sheet: 'Depo 1' }],
    instrumenNoa: [{ label: 'Giro', sheet: 'NOA Gir 1' }, { label: 'Tabungan', sheet: 'NOA Tab 1' }, { label: 'Deposito', sheet: 'NOA Depo 1' }],
    akadNom: [{ label: 'Mudharabah', sheet: 'Mudharabah 1' }, { label: 'Wadiah', sheet: 'Wadiah 1' }],
    akadNoa: [{ label: 'Mudharabah', sheet: 'NOA Mudharabah 1' }, { label: 'Wadiah', sheet: 'NOA Wadiah 1' }]
  };

  PAGES.hldpk = {
    title: () => 'HIGHLIGHT KINERJA / DANA PIHAK KETIGA',
    primary: () => HLD_SHEET.nom,
    sheets: () => [HLD_SHEET.nom, HLD_SHEET.noa]
      .concat(HLD_SHEET.instrumenNom, HLD_SHEET.instrumenNoa, HLD_SHEET.akadNom, HLD_SHEET.akadNoa).map(x => x.sheet || x),

    render(ctx) {
      setTeks('hld-info', ctx.info);
      renderKpi('hld-nom', HLD_SHEET.nom, ctx, 'rp');
      renderKpi('hld-noa', HLD_SHEET.noa, ctx, 'num');

      setTeks('hld-badge-trend', `Series: ${ctx.seriesLabel || ctx.series}`);
      renderTrendGanda('hldTrendChart', ctx,
        { sheet: HLD_SHEET.nom, label: 'Nominal DPK', color: WARNA.teal, fmt: 'rp' },
        { sheet: HLD_SHEET.noa, label: 'NOA DPK', color: WARNA.oranye, fmt: 'num' });

      setTeks('hld-badge-komposisi', `${ctx.entity} • ${ctx.label}`);
      renderDonut('hldInstrumenNom', ctx, HLD_SHEET.instrumenNom, 'rp');
      renderDonut('hldAkadNom', ctx, HLD_SHEET.akadNom, 'rp');
      renderDonut('hldInstrumenNoa', ctx, HLD_SHEET.instrumenNoa, 'num');
      renderDonut('hldAkadNoa', ctx, HLD_SHEET.akadNoa, 'num');

      setTeks('hld-badge-target', `Series: ${ctx.seriesLabel || ctx.series}`);
      renderRealisasiTarget('hldTargetChart', HLD_SHEET.nom, ctx);
      renderLeaderboard('hldLeaderChart', HLD_SHEET.nom, ctx);

      setTeks('hld-badge-table', `Periode: ${ctx.label}`);
      renderTabelRealisasi('hldTable', ctx, { sheet: HLD_SHEET.nom, noaSheet: HLD_SHEET.noa });
    }
  };
;
// Nama sheet sumber data Pembiayaan. Sheet NOA MK/Inv dan Kolektibilitas belum ada
  // di data mentah; tambahkan sheet dengan nama berikut (format kolom sama dengan
  // "Pby 1") agar donut terkait terisi.
  const HLP_SHEET = {
    nom: 'Pby 1',
    noa: 'NOA Pby 1',
    npf: 'NPF 1',
    gunaNom: [{ label: 'Modal Kerja', sheet: 'MK 1' }, { label: 'Investasi', sheet: 'Inv 1' }, { label: 'Konsumer', sheet: 'Kons 1' }],
    gunaNoa: [{ label: 'Modal Kerja', sheet: 'NOA MK 1' }, { label: 'Investasi', sheet: 'NOA Inv 1' }, { label: 'Konsumer', sheet: 'NOA Kons 1' }],
    debiturNom: [{ label: 'Korporate', sheet: 'Korp 1' }, { label: 'UMKM', sheet: 'UMKM 1' }, { label: 'Konsumer', sheet: 'Kons 1' }],
    debiturNoa: [{ label: 'Korporate', sheet: 'NOA Korp 1' }, { label: 'UMKM', sheet: 'NOA UMKM 1' }, { label: 'Konsumer', sheet: 'NOA Kons 1' }],
    kolNom: [
      { label: 'Kol 1 (Lancar)', sheet: 'Kol1 1', color: '#0a7340' },
      { label: 'Kol 2 (DPK)', sheet: 'Kol2 1', color: '#0b8793' },
      { label: 'Kol 3 (Kurang Lancar)', sheet: 'Kol3 1', color: '#ea8010' },
      { label: 'Kol 4 (Diragukan)', sheet: 'Kol4 1', color: '#dc2626' },
      { label: 'Kol 5 (Macet)', sheet: 'Kol5 1', color: '#7f1d1d' }
    ]
  };

  PAGES.hlpembiayaan = {
    title: () => 'HIGHLIGHT KINERJA / PEMBIAYAAN',
    primary: () => HLP_SHEET.nom,
    sheets: () => {
      const grup = [].concat(HLP_SHEET.gunaNom, HLP_SHEET.gunaNoa, HLP_SHEET.debiturNom, HLP_SHEET.debiturNoa, HLP_SHEET.kolNom).map(x => x.sheet);
      return [...new Set([HLP_SHEET.nom, HLP_SHEET.noa, HLP_SHEET.npf].concat(grup))];
    },

    render(ctx) {
      setTeks('hlp-info', ctx.info);
      renderKpi('hlp-nom', HLP_SHEET.nom, ctx, 'rp');
      renderKpi('hlp-noa', HLP_SHEET.noa, ctx, 'num');

      setTeks('hlp-badge-trend', `Series: ${ctx.seriesLabel || ctx.series}`);
      renderTrendGanda('hlpTrendChart', ctx,
        { sheet: HLP_SHEET.nom, label: 'Nominal Pembiayaan', color: WARNA.ungu, fmt: 'rp' },
        { sheet: HLP_SHEET.noa, label: 'NOA Pembiayaan', color: WARNA.oranye, fmt: 'num' });

      setTeks('hlp-badge-komposisi', `${ctx.entity} • ${ctx.label}`);
      renderDonut('hlpGunaNom', ctx, HLP_SHEET.gunaNom, 'rp');
      renderDonut('hlpDebiturNom', ctx, HLP_SHEET.debiturNom, 'rp');
      renderDonut('hlpKolNom', ctx, HLP_SHEET.kolNom, 'rp');
      renderDonut('hlpGunaNoa', ctx, HLP_SHEET.gunaNoa, 'num');
      renderDonut('hlpDebiturNoa', ctx, HLP_SHEET.debiturNoa, 'num');
      renderRasioMini('hlpNpfChart', HLP_SHEET.npf, ctx, 'hlp-npf-val', WARNA.merah);

      setTeks('hlp-badge-target', `Series: ${ctx.seriesLabel || ctx.series}`);
      renderRealisasiTarget('hlpTargetChart', HLP_SHEET.nom, ctx);
      renderLeaderboard('hlpLeaderChart', HLP_SHEET.nom, ctx);

      setTeks('hlp-badge-table', `Periode: ${ctx.label}`);
      renderTabelRealisasi('hlpTable', ctx, { sheet: HLP_SHEET.nom, noaSheet: HLP_SHEET.noa });
    }
  };
;
// Sumber data: "<Nama Sheet>|<Nama Kolom>" (lihat Kode.gs). Ganti di sini bila nama sheet/kolom berubah.
  const HLE_SHEET = {
    eks:   { total: 'Eks Pby|Eks Pby', korp: 'Eks Pby|Eks Korp', umkm: 'Eks Pby|Eks UMKM', kons: 'Eks Pby|Eks Kons' },
    noa:   { total: 'NOA Eks Pby|NOA Eks Pby', korp: 'NOA Eks Pby|NOA Eks Korp', umkm: 'NOA Eks Pby|NOA Eks UMKM', kons: 'NOA Eks Pby|NOA Eks Kons' },
    ro:    { total: 'Run Off|Runoff Pby', korp: 'Run Off|Runoff Korp', umkm: 'Run Off|Runoff UMKM', kons: 'Run Off|Runoff Kons' }
  };

  PAGES.hlekspansi = {
    title: () => 'HIGHLIGHT KINERJA / EKSPANSI & RUN OFF',
    primary: () => HLE_SHEET.eks.total,
    sheets: () => [].concat(...['eks', 'noa', 'ro'].map(g => Object.values(HLE_SHEET[g]))),

    render(ctx) {
      const e = ctx.entity, p = ctx.p;
      setTeks('hle-info', ctx.info);

      // KPI: nilai bulan pada Tanggal Data + akumulasi sejak Januari (Ytd)
      const ytd = sheet => nilaiAlir(sheet, e, p, 'Tahunan');
      const eksNom = nilai(HLE_SHEET.eks.total, e, p);
      const roNom = nilai(HLE_SHEET.ro.total, e, p);
      const selisih = (a, b) => (a === null && b === null) ? null : (a || 0) - (b || 0);
      setTeks('hle-eks-nom', fmtRp(eksNom));
      setTeks('hle-eks-noa', fmtNum(nilai(HLE_SHEET.noa.total, e, p)));
      setTeks('hle-eks-sub', `Ytd ${ctx.label}: ${fmtRp(ytd(HLE_SHEET.eks.total))} • NOA ${fmtNum(ytd(HLE_SHEET.noa.total))}`);
      setTeks('hle-ro-nom', fmtRp(roNom));
      setTeks('hle-ro-sub', `Ytd ${ctx.label}: ${fmtRp(ytd(HLE_SHEET.ro.total))}`);
      setTeks('hle-net-nom', fmtRp(selisih(eksNom, roNom)));
      setTeks('hle-net-sub', `Ytd ${ctx.label}: ${fmtRp(selisih(ytd(HLE_SHEET.eks.total), ytd(HLE_SHEET.ro.total)))}`);

      const ketSeries = STATE.mode === 'Harian' ? 'Series: Harian' : ctx.series === 'Bulanan' ? 'Series: Bulanan' : `Series: ${ctx.series} • jumlah per periode`;
      document.querySelectorAll('.hle-badge-series').forEach(el => { el.textContent = ketSeries; });

      const garisEksRo = kat => [
        { sheet: HLE_SHEET.eks[kat], label: 'Ekspansi', color: WARNA.ungu, fmt: 'rp' },
        { sheet: HLE_SHEET.ro[kat], label: 'Run Off', color: WARNA.oranye, fmt: 'rp' }
      ];
      renderTrendMulti('hleTrendTotal', ctx, garisEksRo('total'), { alir: true });
      renderTrendMulti('hleTrendKorp', ctx, garisEksRo('korp'), { alir: true });
      renderTrendMulti('hleTrendUmkm', ctx, garisEksRo('umkm'), { alir: true });
      renderTrendMulti('hleTrendKons', ctx, garisEksRo('kons'), { alir: true });

      setTeks('hle-badge-komposisi', `${ctx.entity} • ${ctx.label}`);
      const bagian = g => [
        { label: 'Korporate', sheet: HLE_SHEET[g].korp, color: WARNA.biru },
        { label: 'UMKM', sheet: HLE_SHEET[g].umkm, color: WARNA.teal },
        { label: 'Konsumer', sheet: HLE_SHEET[g].kons, color: WARNA.ungu }
      ];
      renderDonut('hleDonutEks', ctx, bagian('eks'), 'rp');
      renderDonut('hleDonutRo', ctx, bagian('ro'), 'rp');

      renderTrendMulti('hleTrendNoa', ctx, [
        { sheet: HLE_SHEET.noa.total, label: 'Total Pembiayaan', color: WARNA.hijau, fmt: 'num' },
        { sheet: HLE_SHEET.noa.korp, label: 'Korporate', color: WARNA.biru, fmt: 'num' },
        { sheet: HLE_SHEET.noa.umkm, label: 'UMKM', color: WARNA.teal, fmt: 'num' },
        { sheet: HLE_SHEET.noa.kons, label: 'Konsumer', color: WARNA.ungu, fmt: 'num' }
      ], { alir: true });
    }
  };
;
// Pilihan ini hanya mengatur peringkat unit kerja. AO memakai filter segmennya sendiri.
  const HLR_DATA = [
    { id: 'aset', label: 'Aset', sheet: 'Aset 1' },
    { id: 'laba', label: 'Laba', sheet: 'Laba 1' },
    { id: 'pby', label: 'Total Pembiayaan', sheet: 'Pby 1' },
    { id: 'korp', label: 'Pembiayaan Korporate', sheet: 'Korp 1' },
    { id: 'umkm', label: 'Pembiayaan UMKM', sheet: 'UMKM 1' },
    { id: 'kons', label: 'Pembiayaan Konsumer', sheet: 'Kons 1' },
    { id: 'dpk', label: 'Total DPK', sheet: 'DPK 1' },
    { id: 'giro', label: 'Giro', sheet: 'Gir 1' },
    { id: 'tab', label: 'Tabungan', sheet: 'Tab 1' },
    { id: 'depo', label: 'Deposito', sheet: 'Depo 1' }
  ];

  // Letakkan kartu "Data" di samping "Tanggal Data" pada baris filter utama.
  (function () {
    const grid = document.querySelector('.filter-grid');
    const kartu = document.getElementById('hlrDataCard');
    if (grid && kartu) grid.appendChild(kartu);
  })();

  function dataPeringkatAktif() {
    const sel = document.getElementById('hlrData');
    if (!sel.options.length) {
      sel.innerHTML = HLR_DATA.map(d => `<option value="${d.id}">${esc(d.label)}</option>`).join('');
    }
    return HLR_DATA.find(d => d.id === sel.value) || HLR_DATA[0];
  }

  function gantiDataPeringkat() {
    muatData(false); // memuat sheet yang belum ada, lalu render ulang
  }

  /** Urutkan dari rasio tertinggi; nilai kosong di bawah. */
  function urutRasio(items) {
    return items.sort((a, b) => {
      const ra = a.rasio === null || a.rasio === undefined ? -Infinity : a.rasio;
      const rb = b.rasio === null || b.rasio === undefined ? -Infinity : b.rasio;
      if (ra !== rb) return rb - ra;
      return (b.v === null ? -Infinity : b.v) - (a.v === null ? -Infinity : a.v) || a.nama.localeCompare(b.nama, 'id');
    });
  }

  function barisPeringkat(items, fmtAktual) {
    return items.map((it, i) => {
      const r = i + 1;
      const pct = it.rasio === null || it.rasio === undefined ? 0 : Math.max(0, Math.min(it.rasio, 1.5)) / 1.5 * 100;
      const warna = it.rasio === null || it.rasio === undefined ? WARNA.teal : it.rasio >= 1 ? WARNA.hijau : it.rasio >= 0.8 ? WARNA.oranye : WARNA.merah;
      return `
        <tr>
          <td class="rank-col"><span class="rank-badge ${it.rasio != null && r <= 3 ? 'rank-' + r : ''}">${it.rasio == null ? '-' : r}</span></td>
          <td><strong>${esc(it.nama)}</strong>${it.sub ? `<span class="rank-sub">${esc(it.sub)}</span>` : ''}${it.note ? `<span class="rank-sub">${esc(it.note)}</span>` : ''}</td>
          <td class="num-col">${fmtNilai(it.v, fmtAktual)}</td>
          <td class="num-col">${fmtNilai(it.t, fmtAktual)}</td>
          <td class="num-col"><strong>${fmtPct(it.rasio)}</strong><div class="rank-bar"><span style="width:${pct}%;background:${warna};"></span></div></td>
        </tr>`;
    }).join('');
  }

  PAGES.hlperingkat = {
    title: () => 'HIGHLIGHT KINERJA / PERINGKAT UNIT KERJA & AO',
    filter: ['tanggal'], // hanya Tanggal Data (+ kartu Data milik halaman ini)
    primary: () => dataPeringkatAktif().sheet,
    sheets: () => {
      const d = dataPeringkatAktif();
      return [d.sheet, 'Peringkat AO'];
    },

    render(ctx) {
      const d = dataPeringkatAktif();
      const unitKerja = anggotaKonsolidasi(ENTITAS_UUS); // seluruh unit kerja UUS
      setTeks('hlr-info', `${d.label} • ${ctx.label}`);

      // ---------- Peringkat unit kerja ----------
      setTeks('hlr-judul-unit', `Peringkat Unit Kerja — ${d.label}`);
      setTeks('hlr-badge-unit', `Periode: ${ctx.label}`);
      const tbodyUnit = document.getElementById('hlrTableUnit');
      if (!sheetAda(d.sheet)) {
        tbodyUnit.innerHTML = `<tr><td colspan="5" class="table-empty">Sheet "${esc(d.sheet)}" belum tersedia di Spreadsheet.</td></tr>`;
      } else {
        const items = urutRasio(unitKerja.map(u => {
          const k = kinerja(d.sheet, u, ctx.p);
          return { nama: u, v: k.v, t: k.t, rasio: k.rbb };
        }).filter(it => it.v !== null));
        tbodyUnit.innerHTML = items.length
          ? barisPeringkat(items, 'rp')
          : '<tr><td colspan="5" class="table-empty">Tidak ada data unit kerja untuk periode ini.</td></tr>';
      }

      // ---------- Peringkat AO ----------
      renderPeringkatAo(ctx);
    }
  };

  function simpanBasisAo() {
    try { localStorage.setItem('bks-ao-basis', JSON.stringify({ aktual: document.getElementById('aoBasisAktual').value, target: document.getElementById('aoBasisTarget').value })); } catch (e) {}
    renderHalamanAktif();
  }

  function terakhirAo(rows, keyFn) {
    const out = new Map();
    rows.forEach(r => {
      const key = keyFn(r), old = out.get(key), day = r.d || r.m + '-01';
      if (old && day === (old.d || old.m + '-01') && (r.v !== old.v || r.t !== old.t)) throw new Error('Ada data AO ganda yang berbeda untuk periode yang sama. Periksa nama AO, kantor, segmen dan tanggal.');
      if (!old || day > (old.d || old.m + '-01')) out.set(key, r);
    });
    return out;
  }

  function hitungPeriodeAo(rows, field, basis, scope, ctx) {
    const month = Number(ctx.p.slice(5, 7)), q = Math.ceil(month / 3);
    const missing = label => ({ value: null, note: label });
    if (!rows.length) return missing('Data periode belum tersedia');
    if (scope === 'posisi') {
      const unique = terakhirAo(rows, () => 'posisi');
      const v = unique.get('posisi')[field];
      return { value: v == null ? null : v, note: v == null ? 'Nilai belum tersedia' : '' };
    }
    if (!basis) return missing('Pilih dasar angka sumber AO');
    const qs = terakhirAo(rows, r => r.q || Math.ceil(Number(r.m.slice(5, 7)) / 3));
    if (basis === 'ytd') {
      const now = qs.get(q);
      if (!now || now[field] == null) return missing('Data TW ' + q + ' belum tersedia');
      if (scope === 'ytd' || q === 1) return { value: now[field], note: '' };
      const before = qs.get(q - 1);
      if (!before || before[field] == null) return missing('Perlu posisi kumulatif akhir TW ' + (q - 1));
      const closeMonth = ctx.p.slice(0, 4) + '-' + String((q - 1) * 3).padStart(2, '0');
      const closeDay = new Date(Date.UTC(Number(ctx.p.slice(0, 4)), (q - 1) * 3, 0)).toISOString().slice(0, 10);
      if (before.m !== closeMonth || (before.daily && before.d !== closeDay)) return missing('Perlu posisi kumulatif akhir TW ' + (q - 1));
      return { value: now[field] - before[field], note: '' };
    }
    const monthly = basis === 'bulanan';
    const positions = monthly ? terakhirAo(rows, r => Number(r.m.slice(5, 7))) : qs;
    const start = scope === 'ytd' ? 1 : monthly ? (q - 1) * 3 + 1 : q;
    const end = monthly ? month : q;
    let total = 0; const gaps = [];
    for (let i = start; i <= end; i++) {
      const row = positions.get(i);
      if (!row || row[field] == null) gaps.push((monthly ? 'bulan ' : 'TW ') + i);
      else total += row[field];
    }
    return gaps.length ? missing('Belum lengkap: ' + gaps.join(', ')) : { value: total, note: '' };
  }

  function bangunRankingAo(ctx, segment, scope, actualBasis, targetBasis) {
    const source = scope === 'posisi' ? (DATA['Peringkat AO'] || []).filter(r => r.p === ctx.p) : (DATA_RAW['Peringkat AO'] || []);
    const y = Number(ctx.p.slice(0, 4)), m = Number(ctx.p.slice(5, 7));
    const akhir = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const end = [ctx.p.length === 10 ? ctx.p : akhir, hariIni()].sort()[0];
    const quarter = Math.ceil(Number(ctx.p.slice(5, 7)) / 3);
    const rows = source.filter(r => r.m.slice(0, 4) === ctx.p.slice(0, 4) && (r.d || r.m + '-01') <= end && (r.q || Math.ceil(Number(r.m.slice(5, 7)) / 3)) <= quarter);
    const groups = new Map();
    rows.forEach(r => {
      if (segment && r.seg !== segment) return;
      const key = JSON.stringify([r.u, r.c || '']);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    const items = [], notices = new Set();
    groups.forEach(group => {
      const segmented = group.some(r => r.seg === 'Konsumer' || r.seg === 'UMK');
      if (segmented && group.some(r => !r.seg)) notices.add('Baris umum lama tidak ditambahkan lagi pada AO yang sudah memiliki rincian segmen.');
      const eligible = segmented ? group.filter(r => !!r.seg) : group;
      const bySeg = new Map();
      eligible.forEach(r => { const key = r.seg || ''; if (!bySeg.has(key)) bySeg.set(key, []); bySeg.get(key).push(r); });
      let v = 0, t = 0, validV = true, validT = true; const notes = new Set();
      bySeg.forEach(rs => {
        const real = hitungPeriodeAo(rs, 'v', actualBasis, scope, ctx);
        const target = hitungPeriodeAo(rs, 't', targetBasis, scope, ctx);
        if (real.value == null) validV = false; else v += real.value;
        if (target.value == null) validT = false; else t += target.value;
        [real.note, target.note].filter(Boolean).forEach(n => notes.add(n));
      });
      if (!segmented) notices.add('Data tanpa Segmen hanya ditampilkan sebagai umum; belum dapat dipisahkan menjadi Konsumer/UMK.');
      if (!validV || !validT) notices.add('Sebagian AO belum memiliki data lengkap. Nilai yang belum lengkap tidak dianggap nol.');
      v = validV ? v : null; t = validT ? t : null;
      items.push({ nama: group[0].u, sub: group[0].c || 'Kantor belum diisi', v, t, rasio: v != null && t > 0 ? v / t : null, note: [...notes].join('; ') });
    });
    return { items: urutRasio(items), notes: [...notices] };
  }

  function renderPeringkatAo(ctx) {
    const seg = document.getElementById('aoSegmen').value;
    const scope = document.getElementById('aoCakupan').value;
    const basisA = document.getElementById('aoBasisAktual').value, basisT = document.getElementById('aoBasisTarget').value;
    const tbody = document.getElementById('hlrTableAo');
    setTeks('hlr-judul-ao', 'Peringkat AO ' + (seg || 'Umum'));
    setTeks('hlr-badge-ao', ctx.label + ' · ' + ({ posisi: 'Posisi sumber', triwulan: 'Triwulanan', ytd: 'Tahun berjalan' }[scope]));
    setTeks('hlr-catatan-ao', 'Urutan berdasarkan pencapaian. Umum = total realisasi ÷ total target Konsumer dan UMK pada cakupan yang sama. Angka sumber tanpa segmen tetap diberi label umum.');
    if (!sheetAda('Peringkat AO') || !ctx.p) { tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Data AO belum tersedia untuk periode ini.</td></tr>'; setTeks('aoCoverage', ''); return; }
    if (scope !== 'posisi' && (!basisA || !basisT)) {
      document.getElementById('aoBasisPanel').open = true;
      setTeks('aoCoverage', 'Tentukan apakah realisasi dan target khusus per triwulan atau kumulatif. Perhitungan belum dijalankan agar tidak menghitung ganda.');
      tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Pilih dasar realisasi dan target di atas.</td></tr>'; return;
    }
    try {
      const result = bangunRankingAo(ctx, seg, scope, basisA, basisT);
      setTeks('aoCoverage', result.notes.join(' '));
      tbody.innerHTML = result.items.length ? barisPeringkat(result.items, 'rp') : '<tr><td colspan="5" class="table-empty">Data AO untuk periode/segmen ini belum tersedia. Periksa periode dan kolom Segmen pada sumber.</td></tr>';
    } catch (e) { setTeks('aoCoverage', e.message); tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Perbaiki data AO yang bertentangan sebelum menampilkan ranking.</td></tr>'; }
  }
;
PAGES.aset = halamanIndikator({ page: 'aset', metric: 'Aset', sheet: 'Aset 1', fmt: 'rp', warna: WARNA.hijau });
;
PAGES.laba = halamanIndikator({ page: 'laba', metric: 'Laba', sheet: 'Laba 1', fmt: 'rp', warna: WARNA.hijau });
;
PAGES.pendopr = halamanIndikator({ page: 'pendopr', metric: 'Pendapatan Operasional', sheet: 'Pend Opr 1', fmt: 'rp', warna: WARNA.hijau });
;
PAGES.byopr = halamanIndikator({ page: 'byopr', metric: 'Biaya Operasional', sheet: 'By Opr 1', fmt: 'rp', warna: WARNA.hijau });
;
PAGES.penydana = halamanIndikator({ page: 'penydana', metric: 'Pendapatan Penyaluran Dana', sheet: 'Peny Dana 1', fmt: 'rp', warna: WARNA.hijau });
;
PAGES.bybaghas = halamanIndikator({ page: 'bybaghas', metric: 'Biaya Bagi Hasil', sheet: 'By BagHas 1', fmt: 'rp', warna: WARNA.hijau });
;
PAGES.fbi = halamanIndikator({ page: 'fbi', metric: 'Fee Based Income', sheet: 'FBI 1', fmt: 'rp', warna: WARNA.hijau });
;
PAGES.dpk = halamanIndikator({ page: 'dpk', metric: 'DPK', sheet: 'DPK 1', fmt: 'rp', warna: WARNA.teal });
;
PAGES.giro = halamanIndikator({ page: 'giro', metric: 'Giro', sheet: 'Gir 1', fmt: 'rp', warna: WARNA.teal });
;
PAGES.tabungan = halamanIndikator({ page: 'tabungan', metric: 'Tabungan', sheet: 'Tab 1', fmt: 'rp', warna: WARNA.teal });
;
PAGES.deposito = halamanIndikator({ page: 'deposito', metric: 'Deposito', sheet: 'Depo 1', fmt: 'rp', warna: WARNA.teal });
;
PAGES.noadpk = halamanIndikator({ page: 'noadpk', metric: 'NOA DPK', sheet: 'NOA DPK 1', fmt: 'num', warna: WARNA.teal });
;
PAGES.pembiayaan = halamanIndikator({ page: 'pembiayaan', metric: 'Pembiayaan', sheet: 'Pby 1', fmt: 'rp', warna: WARNA.ungu });
;
PAGES.korporate = halamanIndikator({ page: 'korporate', metric: 'Pembiayaan Korporate', sheet: 'Korp 1', fmt: 'rp', warna: WARNA.ungu });
;
PAGES.umkm = halamanIndikator({ page: 'umkm', metric: 'Pembiayaan UMKM', sheet: 'UMKM 1', fmt: 'rp', warna: WARNA.ungu });
;
PAGES.konsumer = halamanIndikator({ page: 'konsumer', metric: 'Pembiayaan Konsumer', sheet: 'Kons 1', fmt: 'rp', warna: WARNA.ungu });
;
PAGES.modalkerja = halamanIndikator({ page: 'modalkerja', metric: 'Pembiayaan Modal Kerja', sheet: 'MK 1', fmt: 'rp', warna: WARNA.ungu });
;
PAGES.investasi = halamanIndikator({ page: 'investasi', metric: 'Pembiayaan Investasi', sheet: 'Inv 1', fmt: 'rp', warna: WARNA.ungu });
;
PAGES.noapby = halamanIndikator({ page: 'noapby', metric: 'NOA Pembiayaan', sheet: 'NOA Pby 1', fmt: 'num', warna: WARNA.ungu });
;
PAGES.ekskur = halamanIndikator({ page: 'ekskur', metric: 'Ekspansi KUR', sheet: 'Eksp KUR 1', fmt: 'rp', warna: WARNA.ungu });
;
PAGES.poskur = halamanIndikator({ page: 'poskur', metric: 'Posisi KUR', sheet: 'Pos KUR 1', fmt: 'rp', warna: WARNA.ungu });
;
PAGES.eksflpp = {
    title: () => 'PEMBIAYAAN / EKSPANSI FLPP BERDASARKAN NOA',
    primary: () => 'NOA Eks FLPP 1',
    sheets: () => ['NOA Eks FLPP 1', 'Eks FLPP 1'],
    render(ctx) {
      const sh = 'NOA Eks FLPP 1', k = kinerja(sh, ctx.entity, ctx.p);
      setTeks('eksflpp-info', ctx.info);
      setTeks('eksflpp-noa', fmtNum(k.v));
      const rowNoa = baris(sh, ctx.entity, ctx.p), rowNom = baris('Eks FLPP 1', ctx.entity, ctx.p);
      const dates = STATE.mode === 'Bulanan' && rowNoa && rowNoa.daily ? ' · NOA posisi ' + labelPeriode(rowNoa.d) + (rowNom && rowNom.d !== rowNoa.d ? '; nominal posisi ' + labelPeriode(rowNom.d) : '') : '';
      setTeks('eksflpp-noa-info', `${ctx.entity} · ${ctx.label}${dates}`);
      setTeks('eksflpp-target-noa', fmtNum(k.t));
      setTeks('eksflpp-achieve', fmtPct(k.v != null && k.t > 0 ? k.v / k.t : null));
      setTeks('eksflpp-achieve-info', statusTarget(sh, k.v, k.t).label);
      const gap = k.v != null && k.t > 0 ? k.t - k.v : null;
      setTeks('eksflpp-gap', gap == null ? '-' : fmtNum(Math.abs(gap)));
      setTeks('eksflpp-gap-info', gap == null ? 'Target belum tersedia' : gap < 0 ? 'Melebihi target (unit)' : 'Sisa target (unit)');
      setTeks('eksflpp-nominal', fmtRp(nilai('Eks FLPP 1', ctx.entity, ctx.p)));
      setTeks('eksflpp-badge-trend', ctx.label);
      setTeks('eksflpp-badge-target', ctx.label);
      setTeks('eksflpp-badge-table', ctx.label);
      renderTrendGanda('eksflpp-trend', ctx, { sheet: sh, label: 'Realisasi NOA FLPP', color: WARNA.hijau, fmt: 'num' });
      renderRealisasiTarget('eksflpp-target', sh, ctx, 'num');
      renderLeaderboard('eksflpp-leader', sh, ctx, 'num');
      const body = document.getElementById('eksflpp-table');
      body.innerHTML = barisTabelKonsolidasi(ctx.konsol).map((item, i) => {
        const a = kinerja(sh, item.unit, ctx.p), ratio = a.v != null && a.t > 0 ? a.v / a.t : null;
        const g = a.v != null && a.t > 0 ? a.t - a.v : null;
        return `<tr class="row-${item.tipe}"><td>${i + 1}</td><td>${esc(item.unit)}</td><td class="num-col">${fmtNum(a.v)}</td><td class="num-col">${fmtNum(a.t)}</td><td class="num-col">${fmtPct(ratio)}</td><td class="num-col">${g == null ? '-' : g < 0 ? 'Lebih ' + fmtNum(-g) : fmtNum(g)}</td><td class="num-col">${fmtRp(nilai('Eks FLPP 1', item.unit, ctx.p))}</td></tr>`;
      }).join('');
    }
  };
;
PAGES.posflpp = halamanIndikator({ page: 'posflpp', metric: 'Posisi FLPP', sheet: 'Pos FLPP 1', fmt: 'rp', warna: WARNA.ungu });
;
PAGES.npftotal = halamanNpf({ page: 'npftotal', nama: 'NPF Total Pembiayaan', sheet: 'NPF Total Pembiayaan', warna: WARNA.merah });
;
PAGES.npfkorp = halamanNpf({ page: 'npfkorp', nama: 'NPF Korporate', sheet: 'NPF Korporate', warna: WARNA.merah });
;
PAGES.npfumkm = halamanNpf({ page: 'npfumkm', nama: 'NPF UMKM', sheet: 'NPF UMKM', warna: WARNA.merah });
;
PAGES.npfkons = halamanNpf({ page: 'npfkons', nama: 'NPF Konsumer', sheet: 'NPF Kons', warna: WARNA.merah });
;
PAGES.npfkur = halamanNpf({ page: 'npfkur', nama: 'NPF KUR', sheet: 'NPF KUR', warna: WARNA.merah });
;
PAGES.npfflpp = halamanNpf({ page: 'npfflpp', nama: 'NPF FLPP', sheet: 'NPF FLPP', warna: WARNA.merah });
;
PAGES.roa = halamanIndikator({ page: 'roa', metric: 'ROA', sheet: 'ROA 1', fmt: 'pct', warna: WARNA.biru });
;
PAGES.ni = halamanIndikator({ page: 'ni', metric: 'NI', sheet: 'NI 1', fmt: 'pct', warna: WARNA.biru });
;
PAGES.fdr = halamanIndikator({ page: 'fdr', metric: 'FDR', sheet: 'FDR 1', fmt: 'pct', warna: WARNA.biru });
;
PAGES.bopo = halamanIndikator({ page: 'bopo', metric: 'BOPO', sheet: 'BOPO 1', fmt: 'pct', warna: WARNA.biru });
;
PAGES.npf = halamanIndikator({ page: 'npf', metric: 'NPF', sheet: 'NPF 1', fmt: 'pct', warna: WARNA.biru });
;
PAGES.casa = halamanIndikator({ page: 'casa', metric: 'CASA', sheet: 'CASA 1', fmt: 'pct', warna: WARNA.biru });
;
PAGES.far = halamanIndikator({ page: 'far', metric: 'FAR', sheet: 'FAR 1', fmt: 'pct', warna: WARNA.biru });
;
PAGES.pctfbi = halamanIndikator({ page: 'pctfbi', metric: '% FBI', sheet: '%FBI 1', fmt: 'pct', warna: WARNA.biru });
;
PAGES.pctumkm = halamanIndikator({ page: 'pctumkm', metric: '% UMKM', sheet: '%UMKM 1', fmt: 'pct', warna: WARNA.biru });
;
/* ======================= MANAJEMEN USER ======================= */
    function renderUserManagement() {
      if (STATE.role !== 'admin') return;
      const body = document.getElementById('usersTableBody');
      if (!body) return;
      body.innerHTML = '<tr><td colspan="4">Memuat akun...</td></tr>';
      google.script.run
        .withSuccessHandler(function(res) {
          if (!res || !res.success) {
            body.innerHTML = `<tr><td colspan="4">${esc((res && res.message) || 'Gagal memuat akun.')}</td></tr>`;
            return;
          }
          body.innerHTML = res.users.length ? res.users.map(u => `
            <tr><td>${esc(u.username)}</td><td>${esc(u.nama)}</td><td><span class="user-role-pill">${esc(u.role)}</span></td>
            <td>${u.role.toLowerCase() === 'cabang' ? `<button type="button" class="user-delete-btn" data-username="${esc(u.username)}">Hapus</button>` : '<span class="user-protected">Akun terlindungi</span>'}</td></tr>
          `).join('') : '<tr><td colspan="4">Belum ada akun.</td></tr>';
          body.querySelectorAll('.user-delete-btn').forEach(function(btn) {
            btn.addEventListener('click', function() { hapusUserCabang(btn.dataset.username); });
          });
        })
        .withFailureHandler(function(err) {
          body.innerHTML = `<tr><td colspan="4">${esc(err && err.message ? err.message : err)}</td></tr>`;
        })
        .listUsers(STATE.token);
    }

    function tambahUserCabang() {
      const username = document.getElementById('newUserUsername').value.trim();
      const password = document.getElementById('newUserPassword').value;
      const msg = document.getElementById('userManagementMessage');
      const btn = document.getElementById('btnCreateUser');
      msg.textContent = '';
      if (!username || !password) { msg.textContent = 'Email dan password wajib diisi.'; msg.className = 'user-message error'; return; }
      btn.disabled = true; btn.textContent = 'Menyimpan...';
      google.script.run
        .withSuccessHandler(function(res) {
          btn.disabled = false; btn.textContent = 'Tambah User Cabang';
          msg.textContent = (res && res.message) || 'Permintaan selesai.';
          msg.className = 'user-message ' + (res && res.success ? 'success' : 'error');
          if (res && res.success) {
            document.getElementById('newUserUsername').value = '';
            document.getElementById('newUserPassword').value = '';
            renderUserManagement();
          }
        })
        .withFailureHandler(function(err) {
          btn.disabled = false; btn.textContent = 'Tambah User Cabang';
          msg.textContent = 'Gagal menyimpan: ' + (err && err.message ? err.message : err);
          msg.className = 'user-message error';
        })
        .createBranchUser(STATE.token, username, password);
    }

    function hapusUserCabang(username) {
      if (!confirm('Hapus akun cabang "' + username + '"? Pengguna tersebut tidak akan bisa login lagi.')) return;
      const msg = document.getElementById('userManagementMessage');
      google.script.run
        .withSuccessHandler(function(res) {
          msg.textContent = (res && res.message) || 'Permintaan selesai.';
          msg.className = 'user-message ' + (res && res.success ? 'success' : 'error');
          renderUserManagement();
        })
        .withFailureHandler(function(err) {
          msg.textContent = 'Gagal menghapus: ' + (err && err.message ? err.message : err);
          msg.className = 'user-message error';
        })
        .deleteBranchUser(STATE.token, username);
    }

    // Halaman Ringkasan Eksekutif
    PAGES.home = {
      title: () => 'HIGHLIGHT KINERJA / RINGKASAN EKSEKUTIF',
      primary: () => 'Aset 1',
      sheets: () => ['Aset 1', 'Laba 1', 'DPK 1', 'NOA DPK 1', 'Pby 1', 'NOA Pby 1'],

      render(ctx) {
        const sub = `${ctx.entity} (${ctx.label})`;
        ['aset', 'dpk', 'pby'].forEach(k => setTeks(`home-sub-${k}`, sub));

        const aset = kinerja('Aset 1', ctx.entity, ctx.p);
        const dpk = kinerja('DPK 1', ctx.entity, ctx.p);
        const pby = kinerja('Pby 1', ctx.entity, ctx.p);

        setTeks('home-val-aset', fmtRp(aset.v));
        setTeks('home-val-laba', fmtRp(nilai('Laba 1', ctx.entity, ctx.p)));
        setTeks('home-rbb-aset', `RBB/C Aset: ${fmtPct(aset.rbb)} • YoY ${fmtPct(aset.yoy)}`);

        setTeks('home-val-dpk', fmtRp(dpk.v));
        setTeks('home-noa-dpk', fmtNum(nilai('NOA DPK 1', ctx.entity, ctx.p)));
        setTeks('home-rbb-dpk', `RBB/C DPK: ${fmtPct(dpk.rbb)} • YoY ${fmtPct(dpk.yoy)}`);

        setTeks('home-val-pby', fmtRp(pby.v));
        setTeks('home-noa-pby', fmtNum(nilai('NOA Pby 1', ctx.entity, ctx.p)));
        setTeks('home-rbb-pby', `RBB/C Pembiayaan: ${fmtPct(pby.rbb)} • YoY ${fmtPct(pby.yoy)}`);

        setTeks('home-badge-trend', ctx.info);
        const garis = (sheet, label, warna) => ({
          label,
          data: ctx.seriesPeriods.map(p => nilai(sheet, ctx.entity, p)),
          borderColor: warna, backgroundColor: warna, borderWidth: 2.5, tension: 0.3, pointRadius: 3        });
        buatChart('homeOverviewChart', {
          type: 'line',
          data: {
            labels: ctx.seriesLabels,
            datasets: [garis('Aset 1', 'Aset', WARNA.hijau), garis('DPK 1', 'DPK', WARNA.teal), garis('Pby 1', 'Pembiayaan', WARNA.ungu)]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmtRp(c.parsed.y)}` } } },
            scales: { y: { ticks: { callback: v => fmtSumbu(v, 'rp') } } }
          }
        });
      }
    };

    function warnaChartTema(value) {
      if (Array.isArray(value)) return value.map(warnaChartTema);
      if (typeof value !== 'string' || document.documentElement.dataset.theme !== 'dark') return value;
      const colors = { '#0a7340': '#69dba6', '#0b8793': '#66d2df', '#6343c6': '#baa7ff', '#ea8010': '#ffc374', '#1d4ed8': '#91b9ff', '#dc2626': '#ff9393' };
      const base = value.slice(0, 7).toLowerCase();
      return colors[base] ? colors[base] + value.slice(7) : value;
    }

    function sesuaikanChartTheme(config) {
      const dark = document.documentElement.dataset.theme === 'dark';
      const text = dark ? '#cfddd6' : '#536577', grid = dark ? '#30463d' : '#e5ece8';
      const options = config.options || (config.options = {}), plugins = options.plugins || (options.plugins = {});
      (config.data.datasets || []).forEach(ds => {
        if (!ds._lightColors) ds._lightColors = {};
        ['backgroundColor', 'borderColor', 'pointBackgroundColor', 'pointBorderColor'].forEach(key => {
          if (!(key in ds)) return;
          if (!(key in ds._lightColors)) ds._lightColors[key] = Array.isArray(ds[key]) ? ds[key].slice() : ds[key];
          ds[key] = warnaChartTema(ds._lightColors[key]);
        });
      });
      if (plugins.legend !== false) {
        plugins.legend = plugins.legend || {};
        plugins.legend.labels = Object.assign({}, plugins.legend.labels, { color: text });
      }
      plugins.tooltip = Object.assign({}, plugins.tooltip, { backgroundColor: dark ? '#263d32' : '#183c2a', titleColor: '#ffffff', bodyColor: '#ffffff', borderColor: grid, borderWidth: 1 });
      Object.values(options.scales || {}).forEach(scale => {
        scale.ticks = Object.assign({}, scale.ticks, { color: text });
        scale.grid = Object.assign({}, scale.grid, { color: grid });
        scale.title = Object.assign({}, scale.title, { color: text });
      });
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) options.animation = false;
    }

    function terapkanTheme() {
      const dark = document.documentElement.dataset.theme === 'dark';
      const button = document.getElementById('themeSwitch');
      if (button) { button.setAttribute('aria-checked', String(dark)); button.title = dark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'; }
      setTeks('themeLabel', dark ? 'Gelap' : 'Terang');
      Object.values(CHARTS).forEach(chart => {
        // Chart.options adalah resolver ber-proxy; ubah konfigurasi mentah agar tidak membentuk referensi sirkular.
        sesuaikanChartTheme({ data: chart.data, options: chart.config.options });
        chart.update('none');
      });
    }

    function toggleTheme() {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('bks-dashboard-theme', next); } catch (e) {}
      terapkanTheme();
    }

    PAGES.users = {
      title: () => 'MANAJEMEN USER / KELOLA AKUN CABANG',
      primary: () => 'Aset 1',
      sheets: () => [],
      filter: [],
      render() { renderUserManagement(); }
    };

    terapkanTheme();
    try {
      const saved = JSON.parse(localStorage.getItem('bks-ao-basis') || '{}');
      ['Aktual', 'Target'].forEach(k => {
        const el = document.getElementById('aoBasis' + k), v = saved[k.toLowerCase()];
        if ([...el.options].some(o => o.value === v)) el.value = v;
      });
    } catch (e) {}
    if (typeof lucide !== 'undefined') lucide.createIcons();
