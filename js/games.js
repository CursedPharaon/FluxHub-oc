let currentCategory = "all";
let currentSearch = "";
let currentSort = "popular";

let pubLogoData = "";
let pubShotsData = [];
let pubArchiveData = null; // {name, size, entry, files, fileList, raw}

function handleLogo(input){
  const f = input.files[0];
  if(!f) return;
  if(f.size>2*1024*1024) return toast("Файл >2MB","error");
  const r=new FileReader();
  r.onload=e=>{
    pubLogoData=e.target.result;
    const img=document.getElementById("pub-logo-preview");
    img.src=pubLogoData; img.classList.remove("hidden");
    document.getElementById("pub-logo-text").textContent=f.name;
    updatePubPreview();
  };
  r.readAsDataURL(f);
}
function handleShots(input){
  pubShotsData=[];
  const pr=document.getElementById("pub-shots-preview");
  pr.innerHTML="";
  [...input.files].slice(0,4).forEach(f=>{
    const r=new FileReader();
    r.onload=e=>{
      pubShotsData.push(e.target.result);
      const im=document.createElement("img");
      im.src=e.target.result;
      pr.appendChild(im);
    };
    r.readAsDataURL(f);
  });
  document.getElementById("pub-shots-text").textContent = `${Math.min(input.files.length,4)} файла(ов) выбрано`;
}

function handleArchiveDrop(e){
  e.preventDefault();
  e.stopPropagation();
  const drop = document.getElementById("pub-archive-drop");
  if(drop) drop.style.borderColor='var(--border)';
  const files = e.dataTransfer && e.dataTransfer.files;
  if(files && files[0]){
    const input = document.getElementById("pub-archive");
    // create new DataTransfer for input
    const dt = new DataTransfer();
    dt.items.add(files[0]);
    input.files = dt.files;
    handleArchive(input);
  }
}

