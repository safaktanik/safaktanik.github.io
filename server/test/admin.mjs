// Yönetim paneli API testi. Yerel sunucu geliştirici anahtarıyla çalışmalı:
//   npx wrangler dev --port 8787 --local --var ADMIN_DEV_KEY:yerel-test-anahtari-123 --var ADMIN_EMAILS:sahip@ornek.com
//   node test/admin.mjs
const B="http://localhost:8787",O={"content-type":"application/json",origin:"http://localhost:8765"};
let fails=0;const ok=(c,m)=>{console.log((c?"✓ ":"✗ ")+m);if(!c)fails++;};
const post=(p,b,tok)=>fetch(B+p,{method:"POST",headers:{...O,...(tok?{authorization:"Bearer "+tok}:{})},body:JSON.stringify(b??{})}).then(async r=>({status:r.status,...(await r.json().catch(()=>({})))}));
const guest=()=>post("/api/auth/guest",{});
function conn(tok){const ws=new WebSocket(B.replace("http","ws")+"/arena?token="+tok,{headers:{origin:O.origin}});const c={ev:[],st:null,p:new Map(),id:0,closed:null};
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.t==="s")c.st=m.s;else if(m.t==="r")c.p.get(m.id)?.(m);else c.ev.push(m)};ws.onclose=e=>{c.closed=e.code};
 c.call=(m,...a)=>new Promise(r=>{const i=++c.id;c.p.set(i,r);ws.send(JSON.stringify({t:"call",id:i,m,a}))});c.open=new Promise(r=>ws.onopen=r);c.ws=ws;return c;}
