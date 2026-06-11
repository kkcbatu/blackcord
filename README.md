# Black Cord

Arkadas grubu icin kucuk ses ve chat uygulamasi.

## Ozellikler

- Isim yazip direkt giris
- Tek chat kanali
- Iki ses kanali
- Mikrofon kapat/ac
- Sesten cik
- Ses kalite profilleri
- Mikrofon ve hoparlor secimi
- Opus bitrate ayari
- Echo cancellation, noise suppression ve auto gain ayarlari
- Canli ses baglanti istatistikleri
- WebRTC ile sesli konusma
- Render uyumlu Node sunucusu
- Tarayicidan uygulama gibi kurulabilen PWA
- Windows icin Electron masaustu istemcisi

## Render ayarlari

Render'da `New Web Service` sec ve GitHub reposunu bagla.

```text
Runtime: Node
Build Command: npm install
Start Command: node server.js
Instance Type: Free
```

Deploy bitince Render sana su sekilde bir link verir:

```text
https://black-cord.onrender.com
```

Sen ve arkadaslarin bu linke girip isim yazarak kullanabilirsiniz.

## Lokal calistirma

Windows'ta cift tikla:

```text
start-server.bat
```

Ya da terminalden:

```powershell
node server.js
```

Sonra ac:

```text
http://localhost:3000
```

## Onemli not

Render Free servisleri bos kalinca uykuya alabilir. Ilk acilista 30-60 saniye bekletebilir.

Ses WebRTC ile direkt baglanmaya calisir. Bazi modem/firewall durumlarinda ses baglanmazsa TURN sunucusu gerekir. Render uzerinde TURN kurmak uygun degildir; o durumda Oracle Cloud/VPS daha iyi olur.

## Windows programi

Windows installer almak icin once bilgisayarda Node.js LTS kurulu olmali.

Tek tik:

```text
build-desktop.bat
```

Ya da terminalden:

```powershell
cd desktop
npm install
npm run dist
```

Installer burada olusur:

```text
desktop/dist/Black-Cord-Setup-1.0.0.exe
```

Render linkin degisirse `desktop/app-config.json` dosyasindaki `serverUrl` degerini guncelle ve tekrar paketle.