async function handleArchive(input){
  const f = input.files[0];
  if(!f) return;
  const maxSize = 20*1024*1024;
  if(f.size>maxSize) return toast("Архив >20MB — слишком большой, оптимизируй файлы","error");
  const ext = f.name.split(".").pop().toLowerCase();
  const allowedZipExt = ["zip"];
  const isZip = allowedZipExt.includes(ext) || f.type.includes("zip") || f.name.toLowerCase().endsWith(".zip");
  const textEl = document.getElementById("pub-archive-text");
  const nameEl = document.getElementById("pub-archive-name");
  const listEl = document.getElementById("pub-archive-list");
  const statusEl = document.getElementById("pub-archive-status");
  textEl.textContent = "Обработка архива...";
  nameEl.classList.add("hidden");
  listEl.style.display="none";
  listEl.innerHTML="";
  statusEl.textContent="";
  pubArchiveData = null;

  // For non-zip formats, store raw base64 and warn
  if(!isZip){
    const reader = new FileReader();
    reader.onload = e=>{
      const b64 = e.target.result;
      pubArchiveData = {name:f.name, size:f.size, entry:null, files:null, raw:b64, fileList:[f.name], ext};
      textEl.textContent = "✅ "+f.name+" ("+(f.size/1024).toFixed(1)+" KB)";
      nameEl.textContent = "Формат ."+ext+" — сохранён как есть. Рекомендуем .zip для запуска в браузере.";
      nameEl.classList.remove("hidden");
      listEl.style.display="block";
      listEl.innerHTML = `<div style="font-family:monospace;font-size:11px;opacity:.8">Архив ${f.name} сохранён (${(f.size/1024).toFixed(1)} KB). Распаковка .${ext} в браузере не поддерживается — игра может не запуститься. Конвертируй в .zip.</div>`;
      statusEl.textContent = "Можно публиковать, но лучше перезалей как .zip";
      toast("Формат ."+ext+" сохранён, но рекомендуем .zip","info");
    };
    reader.onerror = ()=> toast("Ошибка чтения файла","error");
    reader.readAsDataURL(f);
    return;
  }

  // ZIP handling via JSZip
  if(typeof JSZip === "undefined"){
    toast("JSZip не загружен","error");
    textEl.textContent = "Ошибка: JSZip не загружен";
    return;
  }
  try{
    const zip = await JSZip.loadAsync(f);
    const files = {};
    let fileList = [];
    const promises = [];
    zip.forEach((relativePath, zipEntry)=>{
      if(zipEntry.dir) return;
      // skip hidden system files
      if(relativePath.startsWith("__MACOSX/") || relativePath.includes("/__MACOSX/")) return;
      fileList.push(relativePath);
      const isText = /\.(html|htm|js|css|json|txt|xml|svg)$/i.test(relativePath);
      const isImage = /\.(png|jpg|jpeg|gif|webp|ico|bmp|avif)$/i.test(relativePath);
      const isAudio = /\.(mp3|wav|ogg|mp4|webm)$/i.test(relativePath);
      promises.push(
        (isText ? zipEntry.async("string") : zipEntry.async("base64")).then(content=>{
          if(isText){
            files[relativePath]=content;
          } else if(isImage || isAudio){
            const mimeMap = {
              png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", gif:"image/gif", webp:"image/webp", ico:"image/x-icon", bmp:"image/bmp", avif:"image/avif",
              mp3:"audio/mpeg", wav:"audio/wav", ogg:"audio/ogg", mp4:"video/mp4", webm:"video/webm"
            };
            const ext2 = relativePath.split(".").pop().toLowerCase();
            const mime = mimeMap[ext2] || "application/octet-stream";
            files[relativePath]=`data:${mime};base64,${content}`;
          } else {
            // generic binary
            files[relativePath]=`data:application/octet-stream;base64,${content}`;
          }
        })
      );
    });
    await Promise.all(promises);
    if(!fileList.length) throw new Error("Архив пустой");
    // find entry html
    let entry = fileList.find(n=>n.toLowerCase() === "index.html") || fileList.find(n=>n.toLowerCase().endsWith("/index.html")) || fileList.find(n=>n.toLowerCase().endsWith("index.htm")) || fileList.find(n=>/\.html?$/i.test(n)) || fileList[0];
    // if entry is not html, try to find html
    if(!/\.html?$/i.test(entry)){
      const htmlCandidate = fileList.find(n=>/\.html?$/i.test(n));
      if(htmlCandidate) entry = htmlCandidate;
    }
    pubArchiveData = {name:f.name, size:f.size, entry, files, fileList, ext:"zip"};
    textEl.textContent = "✅ "+f.name+" ("+(f.size/1024).toFixed(1)+" KB)";
    nameEl.textContent = `Вход: ${entry} • файлов: ${fileList.length}`;
    nameEl.classList.remove("hidden");
    listEl.style.display="block";
    listEl.innerHTML = fileList.slice(0,25).map(n=>`<div style="font-family:monospace;font-size:11px;opacity:.8">${esc(n)}</div>`).join("") + (fileList.length>25?`<div>+ ещё ${fileList.length-25}</div>`:"");
    statusEl.textContent = "Готово к публикации. Убедись что index.html в корне.";
    toast(`Архив загружен: ${fileList.length} файлов, вход ${entry}`,"success");
  }catch(e){
    console.error(e);
    textEl.textContent = "Ошибка — выбери другой архив";
    statusEl.textContent = e.message || "Не удалось прочитать zip";
    toast("Ошибка чтения архива: "+(e.message||e),"error");
  }
}

function updatePubPreview(){
  const t=document.getElementById("pub-title").value || "Название";
  const d=document.getElementById("pub-desc").value || "Описание появится здесь";
  const card = document.getElementById("pub-preview-card");
  if(card){
    card.innerHTML = `
      <div class="thumb">${pubLogoData?`<img src="${pubLogoData}">`:`<span class="no-logo">LOGO</span>`}</div>
      <div class="info"><b>${esc(t)}</b><p>${esc(d)}</p></div>
    `;
  }
}
document.addEventListener("input",e=>{
  if(e.target.id==="pub-title"||e.target.id==="pub-desc") updatePubPreview();
});

