let currentUser = null;

function initAuth(){
  const saved = localStorage.getItem("flux_user");
  if(saved){
    try{
      const u = JSON.parse(saved);
      // re-validate against DB
      const real = DB.users.find(x=>x.id===u.id);
      if(real && !isBanned(real)){
        currentUser = real;
      } else {
        localStorage.removeItem("flux_user");
      }
    }catch{}
  }
  renderUserArea();
}

function isBanned(user){
  if(!user.bannedUntil) return false;
  return Date.now() < user.bannedUntil;
}
function banTimeLeft(user){
  if(!user.bannedUntil) return "";
  const diff = user.bannedUntil - Date.now();
  if(diff<=0) return "";
  const h = Math.floor(diff/3600000);
  const m = Math.floor((diff%3600000)/60000);
  if(h>24) return Math.floor(h/24)+"д";
  if(h>0) return h+"ч "+m+"м";
  return m+"м";
}
function isAdmin(user){ return user && (user.role==="admin" || user.role==="superadmin"); }
function isSuper(user){ return user && user.role==="superadmin"; }

function hashPass(p){ // simple demo hash
  return btoa(p).slice(0,32);
}

function renderUserArea(){
  const el = document.getElementById("user-area");
  const adminBtn = document.getElementById("nav-admin");
  if(!currentUser){
    adminBtn.classList.add("hidden");
    el.innerHTML = `<button class="btn-login" onclick="openAuth()"><i class="fa-solid fa-right-to-bracket"></i> Войти</button>`;
    return;
  }
  // show admin button if admin
  if(isAdmin(currentUser)) adminBtn.classList.remove("hidden");
  else adminBtn.classList.add("hidden");

  const roleClass = currentUser.role==="superadmin"?"role-superadmin":currentUser.role==="admin"?"role-admin":"role-user";
  const roleLabel = currentUser.role==="superadmin"?"SUPERADMIN":currentUser.role==="admin"?"ADMIN":"PLAYER";
  el.innerHTML = `
    <div class="user-chip" onclick="openProfile('${currentUser.id}')">
      <img src="${currentUser.avatar}" onerror="this.src='https://i.pravatar.cc/200?u=${currentUser.username}'">
      <div style="line-height:1">
        <b>${currentUser.username}</b><br>
        <span class="role ${roleClass}">${roleLabel}</span>
      </div>
      <i class="fa-solid fa-chevron-down" style="font-size:11px;color:var(--muted)"></i>
    </div>
    <button class="btn btn-ghost small" onclick="logout()" title="Выйти"><i class="fa-solid fa-right-from-bracket"></i></button>
  `;
}

function openAuth(tab="login"){
  document.getElementById("auth-modal").classList.add("open");
  switchAuth(tab);
}
function closeAuth(){ document.getElementById("auth-modal").classList.remove("open"); }
function switchAuth(which){
  document.getElementById("tab-login").classList.toggle("active", which==="login");
  document.getElementById("tab-reg").classList.toggle("active", which==="reg");
  document.getElementById("auth-login").classList.toggle("active", which==="login");
  document.getElementById("auth-reg").classList.toggle("active", which==="reg");
}

async function doLogin(){
  const user = document.getElementById("login-user").value.trim();
  const pass = document.getElementById("login-pass").value;
  if(!user||!pass) return toast("Заполни все поля","error");
  const found = DB.users.find(u=> (u.username===user || u.email===user) && u.password===pass);
  if(!found) return toast("Неверный ник/email или пароль","error");
  if(isBanned(found)){
    return toast(`Ты забанен ещё ${banTimeLeft(found)} ⛔ Причина: ${found.banReason||'нарушение правил'}`,"error");
  }
  currentUser = found;
  localStorage.setItem("flux_user", JSON.stringify(currentUser));
  closeAuth();
  renderUserArea();
  renderAll();
  toast(`Привет, ${currentUser.username}! 👋`,"success");
}

