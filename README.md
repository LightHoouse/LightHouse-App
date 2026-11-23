# Lighthouse App

Electron desktop Action Agent untuk mode guide-only. App menerima command MQTT per student, menampilkan overlay click-through, dan mengirim ack setelah guide ditampilkan. App tidak melakukan klik atau mengetik untuk mahasiswa.

## Run

```bash
npm install
npm run check
npm run dev
npm run package
```

Set `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `LIGHTHOUSE_SESSION_ID`, dan `LIGHTHOUSE_STUDENT_ID` pada environment proses Electron. Release bertag `vX.Y.Z` dipaketkan oleh GitHub Actions dan diunggah ke GitHub Releases.