const wait=(f,ms=20000)=>new Promise((res,rej)=>{const t0=Date.now();const i=setInterval(()=>{let v;try{v=f()}catch{}if(v){clearInterval(i);res(v)}else if(Date.now()-t0>ms){clearInterval(i);rej(new Error("zaman aşımı"))}},40)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// giriş
let r=await post("/api/admin/login",{devKey:"yanlis"});ok(r.status===403,"yanlış geliştirici anahtarı reddedildi ("+r.status+")");
r=await post("/api/admin/stats",{},"uydurma-token-uydurma-token-123");ok(r.status===401,"geçersiz yönetici anahtarı reddedildi");
r=await post("/api/admin/login",{credential:"x.y.z"});ok(r.status===401||r.status===403,"sahte Google kimliği reddedildi ("+r.status+")");
const adm=(await post("/api/admin/login",{devKey:"yerel-test-anahtari-123",email:"sahip@yerel"})).token;ok(!!adm,"yönetici girişi");
const mod=(await post("/api/admin/login",{devKey:"yerel-test-anahtari-123",email:"yardimci@yerel",role:"mod"})).token;ok(!!mod,"moderatör girişi");
const A=(p,b)=>post("/api/admin/"+p,b,adm), M=(p,b)=>post("/api/admin/"+p,b,mod);
r=await A("me");ok(r.v?.role==="admin","rol: yönetici");r=await M("me");ok(r.v?.role==="mod","rol: moderatör");

// oyuncular
const g1=await guest(),g2=await guest();const P1=conn(g1.token),P2=conn(g2.token);await P1.open;await P2.open;await wait(()=>P1.st&&P2.st);
await P1.call("createProfile","Kotu Isim",0);await P2.call("createProfile","Iyi Oyuncu",1);await wait(()=>P1.st.me&&P2.st.me);
const u1=g1.account.uid,u2=g2.account.uid;
r=await A("stats");ok(r.v&&r.v.online>=2&&r.v.accounts>=2,`pano: çevrimiçi ${r.v?.online}, hesap ${r.v?.accounts}, bugün aktif ${r.v?.per?.[6]?.active}`);
r=await A("search",{q:"kotu"});ok(r.v?.some(x=>x.uid===u1),"isimle arama");
r=await A("search",{q:u2});ok(r.v?.[0]?.uid===u2,"kimlikle arama");
r=await A("player",{uid:u1});ok(r.v?.profile?.name==="Kotu Isim"&&r.v.sessions===1,"oyuncu detayı (oturum "+r.v?.sessions+")");

// moderasyon
r=await A("rename",{uid:u1,name:"Oyuncu 1"});ok(r.status===400&&r.error==="reason-required","gerekçesiz isim değişikliği reddedildi");
r=await M("rename",{uid:u1,name:"Oyuncu 1",reason:"Uygunsuz kullanıcı adı"});ok(r.v?.name==="Oyuncu 1","moderatör isim değiştirdi");
await wait(()=>P1.st.me.username==="Oyuncu 1").then(()=>ok(true,"oyuncunun ekranında yeni isim")).catch(()=>ok(false,"oyuncunun ekranında yeni isim"));
await wait(()=>P1.ev.some(e=>e.t==="notice")).then(()=>ok(true,"oyuncuya isim değişikliği bildirimi gitti")).catch(()=>ok(false,"bildirim"));
r=await M("warn",{uid:u2,text:"Lütfen maçlardan çıkıp durma."});ok(r.v?.delivered,"uyarı canlı iletildi");
await wait(()=>P2.ev.some(e=>e.t==="notice"&&/çıkıp/.test(e.d.text))).then(()=>ok(true,"uyarı oyuncuya ulaştı")).catch(()=>ok(false,"uyarı ulaşmadı"));

// düzeltme (yalnızca yönetici)
r=await M("adjust",{uid:u2,coins:500,reason:"test"});ok(r.status===403,"moderatör coin veremez");
const bal0=P2.st.me.balance;r=await A("adjust",{uid:u2,coins:500,gems:7,reason:"Hata nedeniyle kayıp iade"});ok(r.v?.balance===bal0+500&&r.v?.gems===7,"yönetici coin ve elmas verdi");
await wait(()=>P2.st.me.balance===bal0+500).then(()=>ok(true,"oyuncunun bakiyesi canlı güncellendi")).catch(()=>ok(false,"bakiye güncellenmedi"));
ok(P2.ev.some(e=>e.t==="gems"&&e.s.balance===7),"elmas mesajı oyuncuya gitti");
r=await A("adjust",{uid:u2,coins:-999999,reason:"fazla"});ok(r.error==="insufficient-funds","bakiyeden fazla düşülemez");
r=await A("player",{uid:u2});ok(r.v?.tx?.[0]?.transaction_type==="admin-adjust","bakiye hareketlerinde yönetici düzeltmesi");

// yasak
r=await M("ban",{uid:u1,hours:0,reason:"Hile"});ok(r.status===403,"moderatör kalıcı yasak veremez");
r=await M("ban",{uid:u1,hours:24,reason:"Uygunsuz davranış"});ok(r.v?.kicked>=1,"moderatör 24 saatlik yasak verdi, oyuncu atıldı");
await wait(()=>P1.closed!==null).then(()=>ok(P1.ev.some(e=>e.t==="banned"),"oyuncuya yasak mesajı gitti, bağlantı kapandı ("+P1.closed+")")).catch(()=>ok(false,"bağlantı kapanmadı"));
const P1b=conn(g1.token);await sleep(1500);ok(P1b.ev.some(e=>e.t==="banned")&&P1b.closed===4003,"yasaklı oyuncu yeniden bağlanamıyor");
r=await A("search",{q:"oyuncu 1"});ok(r.v?.[0]?.banned,"aramada yasaklı görünüyor");
r=await M("unban",{uid:u1,reason:"İtiraz kabul"});const P1c=conn(g1.token);await P1c.open;await wait(()=>P1c.st&&P1c.st.me).then(()=>ok(true,"yasak kalkınca bağlanabiliyor")).catch(()=>ok(false,"yasak kalktıktan sonra bağlanamadı"));

// tüm cihazlardan çıkış
r=await M("kick",{uid:u1});ok(r.v?.sessions===1,"tüm oturumlar kapatıldı");
r=await fetch(B+"/api/auth/me",{headers:{...O,authorization:"Bearer "+g1.token}});ok(r.status===401,"eski oturum anahtarı artık geçersiz");

// 2. aşama: duyuru, bakım, ekonomi, lig
r=await A("announce",{text:"Hafta sonu çift coin!",tone:"event",until:Date.now()+3600e3});ok(r.v?.live?.announce?.text,"duyuru yayınlandı");
await wait(()=>P2.ev.some(e=>e.t==="cfg"&&e.c.announce&&/çift coin/.test(e.c.announce.text))).then(()=>ok(true,"duyuru bağlı oyuncuya anında gitti")).catch(()=>ok(false,"duyuru gitmedi"));
r=await fetch(B+"/api/config",{headers:O}).then(x=>x.json());ok(r.announce?.text==="Hafta sonu çift coin!","duyuru herkese açık ayarlarda (çevrimdışı oyuncular da görür)");
r=await M("announce",{text:"x"});ok(r.status===403,"moderatör duyuru yayınlayamaz");
r=await A("maint",{on:true,msg:"Kısa bakım"});const tc=await P2.call("request",{t:"table.create",tier:"bronze",mode:"classic",name:"B",capacity:2,private:true});ok(!tc.ok&&tc.e.code==="maintenance","bakım modunda yeni masa açılamıyor");
await A("maint",{on:false});const tc2=await P2.call("request",{t:"table.create",tier:"bronze",mode:"classic",name:"B",capacity:2,private:true});ok(tc2.ok,"bakım kapanınca masa açılıyor");await P2.call("request",{t:"table.leave"});
r=await A("eco",{daily:400,streak:50,maxStreak:250,prizeMul:2,questMul:2,puzzleMul:1,eventName:"Çift ödül",eventUntil:Date.now()+3600e3});ok(r.v?.eco?.daily===400&&r.v.live.mul.prize===2,"ekonomi ayarı kaydedildi (günlük 400, maç ödülü x2)");
await P2.call("refreshMe");await sleep(300);ok(P2.st.me.dailyAmount===400,"oyuncunun günlük ödül miktarı 400 oldu ("+P2.st.me.dailyAmount+")");
r=await A("eco",{daily:400,streak:50,maxStreak:250,prizeMul:9,questMul:1,puzzleMul:1});ok(r.status===400,"sınır dışı çarpan reddedildi");
await A("eco",{reset:true});await P2.call("refreshMe");await sleep(300);ok(P2.st.me.dailyAmount===250,"varsayılana dönünce 250");
await P2.call("league");r=await A("leagueView",{});ok(r.v?.tiers?.[0]?.groups?.length>=1,"lig grupları görünüyor");
r=await A("leagueView",{tier:0,gid:r.v.tiers[0].groups[0].gid});ok(r.v?.rows?.length===11,"grup tablosu 11 satır");
r=await A("leagueCfg",{botMul:0.8});ok(r.v?.league?.botMul===0.8,"bot seviyesi 0.8");await A("leagueCfg",{botMul:1});

// 3. aşama
r=await P2.call("report",u1,"name","isim uygunsuz");ok(r.ok&&r.v.ok,"oyuncu şikayet gönderdi");
r=await P2.call("report",u1,"name","");ok(r.v?.dup,"aynı şikayet tekrar sayılmıyor");
r=await P2.call("report",u2,"name","");ok(!r.ok,"kendini şikayet edemez");
r=await M("reports",{});ok(r.v?.[0]?.targetName==="Oyuncu 1"&&r.v[0].reason==="name","moderatör şikayetleri görüyor");
r=await M("report",{id:r.v[0].id,result:"actioned",outcome:"isim değiştirildi"});ok(r.v?.ok,"şikayet sonuçlandırıldı");
r=await post("/api/feedback",{puan:4,tur:"Hata",mesaj:"Bulmaca ekranı donuyor",isim:"Ali",cihaz:"test",surum:"3.15.0"},g2.token);ok(r.ok,"geri bildirim sunucuya ulaştı");
r=await M("feedback",{});ok(r.v?.[0]?.text==="Bulmaca ekranı donuyor"&&r.v[0].playerName==="Iyi Oyuncu","geri bildirim panelde, oyuncu adıyla");
r=await A("suspicious",{});ok(Array.isArray(r.v?.ips)&&Array.isArray(r.v?.winners),"şüpheli hareketler listesi");
r=await M("log",{});ok(r.status===403,"moderatör işlem kaydını göremez");
r=await A("log",{});ok(r.v?.some(x=>x.action==="ban"&&x.email==="yardimci@yerel")&&r.v.some(x=>x.action==="adjust"),"işlem kaydında kim neyi yaptı ("+r.v?.length+" kayıt)");

// hesap silme
r=await A("deleteAccount",{uid:u1,reason:"KVKK talebi",confirm:"yanlış"});ok(r.error==="confirm-mismatch","onay adı yanlışsa silmiyor");
r=await A("deleteAccount",{uid:u1,reason:"KVKK talebi",confirm:"Oyuncu 1"});ok(r.v?.ok,"hesap silindi");
r=await A("player",{uid:u1});ok(r.status===404,"silinen hesap bulunamıyor");
r=await post("/api/auth/login",{});const pc=await P2.call("playerCard",u1);ok(!pc.ok&&pc.e.code==="not-found","silinen oyuncunun kartı yok");
console.log(fails?`${fails} HATA`:"TÜM YÖNETİM TESTLERİ GEÇTİ");process.exit(fails?1:0);
