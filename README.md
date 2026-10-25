# Mine Duel

Masalarda oynanan, 3–4 oyunculu, rekabetçi **mayın tarlası**. Oyuncular aynı tahtayı paylaşır, sırayla birer kare açar; herkesin 3 canı ve 1 kalkanı vardır. Altı farklı mod, 14 karakter, emoji ve karakter çıkartmalarıyla atışma, maç madalyaları, sanal DUEL COIN ekonomisi, mağaza, haftalık sıralama, profil ve seviye.

Teknoloji: React + TypeScript + Vite (arayüz), Node + `ws` + yerleşik `node:sqlite` (oyun sunucusu). Kurallar arayüzden bağımsız saf bir motordadır (`src/arena/mines.ts`); oyun sunucusu, test sunucusu ve antrenman aynı motoru kullanır.

## Modlar

| Mod | Fikir | Kazanan |
| --- | --- | --- |
| **Son Kalan** | Klasik ortak tahta. Mayına basan 1 can kaybeder, 3 canı biten elenir. | Ayakta kalan son oyuncu (tahta biterse en çok can) |
| **Bölge Savaşı** | Açtığın her güvenli kare (yayılma dahil) senin rengine boyanır; sıfır açıp büyük alan yaymak değerlidir. | Tahta bitince hayatta kalanlar arasında en geniş bölge |
| **Hazine Avı** | Güvenli karelerin bazılarında gizli sandık var (sayılar yalnızca mayınları sayar). Mayına basan 1 can **ve 1 sandık** kaybeder. | Tüm sandıklar bulununca en çok sandığı olan |
| **Yıldırım** | Son Kalan kuralları ama tur 8 saniye, herkesin 2 canı var, sonar yok. | Ayakta kalan son oyuncu |
| **Mayın Avcısı** | Sıran gelince kare açmak yerine mayın **imha** edebilirsin: doğruysa +1 puan, yanlışsa (kare güvenliyse) kare açılır ve 1 can gider. | Bütün mayınlar imha edilince/patlayınca en çok imha eden |
| **Zincir** | Bir önceki hamlede açılan karelerin hemen yanından açmak zorundasın; mayına basılırsa zincir o mayının çevresinden sürer. Rakibini tehlikeli köşeye sürersin. | Ayakta kalan son oyuncu |

Ayrıntılı kurallar uygulamada "Modlar ve kurallar" ekranında; tanımlar `src/arena/modes.ts`.

## Nerede oynanır? (üç yol)

Uygulama açılışta hangi arka ucun var olduğunu kendisi bulur (`src/arena/detect.ts`):

