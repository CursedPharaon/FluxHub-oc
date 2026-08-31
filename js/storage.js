// FluxHub Storage — Real DB (SQLite/PostgreSQL) + localStorage cache
// Теперь данные строго с сервера: все устройства видят одно и то же.
// localStorage используется ТОЛЬКО как кэш для офлайн-чтения, никогда не перезаписывает сервер старыми данными.
const DEFAULT_PRIVACY = { friendsVisibility: "all", gamesVisibility: "all" };
const DEFAULT_SETTINGS = { notifyFriendRequest: true, notifyMessages: true, soundEnabled: true, showOnline: true, language: "ru" };

function defaultUserExtras(){
  return {
    friends: [],
    friendRequestsIncoming: [],
    friendRequestsOutgoing: [],
    privacy: { ...DEFAULT_PRIVACY },
    settings: { ...DEFAULT_SETTINGS },
    library: []
  };
}

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
      bio: "Founder & Super Admin of FluxHub 👑",
      friends: [],
      friendRequestsIncoming: [],
      friendRequestsOutgoing: [],
      privacy: { ...DEFAULT_PRIVACY },
      settings: { ...DEFAULT_SETTINGS },
      library: []
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
  ],
  chats: [],
};

let DB = null;
let saveTimer = null;
let lastSync = 0;
let _syncInterval = null;
let _lastServerHash = "";
let _offlineWarned = false;

function ensureUserDefaults(u){
  let ch=false;
  if(!Array.isArray(u.friends)){ u.friends=[]; ch=true; }
  if(!Array.isArray(u.friendRequestsIncoming)){ u.friendRequestsIncoming=[]; ch=true; }
  if(!Array.isArray(u.friendRequestsOutgoing)){ u.friendRequestsOutgoing=[]; ch=true; }
  if(!Array.isArray(u.library)){ u.library=[]; ch=true; }
  if(!u.privacy || typeof u.privacy!=='object'){ u.privacy={...DEFAULT_PRIVACY}; ch=true; }
  else {
    if(!["all","friends","none"].includes(u.privacy.friendsVisibility)){ u.privacy.friendsVisibility="all"; ch=true; }
    if(!["all","friends","none"].includes(u.privacy.gamesVisibility)){ u.privacy.gamesVisibility="all"; ch=true; }
  }
  if(!u.settings || typeof u.settings!=='object'){ u.settings={...DEFAULT_SETTINGS}; ch=true; }
  else {
    for(const k of Object.keys(DEFAULT_SETTINGS)){
      if(u.settings[k]===undefined){ u.settings[k]=DEFAULT_SETTINGS[k]; ch=true; }
    }
  }
  return ch;
}

function ensureDBDefaults(){
  if(!DB) return false;
  let ch=false;
  if(!Array.isArray(DB.chats)){ DB.chats=[]; ch=true; }
  if(!Array.isArray(DB.users)) DB.users=[];
  DB.users.forEach(u=>{ if(ensureUserDefaults(u)) ch=true; });
  const ids=new Set(DB.users.map(x=>x.id));
  const gameIds=new Set((DB.games||[]).map(g=>g.id));
  DB.users.forEach(u=>{
    const beforeF=u.friends.length;
    u.friends=u.friends.filter(id=>ids.has(id) && id!==u.id);
    if(u.friends.length!==beforeF) ch=true;
    const beforeI=u.friendRequestsIncoming.length;
    u.friendRequestsIncoming=u.friendRequestsIncoming.filter(id=>ids.has(id) && id!==u.id && !u.friends.includes(id));
    if(u.friendRequestsIncoming.length!==beforeI) ch=true;
    const beforeO=u.friendRequestsOutgoing.length;
    u.friendRequestsOutgoing=u.friendRequestsOutgoing.filter(id=>ids.has(id) && id!==u.id && !u.friends.includes(id));
    if(u.friendRequestsOutgoing.length!==beforeO) ch=true;
    u.friends=[...new Set(u.friends)];
    u.friendRequestsIncoming=[...new Set(u.friendRequestsIncoming)];
    u.friendRequestsOutgoing=[...new Set(u.friendRequestsOutgoing)];
    if(Array.isArray(u.library)){
      const beforeL=u.library.length;
      u.library=[...new Set(u.library)].filter(id=>gameIds.has(id));
      if(u.library.length!==beforeL) ch=true;
    } else { u.library=[]; ch=true; }
  });
  const validChats=[];
  DB.chats.forEach(c=>{
    if(!c || !Array.isArray(c.participants) || c.participants.length!==2) { ch=true; return; }
    if(!ids.has(c.participants[0]) || !ids.has(c.participants[1])) { ch=true; return; }
    if(!Array.isArray(c.messages)) c.messages=[];
    validChats.push(c);
  });
  if(validChats.length!==DB.chats.length){ DB.chats=validChats; ch=true; }
  return ch;
}

