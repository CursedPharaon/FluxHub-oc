// FluxHub Storage — JSONbin + localStorage fallback
const DEFAULT_DATA = {
  users: [
    {
      id: "u_super",
      username: "cursed_dev",
      email: "cursed@fluxhub.dev",
      password: "12345678",
      avatar: "https://i.pravatar.cc/200?u=cursed_dev",
      role: "superadmin",
      bannedUntil: null,
      createdAt: Date.now(),
      bio: "Founder & Super Admin of FluxHub 👑"
    }
  ],
  games: [
    {
      id: "g_demo1",
      title: "NEON DRIFTER",
      description: "Гони на неоновом шоссе, уворачивайся от препятствий и ставь рекорды скорости. Ретро-вейв аркада с синтвейв саундтреком.",
      category: "racing",
      tags: ["neon","arcade","retro"],
      author: "FluxTeam",
      authorId: "u_super",
      logo: "https://images.unsplash.com/photo-1519125323398-675f0ddb6308?w=600&q=80",
      screenshots: [
        "https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=800&q=80",
        "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&q=80"
      ],
      htmlCode: "<canvas id='c' width='800' height='400' style='width:100%;background:#000;display:block'></canvas><p style='color:#0ff;text-align:center;font-family:monospace'>NEON DRIFTER DEMO — нажми SPACE</p>",
      cssCode: "body{margin:0;background:#000;color:#fff;font-family:sans-serif}",
      jsCode: "const c=document.getElementById('c'),x=c.getContext('2d');let p=200,obs=[],score=0;document.addEventListener('keydown',e=>{if(e.code==='Space')p-=40});function loop(){x.fillStyle='#0a0a14';x.fillRect(0,0,800,400);x.fillStyle='#0ff';x.fillRect(100,p,30,30);p+=2;if(p>370)p=370;if(Math.random()<0.03)obs.push({x:800,y:Math.random()*350});obs.forEach(o=>{o.x-=4;x.fillStyle='#ff3b6e';x.fillRect(o.x,o.y,20,20);if(o.x>90&&o.x<130&&p>o.y-30&&p<o.y+20){score=0;obs=[]}});x.fillStyle='#fff';x.font='16px monospace';x.fillText('SCORE:'+score++,10,20);if(obs.length&&obs[0].x<-20)obs.shift();requestAnimationFrame(loop)}loop()",
      status: "approved",
      createdAt: Date.now()-86400000*2,
      plays: 3421,
      likes: [ "u_super" ],
      rating: 4.8,
      comments: [{user:"cursed_dev",text:"Добро пожаловать в FluxHub! Это демо-игра 🔥",at:Date.now()}],
      rejectReason: ""
    },
    {
      id: "g_demo2",
      title: "VOID SHOOTER",
      description: "Космический шутер — уничтожай волны врагов, собирай апгрейды и выживай как можно дольше в пустоте.",
      category: "shooter",
      tags: ["space","shooter","hardcore"],
      author: "cursed_dev",
      authorId: "u_super",
      logo: "https://images.unsplash.com/photo-1446776877081-d282a0f896e2?w=600&q=80",
      screenshots: ["https://images.unsplash.com/photo-1451187580459-43490279c429?w=800&q=80"],
      htmlCode: "<div style='background:#000;color:#0ff;padding:20px;text-align:center'><h2>VOID SHOOTER</h2><canvas id='g' width='600' height='300' style='background:#111;border:1px solid #333'></canvas><p>Управление: стрелки + SPACE</p></div>",
      cssCode: "",
      jsCode: "const cv=document.getElementById('g'),ctx=cv.getContext('2d');let px=300,py=250,bul=[],ene=[],sc=0;document.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')px-=12;if(e.key==='ArrowRight')px+=12;if(e.code==='Space')bul.push({x:px,y:py})});setInterval(()=>ene.push({x:Math.random()*600,y:0}),800);function upd(){ctx.clearRect(0,0,600,300);ctx.fillStyle='#0ff';ctx.fillRect(px-10,py,20,10);bul.forEach(b=>{b.y-=6;ctx.fillStyle='#ff0';ctx.fillRect(b.x, b.y,3,6)});ene.forEach(en=>{en.y+=2;ctx.fillStyle='#f0f';ctx.fillRect(en.x,en.y,14,14)});bul.forEach(b=>ene.forEach(en=>{if(Math.abs(b.x-en.x)<10&&Math.abs(b.y-en.y)<10){sc++;en.y=400;b.y=-10}}));ctx.fillStyle='#fff';ctx.fillText('SCORE:'+sc,10,15);requestAnimationFrame(upd)}upd()",
      status: "approved",
      createdAt: Date.now()-86400000,
      plays: 1280,
      likes: [],
      rating: 4.5,
      comments: [],
      rejectReason: ""
    },
    {
      id: "g_demo3",
      title: "CUBER PUZZLE",
      description: "Минималистичная головоломка — собери куб за минимальное количество ходов. Затянет на часы!",
      category: "puzzle",
      tags: ["puzzle","minimal","brain"],
      author: "FluxTeam",
      authorId: "u_super",
      logo: "https://images.unsplash.com/photo-1605870445919-838d190e8e1b?w=600&q=80",
      screenshots: [],
      htmlCode: "<div style='display:grid;place-items:center;height:300px;background:#0a0f1f;color:#fff'><h1>🧩 CUBER PUZZLE</h1><p>Кликни чтобы собрать куб!</p><button onclick='alert(\"Победа! 🎉\")' style='padding:10px 20px;background:#6c5cff;color:#fff;border:none;border-radius:8px;cursor:pointer'>ИГРАТЬ</button></div>",
      cssCode: "",
      jsCode: "console.log('cuber loaded')",
      status: "pending",
      createdAt: Date.now()-3600000,
      plays: 0,
      likes: [],
      rating: 0,
      comments: [],
      rejectReason: ""
    }
  ]
};

