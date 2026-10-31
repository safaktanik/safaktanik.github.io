// Güvenlik testleri (bozuk parametreler, profil sıfırlama, elmas aktarımı, moderatör e-posta maskesi, silinen hesap temizliği).
// Yerel sunucu geliştirici anahtarıyla çalışmalı (bkz. test/admin.mjs).
const B="http://localhost:8787",H={"content-type":"application/json",origin:"http://localhost:8765"};
const post=(p,b,t)=>fetch(B+p,{method:"POST",headers:{...H,...(t?{authorization:"Bearer "+t}:{})},body:JSON.stringify(b??{})}).then(r=>r.json());
function conn(tok){const ws=new WebSocket(B.replace("http","ws")+"/arena?token="+tok,{headers:{origin:H.origin}});const c={st:null,ev:[],p:new Map(),id:0};ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.t==="s")c.st=m.s;else if(m.t==="r")c.p.get(m.id)?.(m);else c.ev.push(m)};c.call=(m,...a)=>new Promise(r=>{const i=++c.id;c.p.set(i,r);ws.send(JSON.stringify({t:"call",id:i,m,a}))});c.open=new Promise(r=>ws.onopen=r);return c;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let fails=0;const ok=(c,m)=>{console.log((c?"✓ ":"✗ ")+m);if(!c)fails++;};
const mk=async n=>{const g=await post("/api/auth/guest",{});const c=conn(g.token);await c.open;await sleep(500);await c.call("createProfile",n,0);await sleep(500);c.uid=g.account.uid;return c;};
const A=await mk("Saldirgan"),V=await mk("Kurban");
let r=await A.call("createProfile","Yeniden",0);ok(!r.ok&&r.e.code==="profile-exists","profil yeniden oluşturulamıyor");ok(A.st.me.username==="Saldirgan","isim ve bakiye korunuyor");
r=await A.call("updateProfile",{username:{a:1}});ok(!r.ok&&r.e.status===400,"bozuk updateProfile 400 ("+r.e?.code+")");
r=await A.call("joinByCode",{x:1});ok(!r.ok&&r.e.status===400,"bozuk joinByCode 400");
for(const [n,x] of [["yazı ücret",{entryFee:"abc"}],["kesirli ücret",{entryFee:100.5}],["dizi ücret",{entryFee:[100]}],["yazı tahta",{boardSize:"abc"}],["nesne şifre",{password:{length:5}}],["yazı hazır",null]]){
 if(!x){r=await A.call("request",{t:"table.ready",ready:"evet"});}else r=await A.call("request",{t:"table.create",tier:"bronze",mode:"classic",name:"X",capacity:2,private:true,...x});
 ok(!r.ok&&r.e.code==="bad-request",n+" reddedildi");}
ok(A.st.me.balance===3000,"bakiye bozulmadı ("+A.st.me.balance+")");
r=await A.call("request",{t:"table.create",tier:"bronze",mode:"classic",name:"Normal",capacity:2,private:true});ok(r.ok,"normal masa açılabiliyor");await A.call("request",{t:"table.leave"});
r=await A.call("gemImport",{balance:1e9,owned:["hero:11","frame:rainbow","frame:gold"]});ok(r.ok&&r.v.balance===100&&r.v.owned.length===0,"cihazdan aktarım toplam 100 elmasla sınırlı ("+JSON.stringify(r.v)+")");
const W=await mk("Aktaran");r=await W.call("gemImport",{balance:20,owned:["frame:rainbow","hero:11"]});ok(r.ok&&r.v.balance===20&&r.v.owned.join()==="frame:rainbow","20 elmas + 60'lık çerçeve aktarılır, 80'lik kahraman sığmaz ("+JSON.stringify(r.v)+")");
r=await A.call("gemEvent","badge","oracle");ok(r.ok&&r.v.balance===100,"maç oynamadan madalya elması verilmiyor");
// moderatör e-posta maskesi
const em=await post("/api/auth/register",{email:"gizli.kisi@example.com",password:"sifre12345"});const E=conn(em.token);await E.open;await sleep(400);await E.call("createProfile","Epostali",0);await sleep(400);
const adm=(await post("/api/admin/login",{devKey:"yerel-test-anahtari-123",email:"sahip@yerel"})).token,mod=(await post("/api/admin/login",{devKey:"yerel-test-anahtari-123",email:"mod@yerel",role:"mod"})).token;
let x=await post("/api/admin/player",{uid:em.account.uid},mod);ok(x.v.email==="g***@example.com","moderatör e-postayı maskeli görüyor ("+x.v.email+")");
x=await post("/api/admin/player",{uid:em.account.uid},adm);ok(x.v.email==="gizli.kisi@example.com","yönetici tam görüyor");
x=await post("/api/admin/search",{q:"gizli.kisi"},mod);ok(x.v.length===0,"moderatör e-postayla arayamıyor");
x=await post("/api/admin/search",{q:"gizli.kisi"},adm);ok(x.v.length===1,"yönetici e-postayla arayabiliyor");
x=await post("/api/admin/search",{q:12345},adm);ok(Array.isArray(x.v),"sayı ile arama hata vermiyor");
x=await post("/api/admin/leagueView",{tier:"x",gid:0},adm);ok(x.error==="bad-request","bozuk lig parametresi 400");
// silinen hesap arkadaş listelerinden çıkar
await V.call("friendsSave",{list:[{uid:A.uid,name:"Saldirgan",avatar:0,level:1,at:Date.now()}],out:[],inc:[]});
x=await post("/api/admin/deleteAccount",{uid:A.uid,reason:"test",confirm:"Saldirgan"},adm);ok(x.v?.ok,"hesap silindi");await sleep(500);
const fs=V.ev.filter(e=>e.t==="friends").pop();ok(fs&&fs.s.list.length===0,"silinen oyuncu arkadaşın listesinden çıktı");
x=await post("/api/admin/suspicious",{},adm);ok(Array.isArray(x.v.broken),"şüpheli listesinde bozuk bakiye bölümü var ("+x.v.broken.length+")");
console.log(fails?fails+" HATA":"TÜM DÜZELTMELER DOĞRULANDI");process.exit(fails?1:0);
