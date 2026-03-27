# Crypto4Pro — Kalan Eksikler (Mart 2026)

> Proje şu an **~%75-80** tamamlandı.
> Frontend, auth, trading engine, admin panel, market data çalışıyor.
> Ama gerçek para işlemleri için kritik parçalar eksik.

---

## 🔴 ZORUNLU — Launch İçin Olmazsa Olmaz

### 1. Blockchain Wallet Sistemi (EN KRİTİK)

**Durum:** Modeller var (`Wallet`, `Deposit`, `Withdrawal`) ama blockchain bağlantısı sıfır.

- [ ] RPC Provider entegrasyonu (QuickNode veya Alchemy) — BSC, ETH, TRON zincirleri
- [ ] HD Wallet address üretimi — her kullanıcıya benzersiz deposit adresi
- [ ] Deposit listener — blockchain event dinleme, gelen TX yakalama
- [ ] Confirmation system — 3-10 block bekleme, sonra bakiyeye ekleme
- [ ] Withdraw engine — user request → funds lock → admin approve → blockchain TX gönder → TX hash kaydet → confirm olunca tamamla
- [ ] Hot wallet yönetimi — server-side private key (şifrelenmiş!), gas/BNB balance monitoring
- [ ] Cold wallet stratejisi — büyük bakiyelerin güvenli saklanması
- [ ] Gas management — BNB/ETH gas takibi, düşükse alert
- [ ] `last_scanned_block` DB alanı — listener'ın nerede kaldığını bilmesi için

İlgili dosyalar:
- `backend/app/models/wallet.py` — modeller var ama boş
- `backend/app/config.py` — `ENABLE_BLOCKCHAIN_WALLET`, `ALCHEMY_API_KEY` placeholder
- `backend/app/services/` — blockchain servisi yok

---

### 2. Deposit / Withdraw UI (Frontend)

**Durum:** Withdraw modal var (URL düzeltildi), ama deposit UI hiç yok.

- [ ] Deposit sayfası/modali — kullanıcıya deposit adresini gösterme
- [ ] Network seçimi (BSC, ERC20, TRC20)
- [ ] QR kod ile adres gösterimi
- [ ] Deposit geçmişi (pending → confirmed → credited)
- [ ] Withdraw geçmişi (pending → approved → completed / rejected)
- [ ] Tam TX history sayfası (deposit + withdraw birlikte)
- [ ] Withdraw modal'da kayıtlı adres defteri UI (`withdrawalApi.getAddresses` / `addAddress` backend'de hazır)
- [ ] Adres cooldown gösterimi (yeni eklenen adres 24 saat bekler)

---

### 3. Likidite / Market Making (EN ZOR)

**Durum:** Matching engine çalışıyor ama orderbook boş. İlk kullanıcı geldiğinde alım-satım yapamaz.

- [ ] Market maker bot — otomatik bid/ask koyan bot (spread yönetimi)
- [ ] Binance hedge bot — kullanıcı emirlerini Binance'de karşılama (risk yönetimi)
- [ ] Başlangıç likiditesi — ilk gün için yeterli orderbook derinliği
- [ ] Dinamik spread yönetimi — piyasa koşullarına göre ayarlama

---

### 4. T4PRO Token (BSC)

**Durum:** Hiçbir şey yok.

- [ ] BEP20 smart contract yazımı (Solidity) — total supply, burn, mint, fee kararları
- [ ] BSC mainnet'e deploy
- [ ] BscScan üzerinde verify
- [ ] T4PRO/USDT trading pair ekle (admin panelden + seed)
- [ ] PancakeSwap'ta liquidity pool aç (ilk likiditeyi sen koyacaksın)
- [ ] Price feed bağlantısı

Karar verilmesi gerekenler:
- Total supply ne olacak?
- Burn mekanizması var mı?
- Mint yetkisi olacak mı?
- Transfer fee var mı?

---

### 5. KYC/AML Sistemi

**Durum:** Sadece `User.kyc_status` string alanı var. Gerçek doğrulama yok.

- [ ] KYC provider entegrasyonu (Sumsub, Onfido veya Jumio)
- [ ] Kimlik belgesi yükleme (ön/arka yüz)
- [ ] Selfie doğrulama (canlılık testi)
- [ ] Adres belgesi yükleme
- [ ] KYC durumu UI (pending → approved / rejected)
- [ ] KYC'ye göre çekim/yatırma limit sistemi (Level 1, Level 2, Level 3)
- [ ] AML screening — şüpheli işlem tespiti (kısmen var: `suspicious_activity.py`)

---

## 🟡 ÖNEMLİ — Launch Sonrası Kısa Sürede Eklenmeli

### 6. Database Migrations (Alembic)

