# Black Cord

Arkadaş grubu için küçük ses ve chat uygulaması. Dış paket kullanmaz; tek Node sunucusu statik uygulamayı ve WebSocket sinyalini servis eder.

## Çalıştırma

Windows'ta çift tıkla:

```text
start-server.bat
```

Ya da terminalden:

```powershell
node server.js
```

Sonra tarayıcıdan aç:

```text
http://localhost:3000
```

Aynı ağdaki arkadaşların bağlanacaksa Windows güvenlik duvarında Node'a izin ver ve kendi yerel IP adresini paylaş:

```text
http://SENIN-IP-ADRESIN:3000
```

İnternet üzerinden kullanmak için uygulamayı bir VPS'e koyup domain + HTTPS ile yayınla. Mikrofon izni için tarayıcılar `localhost` dışında genelde HTTPS ister.

Arkadaşların siteyi açtıktan sonra tarayıcı menüsünden uygulamayı masaüstüne kurabilir. Chrome/Edge'de adres çubuğunda kurulum simgesi çıkar veya menüde "Uygulamayı yükle" seçeneği görünür.

## Özellikler

- İsmini yazıp direkt giriş
- Tek chat kanalı
- İki ses kanalı
- Mikrofon kapat/aç
- Sesten çık
- Küçük grup için WebRTC ses bağlantısı

## Not

Ses bağlantısı direkt WebRTC ile kurulur. Bazı modem/firewall durumlarında TURN sunucusu gerekebilir; küçük arkadaş gruplarında çoğu zaman STUN ile çalışır.