function esc(s){ return String(s).replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function loadDemo(){
  document.getElementById("pub-title").value="MY FIRST GAME";
  document.getElementById("pub-desc").value="Простая кликер-игра для теста платформы. Кликай и набирай очки!";
  document.getElementById("pub-category").value="arcade";
  document.getElementById("pub-tags").value="clicker, demo";
  // create demo archive in-memory (virtual files)
  const demoHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:sans-serif;background:#0a0f1f;color:#fff;min-height:100vh;display:grid;place-items:center;text-align:center}button{padding:14px 28px;font-size:18px;background:#6c5cff;color:#fff;border:none;border-radius:12px;cursor:pointer}</style></head><body><div><h1>🎮 MY FIRST GAME</h1><p>Счёт: <span id="score">0</span></p><button id="btn">КЛИК!</button></div><script>let s=0;document.getElementById('btn').onclick=()=>{s++;document.getElementById('score').textContent=s; if(s%10===0) document.body.style.filter=\`hue-rotate(\${s*3}deg)\`}<\/script></body></html>`;
  pubArchiveData = {
    name: "demo.zip",
    size: demoHtml.length,
    entry: "index.html",
    files: {"index.html": demoHtml},
    fileList: ["index.html"],
    ext: "zip"
  };
  const textEl = document.getElementById("pub-archive-text");
  const nameEl = document.getElementById("pub-archive-name");
  const listEl = document.getElementById("pub-archive-list");
  const statusEl = document.getElementById("pub-archive-status");
  if(textEl) textEl.textContent = "✅ demo.zip (демо-игра готова)";
  if(nameEl){ nameEl.textContent = "Вход: index.html • файлов: 1 (демо)"; nameEl.classList.remove("hidden"); }
  if(listEl){ listEl.style.display="block"; listEl.innerHTML = `<div style="font-family:monospace;font-size:11px;opacity:.8">index.html</div>`; }
  if(statusEl) statusEl.textContent = "Демо-архив создан — можно публиковать";
  updatePubPreview();
  toast("Демо-архив создан — жми Отправить на модерацию","info");
}

async function publishGame(){
  if(!currentUser) return openAuth();
  if(isBanned(currentUser)) return toast("Ты забанен, публикация запрещена ⛔","error");
  const title=document.getElementById("pub-title").value.trim();
  const desc=document.getElementById("pub-desc").value.trim();
  const cat=document.getElementById("pub-category").value;
  const tags=document.getElementById("pub-tags").value.split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
  const agree=document.getElementById("pub-agree").checked;
  if(!title||!desc) return toast("Заполни название и описание *","error");
  if(!pubLogoData) return toast("Загрузи логотип","error");
  if(!pubArchiveData) return toast("Загрузи архив игры (.zip)","error");
  if(!agree) return toast("Подтверди что игра твоя","error");
  if(title.length<3) return toast("Название слишком короткое","error");
  // verify archive has entry if zip
  if(pubArchiveData.ext==="zip" && !pubArchiveData.files) return toast("Архив не распознан","error");

  // prepare files & html fallback for legacy
  let htmlCode = "";
  let cssCode = "";
  let jsCode = "";
  // if legacy fallback needed (no files but we have raw)
  if(pubArchiveData.files && pubArchiveData.entry && pubArchiveData.files[pubArchiveData.entry]){
    // if entry is html, its content will be used via files, but also keep copy for backward
    const entryContent = pubArchiveData.files[pubArchiveData.entry];
    if(/\.html?$/i.test(pubArchiveData.entry)){
      htmlCode = entryContent;
    }
  }

  const game={
    id: uid("g"),
    title, description:desc, category:cat, tags,
    author: currentUser.username,
    authorId: currentUser.id,
    logo: pubLogoData,
    screenshots: [...pubShotsData],
    // new archive fields
    archiveName: pubArchiveData.name,
    archiveExt: pubArchiveData.ext || "zip",
    archiveEntry: pubArchiveData.entry || "",
    files: pubArchiveData.files || null,
    fileList: pubArchiveData.fileList || [],
    archiveRaw: pubArchiveData.raw || null,
    archiveSize: pubArchiveData.size || 0,
    // legacy fields for old games
    htmlCode: htmlCode,
    cssCode: cssCode,
    jsCode: jsCode,
    status: "pending",
    createdAt: Date.now(),
    plays: 0,
    likes: [],
    rating: 0,
    comments: [],
    rejectReason: ""
  };
  DB.games.unshift(game);
  await saveDB();
  // reset form
  document.getElementById("pub-title").value="";
  document.getElementById("pub-desc").value="";
  document.getElementById("pub-tags").value="";
  const archInput = document.getElementById("pub-archive");
  if(archInput) archInput.value="";
  document.getElementById("pub-archive-text").textContent="Нажми или перетащи архив сюда (.zip / .rar / .7z / .tar)";
  document.getElementById("pub-archive-name").classList.add("hidden");
  document.getElementById("pub-archive-name").textContent="";
  document.getElementById("pub-archive-list").style.display="none";
  document.getElementById("pub-archive-list").innerHTML="";
  document.getElementById("pub-archive-status").textContent="";
  // hidden legacy
  const h=document.getElementById("pub-html"); if(h) h.value="";
  const c=document.getElementById("pub-css"); if(c) c.value="";
  const j=document.getElementById("pub-js"); if(j) j.value="";
  pubLogoData=""; pubShotsData=[]; pubArchiveData=null;
  const logoPrev=document.getElementById("pub-logo-preview");
  if(logoPrev) logoPrev.classList.add("hidden");
  const logoText=document.getElementById("pub-logo-text");
  if(logoText) logoText.textContent="Нажми чтобы загрузить PNG/JPG";
  document.getElementById("pub-shots-preview").innerHTML="";
  document.getElementById("pub-shots-text").textContent="Загрузить скриншоты";
  document.getElementById("pub-agree").checked=false;
  renderAll();
  toast("Игра отправлена на модерацию! Ожидай проверки 🛡️","success");
  router("store");
}

function filteredGames(){
  let list = DB.games.filter(g=> g.status==="approved" || (isAdmin(currentUser) && g.status==="pending") || (currentUser && g.authorId===currentUser.id) );
  return list;
}

function renderStore(){
  const cats = ["all","action","arcade","puzzle","shooter","racing","horror","strategy","casual"];
  const catNames = {all:"Все",action:"Action",arcade:"Arcade",puzzle:"Puzzle",shooter:"Shooter",racing:"Racing",horror:"Horror",strategy:"Strategy",casual:"Casual"};
  document.getElementById("category-tabs").innerHTML = cats.map(c=> `<button class="tab-cat ${currentCategory===c?'active':''}" onclick="setCat('${c}')">${catNames[c]}</button>`).join("");

  let games = DB.games.filter(g=>g.status==="approved");
  if(currentSearch){
    const q=currentSearch.toLowerCase();
    games = games.filter(g=> g.title.toLowerCase().includes(q) || g.description.toLowerCase().includes(q) || g.author.toLowerCase().includes(q) || g.tags.some(t=>t.includes(q)));
  }
  if(currentCategory!=="all") games = games.filter(g=>g.category===currentCategory);
  if(currentSort==="popular") games.sort((a,b)=> b.plays - a.plays);
  if(currentSort==="new") games.sort((a,b)=> b.createdAt - a.createdAt);
  if(currentSort==="liked") games.sort((a,b)=> b.likes.length - a.likes.length);

  const featured = [...DB.games.filter(g=>g.status==="approved")].sort((a,b)=>b.plays-a.plays)[0];
  if(featured){
    document.getElementById("hero-featured").innerHTML = `
      <div class="thumb" style="height:200px;cursor:pointer" onclick="openGame('${featured.id}')">
        <img src="${featured.logo}" onerror="this.style.display='none'">
        <div class="play-overlay"><div class="play-btn"><i class="fa-solid fa-play"></i></div></div>
      </div>
      <div class="info">
        <div class="title">🔥 ${esc(featured.title)} <span class="tag live">• LIVE</span></div>
        <div class="desc">${esc(featured.description)}</div>
        <div class="meta">
          <span class="tag">${featured.category}</span>
          <span class="stats"><i class="fa-solid fa-eye"></i> ${featured.plays} • <i class="fa-solid fa-heart"></i> ${featured.likes.length}</span>
        </div>
        <button class="btn btn-primary small" style="margin-top:10px;width:100%" onclick="playGame('${featured.id}')"><i class="fa-solid fa-gamepad"></i> Играть сейчас</button>
      </div>
    `;
  } else {
    const hf = document.getElementById("hero-featured");
    if(hf) hf.innerHTML = `<div class="thumb" style="height:200px;display:grid;place-items:center;color:var(--muted)">Нет игр</div><div class="info"><div class="title">FluxHub</div><p class="muted">Опубликуй первую игру!</p></div>`;
  }

  const grid = document.getElementById("store-grid");
  const empty = document.getElementById("store-empty");
  if(!games.length){
    grid.innerHTML="";
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
    grid.innerHTML = games.map(cardHtml).join("");
  }

  const newGames = [...DB.games.filter(g=>g.status==="approved")].sort((a,b)=>b.createdAt-a.createdAt).slice(0,6);
  document.getElementById("new-grid").innerHTML = newGames.map(cardHtml).join("") || "<p class='muted'>Новинок пока нет</p>";

  document.getElementById("stat-games").textContent = DB.games.filter(g=>g.status==="approved").length;
  document.getElementById("stat-users").textContent = DB.users.length;
  const libLen = currentUser ? getLibrary().length : 0;
  ["lib-count","lib-count-m","lib-count-b"].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent=libLen; });
  const pending = DB.games.filter(g=>g.status==="pending").length;
  ["mod-count","mod-count-m"].forEach(id=>{ const el=document.getElementById(id); if(el){ el.textContent=pending; el.style.display=pending?"inline-block":"none"; }});
  document.getElementById("admin-pending").textContent = pending;
  // also sync mobile search mirrors
  const s=document.getElementById("search"); const sm=document.getElementById("search-mobile");
  if(s && sm && document.activeElement!==sm) sm.value=s.value;
}

