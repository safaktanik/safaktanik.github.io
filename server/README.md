# Mine Duel arena sunucusu

Çevrimiçi hesaplar (misafir, e-posta + şifre, Google) ve paylaşılan arena dünyası. Cloudflare Workers + tek bir Durable Object (SQLite) üzerinde çalışır.

- Oyun kuralları `build.mjs` ile kökteki `index.html`'den üretilir (`src/engine.gen.mjs`); sunucu ve oyun aynı motoru çalıştırır.
- Oyuncu yalnızca niyetini gönderir (WebSocket `/arena`); hamleleri, ödülleri ve bakiyeyi sunucu uygular. Ödül ve fiyatlar `src/rules.mjs`'te doğrulanır.
- Hesap uçları: `/api/auth/guest | register | login | upgrade | google | logout | me`, ayar: `/api/config`.

## Yerelde çalıştırma

    cd server && npm install
    npm run dev                      # http://localhost:8787
    node test/e2e.mjs                # uçtan uca test
    # oyunu yerel sunucuyla açmak için: http://localhost:8765/?arena=http://localhost:8787

## Kurulum

`main` dalına her gönderimde `.github/workflows/arena.yml` motoru üretir, test eder ve depo gizli değişkenleri (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) tanımlıysa Cloudflare'a kurar. Google ile giriş için depo değişkeni `GOOGLE_CLIENT_ID` eklenir. Kurulan adres `index.html`'deki `<meta name="tanik-arena">` içine yazılınca oyun çevrimiçi açılır.
