# Black Cord Desktop

Windows masaustu istemcisi. Uygulamayi Electron ile paketler ve `app-config.json` icindeki Black Cord site adresini acarak calisir.

## Kurulum

```powershell
cd desktop
npm install
npm run dist
```

Installer su klasore cikar:

```text
desktop/dist/Black-Cord-Setup-1.0.0.exe
```

## Server adresi

Render linkin farkliysa `desktop/app-config.json` icindeki degeri degistir:

```json
{
  "serverUrl": "https://blackcord.onrender.com"
}
```

Sonra tekrar paketle:

```powershell
npm run dist
```