function cardHtml(g){
  const liked = currentUser && g.likes.includes(currentUser.id);
  const hasArchive = !!(g.files || g.archiveRaw || g.htmlCode);
  return `
  <div class="game-card" onclick="openGame('${g.id}')">
    <div class="thumb">
      ${g.logo?`<img src="${g.logo}" loading="lazy">`:`<span class="no-logo">FLUX</span>`}
      <span class="badge ${g.status==="approved"?"badge-approved":g.status==="pending"?"badge-pending":"badge-rejected"}" style="position:absolute;top:8px;left:8px">${g.status==="approved"?"✓ Одобрено":g.status==="pending"?"⏳ На модерации":"✗ Отклонено"}</span>
      <span style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);padding:4px 7px;border-radius:99px;font-size:11px;display:flex;gap:6px;align-items:center">
        <i class="fa-solid fa-eye" style="color:var(--accent)"></i> ${g.plays} &nbsp; <i class="fa-solid fa-heart" style="color:${liked?'#ff3b6e':'#fff'}"></i> ${g.likes.length}
      </span>
    </div>
    <div class="info">
      <b>${esc(g.title)}</b>
      <p>${esc(g.description)}</p>
      <div class="foot">
        <span class="author"><img src="${DB.users.find(u=>u.id===g.authorId)?.avatar||'https://i.pravatar.cc/40'}" onerror="this.src='https://i.pravatar.cc/40'"> ${esc(g.author)} • ${g.category} ${g.archiveName?`• <i class="fa-solid fa-file-zipper" style="color:var(--accent)"></i> ${esc(g.archiveExt||'zip')}`:''}</span>
        <span class="tag">${g.tags[0]||g.category}</span>
      </div>
    </div>
  </div>`;
}

