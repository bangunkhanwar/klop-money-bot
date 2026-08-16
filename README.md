# Klop Money

Klop Money terdiri dari chatbot WhatsApp, REST API Express, Google Sheets, dan PWA React responsif.

## Menjalankan lokal

Persyaratan: Node.js 22+, Google Chrome, `server/private/credentials.json`, dan konfigurasi `server/.env`.

Gunakan nomor WhatsApp khusus bot dan isi nomor tersebut pada `BOT_ACCOUNT_NUMBER`. Sistem akan menolak serta logout otomatis jika QR dipindai oleh akun lain. Jangan gunakan nomor WhatsApp pribadi.

```powershell
npm install
npm run dev
```

Buka `http://localhost:5173`. API berjalan di `http://localhost:3000`.

Untuk login, kirim `login web` ke chatbot, lalu masukkan nomor WhatsApp dan kode 6 digit ke PWA.

Nomor yang belum terdaftar tidak diproses sebagai transaksi dan tidak dibalas. Bot mengirim notifikasi terbatas hanya kepada owner, berisi ID pengirim, cuplikan pesan maksimal 500 karakter, dan contoh perintah `/add`. Notifikasi untuk ID yang sama dibatasi satu kali setiap 15 menit. Owner harus mendaftarkan pengguna secara sengaja melalui `/add`, atau pengguna bergabung memakai kode pairing 8 karakter yang berlaku 10 menit.

Saat kode pairing valid dipakai pihak kedua, bot membentuk satu `household_id` untuk kedua pasangan dan memigrasikan transaksi personal lama dari seluruh alias nomor/LID ke dataset bersama. Pencatatan pasangan dan migrasi transaksi dilakukan dalam satu batch Google Sheets. Pihak kedua menerima pesan sambutan dan belum dapat mencatat transaksi sampai membalas `SETUJU`.

## Peran dan akses

- **Bot** — hanya menerima pesan dan membalas pengirim yang berhak; tidak dapat login sebagai user.
- **Owner** (`0822-4689-1241`) — sekaligus operator/admin tunggal, dapat mengelola user melalui WhatsApp dan memakai seluruh fitur web.
- **Developer** — pengguna pengujian dengan akses fitur aplikasi, tanpa kewenangan mengelola user.
- **User** — hanya dapat memakai fitur setelah ditambahkan owner atau berhasil pairing.

Tidak ada role atau nomor admin terpisah. Akses lama yang dinonaktifkan tetap disimpan untuk audit tetapi tidak dapat login atau memakai bot.

Bot tidak memiliki fitur broadcast atau pembacaan/pengiriman ke daftar kontak. Pengiriman langsung hanya digunakan ke nomor owner tetap untuk notifikasi user baru. Balasan lain hanya dikirim kepada pengirim terdaftar, owner yang menjalankan perintah admin, atau pengguna yang memasukkan kode pairing valid. Pesan lama dari sebelum bot siap juga diabaikan saat reconnect.

Jika hanya ingin menjalankan API dan PWA tanpa bot WhatsApp:

```powershell
npm run dev:api
```

## Struktur

- `server/src/bot` — chatbot WhatsApp.
- `server/src/routes` — REST API.
- `server/src/services` — autentikasi dan Google Sheets.
- `web/src` — PWA React + Tailwind CSS.
- `docs` — catatan proyek.

## Google Sheets

Saat server dimulai, skema diperiksa secara otomatis. Data lama di `Sheet1` dan `Pairing` dipertahankan. Tab `Users`, `Workspaces`, `Members`, dan `Budgets` ditambahkan jika belum ada. Penghapusan transaksi menggunakan status `deleted`, sedangkan penghapusan kategori budget menggunakan status `inactive`; keduanya tidak menghapus baris.

Foto profil dipotong di perangkat pengguna, dikompresi menjadi avatar WebP kecil, divalidasi maksimal 33 KB di server, lalu disimpan pada kolom `Users.avatar_data_url`. File asli tidak dikirim atau disimpan.

## Fitur web

- Dashboard, filter bulan, analisis budget, dan notifikasi budget.
- Pencarian, filter, pagination, tambah, detail, edit, ubah pos, serta hapus transaksi milik sendiri.
- Budget kategori bawaan dan kategori tambahan dengan penghapusan non-destruktif.
- Profil, editor foto fullscreen mobile dengan drag/pinch/wheel zoom, preferensi laporan, bantuan, dan ringkasan privasi.
- Modal sukses informatif untuk penambahan, perubahan, penyimpanan, dan penghapusan data.
- PWA responsif; data dinamis tetap membutuhkan koneksi ke API.

## Build dan Vercel

```powershell
npm run build
```

Pasang folder `web` sebagai Root Directory di Vercel. Untuk preview tanpa backend, tambahkan environment variable `VITE_DEMO_MODE=true`. Mode demo hanya memakai data contoh di browser.

Bot WhatsApp tidak dapat dijalankan di Vercel karena membutuhkan proses Chromium yang hidup terus-menerus. Jalankan bot di komputer lokal atau VPS. Setelah VPS tersedia, isi `VITE_API_URL` di Vercel dengan URL API VPS dan set `VITE_DEMO_MODE=false`.

Untuk production, jalankan API di belakang reverse proxy HTTPS, isi `NODE_ENV=production`, `HOST=127.0.0.1`, `TRUST_PROXY=loopback`, origin frontend yang tepat, dan URL syarat resmi. Simpan `.env`, kredensial Google, whitelist, serta `.wwebjs_auth` di luar Git dan backup terenkripsi.