function deepClone(o){ return JSON.parse(JSON.stringify(o)); }

function migrateLegacyLibraries(){
  if(!DB || !Array.isArray(DB.users)) return false;
  let changed=false;
  const gameIds=new Set((DB.games||[]).map(g=>g.id));
  for(const u of DB.users){
    try{
      const key="flux_lib_"+u.id;
      const raw=localStorage.getItem(key);
      if(!raw) continue;
      const arr=JSON.parse(raw);
      if(!Array.isArray(arr) || !arr.length) continue;
      if(!Array.isArray(u.library)) u.library=[];
      const merged=[...new Set([...u.library, ...arr])].filter(id=>gameIds.has(id) || !gameIds.size);
      if(merged.length!==u.library.length){
        u.library=merged;
        changed=true;
        console.log(`[migrate] library ${u.username}: +${arr.length} from localStorage`);
      }
      // после миграции удаляем ключ чтобы не тащить мусор - данные теперь в БД
      try{ localStorage.removeItem(key); }catch{}
    }catch(e){ console.warn("migrate lib error",e); }
  }
  return changed;
}

function hashDB(obj){
  try{
    // быстрый хэш для проверки изменений: длина + кол-во + последние id
    return JSON.stringify({u: obj.users.length, g: obj.games.length, c: obj.chats.length, lu: obj.users.map(u=>u.id).slice(0,5).join(","), lg: obj.games.map(g=>g.id).slice(0,5).join(",")});
  }catch{ return String(Date.now()); }
}