function setCat(c){ currentCategory=c; renderStore(); }
function setSort(s){ currentSort=s; renderStore(); }
function onSearch(v){
  currentSearch=v;
  // keep both search inputs in sync
  const s=document.getElementById("search");
  const sm=document.getElementById("search-mobile");
  if(s && s.value!==v) s.value=v;
  if(sm && sm.value!==v) sm.value=v;
  renderStore();
}

function getLibrary(){
  if(!currentUser) return [];
  const lib = JSON.parse(localStorage.getItem("flux_lib_"+currentUser.id) || "[]");
  return lib;
}
function addToLibrary(gameId){
  if(!currentUser) return openAuth();
  let lib = getLibrary();
  if(!lib.includes(gameId)){
    lib.push(gameId);
    localStorage.setItem("flux_lib_"+currentUser.id, JSON.stringify(lib));
    toast("Добавлено в библиотеку 📚","success");
    renderLibrary();
    renderStore();
  } else {
    toast("Уже в библиотеке","info");
  }
}
function removeFromLibrary(gameId){
  let lib=getLibrary().filter(id=>id!==gameId);
  localStorage.setItem("flux_lib_"+currentUser.id, JSON.stringify(lib));
  renderLibrary();
  renderStore();
  toast("Удалено из библиотеки","info");
}

