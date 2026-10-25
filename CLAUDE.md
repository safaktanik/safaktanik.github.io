# Mine Duel — Claude Code notları

Türkçe, telefon öncelikli, çok oyunculu mayın tarlası (React + TypeScript + Vite). Canlı sürüm:
https://safaktanik.github.io/ (sitenin kökü; eski v1 kaldırıldı, `/yeni/` köke yönlendirir). Kullanıcıyla **Türkçe** konuş; yapılmayanı yapılmış gibi gösterme.

## Komutlar
- `npm install` — bağımlılıklar (Node ≥ 22.5)
- `npm run dev` — geliştirme sunucusu (http://localhost:5173). Sunucusuz çalışır: çevrimdışı masalar botlarla, "Arkadaşlarla oyna" eşler arası oda.
- `npm test` — birim + simülasyon testleri (Vitest). Hepsi geçmeli.
- `npm run typecheck`
- `npm run sim` — denge simülasyonu (botlarla maç uzunluğu, bitiş sebebi, beceri/şans).
- `npm run site` — tek dosyalık `index.html` üretip `../safaktanik.github.io/` köküne yazar (yayın).
- `npm run server` — isteğe bağlı Node oyun sunucusu (ws + SQLite, `server/`).

## Yayınlama (GitHub Pages)
1. `safaktanik/safaktanik.github.io` deposu bu klasörün yanında klonlu olmalı (`../safaktanik.github.io`).
2. `npm run site`
3. O depoda: `git add index.html && git commit -m "..." && git push`
4. `yeni/index.html` yalnızca eski davet linkleri / ana ekran kısayolları için köke yönlendirme sayfasıdır; silme.

## Mimari (ayrıntı: ARCHITECTURE.md)
- **Oyun mantığı** (saf, sunucu/istemci ortak): `src/arena/mines.ts` (tahta, hamle, can, kalkan, sonar, duman, dondur, bonus, sıralama), `rules.ts`, `modes.ts`, `bot.ts`, `solver.ts`, `scoring.ts` (haftalık puan), `economy.ts` (masa türleri, `BOARDS` tahta/mayın tablosu, ücretler).
- **Ağ**: `src/arena/client.ts` tek arayüz; arka uçlar: `hosted/hostedBackend.ts` (çevrimdışı + arkadaş odası), `p2p/` (MQTT aktarıcı + PeerJS yedeği), `server/arena/` (Node).
- **Arayüz v2**: `src/v2/` (tasarım sistemi, Shell, BattleHome, TableRoom, ikonlar, `v2.css`, gömülü fontlar `fonts.css`), maç ekranı `src/arena/ui/MatchScreen.tsx`, sonuç `MatchResult.tsx`, açılış/tanıtım `Intro.tsx`.
- localStorage anahtarları `md2:` önekinde (`src/v2/storage.ts`); eski sürümün öneksiz `mine-duel…` kayıtları açılışta silinir. Ad alanını değiştirme: oyuncu profilleri orada.

## Kurallar / dikkat
- Fontlar sayfaya gömülü (Baloo 2 + Nunito Sans, Türkçe karakterli). Dış font ekleme; Lilita One'da ş/ğ/İ yok.
- Elenen oyuncu ve izleyici tahtaya dokunamaz (`canAct` MatchScreen'de).
- Sıralama: tahta biterse ayakta kalanlardan en az mayına basan kazanır; sona kadar elenmeyen eksi puan almaz (`scoring.ts`, testleri var).
- Tahta boyu oyuncu sayısına göre `BOARDS`'tan gelir; değiştirirsen `npm run sim` ile kontrol et.
- Git commit kimliği: `safaktanik <safaktanik@users.noreply.github.com>`.

- Ödül: havuza ≥3 ücret girdiyse ikinci ücretini geri alır (`payout()`); çevrimdışında botların ücretini ev öder (`payingSeats`).
- Güçler (2.4): Sonar + Pas + Zorla (+ Avcı'da İmha). `usePower` (`mines.ts`); Zorla `forceArmed` → hamlede `applyRestriction` ile `allowed`/`forcedBy`; Pas/süre aşımı `dropForce`. Botlar `chooseBotPower` (`bot.ts`). Ölçüm: `npx tsx src/arena/powers.sim.ts 600`. Duman/Dondur/İpucu kaldırıldı (eski kayıtlar `normalizeState`/`parseOptions` ile uyumlu).
- **Daralan Tahta** (`shrink`, 2.5): `mines.ts` `shrink` durumu; `advanceShrink` her tur geçişinde (pass/stay) saati ilerletir, fırtınada `applyStorm` `allowed` = en dış açık halkanın gizli kareleri; fırtına bitince `lockRing` (hücre 4 → görünümde 12 güvenli / 13 mayın). Ayar `SHRINK` + `SHRINK_LIVES` (`modes.ts`): ×1,5 mayın, 2 can, fırtına 2 tur, sakin 1 tur (variants.sim.ts ile seçildi). Zorla bu modda yok.
- **Günün Bulmacası** (`puzzle.ts`, `ui/Puzzle.tsx`): gün anahtarı Türkiye saati; tahta tarihten deterministik, yalnızca kesin çıkarımla (`solver.ts`) çözülebilenler seçilir. Sonuçlar `md2:puzzle` (ilk deneme sayılır).
- **Görevler** (`quests.ts`, `ui/Quests.tsx`): günde 3 görev, ilerleme `md2:quests`, ödül `grantReward(key)` (PlayerDoc.claims, anahtar başına bir kez). Antrenman maçları sayılmaz. Olaylar MatchScreen'de (`questEvent`).
- **Mağaza temaları** (`cosmetics.ts`): `purchase` (PlayerDoc.owned) + takılı tema `md2:theme`; CSS `.match.theme--x` (`v2.css`). Tema kuralları `.mc--allow/.mc--sel/.mc--flag`'i ezmemeli.
- **Görsel tasarım (2.6):** Freepik oyun arayüz seti (`assets/ui-kit/`, kaynak/atıf `assets/ui-kit/KAYNAK.md`). Görseller `src/v2/kit.ts` (`?inline` data: adresi), stil katmanı `src/v2/kit.css` (v2.css'ten sonra yüklenir; setin mor-lacivert paleti, açık çerçeveli paneller/düğmeler). Jeton `CoinIcon`/`Coin`, elmas `XpIcon`, madalyalar `TierBadge`/`RankMark`. Ücretsiz lisans atıf ister: Ayarlar'da "Designed by Freepik" kalmalı. Setin fontu Changa One'da ş/ğ/İ yok, kullanılmadı.
- İzinli kareler (Zincir/Zorla/fırtına) `.match .mc--hidden.mc--allow` kuralıyla parlar (eski `.mc--allow` v2 kare stiline eziliyordu).
- Antrenman ekranı `PracticeGame.resume()` çağırır: React StrictMode (geliştirme) efekt temizliğindeki `dispose()` maçı dondurmasın.
- Bölge renkleri `v2.css`'teki `.match .mc--own.sN` kurallarında (`.match .mc--open` !important'ını ezer).

## Açık işler / fikirler
- **Denge:** Son Kalan/Yıldırım'da mayın ×1,5 (`MODE_MINE_FACTOR`, `modes.ts`; `minesForTable(…, mode)`). Karşılaştırma: `npx tsx src/arena/variants.sim.ts 300`. Eski yoğunlukta maçların %83–91'i eşitlikle bitiyordu; ×1,25'te %45–71 (canlıda denendi, Gümüş'te eşitlik sık), ×1,5'te %31–47, iyi oynayanın kazanma oranı %51–80, maçlar ~%50 uzun, Elmas %30 sınırına takılır (67 mayın). Tur sınırı daha kötüydü, komşu kare kuralı eşitliği bitirip oyunu şansa çeviriyordu.
- Son Kalan'da eleme seyrek (3 can + kalkan): canı 2'ye indirmek denenebilir.
- `server/arena/arena.test.ts` "003 göçü" testi Windows'ta yol hatasıyla düşüyor (`C:\C:\…`, URL→yol dönüşümü); Linux'ta sorun yok.
- Henüz yok: elmas (gem), karakter kostümleri, battle pass, ELO eşleşmesi, Google/Apple girişi, gerçek 3D.
- Node sunucusunda "hazır" kontrolü ve "izle" yok.
- Gerçek iPhone/Safari'de test edilmedi.
