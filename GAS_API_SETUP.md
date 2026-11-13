# Menghubungkan GitHub Pages ke Google Sheets melalui Apps Script

Dashboard ini tetap menggunakan Google Sheets sebagai sumber data. Supabase tidak diperlukan untuk login maupun data setelah penghubung GAS aktif.

## 1. Tambahkan API ke Apps Script

1. Buka project Apps Script yang saat ini menjalankan dashboard.
2. Buka file `Code.gs`.
3. **Jangan mengganti `doGet(e)` yang ada.** Tambahkan isi file `GAS_API_PATCH.gs` di bagian paling bawah.
4. Simpan, lalu buka **Deploy → Manage deployments → Edit** pada deployment Web App yang sama.
5. Pilih **New version**, lalu klik **Deploy**. Pertahankan URL Web App yang sama.
6. Pastikan deployment berjalan sebagai pemilik script (**Execute as: Me**) dan aksesnya mengizinkan endpoint dipanggil oleh Worker (**Who has access: Anyone**, bila opsi ini tersedia di akunmu). Akses data tetap dibatasi oleh token sesi dan pemeriksaan role di fungsi backend.
7. Tes URL Web App lama; dashboard GAS seharusnya tetap tampil seperti biasa.

Patch ini menambahkan `doPost` untuk meneruskan hanya metode yang diizinkan ke fungsi login/data yang sudah ada. Fungsi `getDataBundle` dan pengelolaan user tetap memakai validasi token yang ada di Code.gs.

## 2. Deploy Cloudflare Worker

1. Masuk ke Cloudflare Dashboard → **Workers & Pages** → **Create** → **Worker**.
2. Pilih opsi untuk menulis kode sendiri, lalu ganti kode contoh dengan isi `cloudflare-worker.js`.
3. Deploy Worker dan salin URL Worker yang diberikan (mis. `https://nama-worker.nama-akun.workers.dev`).

Worker hanya menjadi penghubung lintas domain; data dan autentikasi tetap diproses oleh Apps Script. URL Apps Script bukan rahasia, tetapi jangan pernah menaruh password, token, atau data privat di source code.

## 3. Sambungkan frontend

Buka `gas-api-client.js` dan ganti nilai `API_BRIDGE_URL` dengan URL Worker milikmu. Simpan dan commit perubahan tersebut ke GitHub.

## 4. Verifikasi

- Login memakai username/password yang sama dari sheet `Users` (bukan akun Supabase).
- Coba muat data dan tombol **Sinkronkan Data**.
- Coba logout.
- Jika login berhasil tetapi data gagal, cek apakah deployment GAS sudah diperbarui dan pesan error di status dashboard.

## Keamanan penting

- Jangan publikasikan spreadsheet menggunakan **Publish to web**.
- Jangan menghapus sheet `Users` atau mengubah struktur sheet sumber.
- Jangan menghapus project Supabase dulu; cukup tidak dipakai oleh frontend.
- Apps Script masih menjalankan pengecekan token dan role admin pada fungsi yang sudah ada. Pastikan deployment Web App disetel sesuai akses yang dibutuhkan aplikasi.