- [ ] Alembic `versions/` klasörü boş — migration script yok
- [ ] Şu an `Base.metadata.create_all` ile tablo oluşturuyor (production'da tablo değişikliği = veri kaybı riski)
- [ ] Her schema değişikliğinde migration yazılmalı
- [ ] Migration test workflow'u

---

### 7. WebSocket Gerçek Real-Time Mimarisi

- [ ] `ws.py` Redis pub/sub diyor ama gerçekte 2-5 saniye polling yapıyor
- [ ] Matching engine trade oluşturduğunda `broadcast_trade` çağırmıyor
- [ ] Gerçek flow: matching engine → Redis pub/sub → WS broadcast
- [ ] Trade anında orderbook + trades push

---

### 8. Güvenlik Eksikleri

- [ ] CAPTCHA — auth sayfalarına reCAPTCHA veya hCaptcha
- [ ] Anti-phishing code — kullanıcının tanımladığı kod emaillerde gösterilir
- [ ] IP whitelist — çekim için izin verilen IP listesi
- [ ] docker-compose.yml default şifrelerini değiştirme uyarısı/check

---

### 9. Monitoring & Backup

- [ ] Log aggregation (ELK stack veya Loki)
- [ ] Uptime monitoring (UptimeRobot, Pingdom)
- [ ] Slack alert'leri genişletme (şu an kısmen var: `alerting.py`)
- [ ] Otomatik database backup (pg_dump cron job)

---

### 10. Frontend UX Eksikleri

- [ ] Onboarding flow — yeni kullanıcı rehberi (tur/checklist)
- [ ] Favoriler/Watchlist — şu an icon var ama persist etmiyor
- [ ] Fiyat alertleri — Settings'te UI var ama fonksiyonel değil
- [ ] Social login (Google/GitHub) — butonlar dekoratif, handler yok

---

## 🟢 ERTELENEBİLİR — Nice-to-Have

### 11. Diğer Eksikler

- [ ] Earn sayfası "Coming Soon" — ya içerik ekle ya kaldır
- [ ] Options sayfası "Coming Soon" — aynı durum
- [ ] API key yönetimi — oluşturma/silme/listeleme (şu an sadece UI mockup)
- [ ] Referral/affiliate sistemi
- [ ] Multi-language (i18n) desteği
- [ ] Mobile app (React Native)
- [ ] P2P trading
- [ ] Futures / margin trading
- [ ] Copy trading
- [ ] Launchpad / IEO platformu
- [ ] Fiat gateway (kredi kartı / banka havalesi ile yatırma)

---

## ÖNCELİK SIRASI (Önerilen Roadmap)

```
Faz 3 — Blockchain Wallet (2-3 hafta)
  ├── QuickNode/Alchemy entegrasyonu
  ├── HD wallet address üretimi
  ├── Deposit listener + confirmation
  ├── Withdraw engine (blockchain TX)
  ├── Hot wallet yönetimi
  └── Deposit/Withdraw UI (frontend)

Faz 4 — T4PRO Token (1 hafta)
  ├── BEP20 contract yazımı
  ├── Deploy + verify (BSC mainnet)
  ├── Borsaya T4PRO/USDT pair ekle
  └── PancakeSwap pool aç

Faz 5 — Likidite + KYC (2 hafta)
  ├── Market maker bot
  ├── Binance hedge bot
  ├── KYC provider entegrasyonu
  └── Çekim/yatırma limit sistemi

Faz 6 — Polish & Infra (1 hafta)
  ├── Alembic migrations
  ├── WebSocket gerçek real-time
  ├── CAPTCHA
  ├── DB backup cron
  └── Monitoring genişletme
```

---

## TAMAMLANAN MADDELER (Referans)

✅ Email / bildirim sistemi (SMTP + şablonlar)
✅ Şifre sıfırlama (forgot + reset flow)
✅ Email doğrulama (kayıtta otomatik gönderim)
✅ Trading chart gerçek Binance klines
✅ Orderbook + Recent Trades gerçek veri (fallback ile)
✅ Order form gerçek bakiye
✅ Withdraw URL düzeltme
✅ Kullanıcı 2FA (TOTP) — QR setup + login doğrulama
✅ Settings backend bağlantısı (profil, şifre, oturumlar)
✅ Rate limiting (auth endpoints)
✅ Sentry entegrasyonu (frontend + backend)
✅ Toast bildirim sistemi (sonner)
✅ .env.production gitignore
✅ Skip link (#main-content) tüm sayfalara
✅ Pinch-zoom engeli kaldırıldı
✅ Admin panel sayfaları (orders, markets, analytics, wallets)
✅ Landing page (FAQ, stats düzeltme, trust badge düzeltme)
✅ Legal sayfalar (Terms of Service, Privacy Policy)
✅ Fee schedule sayfası
✅ Celery birleştirme
✅ Ledger pagination düzeltme
✅ useUserFlags backend'den okuma
✅ CMS/System flags tüm kullanıcılara
✅ Market buy order desteği