function renderLibrary(){
  const grid=document.getElementById("library-grid");
  const empty=document.getElementById("library-empty");
  const info=document.getElementById("library-info");
  if(!currentUser){
    grid.innerHTML="";
    empty.classList.remove("hidden");
    empty.innerHTML=`<i class="fa-solid fa-lock"></i><h3>Войди чтобы видеть библиотеку</h3><button class="btn btn-primary" onclick="openAuth()">Войти</button>`;
    info.textContent="";
    return;
  }
  const lib=getLibrary();
  const games= lib.map(id=> DB.games.find(g=>g.id===id)).filter(Boolean);
  info.textContent = `${games.length} игр`;
  if(!games.length){
    grid.innerHTML="";
    empty.classList.remove("hidden");
    empty.innerHTML=`<i class="fa-solid fa-inbox"></i><h3>Библиотека пуста</h3><p>Добавляй игры из магазина — они появятся здесь</p>`;
  } else {
    empty.classList.add("hidden");
    grid.innerHTML = games.map(g=>`
      <div class="game-card" onclick="openGame('${g.id}')">
        <div class="thumb"><img src="${g.logo}"><span style="position:absolute;bottom:8px;right:8px" class="btn btn-primary small" onclick="event.stopPropagation();playGame('${g.id}')"><i class="fa-solid fa-play"></i> Играть</span></div>
        <div class="info"><b>${esc(g.title)}</b><p>${esc(g.description)}</p><button class="btn btn-ghost small" style="width:100%;margin-top:6px" onclick="event.stopPropagation();removeFromLibrary('${g.id}')"><i class="fa-solid fa-trash"></i> Убрать</button></div>
      </div>
    `).join("");
  }
}