async function fetchServerDB(){
  const headers = {};
  const token = localStorage.getItem("flux_token");
  if(token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch((CONFIG.API_BASE || "/api") + "/db", {
    headers,
    cache: "no-store"
  });
  if(!res.ok) throw new Error("HTTP "+res.status+" "+ await res.text().catch(()=>res.statusText));
  const data = await res.json();
  const record = data.record || data;
  if(!record || !Array.isArray(record.users) || !Array.isArray(record.games)) throw new Error("invalid record");
  return record;
}

async function loadDB(){
  // 1) строго пробуем сервер — это источник истины для всех устройств
  try{
    const record = await fetchServerDB();
    DB = record;
    let changed = ensureSuperAdmin();
    if(ensureDBDefaults()) changed=true;
    if(migrateLegacyLibraries()) changed=true;
    if(ensureDBDefaults()) changed=true;
    _lastServerHash = hashDB(DB);
    localStorage.setItem("flux_db", JSON.stringify(DB));
    console.log("[FluxHub] Loaded from Real DB (SQLite/PostgreSQL)", DB);
    if(changed){
      await saveDB(true);
    }
    _offlineWarned = false;
    startAutoSync();
    return DB;
  }catch(e){
    console.warn("[FluxHub] Real DB load failed, using cache/offline", e);
  }

  // 2) fallback к локальному кэшу — только для чтения, НЕ перезаписываем сервер старыми данными
  const local = localStorage.getItem("flux_db");
  if(local){
    try{
      DB = JSON.parse(local);
      ensureSuperAdmin();
      ensureDBDefaults();
      migrateLegacyLibraries();
      ensureDBDefaults();
      console.log("[FluxHub] Loaded from localStorage cache (offline mode) — данные могут быть устаревшими, сервер недоступен");
      if(!_offlineWarned && typeof toast==="function"){
        toast("Сервер недоступен — показаны кэшированные данные. Проверь что запущен server.py и есть интернет","error");
        _offlineWarned = true;
      }
      _lastServerHash = hashDB(DB);
      startAutoSync();
      return DB;
    }catch{}
  }
  // 3) совсем нет кэша — создаём демо только для офлайн просмотра, не пушим на сервер пока нет связи
  DB = deepClone(DEFAULT_DATA);
  ensureSuperAdmin();
  ensureDBDefaults();
  migrateLegacyLibraries();
  ensureDBDefaults();
  DB.games.forEach(g=>{
    if(!g.createdAt) g.createdAt = Date.now();
  });
  _lastServerHash = hashDB(DB);
  localStorage.setItem("flux_db", JSON.stringify(DB));
  console.log("[FluxHub] Created offline default DB");
  if(typeof toast==="function" && !_offlineWarned){
    toast("Сервер недоступен — работа в офлайн режиме","error");
    _offlineWarned=true;
  }
  startAutoSync();
  // не делаем saveDB(true) здесь — не затираем сервер демо-данными если он просто временно недоступен
  return DB;
}

async function syncFromServer(){
  try{
    const record = await fetchServerDB();
    const newHash = hashDB(record);
    if(newHash === _lastServerHash && DB) {
      // нет изменений
      return false;
    }
    // мерджим: сервер — истина
    DB = record;
    ensureSuperAdmin();
    ensureDBDefaults();
    // мигрируем библиотеки если были локальные
    if(migrateLegacyLibraries()) {
      ensureDBDefaults();
      await saveDB(true);
    }
    _lastServerHash = hashDB(DB);
    localStorage.setItem("flux_db", JSON.stringify(DB));
    console.log("[FluxHub] Synced from server", DB.users.length+" users", DB.games.length+" games");
    // обновляем текущий юзер ссылку
    if(typeof currentUser!=="undefined" && currentUser){
      const fresh = DB.users.find(u=>u.id===currentUser.id);
      if(fresh) {
        // сохраняем ссылку но обновляем поля
        Object.assign(currentUser, fresh);
        try{ localStorage.setItem("flux_user", JSON.stringify({id: fresh.id, username: fresh.username})); }catch{}
        // точнее перезапишем полностью без пароля
        const safe = {...fresh}; delete safe.password;
        localStorage.setItem("flux_user", JSON.stringify(safe));
      }
    }
    // перерисовываем UI если загружен
    if(typeof renderAll==="function") renderAll();
    else {
      if(typeof renderStore==="function" && document.getElementById("view-store")?.classList.contains("active")) renderStore();
      if(typeof updateSocialBadges==="function") updateSocialBadges();
    }
    _offlineWarned=false;
    return true;
  }catch(e){
    // сервер недоступен — молчим, ждём следующего опроса
    console.warn("[sync] server unreachable", e.message);
    return false;
  }
}

function startAutoSync(){
  if(_syncInterval) return;
  // опрос каждые 5 секунд — все устройства видят одинаково
  _syncInterval = setInterval(()=>{ syncFromServer(); }, 5000);
  // также синхронизируем при возвращении вкладки
  document.addEventListener("visibilitychange", ()=>{
    if(document.visibilityState==="visible") syncFromServer();
  });
  window.addEventListener("focus", ()=> syncFromServer());
  window.addEventListener("online", ()=> syncFromServer());
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
    if(ensureUserDefaults(u)) changed=true;
  }
  if(DB.users.forEach){
    DB.users.forEach(x=>{ if(ensureUserDefaults(x)) changed=true; });
  }
  if(!Array.isArray(DB.chats)){ DB.chats=[]; changed=true; }
  return changed;
}