let DB = null;
let saveTimer = null;
let lastSync = 0;

function deepClone(o){ return JSON.parse(JSON.stringify(o)); }

async function loadDB(){
  // 1) try server proxy -> JSONBin (real saving)
  try{
    const res = await fetch((CONFIG.API_BASE || "/api") + "/db", {
      headers: { "X-Bin-Meta": "false" },
      cache: "no-store"
    });
    if(res.ok){
      const data = await res.json();
      const record = data.record || data;
      if(record && Array.isArray(record.users) && Array.isArray(record.games)){
        DB = record;
        const changed = ensureSuperAdmin();
        localStorage.setItem("flux_db", JSON.stringify(DB));
        console.log("[FluxHub] Loaded from JSONbin via server proxy", DB);
        if(changed){
          // persist cursed_dev and any fixes immediately to JSONbin
          await saveDB(true);
        }
        return DB;
      }
    }
    console.warn("[FluxHub] server proxy load failed", res.status, await res.text());
  }catch(e){ console.warn("JSONbin via proxy load error", e); }

  // 2) fallback localStorage cache
  const local = localStorage.getItem("flux_db");
  if(local){
    try{
      DB = JSON.parse(local);
      const changed = ensureSuperAdmin();
      console.log("[FluxHub] Loaded from localStorage cache");
      if(changed){
        localStorage.setItem("flux_db", JSON.stringify(DB));
        // try to sync fixed superadmin to bin in background
        saveDB(true);
      }
      return DB;
    }catch{}
  }
  DB = deepClone(DEFAULT_DATA);
  ensureSuperAdmin();
  // fix timestamps for default demo games if created before
  DB.games.forEach(g=>{
    if(!g.createdAt) g.createdAt = Date.now();
  });
  await saveDB(true);
  return DB;
}

function ensureSuperAdmin(){
  if(!DB) return false;
  let changed = false;
  let u = DB.users.find(x=>x.username===CONFIG.SUPERADMIN);
  if(!u){
    const su = deepClone(DEFAULT_DATA.users[0]);
    su.createdAt = Date.now();
    DB.users.unshift(su);
    changed = true;
  } else {
    if(u.role !== "superadmin"){ u.role = "superadmin"; changed = true; }
    if(u.bannedUntil !== null){ u.bannedUntil = null; changed = true; }
    if(u.username==="cursed_dev" && !u.password){ u.password="12345678"; changed = true; }
    if(!u.email){ u.email = "cursed@fluxhub.dev"; changed = true; }
    if(!u.id){ u.id = "u_super"; changed = true; }
  }
  return changed;
}

async function saveDB(immediate=false){
  localStorage.setItem("flux_db", JSON.stringify(DB));
  if(!immediate){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(()=> saveToBin(), 900);
    return;
  }
  clearTimeout(saveTimer);
  await saveToBin();
}

async function saveToBin(){
  // throttle: wait instead of dropping, so accounts never lost
  const now = Date.now();
  const elapsed = now - lastSync;
  if(elapsed < 800){
    await new Promise(r=> setTimeout(r, 800 - elapsed));
  }
  lastSync = Date.now();
  try{
    const res = await fetch((CONFIG.API_BASE || "/api") + "/db", {
      method: "PUT",
      headers: {
        "Content-Type":"application/json"
      },
      body: JSON.stringify(DB)
    });
    if(!res.ok) {
      const txt = await res.text().catch(()=>res.statusText);
      console.warn("JSONbin save via proxy failed", res.status, txt);
      // keep localStorage as fallback, will retry on next saveDB
    } else {
      console.log("[FluxHub] Saved to JSONbin via server proxy");
    }
  }catch(e){ console.warn("JSONbin save via proxy error", e); }
}

function uid(prefix="id"){ return prefix+"_"+Math.random().toString(36).slice(2,9)+"_"+Date.now().toString(36) }
