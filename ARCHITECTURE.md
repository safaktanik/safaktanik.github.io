# Mine Duel 2 — Faz 1 mimarisi

Teknoloji: React + TypeScript (web, mobil tarayıcı öncelikli), 2.5D CSS/SVG görseller.
Sunucu seçenekleri: Node + WebSocket + SQLite (yetkili sunucu) ya da sunucusuz eşler arası oda (MQTT aktarıcı + PeerJS yedeği).

| İstenen modül | Karşılığı | Dosyalar |
|---|---|---|
| **GameLogic** (mayın motoru) | Saf, yan etkisiz kurallar; sunucu ve istemci aynı kodu çalıştırır | `src/arena/mines.ts` (tahta, hamle, can, kalkan, sonar, duman, dondur, bonus), `src/arena/rules.ts`, `src/arena/modes.ts`, `src/arena/solver.ts`, `src/arena/bot.ts` |
| **Oda/Masa modeli** (101 Okey tarzı) | Masa: sahip, giriş ücreti, şifre/kod, 2–4 koltuk, tur süresi, güç kuralları, hazır durumu, izleyiciler | `src/arena/tableOptions.ts`, `src/arena/protocol.ts` (`TableView`, `PlayerSeatView`), `src/arena/hosted/model.ts` (`SeatDoc`, `MatchDoc`), `src/arena/economy.ts` (kademeler, ödül havuzu) |
| **NetworkManager** | Tek istemci arayüzü (`arenaClient`) arkasında üç arka uç | `src/arena/client.ts`, `src/arena/hosted/hostedBackend.ts` (çevrimdışı / P2P), `src/arena/p2p/relay.ts`, `mqtt.ts`, `room.ts`, `server/arena/gateway.ts` + `arena.ts` (Node) |
| **UIManager** | Neon tasarım sistemi + ekranlar | `src/v2/ui.tsx`, `icons.tsx`, `v2.css`, `Shell.tsx` (üst bar + sekme çubuğu), `BattleHome.tsx` (ana menü), `TableRoom.tsx` (2.5D bekleme odası), `src/arena/ui/MatchScreen.tsx` (maç HUD'u), `MatchResult.tsx` |
| **PlayerData** | Profil, coin, XP/seviye, başarımlar, haftalık puan | `src/arena/economy.ts`, `src/arena/achievements.ts`, hosted `players` koleksiyonu / sunucu SQLite |

## Akış
1. Ana menü (Savaş sekmesi) → OYNA (hızlı eşleşme) / Masalar / Masa Aç / Arkadaşlarla / Antrenman.
2. Masa açılır → bekleme odası: koltuklar, davet, bot oturtma, emoji, HAZIRIM.
3. Masa dolu ve herkes hazır → 3 sn geri sayım; hazır olmayan varsa 15 sn sonra otomatik başlar.
4. Maç: sıra tabanlı; süre sunucu saatiyle senkron. Güçler: Kalkan, Sonar (Radar), Pas (sırayı geç), Zorla (sıradakini açtığın yerin yanına it). Duman/Dondur/İpucu 2.4'te kaldırıldı.
5. Sonuç ekranı: sıralama, ödül, tekrar oyna.

## Henüz yok (sonraki fazlar)
Elmas (gem), mağaza kostümleri, görevler, battle pass, ELO eşleşmesi, Google/Apple girişi, gerçek 3D (three.js).
Node sunucusunda "hazır" ve "izle" yok (hazır kontrolü çevrimdışı ve arkadaş odasında çalışır).