1. **Test sunucusu (claude.ai'de yayınlanan sayfa).** Sayfa claude.ai'nin paylaşılan veritabanını kullanır: linki açan, giriş yapmış herkes aynı masaları canlı görür ve birlikte oynar. Kimlik claude.ai hesabıdır; ilk girişte oyun adı ve avatar seçilir, 3.000 test parası verilir. Masa sahibi boş koltuklara **bot** oturtabilir (tek başına deneme için).
   - Kuralları her oyuncunun tarayıcısı aynı motorla uygular; masa belgesi her değişiklikte kısa bir kilitle (lease) güncellenir. Botları ve süre aşımlarını masayı açık tutan oyuncuların tarayıcıları yürütür.
   - **Hileye karşı korumalı değildir** (gerçek sunucu değil): bilgili biri tarayıcı araçlarıyla mayın verisini okuyabilir. Yalnızca test içindir. Bir oyuncu başkasının bakiyesini değiştiremez (veritabanı kuralı: `players/{kendi id}`).
   - Botlar havuza para eklemez; yalnızca 2+ gerçek oyunculu maçlar sıralama puanı verir; haftalık ödül dağıtılmaz.
   - Başkalarının oynayabilmesi için sayfayı paylaşım menüsünden paylaşmalısın: yazabilmeleri için **Katkıda bulunan** (aynı kuruluş) ya da **Düzenleyici** (e-postayla davet) olmaları gerekir; yalnızca "görüntüleyen" olanlar oynayamaz.
2. **Oyun sunucusu (`npm start`).** Gerçek, sunucu doğrulamalı sistem: misafir/e-postalı hesap, SQLite, hile korumalı hamleler, kuyruklu eşleştirme. Aşağıda.
3. **Çevrimdışı masalar / arkadaş odası.** Sunucu bulunamazsa (dosyadan açınca, statik barındırmada, claude.ai'de giriş yapılmamışsa) masalar yine açılır: rakipler bot, lobide botların açtığı hazır masalar var, oturduğun masanın boş koltukları birkaç saniyede botlarla dolar. DUEL COIN, mağaza (günlük ödül, yardım paketi), profil ve haftalık sıralama (sen + botlar) bu tarayıcıda saklanır (`src/arena/hosted/localDb.ts`).
4. **Botlarla antrenman.** Sunucu gerektirmez; altı mod, para ve sıralama yok.

## Tek HTML dosyasıyla arkadaşlarla oynamak (iPhone / Safari)

`mine-duel.html` tek başına çalışan bir dosyadır. Sunucu ya da hesap gerekmez; telefonlar birbirine **doğrudan (WebRTC)** bağlanır.

1. **Dosyayı bir https adresine koy (bir kez).** Telefonlar dosyayı ancak bir web adresinden açabilir. En kolayı: bilgisayarda bir klasöre `index.html` adıyla koy ve klasörü [Netlify Drop](https://app.netlify.com/drop) sayfasına sürükle → `https://…netlify.app` linki çıkar. (Kalıcı olsun diye ücretsiz hesapla sahiplen.) GitHub Pages ya da herhangi bir statik barındırma da olur.
2. **Odayı kur:** linki Safari'de aç → **Arkadaşlarla oyna** → **Odayı aç**. 5 haneli oda kodun (her zaman aynı) ve **Davet** düğmesi çıkar.
3. **Arkadaşların:** davet linkine dokunur (`…#oda=KOD`) ya da linki açıp kodu yazar → odaya girer.
4. Oda içinde lobi, masa açma, hemen oyna, 6 mod, emoji/çıkartma, mağaza, haftalık sıralama aynen çalışır.

Nasıl çalışır: odayı kuran telefonun tarayıcısı küçük bir sunucu olur (`src/arena/p2p/room.ts`); masalar ve profiller onun belleğinde, oyuncu profilleri o cihazın tarayıcı deposunda tutulur (aynı kişi odayı tekrar kurunca herkesin bakiyesi yerinde). Tanışma için ücretsiz PeerJS aracı sunucusu ve kütüphanesi (CDN'den) kullanılır; oyun verisi telefonlar arasında akar.

Sınırlar: odayı kuran kişinin sayfası açık kalmalı (telefonu kilitlerse oda geçici olarak kapanır; açınca katılanlar kendiliğinden yeniden bağlanır). Bazı mobil operatör ağları doğrudan bağlantıyı engelleyebilir; o zaman Wi-Fi'ye geçin (yedek olarak ücretsiz bir TURN aktarıcısı denenir, garantisi yoktur). Kurallar oda kuranın tarayıcısında uygulanır; hileye karşı korumalı değildir, arkadaşlar arası test içindir.

Geliştirme testi: `tsx server/p2prelay.ts` (PeerJS taklidi) + sayfa `?p2ptest=ws://127.0.0.1:8793`.

## Hızlı başlangıç (oyun sunucusu)

Gereksinim: **Node.js 22.5 veya üzeri** (yerleşik SQLite için).

```bash
npm install
npm start                 # derler + sunucuyu başlatır → http://localhost:8787 → "Masalar"
```

| Komut | Ne yapar |
| --- | --- |
| `npm run dev` | Vite geliştirme sunucusu (http://localhost:5173; /api ve /arena 8787'ye yönlendirilir) |
| `npm run server` | Oyun sunucusu (API + WebSocket + SQLite; varsa `dist/`'i de sunar) |
| `npm start` | `build` + `server` |
| `npm run build` | Üretim derlemesi (`dist/`) |
| `npm test` | Tüm testler (Vitest) |
| `npm run typecheck` | TypeScript denetimi |
| `npm run db:migrate` | Veritabanı şemasını uygular (sunucu açılışta da yapar) |
| `npm run test-store` | **Yerel test deposu**: claude.ai veritabanı API'sinin taklidi (geliştirme/test) |

### Test sunucusunu yerelde denemek

```bash
npm run test-store        # ws://127.0.0.1:8790
npm run dev               # sonra iki ayrı tarayıcı penceresinde:
# http://localhost:5173/?teststore=ws://127.0.0.1:8790&uid=ayse
# http://localhost:5173/?teststore=ws://127.0.0.1:8790&uid=burak
```

Aynı arka uç kodu (`src/arena/hosted/hostedBackend.ts`) claude.ai'de gerçek paylaşılan veritabanıyla, yerelde bu taklitle çalışır.

## Oyun sunucusu ayrıntıları

### Kurallar

- Masa türleri (`src/arena/economy.ts` — tüm sayılar tek yerde). Klasik mayın tarlası ölçüleri; büyük tahtalar telefonda tahta kutusunun içinde yakınlaştırılıp kaydırılır (sayfa kaymaz):

  | Masa | Alan | Mayın (Normal) | Karşılığı | Varsayılan kapasite | Giriş |
  | --- | --- | --- | --- | --- | --- |
  | Bronz | 9×9 | 10 | Başlangıç | 3 | 100 |
  | Gümüş | 13×13 | 26 | Kolay–orta | 3 | 500 |
  | Altın | 16×16 | 40 | Orta seviye | 4 | 1.500 |
  | Elmas | 20×20 | 80 | Uzman yoğunluğu (%20) | 4 | 5.000 |

- **Kare menüsü:** kareye dokununca (ya da basılı tutunca) çevresinde, tahtanın içine doğru açılan yuvarlak düğmeler çıkar: ⛏️ Aç, 🚩 Bayrak/Kaldır, 📡 Sonar (kalan hak rozetiyle), Avcı modunda 🎯 İmha. Sıra sende değilken yalnızca Bayrak görünür. Aynı kareye ikinci dokunuş da açar; masaüstünde sağ tık doğrudan bayrak koyar.
- **Yakınlaştırma:** kareler 22 px'ten küçük kalacaksa tahta otomatik olarak ~30 px'e büyür ve başlangıç adasına odaklanır; başlıktaki 🔍− / 🔍+ düğmeleri ya da iki parmak hareketiyle yakınlaştırılır, tahta kendi içinde kaydırılır.
- **Sonar:** 3×3 alandaki gizli mayınların **tam yerini** yalnızca kullanana gösterir (kırmızı), alanın geri kalanı yeşil ✓ (kesin güvenli). Sonarın bulduğu mayın menüde açılamaz (Avcı modunda imha edilebilir); kalan mayın sayacı bu bilgiyi kullanır.
- **Pas ve Zorla** (2.4; masa ayarı, varsayılan 1'er hak; `usePower` — `mines.ts`): **Pas** sıranı hamle yapmadan geçirir (süre aşımı sayılmaz; seni kısıtlayan Zorla da düşer; Zincir kısıtı sıradakine geçer). **Zorla** hamlenden önce kurulur; hamleden sonra sıradaki oyuncu yalnızca açtığın karelerin (ya da bastığın mayının) hemen yanındaki gizli karelerden açabilir; bir tur sürer, Zincir modunda yoktur. Botlar da kullanır (`chooseBotPower` — `bot.ts`): kesin güvenli kare yokken risk yüksekse Pas, güvenli hamlede arada bir Zorla. Değerlendirme: `src/arena/powers.sim.ts` (Sonar +7–11, Pas +4–7 puan kazanma oranı). Eski Duman, Dondur ve İpucu kaldırıldı: Duman botları etkilemiyordu, süre nadiren kısıttı, İpucu iyi oyuncuya bilmediği bir şey göstermiyordu.
- **İnsan gibi botlar** (`src/arena/bot.ts`): her seviyenin bir "kişiliği" var: kesin güvenli kareyi fark etme olasılığı (kolay %45, orta %68, zor %88), tahminlerindeki sezgi payı ve ara sıra düşünmeden açma. Düşünme süresi bariz hamlede ~3–5,5 sn, tahminde ~4–8 sn (süreli turda tur süresinin %70'ini aşmaz). Bot önce kareyi seçer (herkes 🤔 ile görür), kısa bir tereddütten sonra açar; sırası gelen rakibin kartında "düşünüyor" noktaları yanar.
- **Kişiselleştirilebilir masa** (`src/arena/tableOptions.ts`): masa açarken kişi sayısı (**2 düello / 3 / 4**), giriş ücreti (×0,5–×2), alan (±2), **mayın yoğunluğu** (Az ×0,8 / Normal / Çok ×1,25; en az 4, en fazla alanın %30'u), **tur süresi** (10/15/20/30/45 sn), **can** (1–5), **kalkan** (0–2), **sonar** (0–3) ve **bonus kutuları** (açık/kapalı), ad, şifre seçilir. Seçimler masa kartında ve bekleme odasında rozet olarak görünür; sunucu hepsini doğrular (`bad-options`). Yıldırım modunda tur en fazla 8 sn, can en fazla 2, sonar yok.
- Maç ekranı ekrana **tam sığar, kaydırılmaz**: tahta kare boyutu ekran yüksekliğine göre hesaplanır (iPhone SE'de bile tamamı görünür). Bayrak, Sonar, Kalkan, (Avcı modunda) İmha ve Emoji düğmeleri başparmak altında, alttaki sabit çubukta. Seçilen kareyi açmak için üstteki büyük "Kareyi aç ✓" düğmesi.
- Sesler: sıra sende, son 5 saniyede tik-tak, son 3 saniyede uyarı sesi + titreşim (destekleyen cihazlarda), süre dolunca uyarı; bayrak koy/kaldır sesleri; süre azaldıkça hızlanan maç müziği (Ayarlar → Maç müziği ile kapatılır). iPhone'da ses ilk dokunuşta açılır (Safari kuralı).
- Botlar: düşünme süresi ~1,9–3,4 sn, hata oranı kolay/orta/zor için %50/%28/%10; Avcı modunda imha cesareti daha düşük. Antrenmanda yoğunluk, can, tur süresi ve 1 botla düello seçilebilir.
- **Bonus kutuları** (masa ayarı, varsayılan açık; `src/arena/mines.ts`): tahtaya güvenli karelere 2–6 gizli kutu serpilir (türler: +1 kalkan, +1 sonar, +1 can — can 5'teyse kalkana dönüşür — ve **ekstra tur**). Kutuyu açan (taşan açılımla bile) ödülü alır; ekstra turda sıra aynı oyuncuda kalır, tur numarası artar ve süre yeniden başlar. Kutuların yeri maç bitene kadar istemciye gönderilmez (test sunucusunda mayınlar gibi karıştırılmış alanda saklanır); bitince hepsi gösterilir. Sonar kapalı masalarda sonar kutusu çıkmaz.
- **Eğlence katmanı** (istemci tarafı, herkes için eşit): 🔥 seri alevi, ⚡ şimşek hamle (sıra gelince 3 sn içinde güvenli kare), son canda kalp atışı + kırmızı nabız, maç sonu bayrak kontrolü (✓/✗; maç sırasında başkasının açtığı bayraklı kareler de doğru/yanlış sayılır) ve maç karnesi, elenen/izleyen için 🔮 hamle tahmini. Yeni madalyalar: Şimşek El, Bayrak Ustası, Kutu Avcısı, Kâhin, Keskin Zekâ.
- Maç ekranının üst bölümleri (başlık, oyuncu kartları, durum çubuğu, alt araç çubuğu) **sabit yükseklikte**; araç seçimi, uzun yazılar ya da efektler tahtayı küçültüp büyütmez veya kaydırmaz. Kare boyutu yalnızca ekran boyutu değişince (döndürme) yeniden hesaplanır.
- Mayınlar maç başlamadan sunucuda belirlenir; istemciye **maç bitene kadar hiç gönderilmez**. Herkes aynı tahtayı görür.
- Sıra: sırası gelen tek oyuncu bir kare açar; her hamle sırayı geçirir. Açılan karede komşu mayın sayısı (8 komşu) yazar; 0 ise komşu güvenli alan otomatik açılır (herkeste aynı).
- Mayın → tam 1 can; canı (varsayılan 3) biterse elenir, sırası atlanır, maçı izler. Son kalan kazanır. Tüm güvenli kareler açılırsa: en çok can → en az patlama → en çok açılan kare.
- Tur süresi varsayılan 20 sn (masada seçilebilir). Süre dolarsa sıra geçer; **art arda 3 süre aşımı = eleme** (süreyi kasıtlı tüketip rakiplerin elenmesini beklemeyi önler). Bağlantısı kopan oyuncu için de aynı kural işler; maç durumu sunucuda korunur, geri dönen oyuncu aynı maça bağlanır.
- Maçta masadan ayrılan elenir; ücreti iade edilmez, havuz değişmez. Elenen ya da ayrılan oyuncu **maçın bitmesini beklemeden** lobiye dönüp yeni masaya oturabilir; sonucu (sıralama, deneyim) maç bitince yine kesinleşir. Elenen oyuncu isterse maçı izlemeye devam eder.
- Denge (hepsi `ECONOMY`'de açılıp kapatılabilir): **başlangıç adası** (maç, ortada açılmış güvenli bir bölgeyle başlar; ilk hamle körlemesine değildir), **kalkan** (her oyuncunun bastığı ilk mayın can götürmez), **sonar** (maç başına 1; sıran sendeyken 3×3 alandaki mayın sayısını yalnızca sana gösterir, sıra geçmez). Son Kalan ve Yıldırım'da mayın sayısı tablodaki değerin ×1,5'i (`MODE_MINE_FACTOR`): yoksa iyi oynayan herkes tahmin yapmadan bitirip maç eşitlikle sonlanıyordu (`src/arena/variants.sim.ts`).
- Bayrak: **sınırsız**; oyuncu şüphelendiği karelere bayrak koyar (yalnızca kendisi görür; bayraklı kare yanlışlıkla açılmaz). Üstteki sayaç kalan tahmini mayını (mayın − patlayan/imha − bayrak) gösterir; çevresindeki mayınları bayrakla tamamlanmış sayılar soluklaşır, böylece hangi bölgenin "bittiği" bir bakışta görülür. Dokunmatikte uzun basınca da bayrak konur.
- Emoji atışması: alttaki Emoji düğmesinden açılan menü; gönderilen emoji herkesin ekranında gönderenin kartından çıkıp büyüyerek uçar. Saklanmaz; kişi başı saniyede en fazla bir.

### Ekonomi (sanal DUEL COIN)

- Gerçek para, satın alma, nakit çekme ya da oyuncular arası transfer **yoktur**.
- Başlangıç: 3.000. Günlük ödül 500 (+100/seri günü, en fazla +500; günde bir kez, sunucu saatiyle UTC gün). İlk maç ödülü 300. Bakiye en ucuz masanın altına düşerse günde bir kez 400 yardım paketi.
- Giriş ücreti masaya oturunca tahsil edilir. Havuz = oyuncu sayısı × giriş ücreti, maç başlamadan kesinleşir; işletim payı şu an %0 (`houseFeePercent`). Havuza en az 3 ücret girdiyse ikinci olan ücretini geri alır (`prize2:<maç>`), kalanı kazananın; yoksa kazanan hepsini alır (`payout()` — `economy.ts`).
- Çevrimdışı masalarda botların ücretini "ev" öder (havuz = kapasite × ücret); arkadaş odasında botlar havuza para eklemez.
- **İade politikası:** oyun başlamadan ayrılan ya da bekleme odasında bağlantısı 45 sn kopan oyuncuya tam iade; masa sahibi ayrılırsa sahiplik sıradakine geçer, masa boşalırsa kapanır. Sunucu yarıda kalan maçlar (çökme/yeniden başlatma) açılışta **tüm giriş ücretleri iade edilerek** kapatılır.
- Her bakiye değişikliği `wallet_transactions` kaydı oluşturur (önceki/sonraki bakiye, masa/maç, zaman) ve **benzersiz işlem anahtarı** taşır (`fee:<koltuk>`, `refund:<koltuk>`, `prize:<maç>`, `daily:<kullanıcı>:<gün>` …): aynı istek tekrarlanırsa ikinci kez uygulanmaz. Bakiye eksiye düşemez (veritabanı CHECK kısıtı da var). Maç sonucu tek transaction'da ve yalnızca bir kez kesinleşir (`matches.settled`).

### Sıralama, seviye

- Haftalık puan: 1. +25, 2. +10, 3. 0, son sıra −5 (3 kişilik masada 3. sıra −5); masadan kaçan/uzakta elenen her zaman −5. Tier çarpanı dar tutuldu (1,0–1,3) ki pahalı masa puanı şişirmesin.
- Kötüye kullanım önlemleri: en az 3 güvenli kare açmayan olumlu puan alamaz; rakiplerin hepsi kaçarak/uzakta kalarak elenirse kazanana puan yok; **aynı oyuncu kümesi** bir hafta içinde 3 maçtan sonra yarım, 5 maçtan sonra sıfır puan alır.
- Hafta pazartesi 00:00 UTC'de (sunucu saati) başlar; puanlar `week_start` ile tutulduğu için yeni hafta otomatik sıfırdan başlar, eski haftalar arşivde kalır. Biten hafta bir kez "kesinleştirilir": sıra numaraları yazılır, ilk 3'e 1.000 / 500 / 250 ödül verilir (açılışta ve 10 dakikada bir denetlenir). Toplam galibiyet/deneyim korunur.
- Deneyim: katılım 20 + galibiyet 50 + açılan güvenli kare (en fazla 60). Seviye = ⌊√(XP/100)⌋ + 1; bakiyeden bağımsızdır.

### Hesaplar ve güvenlik

- Misafir: sunucu rastgele kimlik, ad, avatar ve 32 baytlık rastgele oturum jetonu üretir; veritabanında jetonun yalnızca SHA-256 özeti tutulur (tarayıcıdaki değer tahmin edilemez/taklit edilemez). Misafir hesabı **aynı kimlikle** e-posta + parolalı kalıcı hesaba dönüştürülebilir: bakiye, istatistik, sıralama korunur, ödüller tekrar verilmez.
- Kalıcı hesap: e-posta + parola (scrypt, tuzlu; düz metin hiçbir yerde yok), giriş deneme sınırı, kullanıcı adları benzersiz (büyük/küçük harf duyarsız). Google/Apple girişi **yok** (arayüzde düğme de yok).
- Sunucu her şeyi doğrular: sıra, kare, can, eleme, bakiye, ödül, masa doluluğu, şifre (scrypt özeti). Aynı oyuncu aynı anda tek masada olabilir (`uq_tp_active_user` kısmi benzersiz indeksi + kod denetimi). Aynı masa için tek maç (`matches.table_id UNIQUE`). Mesaj boyutu/hız sınırları var.

### API özeti

HTTP (`Authorization: Bearer <jeton>`): `POST /api/auth/guest|register|login|upgrade|logout`, `GET /api/me`, `POST /api/me/profile`, `GET /api/me/matches`, `GET /api/me/transactions`, `POST /api/rewards/daily|rescue`, `GET /api/leaderboard[?week=YYYY-MM-DD]`, `GET /api/config`.
WebSocket `/arena` (ilk mesaj `{t:'auth', token}`): `lobby.sub`, `table.create|join|leave`, `quick.start|cancel`, `move` (`action: 'open' | 'defuse'`), `scan` (sonar), `react` (emoji/çıkartma); sunucu `lobby`, `table`, `match`, `queue`, `me`, `react`, `ack` gönderir. Tipler: `src/arena/protocol.ts`.

### Veritabanı şeması

`server/arena/migrations/001_init.sql`: `users`, `sessions`, `tables`, `table_players`, `matches`, `match_players`, `wallet_transactions`, `weekly_leaderboard`, `weekly_settlements`, `daily_claims` (yabancı anahtarlar, indeksler ve benzersizlik kuralları dahil). Şartnamedeki alanların hepsi var; ek olarak `matches.settled`, `match_players.points_delta/prize/safe_opened` gibi denetim alanları eklendi. `002_modes.sql` masa modunu ekler; `003_more_modes.sql` yeni modlar için tabloyu yeniden kurar; `004_table_options.sql` 2 kişilik masaya izin verir ve `tables.options` (JSON) sütununu ekler (göçler yabancı anahtarları işlem dışında kapatır, işlem bitmeden `foreign_key_check` ile denetler; eski veriler korunur).

### Gerçek çevrimiçi yayın (dağıtım adımları)

1. Node 22.5+ çalıştıran, **WebSocket destekleyen** ve **kalıcı diski** olan bir sunucu/servis seçin (VPS, Fly.io + volume, Render disk, Railway volume …). Yalnızca statik barındırma (Netlify, GitHub Pages) **yetmez**.
2. Kodu kopyalayın: `npm ci && npm run build`.
3. Ortam: `PORT=8787`, `DB_PATH=/kalici/disk/mine-duel.db`, `ALLOWED_ORIGINS=https://alanadiniz`.
4. Başlatın: `npm run server` (systemd/pm2 ile yeniden başlatmalı). Açılışta şema uygulanır, yarım kalan maçlar iade edilir.
5. Önüne HTTPS ters vekil koyun (aşağıdaki nginx örneği `/api`, `/arena` ve `/ws`'yi aynı yerden geçirir).
6. Tek süreç içindir (durum bellekte + SQLite). Çok sunuculu ölçekleme için Postgres + ortak yayın kanalı (Redis) gerekir; bu sürümde yok.

## Ortam değişkenleri

| Değişken | Nerede | Anlamı |
| --- | --- | --- |
| `PORT` / `HOST` | Sunucu | Varsayılan `8787` / `0.0.0.0` |
| `DB_PATH` | Sunucu | SQLite dosyası, varsayılan `./data/mine-duel.db` |
| `ALLOWED_ORIGINS` | Sunucu | İzinli Origin listesi (virgülle); yayında doldurun |
| `STATIC_DIR` | Sunucu | Arayüz klasörü, varsayılan `./dist` |
| `VITE_ARENA_URL` | Arayüz (derleme) | Sunucu başka adresteyse kökü (CORS için `ALLOWED_ORIGINS`) |
| `ARENA_SERVER` | `npm run dev` | /api ve /arena yönlendirme hedefi |

## Mimari

```
src/arena/mines.ts        saf motor (4 mod)            src/arena/modes.ts     mod adları ve kuralları
src/arena/bot.ts          hilesiz bot (yalnızca açık sayılardan çıkarım)
src/arena/economy.ts      tüm sayılar tek yerde         src/arena/scoring.ts   puan / deneyim
src/arena/protocol.ts     görünüm ve mesaj tipleri      src/arena/detect.ts    arka uç seçimi
src/arena/client.ts       oyun sunucusu istemcisi       src/arena/hosted/      test sunucusu (paylaşılan db) + yerel taklit
src/arena/practice.ts     sunucusuz antrenman           src/arena/ui/          ekranlar
server/arena/             oyun sunucusu: hesaplar, cüzdan, masalar, eşleştirme, maç, sıralama, SQLite
server/teststore.ts       yerel test deposu
```

Amiral Battı (gemi düellosu) ve ona ait her şey (motor, ekranlar, 2 kişilik çevrimiçi odalar, ödül/reklam katmanı) bu sürümde **tamamen kaldırıldı**.

## Karakterler, görseller ve efektler

- **14 karakter** (`src/arena/characterData.ts`, çizimler `src/arena/ui/characters.tsx`): 12 kodla çizilmiş deniz kaptanı (Kaptan Fok, Okta, Martı Mırtı, Tosun, Pofuduk, Pıt, Kıskaç, Bulut, Dalga, Diş, Rüzgâr, Dalgıç Demir) + varlık paketinden 2 insan karakter (Stratejist Kaan, Taktisyen Arda). Bazıları seviyeyle açılır (sunucu da denetler). Maçta karakterin yüzü olaylara göre değişir: mayına basınca üzülür/şaşırır, sandık ya da imhada sevinir, seride havalı gözlük takar, elenince soluklaşır, kazanınca ışıldar; göz kırpar, hafifçe sallanır.
- **Varlık paketi** (`assets/mine-duel-pack/`, kullanıcıdan gelen SVG paketi): `node scripts/gen-pack-art.mjs` ile `src/arena/ui/packArt.ts` içine gömülür (tek dosya ve claude.ai sürümü ek dosya istemez). Kullanıldığı yerler: arka planlar (menü, oyun, zafer), kapalı/üzerine gelinen/bayraklı/radar/zincir kareleri, 5 paket mayını + patlamış ve imha edilmiş mayın, araç ve lobi simgeleri, 16 çizimli emoji, 8 madalya rozeti, kalkan/radar/imha/zafer efektleri, sekme simgesi.
- **Efektler** (`src/arena/ui/Fx.tsx`): tam ekran parçacık tuvali. Patlama (ışık, şok dalgası, kıvılcım, enkaz, duman, su damlaları), kalkan (altıgen kalkan + kırıklar), sandık (dönen altınlar), imha (yeşil yıldızlar), sonar (halkalar), seri (ateş kıvılcımları), zafer (konfeti). Ayrıca kırmızı ekran flaşı + sarsıntı + titreşim.
- **Emoji ve çıkartmalar**: 16 paket emojisi + 20 standart emoji + 8 karakter çıkartması (gönderenin kendi karakteri, ifadesi ve lafıyla uçar). Antrenman botları da emojiyle laf atar.
- **Madalyalar** (`src/arena/achievements.ts`): maç sonunda o maçtaki oyununa göre (Zafer, Kusursuz Mantık, Geri Dönüş, Hızlı Düşünür, Mayın Avcısı, Radar Uzmanı, Strateji Ustası, Seri Ustası). Koleksiyon profilde, bu cihazda saklanır.
- **Higgsfield / dış görseller**: `docs/higgsfield-prompts.md` hazır prompt'ları ve model önerilerini içerir; üretilen görseller `src/arena/ui/assets.ts` yuvalarına bağlanınca oyun onları kullanır.

## Görsel tasarım

"Gece seyir haritası": zemin derinlik eğrili bir deniz haritası (`src/theme.css`), tahta pirinç çerçeveli harita paftası. Renkler: lacivert, sonar turkuazı (sıra/eylem), pirinç (para, kazanan), işaret fişeği kırmızısı (hasar), sinyal turuncusu (mayın); her modun kendi rengi, her koltuğun kendi rengi (Bölge Savaşı'nda tahtayı boyar). Yazı: Saira Condensed + Nunito Sans + Saira Stencil (Google Fonts; internet yoksa sistem yazı tipleri).

Açılış ekranı (`Intro.tsx`): hareketli logo (sonar halkaları üzerinde süzülen deniz mayını), "Oyna" düğmesi ve ilk açılışta 3 sayfalık "Nasıl oynanır?". Sunucu varsa "Oyna" doğrudan lobiye götürür; yoksa antrenmana. Çizimler (`src/arena/ui/art.tsx`) kodla çizilmiş SVG'dir: pirinç uçlu boynuzlu deniz mayını (patlayınca kızgın turuncu), logo, kalkan/sonar simgeleri. Efektler `src/arena/ui/fx.css`'te: her patlamada tam ekran kırmızı flaş + sarsıntı (patlayan sensen daha güçlü ve telefon titrer), kalkan çarpınca mavi-kırmızı flaş, sonar dalgası, seri (3/5/8… güvenli hamle) bildirimi, uçan emojiler. "Hareketi azalt" ayarı ve sistem tercihi animasyonları kısar.

### Görselleri bir üst seviyeye taşımak (öneri)

| İhtiyaç | Önerilen araç | Not |
| --- | --- | --- |
| Patlama, sandık, kazanma animasyonları | **Lottie** (`lottie-web` / `@lottiefiles/dotlottie-web`) ya da **Rive** | Tasarımcı After Effects/Rive'da hazırlar, kod yalnızca oynatır |
| Parçacık/ışık efektli tahta (büyük tahtalarda akıcı) | **PixiJS** (WebGL) | Tahtayı tuvale taşır; 900 kare + parçacıklar 60 fps |
| Konfeti, kıvılcım | **canvas-confetti** | Kazanma ve seri anları için tek satır |
| Gerçek ses efektleri ve müzik | **Howler.js** + CC0 ses paketi (Kenney, Freesound) | Şu an sesler Web Audio ile üretiliyor |
| Ekran geçişleri, kart animasyonları | **Motion** (Framer Motion) | Lobi → masa → maç geçişleri |
| İkon/çizim seti | Kenney (CC0), özel illüstrasyon | Avatarlar ve mayın/sandık için profesyonel çizer en büyük farkı yaratır |


## Testler

```bash
npm test                 # Vitest
./run-tests-bun.sh       # npm yoksa: Bun ile aynı testler
```

| Alan | Dosya |
| --- | --- |
| Motor + 4 mod | `src/arena/mines.test.ts` |
| Bot | `src/arena/bot.test.ts` |
| Test sunucusu (paylaşılan db, iki oyuncu + bot, ücret/iade/ödül, yazma kuralı, 4 mod) | `src/arena/hosted/hosted.test.ts` |
| Filtreler | `src/arena/ui/filters.test.ts` |
| Oyun sunucusu (hesap, cüzdan, masa, maç, sıralama, yük) | `server/arena/arena.test.ts` |
| Gerçek HTTP + WebSocket | `server/arena/ws.test.ts`, `server/server.test.ts` |
| Madalyalar | `src/arena/achievements.test.ts` |

## Doğrulama notu

Bu proje npm kayıt sunucusuna erişimsiz bir ortamda geliştirildi; `npm install`, Vite ve Vitest orada çalıştırılmadı. Testler Bun ile koşturuldu (84 test, hepsi geçti); sunucu gerçek Node 22 + `node:sqlite` ile çalıştırıldı; tarayıcı testleri Playwright/Chromium ile yapıldı (test sunucusu: yerel taklit depoyla iki ayrı tarayıcı + botlar, emoji ve maç ortasında çıkış; oyun sunucusu: 4 ayrı tarayıcı + emoji; antrenman: açılış, öğretici, bayrak, sonar, kalkan, patlama efekti, elenince çıkış). İlk iş: `npm install && npm run typecheck && npm test && npm run build`.

## Bilinen sınırlar

- Test sunucusu hile korumalı değil; kuralları tarayıcılar uygular. Masa değişiklikleri kısa kilitlerle sıralandığı için hamle onayı yaklaşık bir saniye sürebilir. Botlar ve süre aşımları ancak masada sayfası açık bir oyuncu varken ilerler. Haftalık ödül yok.
- Oyun sunucusu: Google/Apple girişi, e-posta doğrulama, arkadaş listesi ve yazılı sohbet yok (yalnızca hazır emojiler); masada oturmayan dışarıdan izleyici yok (elenen oyuncu izleyebilir); tek süreç + SQLite.
- Test sunucusunda emojiler claude.ai'nin `room` yeteneğiyle anlık iletilir; bu yetenek kapalıysa emojiler yalnızca gönderenin ekranında görünür.
- Bayraklar ve sonar sonuçları yalnızca o tarayıcıda tutulur; sayfa yenilenirse kaybolur (sonar hakkı geri gelmez).
- Arayüz yalnızca Türkçe.

## Görsel kaynaklar

Arayüz görselleri (madalyalar, jeton, elmas, taşlar, oklar): [Designed by Freepik](https://www.freepik.com) — "Hand drawn video game set elements". Ayrıntı: `assets/ui-kit/KAYNAK.md`.
