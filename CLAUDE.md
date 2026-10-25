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

- Ödül: havuza ≥3 ücret girdiyse ikinci ücretini geri alır (`payout()`); çevrimdışında botların ücretini ev öder (`payingSeats`).
- Bölge renkleri `v2.css`'teki `.match .mc--own.sN` kurallarında (`.match .mc--open` !important'ını ezer).

## Açık işler / fikirler
- **Denge (karar bekliyor):** Son Kalan/Yıldırım'da kusursuz mantıkla oynayan herkes tahmin yapmadan bitirebiliyor (14×14/36 ve 12×12/25'te denendi); maç "0 mayın" eşitliğiyle bitiyor ve kazananı açılan kare sayısı (büyük boş alan şansı) belirliyor. Seçenekler: daha yoğun mayın, tur sınırı, hamle başına puan ya da Zincir kuralını klasiğe taşımak. Zincir bu sorunu yaşamıyor.
- Son Kalan'da eleme seyrek (3 can + kalkan): canı 2'ye indirmek denenebilir.
- `server/arena/arena.test.ts` "003 göçü" testi Windows'ta yol hatasıyla düşüyor (`C:\C:\…`, URL→yol dönüşümü); Linux'ta sorun yok.
- Henüz yok: elmas (gem), mağaza kostümleri, görevler, battle pass, ELO eşleşmesi, Google/Apple girişi, gerçek 3D.
- Node sunucusunda "hazır" kontrolü ve "izle" yok.
- Gerçek iPhone/Safari'de test edilmedi.