async function saveDB(immediate=false){
  // всегда обновляем кэш
  localStorage.setItem("flux_db", JSON.stringify(DB));
  if(!immediate){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(()=> saveToDB(), 900);
    return;
  }
  clearTimeout(saveTimer);
  await saveToDB();
}

async function saveToDB(){
  const now = Date.now();
  const elapsed = now - lastSync;
  if(elapsed < 800){
    await new Promise(r=> setTimeout(r, 800 - elapsed));
  }
  lastSync = Date.now();
  try{
    const headers = { "Content-Type":"application/json" };
    const token = localStorage.getItem("flux_token");
    if(token) headers["Authorization"] = "Bearer " + token;
    // перед сохранением подтянем свежее с сервера чтобы не затереть чужие изменения (last-write-wins защита)
    try{
      const fresh = await fetchServerDB();
      // мерджим: если на сервере больше пользователей/игр чем у нас — значит мы устарели, нужно смерджить
      // простая стратегия: если свежие данные отличаются, берём их за основу и накатываем наши изменения по id
      // но для простоты сейчас — если свежий хэш отличается, сначала синхронизируем, потом поверх пишем
      // Делаем лёгкий мёрдж: сохраняем наши новые игры/юзеры которых нет на сервере
      if(fresh && fresh.users && fresh.games){
        const freshIds = new Set(fresh.users.map(u=>u.id));
        const freshGameIds = new Set(fresh.games.map(g=>g.id));
        // если у нас есть юзеры/игры которых нет на сервере — они новые, их нужно сохранить
        // если на сервере есть новые — они уже в fresh, а мы их затрем если просто PUT DB.
        // Поэтому мерджим свежие + наши новые
        let needMerge=false;
        for(const u of DB.users){ if(!freshIds.has(u.id)) { fresh.users.push(u); needMerge=true; } }
        for(const g of DB.games){ if(!freshGameIds.has(g.id)) { fresh.games.unshift(g); needMerge=true; } }
        // также свежие чаты
        if(DB.chats) {
          const freshChatIds=new Set((fresh.chats||[]).map(c=>c.id));
          for(const c of DB.chats){ if(!freshChatIds.has(c.id)) { (fresh.chats||(fresh.chats=[])).push(c); needMerge=true; } }
        }
        if(needMerge){
          // обновим DB перед отправкой чтобы включить свежие данные + наши новые
          DB.users = fresh.users;
          DB.games = fresh.games;
          DB.chats = fresh.chats||[];
          _lastServerHash = hashDB(DB);
          localStorage.setItem("flux_db", JSON.stringify(DB));
        }
      }
    }catch(e){ /* если не удалось подтянуть — всё равно пробуем сохранить */ console.warn("[save] pre-fetch failed", e.message); }

    const res = await fetch((CONFIG.API_BASE || "/api") + "/db", {
      method: "PUT",
      headers,
      body: JSON.stringify(DB)
    });
    if(!res.ok) {
      const txt = await res.text().catch(()=>res.statusText);
      console.warn("Real DB save failed", res.status, txt);
      if(typeof toast==="function") toast("Ошибка сохранения на сервере: "+txt,"error");
      throw new Error(txt);
    } else {
      console.log("[FluxHub] Saved to Real DB (SQLite/PostgreSQL)");
      _lastServerHash = hashDB(DB);
      // после успешного сохранения сразу синхронизируем чтобы другие устройства подтянули
      setTimeout(()=> syncFromServer(), 500);
    }
  }catch(e){
    console.warn("Real DB save error", e);
    if(e.message && e.message.includes("Failed to fetch")){
      if(typeof toast==="function" && !_offlineWarned) toast("Нет связи с сервером — данные сохранены локально, синхронизируются при подключении","error");
    }
  }
}

function uid(prefix="id"){ return prefix+"_"+Math.random().toString(36).slice(2,9)+"_"+Date.now().toString(36) }
