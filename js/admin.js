function adminTab(which){
  document.querySelectorAll(".admin-tabs .tab").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(".admin-pane").forEach(p=>p.classList.remove("active"));
  const map={mod:0,users:1,games:2,stats:3};
  document.querySelectorAll(".admin-tabs .tab")[map[which]].classList.add("active");
  document.getElementById("admin-"+which).classList.add("active");
  if(which==="mod") renderAdminMod();
  if(which==="users") renderAdminUsers();
  if(which==="games") renderAdminGames();
  if(which==="stats") renderAdminStats();
}

function renderAdminMod(){
  if(!isAdmin(currentUser)){
    document.getElementById("admin-mod").innerHTML="<p class='muted'>Нет доступа</p>"; return;
  }
  const pend = DB.games.filter(g=>g.status==="pending").sort((a,b)=>a.createdAt-b.createdAt);
  if(!pend.length){
    document.getElementById("admin-mod").innerHTML=`<div class="empty"><i class="fa-solid fa-circle-check" style="color:var(--accent2)"></i><h3>Очередь пуста</h3><p>Все игры проверены. Отдохни, админ 👑</p></div>`;
    return;
  }
  document.getElementById("admin-mod").innerHTML = pend.map(g=>`
    <div class="admin-card">
      <img src="${g.logo}">
      <div class="grow">
        <b>${esc(g.title)}</b> <span class="tag">${g.category}</span> <span class="muted" style="font-size:11px">от ${esc(g.author)} • ${new Date(g.createdAt).toLocaleString()}</span>
        <p>${esc(g.description)}</p>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${g.tags.map(t=>`<span class="tag">#${t}</span>`).join("")}</div>
        ${g.archiveName?`<div class="muted small" style="margin-top:6px"><i class="fa-solid fa-file-zipper"></i> ${esc(g.archiveName)} (${esc(g.archiveExt||'zip')}) • ${g.fileList?g.fileList.length+' файлов':''} • вход: ${esc(g.archiveEntry||'—')} • ${(g.archiveSize? (g.archiveSize/1024).toFixed(1)+' KB' : '')}</div>`:''}
      </div>
      <div class="admin-actions">
        <button class="btn btn-ghost small" onclick="playGame('${g.id}')"><i class="fa-solid fa-vial"></i> Тест</button>
        <button class="btn btn-ghost small" onclick="openGame('${g.id}')"><i class="fa-solid fa-eye"></i> Открыть</button>
        <button class="btn btn-primary small" onclick="moderate('${g.id}','approved')"><i class="fa-solid fa-check"></i> Одобрить</button>
        <button class="btn btn-danger small" onclick="rejectPrompt('${g.id}')"><i class="fa-solid fa-xmark"></i> Отклонить</button>
      </div>
    </div>
  `).join("");
}

async function moderate(id, status){
  const g=DB.games.find(x=>x.id===id);
  if(!g) return;
  g.status=status;
  if(status==="rejected") g.rejectReason = g.rejectReason || "Отклонено модератором";
  await saveDB();
  toast(status==="approved" ? `Игра "${g.title}" одобрена ✅` : "Игра отклонена","success");
  renderAll();
  renderAdminMod();
}

function rejectPrompt(id){
  const reason = prompt("Причина отклонения:");
  if(reason===null) return;
  const g=DB.games.find(x=>x.id===id);
  g.rejectReason = reason || "Нарушение правил";
  moderate(id,"rejected");
}

function renderAdminUsers(){
  if(!isAdmin(currentUser)){ document.getElementById("admin-users").innerHTML="<p class='muted'>Нет доступа</p>"; return;}
  document.getElementById("admin-users").innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <input id="admin-user-search" placeholder="Поиск по нику/email..." style="flex:1;padding:10px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,.05);color:var(--text)" oninput="renderAdminUsersFiltered(this.value)">
      <span class="muted" style="align-self:center">${DB.users.length} игроков</span>
    </div>
    <div id="admin-users-list">${adminUsersHtml("")}</div>
  `;
}
function adminUsersHtml(q){
  const lower=q.toLowerCase();
  let list=DB.users;
  if(q) list=list.filter(u=>u.username.toLowerCase().includes(lower)||u.email.toLowerCase().includes(lower));
  return list.map(u=>{
    const banned=isBanned(u);
    return `
    <div class="user-row">
      <img src="${u.avatar}">
      <div class="grow">
        <b>${esc(u.username)} ${banned?`<span class="ban-badge">BAN ${banTimeLeft(u)}</span>`:''}</b> <span class="role ${u.role==="superadmin"?"role-superadmin":u.role==="admin"?"role-admin":"role-user"}" style="font-size:10px;padding:2px 6px;border-radius:99px">${u.role}</span>
        <div class="muted" style="font-size:11px">${esc(u.email)} • ${esc(u.bio||"")}</div>
      </div>
      <div class="admin-actions">
        ${u.id!==currentUser.id ? `
          ${u.role!=="admin" && u.role!=="superadmin" ? `<button class="btn btn-primary small" onclick="setRole('${u.id}','admin')"><i class="fa-solid fa-crown"></i> Дать админку</button>` : ''}
          ${u.role==="admin" ? `<button class="btn btn-ghost small" onclick="setRole('${u.id}','user')"><i class="fa-solid fa-user-minus"></i> Забрать</button>` : ''}
          ${u.role!=="superadmin" ? `<button class="btn ${banned?'btn-primary':'btn-danger'} small" onclick="${banned?`unban('${u.id}')`:`banPrompt('${u.id}')`}"><i class="fa-solid fa-ban"></i> ${banned?'Разбанить':'Бан'}</button>` : '<span class="muted small">👑 superadmin</span>'}
        ` : '<span class="muted small">это ты</span>'}
        <button class="btn btn-ghost small" onclick="openProfile('${u.id}')"><i class="fa-solid fa-eye"></i></button>
      </div>
    </div>
  `}).join("");
}
function renderAdminUsersFiltered(q){
  document.getElementById("admin-users-list").innerHTML = adminUsersHtml(q);
}

async function setRole(userId, role){
  if(!isAdmin(currentUser)) return toast("Нет прав","error");
  const u=DB.users.find(x=>x.id===userId);
  if(!u) return;
  if(u.role==="superadmin" && currentUser.role!=="superadmin") return toast("Нельзя трогать суперадмина","error");
  if(u.username===CONFIG.SUPERADMIN) return toast("cursed_dev всегда superadmin 👑","error");
  // only superadmin can give admin? But spec says all admins can — allow
  u.role=role;
  await saveDB();
  toast(`${u.username} теперь ${role}`,"success");
  renderAdminUsers();
  renderUserArea();
}

function banPrompt(userId){
  const u=DB.users.find(x=>x.id===userId);
  if(u.role==="superadmin") return toast("Суперадмина нельзя банить","error");
  const hoursStr = prompt(`На сколько забанить ${u.username}?\nВведи: 1h / 24h / 7d / 30d / 1y\n(или число часов)`, "24h");
  if(hoursStr===null) return;
  let hours=24;
  if(hoursStr.endsWith("h")) hours=parseFloat(hoursStr);
  else if(hoursStr.endsWith("d")) hours=parseFloat(hoursStr)*24;
  else if(hoursStr.endsWith("y")) hours=parseFloat(hoursStr)*24*365;
  else hours=parseFloat(hoursStr)||24;
  const reason = prompt("Причина бана:", "нарушение правил");
  if(reason===null) return;
  u.bannedUntil = Date.now() + hours*3600000;
  u.banReason = reason;
  saveDB();
  toast(`${u.username} забанен на ${hours}ч`,"success");
  renderAdminUsers();
}
async function unban(userId){
  const u=DB.users.find(x=>x.id===userId);
  u.bannedUntil=null; u.banReason="";
  await saveDB();
  toast(`${u.username} разбанен`,"success");
  renderAdminUsers();
}

function renderAdminGames(){
  if(!isAdmin(currentUser)) return;
  const all=[...DB.games].sort((a,b)=>b.createdAt-a.createdAt);
  document.getElementById("admin-games").innerHTML = all.map(g=>`
    <div class="admin-card">
      <img src="${g.logo}">
      <div class="grow"><b>${esc(g.title)}</b> <span class="badge ${g.status==="approved"?"badge-approved":g.status==="pending"?"badge-pending":"badge-rejected"}">${g.status}</span><p>${esc(g.description)}</p><span class="muted" style="font-size:11px">${g.category} • ${g.plays} plays • ${g.likes.length} likes • ${esc(g.author)} ${g.archiveName?`• <i class="fa-solid fa-file-zipper"></i> ${esc(g.archiveName)}`:''}</span></div>
      <div class="admin-actions">
        <button class="btn btn-ghost small" onclick="openGame('${g.id}')"><i class="fa-solid fa-eye"></i></button>
        <button class="btn btn-ghost small" onclick="playGame('${g.id}')"><i class="fa-solid fa-play"></i></button>
        ${g.status!=="approved"?`<button class="btn btn-primary small" onclick="moderate('${g.id}','approved')"><i class="fa-solid fa-check"></i></button>`:''}
        ${g.status!=="rejected"?`<button class="btn btn-danger small" onclick="rejectPrompt('${g.id}')"><i class="fa-solid fa-xmark"></i></button>`:''}
        <button class="btn btn-danger small" onclick="deleteGame('${g.id}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `).join("") || "<p class='muted'>Нет игр</p>";
}
async function deleteGame(id){
  if(!confirm("Удалить игру навсегда?")) return;
  DB.games = DB.games.filter(g=>g.id!==id);
  await saveDB();
  toast("Игра удалена","success");
  renderAll();
  renderAdminGames();
}

function renderAdminStats(){
  const approved=DB.games.filter(g=>g.status==="approved").length;
  const pending=DB.games.filter(g=>g.status==="pending").length;
  const totalPlays=DB.games.reduce((a,g)=>a+g.plays,0);
  const totalLikes=DB.games.reduce((a,g)=>a+g.likes.length,0);
  const top= [...DB.games].sort((a,b)=>b.plays-a.plays).slice(0,3);
  document.getElementById("admin-stats").innerHTML=`
    <div class="stat-grid">
      <div class="stat"><b>${DB.users.length}</b><span>Игроков</span></div>
      <div class="stat"><b>${DB.games.length}</b><span>Всего игр</span></div>
      <div class="stat"><b>${approved}</b><span>Одобрено</span></div>
      <div class="stat"><b>${pending}</b><span>На модерации</span></div>
      <div class="stat"><b>${totalPlays}</b><span>Запусков</span></div>
      <div class="stat"><b>${totalLikes}</b><span>Лайков</span></div>
    </div>
    <div class="card">
      <h3><i class="fa-solid fa-trophy"></i> Топ игр</h3>
      <div style="margin-top:10px;display:grid;gap:8px">
        ${top.map((g,i)=>`<div style="display:flex;align-items:center;gap:10px"><span style="font-family:Orbitron;font-weight:900;color:var(--accent)">#${i+1}</span><img src="${g.logo}" style="width:40px;height:40px;border-radius:8px;object-fit:cover"><b>${esc(g.title)}</b><span class="muted" style="margin-left:auto">${g.plays} plays</span></div>`).join("")}
      </div>
    </div>
    <div class="card" style="margin-top:12px">
      <h3>JSONbin статус</h3>
      <p class="muted" style="margin-top:6px">Bin: <code>${CONFIG.JSONBIN_BIN_ID}</code> • Автосохранение включено • Локальный кэш + облако</p>
      <button class="btn btn-primary small" style="margin-top:8px" onclick="saveDB(true).then(()=>toast('Синхронизировано с JSONbin','success'))"><i class="fa-solid fa-cloud-arrow-up"></i> Синхронизировать сейчас</button>
      <button class="btn btn-ghost small" onclick="if(confirm('Сбросить к дефолту?')){localStorage.clear();location.reload()}"><i class="fa-solid fa-rotate"></i> Сбросить</button>
    </div>
  `;
}
