# Lighthouse desktop

Jalankan `npm ci`, `npm test`, lalu `npm run dev`. Paket Windows: `npm run package`, hasil ada di `release/`.

Tes Playwright membuka panel Electron, memeriksa preload sandbox, mengklik demo panduan, memeriksa teks overlay, lalu menutupnya. CI Windows menjalankan tes pada source dan executable yang dipaketkan.

Status: panel dan panduan teks (`say`) berfungsi. Resolusi locator live UIA/CDP, Record Agent, step verification, dan dashboard kelas belum tersedia. Command pointer gagal dengan `LOCATOR_RESOLVER_UNAVAILABLE`; aplikasi tidak mengarang koordinat target. Installer bukan bukti bahwa alur praktikum lengkap sudah tersedia.

MQTT menggunakan environment proses: MQTT_URL (mqtts), MQTT_USERNAME, MQTT_PASSWORD, LIGHTHOUSE_SESSION_ID, LIGHTHOUSE_STUDENT_ID. Tidak ada credential di installer. Mode guide-only, command expired dan scope yang salah ditolak. Dedup command masih sebatas sesi proses; belum persisten melewati restart.
