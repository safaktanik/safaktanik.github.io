// Ad filtresi: küfürlü oyuncu/arena adları sunucuda reddedilir, masum adlar geçer.
const B="http://localhost:8787",H={"content-type":"application/json",origin:"http://localhost:8765"};
const post=(p,b)=>fetch(B+p,{method:"POST",headers:H,body:JSON.stringify(b??{})}).then(r=>r.json());
function conn(tok){const ws=new WebSocket(B.replace("http","ws")+"/arena?token="+tok,{headers:{origin:H.origin}});const c={st:null,p:new Map(),id:0};ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.t==="s")c.st=m.s;else if(m.t==="r")c.p.get(m.id)?.(m)};c.call=(m,...a)=>new Promise(r=>{const i=++c.id;c.p.set(i,r);ws.send(JSON.stringify({t:"call",id:i,m,a}))});c.open=new Promise(r=>ws.onopen=r);c.ws=ws;return c;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let fails=0;const ok=(c,m)=>{console.log((c?"✓ ":"✗ ")+m);if(!c)fails++;};
const g=await post("/api/auth/guest",{});const c=conn(g.token);await c.open;await sleep(400);
let r=await c.call("createProfile","0r0spu",0);ok(!r.ok&&r.e.code==="bad-name","küfürlü ad reddedildi ("+r.e?.code+")");
r=await c.call("createProfile","F4ckYou",0);ok(!r.ok&&r.e.code==="bad-name","İngilizce harf oyunlu ad reddedildi");
r=await c.call("createProfile","Sıkıntı",0);ok(r.ok,"masum ad kabul edildi");await sleep(300);
r=await c.call("updateProfile",{username:"amk"});ok(!r.ok&&r.e.code==="bad-name","ad değiştirirken de denetleniyor");
r=await c.call("request",{t:"table.create",tier:"bronze",mode:"classic",name:"Siktir Arena",capacity:2,private:true});ok(!r.ok&&r.e.code==="bad-name","küfürlü arena adı reddedildi");
r=await c.call("request",{t:"table.create",tier:"bronze",mode:"classic",name:"Kaptanın Arenası",capacity:2,private:true});ok(r.ok,"normal arena adı kabul edildi");
c.ws.close();console.log(fails?fails+" HATA":"AD FİLTRESİ DOĞRULANDI");process.exit(fails?1:0);
