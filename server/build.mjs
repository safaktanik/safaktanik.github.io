// Oyun motorunu ../index.html'deki modül betiğinden çıkarıp sunucu için hazırlar.
// Sunucu ve istemci aynı kuralları çalıştırsın diye her kurulumda yeniden üretilir.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");
const open = '<script type="module">';
const a = html.indexOf(open);
if (a < 0) throw new Error("modül betiği bulunamadı");
let m = html.slice(a + open.length, html.indexOf("</script>", a));

function patch(from, to) {
  const n = m.split(from).length - 1;
  if (n !== 1) throw new Error(`yama noktası ${n} kez bulundu: ${from.slice(0, 70)}`);
  m = m.replace(from, to);
}

// Arayüzün başlatıldığı son kısım sunucuda çalışmaz.
const tail = m.indexOf('Cw();ww();e5();document.addEventListener("visibilitychange"');
if (tail < 0) throw new Error("başlatma kısmı bulunamadı");
m = m.slice(0, tail) + "\nexport {zo,gC,U,K,ne,Ni,Mp,_i,Bd,tl,Sl,ts,Us};\n";

// Sunucu yalnızca kuralları çalıştırır; gömülü görseller gerekmez.
m = m.replace(/data:(image|audio|font)\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]{200,}/g, "data:,");
m = m.replace(/data:image\/svg\+xml,[^"'`)]{500,}/g, "data:,");

// Arkadaş odaları ve şifreli masalar botla doldurulmaz; açık masalarda gerçek oyunculara süre tanınır.
patch(
  'if(this.local&&t.status==="waiting"&&t.seats.length<t.maxPlayers&&t.seats.some(n=>n.uid===this.uid)&&l-t.updatedAt>3500&&',
  'if(this.local&&t.status==="waiting"&&!t.private&&!t.pw&&t.seats.length<t.maxPlayers&&t.seats.some(n=>n.uid===this.uid)&&l-t.updatedAt>(globalThis.__tgFillMs??3500)&&'
);
// Lobideki bot masalarını yalnızca sunucunun kendi örneği kurar (oyuncu örnekleri kurmaz).
patch("this.local&&this.seedLocal(n)", "this.local&&!this.noSeed&&this.seedLocal(n)");

// Elmasla açılan kahramanlar: sunucu, oyuncunun sunucudaki elmas kaydına bakar.
patch("if(!D1(a,1))", "if(!D1(a,1)&&!(globalThis.__tgOwns&&globalThis.__tgOwns(this.uid,\"hero:\"+a)))");
patch("!D1(t.avatar,Us(a.xp))", "!D1(t.avatar,Us(a.xp))&&!(globalThis.__tgOwns&&globalThis.__tgOwns(this.uid,\"hero:\"+t.avatar))");

// Maç geçmişine açılan güvenli kare ve elenme bilgisi de yazılır (günlük görevler sunucuda doğrulanır).
patch("mines_triggered:n.mineHits,", "mines_triggered:n.mineHits,safe_opened:n.safeOpened,elim:n.eliminationReason??null,");

writeFileSync(join(here, "src", "engine.gen.mjs"), m);
console.log(`motor hazır: ${(m.length / 1024).toFixed(0)} KB`);
