# Layer 7 HTTP Stress Test Tool

Utility command-line Node.js untuk **testing layanan HTTP yang terkendali dan terotorisasi**. Ia merekam hasil request, latency, status code, protokol yang terpakai, dan state circuit-breaker selama menargetkan satu target dari satu proses.

> Ini bukan platform testing terdistribusi dan bukan pengganti rencana performance test yang benar. Gunakan hanya pada infrastruktur milikmu sendiri atau yang secara eksplisit kamu izinkan untuk dites.

## Status saat ini

Project ini eksperimen terfokus, bukan benchmarking suite yang polish. Implementasi sekarang mendukung jalur HTTP/1.1 dan HTTP/2, deteksi/fallback protokol, bounded asynchronous work, adaptive delay, dan circuit breaker. CLI juga masih membawa branch eksperimen protokol lama; jangan pakai mode yang diberi label attack atau rapid-reset di luar lab terisolasi dengan otorisasi tertulis.

## Kebutuhan

| Kebutuhan | Versi |
| --- | --- |
| Node.js | 18 atau lebih baru |
| npm | Bundle Node.js |
| Akses jaringan | Hanya ke target yang eksplisit terotorisasi |

## Install

```bash
npm install
node stress-test.js --help
```

## Titik awal yang aman

Mulai dengan test pendek dan concurrency rendah ke layanan lokal atau endpoint staging. Pastikan jendela test dan kriteria berhenti sebelum menaikkan salah satunya.

```bash
node stress-test.js \
  --url https://staging.example.test/health \
  --time 1 \
  --conc 10 \
  --adaptive-delay
```

Target contoh sengaja memakai domain dokumentasi yang tidak routable. Ganti hanya setelah otorisasi dipastikan.

## Opsi CLI

| Opsi | Keterangan | Default |
| --- | --- | --- |
| `-u, --url <url>` | URL yang dites; wajib | |
| `-t, --time <menit>` | Durasi test | `1` |
| `-c, --conc <angka>` | Jumlah worker konkuren | `50` |
| `-p, --protocol <list>` | Paksa jalur `1.1`, `2`, atau `3` | auto-detect |
| `--adaptive-delay` | Mundur saat respons blocking teramati | off |
| `-a, --attack <mode>` | Switch eksperimen protokol lama; lab saja | `none` |
| `-h, --help` | Tampilkan bantuan | |

## Membaca hasilnya

Laporan akhir memuat request sukses dan gagal, latency rata-rata/minimum/maksimum, requests per second, distribusi status code, distribusi protokol, dan error yang umum. Nilai-nilai ini menggambarkan pengamatan dari proses ini; bukan pengukuran service-level yang lengkap, dan jangan disajikan demikian.

## Checklist keselamatan

Sebelum setiap run, pastikan kepemilikan atau izin tertulis, target dan path-nya, durasi dan concurrency maksimum, orang yang bisa menghentikan test, dan kriteria sukses/gagal. Jalankan di staging bila bisa, hormati rate limit, dan catat command serta commit persis yang dipakai. Jangan pernah pakai tools ini untuk evasion, disruption, testing kredensial, atau traffic amplification.

## Keterbatasan

Project ini tidak menyediakan koordinasi terdistribusi, control plane terautentikasi, penyimpanan hasil persisten, atau allowlist target. Tambahkan kontrol itu secara eksternal sebelum memasukkannya ke workflow test formal. Belum ada baseline performa otomatis di repo ini.

## Contributing

Baca [`CONTRIBUTING.md`](CONTRIBUTING.md) dan [`SECURITY.md`](SECURITY.md). Perubahan yang menaikkan volume traffic, melewati kontrol target, atau mempermudah penggunaan tanpa izin tidak akan diterima.

## Lisensi

[MIT License](LICENSE)
