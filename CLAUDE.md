# Mine Duel 2 — Claude Code notları

Türkçe, telefon öncelikli, çok oyunculu mayın tarlası (React + TypeScript + Vite). Canlı sürüm:
https://safaktanik.github.io/yeni/ (eski v1 sitenin kökünde). Kullanıcıyla **Türkçe** konuş; yapılmayanı yapılmış gibi gösterme.

## Komutlar
- `npm install` — bağımlılıklar (Node ≥ 22.5)
- `npm run dev` — geliştirme sunucusu (http://localhost:5173). Sunucusuz çalışır: çevrimdışı masalar botlarla, "Arkadaşlarla oyna" eşler arası oda.
- `npm test` — birim + simülasyon testleri (Vitest). Hepsi geçmeli.
- `npm run typecheck`
- `npm run sim` — denge simülasyonu (botlarla maç uzunluğu, bitiş sebebi, beceri/şans).
- `npm run site` — tek dosyalık `index.html` üretip `../safaktanik.github.io/yeni/` klasörüne yazar (yayın).
- `npm run server` — isteğe bağlı Node oyun sunucusu (ws + SQLite, `server/`).

## Yayınlama (GitHub Pages)
1. `safaktanik/safaktanik.github.io` deposu bu klasörün yanında klonlu olmalı (`../safaktanik.github.io`).
2. `npm run site`
3. O depoda: `git add yeni && git commit -m "..." && git push`
4. Kök klasördeki v1'e dokunma (kullanıcı ayrı adreste geliştirmeyi seçti).

## Mimari (ayrıntı: ARCHITECTURE.md)
- **Oyun mantığı** (saf, sunucu/istemci ortak): `src/arena/mines.ts` (tahta, hamle, can, kalkan, sonar, duman, dondur, bonus, sıralama), `rules.ts`, `modes.ts`, `bot.ts`, `solver.ts`, `scoring.ts` (haftalık puan), `economy.ts` (masa türleri, `BOARDS` tahta/mayın tablosu, ücretler).
- **Ağ**: `src/arena/client.ts` tek arayüz; arka uçlar: `hosted/hostedBackend.ts` (çevrimdışı + arkadaş odası), `p2p/` (MQTT aktarıcı + PeerJS yedeği), `server/arena/` (Node).
- **Arayüz v2**: `src/v2/` (tasarım sistemi, Shell, BattleHome, TableRoom, ikonlar, `v2.css`, gömülü fontlar `fonts.css`), maç ekranı `src/arena/ui/MatchScreen.tsx`, sonuç `MatchResult.tsx`, açılış/tanıtım `Intro.tsx`.
- localStorage anahtarları `md2:` önekiyle v1'den ayrılır (`src/v2/storage.ts`).

## Kurallar / dikkat
- Fontlar sayfaya gömülü (Baloo 2 + Nunito Sans, Türkçe karakterli). Dış font ekleme; Lilita One'da ş/ğ/İ yok.
- Elenen oyuncu ve izleyici tahtaya dokunamaz (`canAct` MatchScreen'de).
- Sıralama: tahta biterse ayakta kalanlardan en az mayına basan kazanır; sona kadar elenmeyen eksi puan almaz (`scoring.ts`, testleri var).
- Tahta boyu oyuncu sayısına göre `BOARDS`'tan gelir; değiştirirsen `npm run sim` ile kontrol et.
- Git commit kimliği: `safaktanik <safaktanik@users.noreply.github.com>`.

## Açık işler / fikirler
- Son Kalan'da eleme seyrek (3 can + kalkan): canı 2'ye indirmek denenebilir.
- Havuzun tamamı birinciye gidiyor; ikinciye pay düşünülebilir.
- Henüz yok: elmas (gem), mağaza kostümleri, görevler, battle pass, ELO eşleşmesi, Google/Apple girişi, gerçek 3D.
- Node sunucusunda "hazır" kontrolü ve "izle" yok.
- Gerçek iPhone/Safari'de test edilmedi.