async function doRegister(){
  const u = document.getElementById("reg-user").value.trim();
  const e = document.getElementById("reg-email").value.trim();
  const p = document.getElementById("reg-pass").value;
  const p2 = document.getElementById("reg-pass2").value;
  if(!u||!e||!p) return toast("Заполни все поля","error");
  if(u.length<3) return toast("Ник минимум 3 символа","error");
  if(p.length<6) return toast("Пароль минимум 6 символов","error");
  if(p!==p2) return toast("Пароли не совпадают","error");
  if(DB.users.some(x=>x.username.toLowerCase()===u.toLowerCase())) return toast("Ник уже занят","error");
  if(DB.users.some(x=>x.email.toLowerCase()===e.toLowerCase())) return toast("Email уже используется","error");
  // cursed_dev is reserved superadmin
  if(u.toLowerCase()==="cursed_dev") return toast("Этот ник зарезервирован 👑","error");

  const newUser = {
    id: uid("u"),
    username: u,
    email: e,
    password: p,
    avatar: `https://i.pravatar.cc/200?u=${encodeURIComponent(u)}`,
    role: "user",
    bannedUntil: null,
    createdAt: Date.now(),
    bio: "Новый игрок FluxHub 🎮"
  };
  DB.users.push(newUser);
  await saveDB();
  currentUser = newUser;
  localStorage.setItem("flux_user", JSON.stringify(currentUser));
  closeAuth();
  renderUserArea();
  renderAll();
  toast("Аккаунт создан! Добро пожаловать в FluxHub 🚀","success");
}

function logout(){
  currentUser=null;
  localStorage.removeItem("flux_user");
  renderUserArea();
  renderAll();
  toast("Ты вышел из аккаунта","info");
  router("store");
}

function openProfile(userId){
  const u = DB.users.find(x=>x.id===userId) || currentUser;
  if(!u) return;
  const isMe = currentUser && currentUser.id===u.id;
  const games = DB.games.filter(g=>g.authorId===u.id && g.status==="approved");
  document.getElementById("profile-card").innerHTML = `
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <img src="${u.avatar}" style="width:80px;height:80px;border-radius:50%;border:3px solid var(--primary)">
      <div>
        <h2 style="font-family:Orbitron;display:flex;align-items:center;gap:8px">${u.username} ${u.role==="superadmin"?'<span class="badge" style="background:linear-gradient(135deg,#ff2e63,#ff8a00);color:#fff">SUPERADMIN</span>':u.role==="admin"?'<span class="badge" style="background:var(--primary);color:#fff">ADMIN</span>':''} ${isBanned(u)?'<span class="ban-badge">BAN '+banTimeLeft(u)+'</span>':''}</h2>
        <p class="muted">${u.bio||""} • На платформе с ${new Date(u.createdAt).toLocaleDateString()}</p>
        <p class="muted">Игр опубликовано: ${games.length} • Лайков: ${games.reduce((a,g)=>a+g.likes.length,0)}</p>
      </div>
      ${isMe?`<button class="btn btn-ghost small" onclick="editProfile()"><i class="fa-solid fa-pen"></i> Редактировать</button>`:''}
    </div>
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
      ${games.map(g=>`<div class="game-card" style="width:180px" onclick="openGame('${g.id}')"><div class="thumb" style="height:100px"><img src="${g.logo}"></div><div class="info"><b>${g.title}</b></div></div>`).join("") || '<p class="muted">Пока нет опубликованных игр</p>'}
    </div>
  `;
  router("profile");
}

function editProfile(){
  const bio = prompt("Новый статус / био:", currentUser.bio||"");
  if(bio===null) return;
  currentUser.bio = bio.slice(0,120);
  const idx = DB.users.findIndex(x=>x.id===currentUser.id);
  DB.users[idx]=currentUser;
  saveDB();
  localStorage.setItem("flux_user", JSON.stringify(currentUser));
  openProfile(currentUser.id);
  toast("Профиль обновлён","success");
}
