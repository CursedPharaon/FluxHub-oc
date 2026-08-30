let currentCategory = "all";
let currentSearch = "";
let currentSort = "popular";

let pubLogoData = "";
let pubShotsData = [];

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

function updatePubPreview(){
  const t=document.getElementById("pub-title").value || "Название";
  const d=document.getElementById("pub-desc").value || "Описание появится здесь";
  document.getElementById("pub-preview-card").innerHTML = `
    <div class="thumb">${pubLogoData?`<img src="${pubLogoData}">`:`<span class="no-logo">LOGO</span>`}</div>
    <div class="info"><b>${esc(t)}</b><p>${esc(d)}</p></div>
  `;
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
  document.getElementById("pub-html").value="<div style='background:#0a0f1f;color:#fff;min-height:300px;display:grid;place-items:center;text-align:center;padding:20px'><h1>🎮 MY FIRST GAME</h1><p>Счёт: <span id=\"score\">0</span></p><button id=\"btn\" style=\"padding:14px 28px;font-size:18px;background:#6c5cff;color:#fff;border:none;border-radius:12px;cursor:pointer\">КЛИК!</button></div>";
  document.getElementById("pub-js").value="let s=0;document.getElementById('btn').onclick=()=>{s++;document.getElementById('score').textContent=s; if(s%10===0) document.body.style.filter=`hue-rotate(${s*3}deg)`}";
  document.getElementById("pub-css").value="body{margin:0;font-family:sans-serif}";
  updatePubPreview();
  toast("Демо загружено — жми Отправить на модерацию","info");
}

async function publishGame(){
  if(!currentUser) return openAuth();
  if(isBanned(currentUser)) return toast("Ты забанен, публикация запрещена ⛔","error");
  const title=document.getElementById("pub-title").value.trim();
  const desc=document.getElementById("pub-desc").value.trim();
  const cat=document.getElementById("pub-category").value;
  const tags=document.getElementById("pub-tags").value.split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
  const html=document.getElementById("pub-html").value.trim();
  const js=document.getElementById("pub-js").value;
  const css=document.getElementById("pub-css").value;
  const agree=document.getElementById("pub-agree").checked;
  if(!title||!desc||!html||!js) return toast("Заполни обязательные поля *","error");
  if(!pubLogoData) return toast("Загрузи логотип","error");
  if(!agree) return toast("Подтверди что игра твоя","error");
  if(title.length<3) return toast("Название слишком короткое","error");

  const game={
    id: uid("g"),
    title, description:desc, category:cat, tags,
    author: currentUser.username,
    authorId: currentUser.id,
    logo: pubLogoData,
    screenshots: [...pubShotsData],
    htmlCode: html,
    cssCode: css,
    jsCode: js,
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
  // reset
  document.getElementById("pub-title").value="";
  document.getElementById("pub-desc").value="";
  document.getElementById("pub-html").value="";
  document.getElementById("pub-js").value="";
  document.getElementById("pub-css").value="";
  pubLogoData=""; pubShotsData=[];
  document.getElementById("pub-logo-preview").classList.add("hidden");
  document.getElementById("pub-shots-preview").innerHTML="";
  renderAll();
  toast("Игра отправлена на модерацию! Ожидай проверки 🛡️","success");
  router("store");
}

function filteredGames(){
  let list = DB.games.filter(g=> g.status==="approved" || (isAdmin(currentUser) && g.status==="pending") || (currentUser && g.authorId===currentUser.id) );
  // for store we only show approved unless admin viewing pending elsewhere
  // But search/category filters for store view:
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

  // hero featured = most played
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

  // new grid - last 6
  const newGames = [...DB.games.filter(g=>g.status==="approved")].sort((a,b)=>b.createdAt-a.createdAt).slice(0,6);
  document.getElementById("new-grid").innerHTML = newGames.map(cardHtml).join("") || "<p class='muted'>Новинок пока нет</p>";

  document.getElementById("stat-games").textContent = DB.games.filter(g=>g.status==="approved").length;
  document.getElementById("stat-users").textContent = DB.users.length;
  document.getElementById("lib-count").textContent = currentUser ? getLibrary().length : 0;
  const pending = DB.games.filter(g=>g.status==="pending").length;
  document.getElementById("mod-count").textContent = pending;
  document.getElementById("admin-pending").textContent = pending;
  document.getElementById("mod-count").style.display = pending? "inline-block":"none";
}

function cardHtml(g){
  const liked = currentUser && g.likes.includes(currentUser.id);
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
        <span class="author"><img src="${DB.users.find(u=>u.id===g.authorId)?.avatar||'https://i.pravatar.cc/40'}" onerror="this.src='https://i.pravatar.cc/40'"> ${esc(g.author)} • ${g.category}</span>
        <span class="tag">${g.tags[0]||g.category}</span>
      </div>
    </div>
  </div>`;
}

function setCat(c){ currentCategory=c; renderStore(); }
function setSort(s){ currentSort=s; renderStore(); }
function onSearch(v){ currentSearch=v; renderStore(); }

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
  // increment plays view
  // don't spam increment - only on open detail? We'll increment on play
  document.getElementById("game-modal-content").innerHTML = `
    <div class="game-detail">
      <div class="game-detail-hero"><img src="${g.logo}"><div class="game-detail-overlay"><img class="logo" src="${g.logo}"><div><h2 style="font-family:Orbitron;font-size:20px">${esc(g.title)} <span class="badge ${g.status==="approved"?"badge-approved":g.status==="pending"?"badge-pending":"badge-rejected"}">${g.status}</span></h2><p class="muted" style="color:#cbd2ff">${esc(g.author)} • ${g.category} • <i class="fa-solid fa-eye"></i> ${g.plays} • <i class="fa-solid fa-heart"></i> ${g.likes.length}</p></div></div></div>
      <div class="game-detail-body">
        <p style="line-height:1.6">${esc(g.description)}</p>
        <div style="display:flex;gap:6px;margin:10px 0;flex-wrap:wrap">${g.tags.map(t=>`<span class="tag">#${esc(t)}</span>`).join("")}</div>
        ${g.screenshots.length?`<div class="screenshots">${g.screenshots.map(s=>`<img src="${s}">`).join("")}</div>`:""}
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
  // sandbox srcdoc
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;background:#000;color:#fff;overflow:auto}*{box-sizing:border-box} ${g.cssCode||""}</style></head><body>${g.htmlCode||""}<script>${g.jsCode||""}<\/script></body></html>`;
}

function playGame(id){
  const g=DB.games.find(x=>x.id===id);
  if(!g) return;
  if(g.status!=="approved" && !isAdmin(currentUser) && g.authorId!==currentUser?.id){
    return toast("Игра на модерации","error");
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