function openGame(id){
  const g=DB.games.find(x=>x.id===id);
  if(!g) return;
  const author = DB.users.find(u=>u.id===g.authorId);
  const liked = currentUser && g.likes.includes(currentUser.id);
  const inLib = currentUser && getLibrary().includes(g.id);
  const archiveInfo = g.archiveName ? `<div class="muted small" style="margin-top:6px"><i class="fa-solid fa-file-zipper"></i> Архив: ${esc(g.archiveName)} (${g.archiveExt||'zip'}) • ${g.fileList?g.fileList.length+' файлов':''} • Вход: ${esc(g.archiveEntry||'index.html')}</div>` : "";
  const fileListHtml = g.fileList && g.fileList.length ? `<details style="margin-top:8px"><summary class="muted small" style="cursor:pointer">Файлы архива (${g.fileList.length})</summary><div style="max-height:120px;overflow:auto;margin-top:6px;display:grid;gap:2px">${g.fileList.slice(0,50).map(f=>`<span style="font-family:monospace;font-size:11px;color:var(--muted)">${esc(f)}</span>`).join("")}</div></details>` : "";
  document.getElementById("game-modal-content").innerHTML = `
    <div class="game-detail">
      <div class="game-detail-hero"><img src="${g.logo}"><div class="game-detail-overlay"><img class="logo" src="${g.logo}"><div><h2 style="font-family:Orbitron;font-size:20px">${esc(g.title)} <span class="badge ${g.status==="approved"?"badge-approved":g.status==="pending"?"badge-pending":"badge-rejected"}">${g.status}</span></h2><p class="muted" style="color:#cbd2ff">${esc(g.author)} • ${g.category} • <i class="fa-solid fa-eye"></i> ${g.plays} • <i class="fa-solid fa-heart"></i> ${g.likes.length}</p></div></div></div>
      <div class="game-detail-body">
        <p style="line-height:1.6">${esc(g.description)}</p>
        <div style="display:flex;gap:6px;margin:10px 0;flex-wrap:wrap">${g.tags.map(t=>`<span class="tag">#${esc(t)}</span>`).join("")}</div>
        ${g.screenshots.length?`<div class="screenshots">${g.screenshots.map(s=>`<img src="${s}">`).join("")}</div>`:""}
        ${archiveInfo}
        ${fileListHtml}
        <div class="game-detail-actions">
          ${g.status==="approved"?`<button class="btn btn-primary" onclick="playGame('${g.id}')"><i class="fa-solid fa-play"></i> Играть</button>`:`<button class="btn btn-ghost" disabled><i class="fa-solid fa-hourglass"></i> На модерации</button>`}
          <button class="btn ${liked?'btn-primary':'btn-ghost'}" onclick="toggleLike('${g.id}')"><i class="fa-solid fa-heart"></i> ${liked?'Убрать лайк':"Лайк"} • ${g.likes.length}</button>
          <button class="btn ${inLib?'btn-ghost':'btn-ghost'}" onclick="addToLibrary('${g.id}')" style="${inLib?'opacity:.6':''}"><i class="fa-solid fa-bookmark"></i> ${inLib?'В библиотеке':'В библиотеку'}</button>
          ${isAdmin(currentUser) && g.status==="pending"?`<button class="btn btn-ghost" onclick="playGame('${g.id}');toast('Тестируй игру — это превью модератора','info')"><i class="fa-solid fa-vial"></i> Тест (админ)</button>`:''}
          ${currentUser && currentUser.id===g.authorId && g.status==="rejected"?`<span class="badge badge-rejected">Причина отказа: ${esc(g.rejectReason||"нарушение правил")}</span>`:''}
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
          <img src="${author?.avatar}" style="width:28px;height:28px;border-radius:50%">
          <span style="font-size:13px">Автор: <b>${esc(g.author)}</b> • ${new Date(g.createdAt).toLocaleDateString()}</span>
        </div>

        <div class="comments">
          <h3 style="font-family:Orbitron;font-size:14px;margin-bottom:8px"><i class="fa-solid fa-comments"></i> Комментарии • ${g.comments.length}</h3>
          <div id="comments-list">
            ${g.comments.map(c=>`
              <div class="comment"><b>${esc(c.user)}</b> <span class="muted" style="font-size:11px">${new Date(c.at).toLocaleString()}</span><p>${esc(c.text)}</p></div>
            `).join("") || "<p class='muted'>Пока нет комментов — будь первым!</p>"}
          </div>
          ${currentUser?`
            <div class="comment-form">
              <input id="comment-input" placeholder="Напиши комментарий...">
              <button class="btn btn-primary" onclick="addComment('${g.id}')"><i class="fa-solid fa-paper-plane"></i></button>
            </div>
          `:`<p class="muted" style="margin-top:8px"><a href="#" onclick="openAuth();return false">Войди</a> чтобы комментировать</p>`}
        </div>
      </div>
    </div>
  `;
  document.getElementById("game-modal").classList.add("open");
}
function closeGame(){ document.getElementById("game-modal").classList.remove("open"); }

function toggleLike(id){
  if(!currentUser) return openAuth();
  const g=DB.games.find(x=>x.id===id);
  const idx=g.likes.indexOf(currentUser.id);
  if(idx>=0) g.likes.splice(idx,1);
  else g.likes.push(currentUser.id);
  saveDB();
  openGame(id);
  renderStore();
}

function addComment(id){
  if(!currentUser) return openAuth();
  if(isBanned(currentUser)) return toast("Ты забанен, комменты запрещены","error");
  const inp=document.getElementById("comment-input");
  const text=inp.value.trim();
  if(!text) return;
  const g=DB.games.find(x=>x.id===id);
  g.comments.push({user:currentUser.username, text, at:Date.now()});
  saveDB();
  openGame(id);
  toast("Комментарий добавлен","success");
}

function buildGameSrc(g){
  // new bundle files handling
  if(g.files && g.archiveEntry && g.files[g.archiveEntry]){
    let html = g.files[g.archiveEntry];
    // helper to find file by href/src
    const findFile = (href)=>{
      if(g.files[href]) return g.files[href];
      const clean = href.replace(/^\.\//,"").replace(/^\//,"").split("?")[0].split("#")[0];
      if(g.files[clean]) return g.files[clean];
      const base = clean.split("/").pop();
      const k = Object.keys(g.files).find(key=> key.endsWith("/"+base) || key===base || key.endsWith(base));
      return k ? g.files[k] : null;
    };
    // inline CSS links
    html = html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, (tag)=>{
      const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
      if(!hrefMatch) return tag;
      const href = hrefMatch[1];
      if(href.startsWith("http") || href.startsWith("data:")) return tag;
      const content = findFile(href);
      if(content && typeof content==="string" && !content.startsWith("data:")){
        return `<style>\n/* inlined ${href} */\n${content}\n</style>`;
      }
      return tag;
    });
    // also generic <link href> without rel? try
    html = html.replace(/<link[^>]*href=["']([^"']+\.css)["'][^>]*>/gi, (tag, href)=>{
      if(href.startsWith("http") || href.startsWith("data:")) return tag;
      // already handled stylesheet, avoid double
      if(tag.toLowerCase().includes('rel="stylesheet"') || tag.toLowerCase().includes("rel='stylesheet'")) return tag;
      const content = findFile(href);
      if(content && typeof content==="string" && !content.startsWith("data:")){
        return `<style>\n/* inlined ${href} */\n${content}\n</style>`;
      }
      return tag;
    });
    // inline JS scripts
    html = html.replace(/<script[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, src)=>{
      if(src.startsWith("http") || src.startsWith("data:")) return match;
      const content = findFile(src);
      if(content && typeof content==="string" && !content.startsWith("data:")){
        return `<script>\n/* inlined ${src} */\n${content}\n<\/script>`;
      }
      return match;
    });
    // inline images
    html = html.replace(/<img([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (match, pre, src, post)=>{
      if(src.startsWith("data:") || src.startsWith("http") || src.startsWith("blob:")) return match;
      const dataUrl = findFile(src);
      if(dataUrl && dataUrl.startsWith("data:")){
        return `<img${pre}src="${dataUrl}"${post}>`;
      }
      return match;
    });
    // inline audio/video source
    html = html.replace(/<(audio|video|source)([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (match, tag, pre, src, post)=>{
      if(src.startsWith("data:") || src.startsWith("http")) return match;
      const dataUrl = findFile(src);
      if(dataUrl && dataUrl.startsWith("data:")){
        return `<${tag}${pre}src="${dataUrl}"${post}>`;
      }
      return match;
    });
    // if html doesn't have html tag, wrap
    if(!html.toLowerCase().includes("<html")){
      html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;
    }
    return html;
  }
  // non-zip raw archive cannot be played
  if(g.archiveRaw && !g.files){
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;display:grid;place-items:center;height:100vh;background:#080b14;color:#8b93b8;font-family:Inter,sans-serif;text-align:center;padding:20px}</style></head><body><div><h2 style="color:#fff">⚠️ Архив .${esc(g.archiveExt||'rar')} не поддерживается для запуска</h2><p>Попроси автора перезалить игру как <b>.zip</b> с index.html внутри.</p><p class="muted">Архив: ${esc(g.archiveName||'')}</p></div></body></html>`;
  }
  // legacy fallback
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;background:#000;color:#fff;overflow:auto}*{box-sizing:border-box} ${g.cssCode||""}</style></head><body>${g.htmlCode||""}<script>${g.jsCode||""}<\/script></body></html>`;
}

function playGame(id){
  const g=DB.games.find(x=>x.id===id);
  if(!g) return;
  if(g.status!=="approved" && !isAdmin(currentUser) && g.authorId!==currentUser?.id){
    return toast("Игра на модерации","error");
  }
  if(g.archiveRaw && !g.files){
    toast("Архив ."+(g.archiveExt||"rar")+" нельзя запустить — нужен .zip","error");
  }
  g.plays++;
  saveDB();
  document.getElementById("play-title").textContent = g.title;
  const iframe=document.getElementById("play-iframe");
  iframe.srcdoc = buildGameSrc(g);
  document.getElementById("play-modal").classList.add("open");
  renderStore();
}
function closePlay(){
  document.getElementById("play-modal").classList.remove("open");
  document.getElementById("play-iframe").srcdoc="";
  if(document.fullscreenElement) document.exitFullscreen();
}
function toggleFullscreen(){
  const box=document.querySelector(".play-box");
  if(!document.fullscreenElement) box.requestFullscreen();
  else document.exitFullscreen();
}
