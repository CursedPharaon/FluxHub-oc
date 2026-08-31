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
  await saveDB(true);
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
      <div class="avatar-wrap ${isMe?'avatar-clickable':''}" style="position:relative;width:80px;height:80px;flex-shrink:0" ${isMe?`onclick="triggerAvatarPicker()" title="Нажми чтобы сменить аватарку"`:""}>
        <img src="${u.avatar}" style="width:80px;height:80px;border-radius:50%;border:3px solid var(--primary);object-fit:cover;${isMe?'cursor:pointer':''}" onerror="this.src='https://i.pravatar.cc/200?u=${u.username}'" ${isMe?'title="Сменить аватарку — кликни по фото"':''}>
        ${isMe?`<button title="Сменить аватарку" onclick="event.stopPropagation();triggerAvatarPicker()" style="position:absolute;bottom:0;right:0;width:28px;height:28px;border-radius:50%;background:var(--primary);border:2px solid var(--bg);color:#fff;display:grid;place-items:center;cursor:pointer;z-index:2"><i class="fa-solid fa-camera" style="font-size:12px"></i></button><div class="avatar-overlay"><i class="fa-solid fa-camera"></i><span>Сменить</span></div>`:''}
      </div>
      <div>
        <h2 style="font-family:Orbitron;display:flex;align-items:center;gap:8px">${u.username} ${u.role==="superadmin"?'<span class="badge" style="background:linear-gradient(135deg,#ff2e63,#ff8a00);color:#fff">SUPERADMIN</span>':u.role==="admin"?'<span class="badge" style="background:var(--primary);color:#fff">ADMIN</span>':''} ${isBanned(u)?'<span class="ban-badge">BAN '+banTimeLeft(u)+'</span>':''}</h2>
        <p class="muted">${u.bio||""} • На платформе с ${new Date(u.createdAt).toLocaleDateString()}</p>
        <p class="muted">Игр опубликовано: ${games.length} • Лайков: ${games.reduce((a,g)=>a+g.likes.length,0)}</p>
      </div>
      ${isMe?`<div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost small" onclick="editProfile()"><i class="fa-solid fa-pen"></i> Редактировать био</button>
        <button class="btn btn-primary small" onclick="triggerAvatarPicker()"><i class="fa-solid fa-image"></i> Сменить аватарку</button>
        <input type="file" id="avatar-input" accept=".png,.jpg,.jpeg,image/png,image/jpeg" class="hidden" onchange="handleAvatarChange(this)">
      </div>`:''}
    </div>
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
      ${games.map(g=>`<div class="game-card" style="width:180px" onclick="openGame('${g.id}')"><div class="thumb" style="height:100px"><img src="${g.logo}"></div><div class="info"><b>${g.title}</b></div></div>`).join("") || '<p class="muted">Пока нет опубликованных игр</p>'}
    </div>
  `;
  router("profile");
}

function triggerAvatarPicker(){
  const inp = document.getElementById('avatar-input');
  if(inp){
    inp.click();
  } else {
    // fallback: create temporary input if profile not rendered (desktop explorer / mobile gallery)
    if(!currentUser) return toast("Войди чтобы сменить аватарку","error");
    const tmp = document.createElement('input');
    tmp.type='file';
    tmp.accept='.png,.jpg,.jpeg,image/png,image/jpeg';
    tmp.style.display='none';
    tmp.onchange = ()=> handleAvatarChange(tmp);
    document.body.appendChild(tmp);
    tmp.click();
    setTimeout(()=> tmp.remove(), 60000);
  }
}

function handleAvatarChange(input){
  const f = input.files && input.files[0];
  if(!f) return;
  if(!currentUser) return toast("Войди чтобы сменить аватарку","error");
  // strictly PNG/JPEG as requested; allow detection by MIME or file extension fallback (mobile may give empty MIME)
  const allowedTypes = ["image/png","image/jpeg","image/jpg"];
  const ext = f.name ? f.name.split(".").pop().toLowerCase() : "";
  const allowedExts = ["png","jpg","jpeg"];
  const typeOk = f.type ? allowedTypes.includes(f.type.toLowerCase()) : false;
  const extOk = allowedExts.includes(ext);
  const isValidType = typeOk || extOk;
  if(!isValidType) {
    toast("Выбери PNG или JPEG файл","error");
    input.value="";
    return;
  }
  if(f.size>2*1024*1024) {
    toast("Аватарка >2MB — выбери файл поменьше","error");
    input.value="";
    return;
  }
  const r = new FileReader();
  r.onerror = ()=>{
    toast("Ошибка чтения файла","error");
    input.value="";
  };
  r.onload = async e=>{
    const dataUrl = e.target.result;
    if(typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')){
      toast("Файл не является изображением","error");
      input.value="";
      return;
    }
    if(!dataUrl.startsWith('data:image/png') && !dataUrl.startsWith('data:image/jpeg')){
      toast("Выбери PNG или JPEG файл","error");
      input.value="";
      return;
    }
    // validate image loads
    const img = new Image();
    img.onload = async ()=>{
      currentUser.avatar = dataUrl;
      const idx = DB.users.findIndex(x=>x.id===currentUser.id);
      if(idx>=0) DB.users[idx].avatar = dataUrl;
      localStorage.setItem("flux_user", JSON.stringify(currentUser));
      try{
        await saveDB(true);
      }catch(err){
        console.warn("saveDB avatar error", err);
      }
      renderUserArea();
      openProfile(currentUser.id);
      toast("Аватарка обновлена ✨","success");
      input.value="";
    };
    img.onerror = ()=>{
      toast("Не удалось прочитать изображение","error");
      input.value="";
    };
    img.src = dataUrl;
  };
  r.readAsDataURL(f);
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
