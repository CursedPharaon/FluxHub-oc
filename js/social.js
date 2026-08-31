// FluxHub Social — друзья, запросы, чаты, приватность
if(typeof esc==="undefined"){ var esc = s=> String(s).replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function getUserById(id){ return DB.users.find(u=>u.id===id); }
function ensureCurrentUser(){ if(!currentUser) { toast("Войди чтобы продолжить","error"); openAuth(); return false;} return true; }

// ===== privacy helpers =====
function canViewFriends(viewerId, targetUser){
  if(!targetUser) return false;
  if(viewerId && viewerId===targetUser.id) return true;
  const v = targetUser.privacy?.friendsVisibility || "all";
  if(v==="all") return true;
  if(v==="none") return false;
  if(v==="friends") {
    if(!viewerId) return false;
    const viewer = getUserById(viewerId);
    if(!viewer) return false;
    return targetUser.friends?.includes(viewerId) || viewer.friends?.includes(targetUser.id);
  }
  return true;
}
function canViewGames(viewerId, targetUser){
  if(!targetUser) return false;
  if(viewerId && viewerId===targetUser.id) return true;
  const v = targetUser.privacy?.gamesVisibility || "all";
  if(v==="all") return true;
  if(v==="none") return false;
  if(v==="friends") {
    if(!viewerId) return false;
    return targetUser.friends?.includes(viewerId);
  }
  return true;
}
function privacyLabel(v){
  if(v==="all") return "Все";
  if(v==="friends") return "Только друзья";
  if(v==="none") return "Никто";
  return v;
}

// ===== friendship =====
function areFriends(aId,bId){
  const a=getUserById(aId); if(!a) return false; return a.friends.includes(bId);
}
function hasIncoming(userId, fromId){
  const u=getUserById(userId); return u && u.friendRequestsIncoming.includes(fromId);
}
function hasOutgoing(userId, toId){
  const u=getUserById(userId); return u && u.friendRequestsOutgoing.includes(toId);
}

async function sendFriendRequest(toId){
  if(!ensureCurrentUser()) return;
  if(toId===currentUser.id) return toast("Нельзя добавить себя","error");
  const target=getUserById(toId);
  if(!target) return toast("Пользователь не найден","error");
  if(areFriends(currentUser.id,toId)) return toast("Уже друзья","info");
  if(hasOutgoing(currentUser.id,toId)) return toast("Заявка уже отправлена","info");
  if(hasIncoming(currentUser.id,toId)){
    // auto accept if opposite request exists
    return acceptFriendRequest(toId);
  }
  // privacy: if target privacy friendsVisibility none? still allow? Let's allow.
  currentUser.friendRequestsOutgoing.push(toId);
  target.friendRequestsIncoming.push(currentUser.id);
  // dedup
  currentUser.friendRequestsOutgoing=[...new Set(currentUser.friendRequestsOutgoing)];
  target.friendRequestsIncoming=[...new Set(target.friendRequestsIncoming)];
  await saveDB();
  renderAllSocial();
  if(target.settings?.notifyFriendRequest) toast(`Заявка отправлена ${target.username} 👋`,"success");
  else toast("Заявка отправлена","success");
}

async function cancelFriendRequest(toId){
  if(!ensureCurrentUser()) return;
  const target=getUserById(toId);
  if(!target) return;
  currentUser.friendRequestsOutgoing=currentUser.friendRequestsOutgoing.filter(id=>id!==toId);
  target.friendRequestsIncoming=target.friendRequestsIncoming.filter(id=>id!==currentUser.id);
  await saveDB();
  renderAllSocial();
  toast("Заявка отменена","info");
}

async function acceptFriendRequest(fromId){
  if(!ensureCurrentUser()) return;
  const fromUser=getUserById(fromId);
  if(!fromUser) return toast("Пользователь не найден","error");
  if(!hasIncoming(currentUser.id,fromId)) return toast("Заявки нет","error");
  // remove requests
  currentUser.friendRequestsIncoming=currentUser.friendRequestsIncoming.filter(id=>id!==fromId);
  fromUser.friendRequestsOutgoing=fromUser.friendRequestsOutgoing.filter(id=>id!==currentUser.id);
  // also clean opposite direction if any
  currentUser.friendRequestsOutgoing=currentUser.friendRequestsOutgoing.filter(id=>id!==fromId);
  fromUser.friendRequestsIncoming=fromUser.friendRequestsIncoming.filter(id=>id!==currentUser.id);
  // add friends both sides
  if(!currentUser.friends.includes(fromId)) currentUser.friends.push(fromId);
  if(!fromUser.friends.includes(currentUser.id)) fromUser.friends.push(currentUser.id);
  // ensure chats not needed
  await saveDB();
  renderAllSocial();
  toast(`Вы теперь друзья с ${fromUser.username} 🎉`,"success");
}

async function declineFriendRequest(fromId){
  if(!ensureCurrentUser()) return;
  const fromUser=getUserById(fromId);
  if(!fromUser) return;
  currentUser.friendRequestsIncoming=currentUser.friendRequestsIncoming.filter(id=>id!==fromId);
  fromUser.friendRequestsOutgoing=fromUser.friendRequestsOutgoing.filter(id=>id!==currentUser.id);
  await saveDB();
  renderAllSocial();
  toast("Заявка отклонена","info");
}

async function removeFriend(friendId){
  if(!ensureCurrentUser()) return;
  if(!confirm("Удалить из друзей?")) return;
  const friend=getUserById(friendId);
  currentUser.friends=currentUser.friends.filter(id=>id!==friendId);
  if(friend) friend.friends=friend.friends.filter(id=>id!==currentUser.id);
  // also remove chat? keep history but maybe keep
  await saveDB();
  renderAllSocial();
  toast(friend?`${friend.username} удалён из друзей`:"Удалён","info");
}

// ===== chats =====
function getChatId(a,b){ return [a,b].sort().join("__"); }
function getChat(a,b){
  const id=getChatId(a,b);
  return DB.chats.find(c=>c.id===id);
}
function getOrCreateChat(a,b){
  const id=getChatId(a,b);
  let chat=DB.chats.find(c=>c.id===id);
  if(!chat){
    chat={ id, participants:[a,b].sort(), messages:[] };
    DB.chats.push(chat);
  }
  return chat;
}
function getChatsForUser(userId){
  return DB.chats.filter(c=>c.participants.includes(userId)).sort((a,b)=>{
    const aLast = a.messages.length? a.messages[a.messages.length-1].at : a.createdAt||0;
    const bLast = b.messages.length? b.messages[b.messages.length-1].at : b.createdAt||0;
    return bLast - aLast;
  });
}
function getUnreadCount(userId){
  let cnt=0;
  DB.chats.forEach(c=>{
    if(!c.participants.includes(userId)) return;
    c.messages.forEach(m=>{
      if(m.senderId!==userId && !m.readBy?.includes(userId)) cnt++;
    });
  });
  return cnt;
}
function getChatUnread(chat, userId){
  return chat.messages.filter(m=> m.senderId!==userId && !m.readBy?.includes(userId)).length;
}
async function sendMessage(toId, text){
  if(!ensureCurrentUser()) return;
  if(!areFriends(currentUser.id,toId)) return toast("Можно писать только друзьям","error");
  text=text.trim();
  if(!text) return;
  if(text.length>2000) return toast("Сообщение слишком длинное","error");
  const chat=getOrCreateChat(currentUser.id,toId);
  const msg={ id:uid("m"), senderId:currentUser.id, text: text.slice(0,2000), at:Date.now(), readBy:[currentUser.id] };
  chat.messages.push(msg);
  // limit messages per chat to 500
  if(chat.messages.length>500) chat.messages=chat.messages.slice(-500);
  await saveDB();
  // render if chat open
  if(currentChatId===chat.id) renderChatMessages(chat.id);
  renderAllSocial();
  // sound/toast if recipient online? just update
}

async function markChatRead(chatId){
  if(!currentUser) return;
  const chat=DB.chats.find(c=>c.id===chatId);
  if(!chat) return;
  let changed=false;
  chat.messages.forEach(m=>{
    if(m.senderId!==currentUser.id){
      if(!m.readBy) m.readBy=[m.senderId];
      if(!m.readBy.includes(currentUser.id)){ m.readBy.push(currentUser.id); changed=true; }
    }
  });
  if(changed) await saveDB();
}

let currentChatId = null;

function openChatWith(userId){
  if(!ensureCurrentUser()) return;
  if(!areFriends(currentUser.id,userId)){
    // if not friends, maybe still show profile with add button? But chats only friends
    return toast("Сначала станьте друзьями чтобы чатиться","info");
  }
  const chat=getOrCreateChat(currentUser.id,userId);
  currentChatId=chat.id;
  router("chat");
  // render will pick up currentChatId
  setTimeout(()=>{ renderChat(); renderChatMessages(chat.id); markChatRead(chat.id).then(()=>renderAllSocial()); }, 50);
}

function renderAllSocial(){
  updateSocialBadges();
  // re-render current views
  if(document.getElementById("view-friends")?.classList.contains("active")) renderFriends();
  if(document.getElementById("view-chat")?.classList.contains("active")) renderChat();
  if(document.getElementById("view-profile")?.classList.contains("active") && window._lastProfileId){
    openProfile(window._lastProfileId);
  }
  // profile card friends section already rendered via openProfile
}

function updateSocialBadges(){
  if(!currentUser){
    const fc=document.getElementById("friends-count");
    const cc=document.getElementById("chat-count");
    if(fc){ fc.textContent="0"; fc.classList.add("hidden"); }
    if(cc){ cc.textContent="0"; cc.classList.add("hidden"); }
    return;
  }
  const incoming = currentUser.friendRequestsIncoming?.length||0;
  const unread = getUnreadCount(currentUser.id);
  const fc=document.getElementById("friends-count");
  if(fc){
    if(incoming>0){ fc.textContent=incoming; fc.classList.remove("hidden"); }
    else { fc.classList.add("hidden"); }
  }
  const cc=document.getElementById("chat-count");
  if(cc){
    if(unread>0){ cc.textContent=unread>99?"99+":unread; cc.classList.remove("hidden"); fc?.classList; }
    else cc.classList.add("hidden");
  }
  // also update title?
}

// ===== RENDER FRIENDS VIEW =====
function renderFriends(){
  const el=document.getElementById("view-friends");
  if(!el) return;
  if(!currentUser){
    el.innerHTML=`<div class="card empty"><i class="fa-solid fa-lock"></i><h3>Войди чтобы видеть друзей</h3><button class="btn btn-primary" onclick="openAuth()">Войти</button></div>`;
    return;
  }
  const tab = window._friendsTab || "friends";
  const searchQ = (document.getElementById("friends-search")?.value || "").toLowerCase();
  // counts
  const friendsCount = currentUser.friends.length;
  const incCount = currentUser.friendRequestsIncoming.length;
  const outCount = currentUser.friendRequestsOutgoing.length;

  // all users search for adding
  let addList = [];
  if(searchQ){
    addList = DB.users.filter(u=> u.id!==currentUser.id && !areFriends(currentUser.id,u.id) && !hasOutgoing(currentUser.id,u.id) && !hasIncoming(currentUser.id,u.id))
      .filter(u=> u.username.toLowerCase().includes(searchQ) || u.email.toLowerCase().includes(searchQ))
      .slice(0,20);
  }

  let content="";
  if(tab==="friends"){
    const friends = currentUser.friends.map(id=>getUserById(id)).filter(Boolean);
    const filtered = searchQ ? friends.filter(u=> u.username.toLowerCase().includes(searchQ) || u.email.toLowerCase().includes(searchQ)) : friends;
    if(!filtered.length){
      content = `<div class="empty"><i class="fa-solid fa-user-group"></i><h3>${searchQ? "Ничего не найдено":"Друзей пока нет"}</h3><p>${searchQ? "Попробуй другой запрос":"Найди друзей через поиск ниже — добавляй игроков и чаться"}</p></div>`;
    } else {
      content = `<div class="friends-grid">${filtered.map(u=> friendCard(u, "friend")).join("")}</div>`;
    }
  } else if(tab==="requests"){
    const inc = currentUser.friendRequestsIncoming.map(id=>getUserById(id)).filter(Boolean);
    const out = currentUser.friendRequestsOutgoing.map(id=>getUserById(id)).filter(Boolean);
    if(!inc.length && !out.length){
      content = `<div class="empty"><i class="fa-solid fa-inbox"></i><h3>Заявок нет</h3><p>Когда кто-то отправит заявку — она появится здесь</p></div>`;
    } else {
      content = "";
      if(inc.length){
        content+=`<h3 style="margin:12px 0 8px;font-family:Orbitron;font-size:14px"><i class="fa-solid fa-arrow-down"></i> Входящие • ${inc.length}</h3><div class="friends-grid">${inc.map(u=> friendCard(u,"incoming")).join("")}</div>`;
      }
      if(out.length){
        content+=`<h3 style="margin:12px 0 8px;font-family:Orbitron;font-size:14px"><i class="fa-solid fa-arrow-up"></i> Исходящие • ${out.length}</h3><div class="friends-grid">${out.map(u=> friendCard(u,"outgoing")).join("")}</div>`;
      }
    }
  } else if(tab==="find"){
    const all = DB.users.filter(u=> u.id!==currentUser.id).filter(u=> !searchQ || u.username.toLowerCase().includes(searchQ) || u.email.toLowerCase().includes(searchQ)).slice(0,30);
    // prioritize non-friends
    content = `<div class="friends-grid">${all.map(u=>{
      if(areFriends(currentUser.id,u.id)) return friendCard(u,"friend");
      if(hasIncoming(currentUser.id,u.id)) return friendCard(u,"incoming");
      if(hasOutgoing(currentUser.id,u.id)) return friendCard(u,"outgoing");
      return friendCard(u,"stranger");
    }).join("") || "<p class='muted'>Пользователи не найдены</p>"}</div>`;
    if(addList.length && searchQ){
      // addList already handled in main? Actually we show all, so fine
    }
  }

  el.innerHTML=`
    <div class="section-head">
      <h2><i class="fa-solid fa-user-group"></i> Друзья</h2>
      <span class="muted" style="font-size:13px">${friendsCount} друзей • ${incCount} заявок</span>
    </div>
    <div class="card" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <div class="search-box" style="flex:1;min-width:200px">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input id="friends-search" placeholder="Поиск по нику или email..." value="${esc(searchQ)}" oninput="renderFriends()">
      </div>
      <div class="tabs" style="margin-left:auto">
        <button class="tab-cat ${tab==="friends"?"active":""}" onclick="setFriendsTab('friends')"><i class="fa-solid fa-heart"></i> Мои друзья ${friendsCount?`<span class="count">${friendsCount}</span>`:""}</button>
        <button class="tab-cat ${tab==="requests"?"active":""}" onclick="setFriendsTab('requests')"><i class="fa-solid fa-envelope"></i> Заявки ${incCount?`<span class="count warn">${incCount}</span>`:""}</button>
        <button class="tab-cat ${tab==="find"?"active":""}" onclick="setFriendsTab('find')"><i class="fa-solid fa-search"></i> Найти</button>
      </div>
    </div>
    <div style="margin-top:16px">${content}</div>
  `;
  // focus search
  const inp=el.querySelector("#friends-search");
  if(inp) { const v=inp.value; inp.focus(); inp.setSelectionRange(v.length,v.length); }
}

function setFriendsTab(t){ window._friendsTab=t; renderFriends(); }

function friendCard(u, mode){
  const isFriend = mode==="friend";
  const isIncoming = mode==="incoming";
  const isOutgoing = mode==="outgoing";
  const isStranger = mode==="stranger";
  const roleClass = u.role==="superadmin"?"role-superadmin":u.role==="admin"?"role-admin":"role-user";
  const roleLabel = u.role==="superadmin"?"SUPERADMIN":u.role==="admin"?"ADMIN":"PLAYER";
  const statusDot = u.settings?.showOnline ? `<span title="онлайн" style="width:10px;height:10px;border-radius:50%;background:var(--accent2);border:2px solid var(--card);position:absolute;bottom:0;right:0"></span>` : "";
  return `
  <div class="friend-card card">
    <div style="display:flex;gap:12px;align-items:center">
      <div style="position:relative;flex-shrink:0">
        <img src="${u.avatar}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid var(--border)" onerror="this.src='https://i.pravatar.cc/200?u=${u.username}'">
        ${statusDot}
      </div>
      <div style="flex:1;min-width:0">
        <b style="display:flex;gap:6px;align-items:center">${esc(u.username)} <span class="role ${roleClass}" style="font-size:9px;padding:2px 6px;border-radius:99px">${roleLabel}</span></b>
        <div class="muted" style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(u.bio||"")}</div>
        <div class="muted" style="font-size:11px">${u.friends?.length||0} друзей • ${DB.games.filter(g=>g.authorId===u.id && g.status==="approved").length} игр</div>
      </div>
    </div>
    <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
      <button class="btn btn-ghost small" onclick="openProfile('${u.id}')"><i class="fa-solid fa-eye"></i> Профиль</button>
      ${isFriend ? `
        <button class="btn btn-primary small" onclick="openChatWith('${u.id}')"><i class="fa-solid fa-comments"></i> Чат ${(() => { const ch=getChat(currentUser.id,u.id); const unread=ch?getChatUnread(ch,currentUser.id):0; return unread? `<span class="count warn" style="margin-left:4px">${unread}</span>`:""})()}</button>
        <button class="btn btn-ghost small" onclick="removeFriend('${u.id}')"><i class="fa-solid fa-user-minus"></i> Удалить</button>
      ` : ``}
      ${isIncoming ? `
        <button class="btn btn-primary small" onclick="acceptFriendRequest('${u.id}')"><i class="fa-solid fa-check"></i> Принять</button>
        <button class="btn btn-ghost small" onclick="declineFriendRequest('${u.id}')"><i class="fa-solid fa-xmark"></i> Отклонить</button>
      `:``}
      ${isOutgoing ? `
        <button class="btn btn-ghost small" onclick="cancelFriendRequest('${u.id}')"><i class="fa-solid fa-ban"></i> Отменить</button>
      `:``}
      ${isStranger ? `
        <button class="btn btn-primary small" onclick="sendFriendRequest('${u.id}')"><i class="fa-solid fa-user-plus"></i> Добавить</button>
      `:``}
    </div>
  </div>
  `;
}

// ===== CHAT VIEW =====
function renderChat(){
  const el=document.getElementById("view-chat");
  if(!el) return;
  if(!currentUser){
    el.innerHTML=`<div class="card empty"><i class="fa-solid fa-lock"></i><h3>Войди чтобы чатиться</h3><button class="btn btn-primary" onclick="openAuth()">Войти</button></div>`;
    return;
  }
  const chats=getChatsForUser(currentUser.id);
  // if no friends at all and no chats
  // list panel
  const friends = currentUser.friends.map(id=>getUserById(id)).filter(Boolean);
  const chatListHtml = chats.length ? chats.map(c=>{
    const otherId=c.participants.find(id=>id!==currentUser.id);
    const other=getUserById(otherId);
    if(!other) return "";
    const last = c.messages[c.messages.length-1];
    const unread=getChatUnread(c,currentUser.id);
    const isActive = c.id===currentChatId;
    return `
      <div class="chat-list-item ${isActive?'active':''}" onclick="switchChat('${c.id}')">
        <img src="${other.avatar}" onerror="this.src='https://i.pravatar.cc/40?u=${other.username}'">
        <div style="flex:1;min-width:0">
          <b style="font-size:13px;display:flex;gap:6px;align-items:center">${esc(other.username)} ${unread?`<span class="count warn">${unread}</span>`:""}</b>
          <span class="muted" style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block">${last? `${last.senderId===currentUser.id?'Ты: ':''}${esc(last.text.slice(0,40))}` : "Нет сообщений"}</span>
        </div>
        <span class="muted" style="font-size:10px">${last? new Date(last.at).toLocaleTimeString().slice(0,5):""}</span>
      </div>
    `;
  }).join("") : `<div class="muted" style="padding:12px;text-align:center">Чатов пока нет<br><span style="font-size:11px">Начни с добавления друзей</span></div>`;

  const friendsShort = friends.length ? `<div style="padding:8px 12px;border-top:1px solid var(--border)"><div class="muted small" style="margin-bottom:6px"><i class="fa-solid fa-user-group"></i> Друзья</div><div style="display:flex;gap:6px;overflow:auto;padding-bottom:4px">${friends.map(u=>`<div title="${esc(u.username)}" onclick="openChatWith('${u.id}')" style="cursor:pointer;text-align:center;min-width:50px"><img src="${u.avatar}" style="width:40px;height:40px;border-radius:50%;border:2px solid ${currentChatId && getChat(currentUser.id,u.id)?.id===currentChatId?'var(--primary)':'var(--border)'};object-fit:cover"><div style="font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:50px">${esc(u.username)}</div></div>`).join("")}</div></div>` : "";

  el.innerHTML=`
    <div class="chat-layout">
      <div class="chat-sidebar card">
        <div style="padding:12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
          <h3 style="font-family:Orbitron;font-size:14px;flex:1"><i class="fa-solid fa-comments"></i> Чаты</h3>
          <span class="muted small">${chats.length}</span>
        </div>
        <div class="chat-list">${chatListHtml}</div>
        ${friendsShort}
      </div>
      <div class="chat-main card" id="chat-main">
        ${currentChatId ? "" : `<div class="empty" style="margin:20px"><i class="fa-solid fa-comments"></i><h3>Выбери чат</h3><p>Нажми на друга или чат слева чтобы начать общение</p></div>`}
      </div>
    </div>
  `;
  if(currentChatId) renderChatMessages(currentChatId);
}

function switchChat(chatId){
  currentChatId=chatId;
  renderChat();
  renderChatMessages(chatId);
  markChatRead(chatId).then(()=>updateSocialBadges());
}

function renderChatMessages(chatId){
  const chat=DB.chats.find(c=>c.id===chatId);
  const main=document.getElementById("chat-main");
  if(!main || !chat) return;
  const otherId=chat.participants.find(id=>id!==currentUser.id);
  const other=getUserById(otherId);
  if(!other) return;
  main.innerHTML=`
    <div class="chat-header">
      <img src="${other.avatar}" style="width:32px;height:32px;border-radius:50%" onerror="this.src='https://i.pravatar.cc/40'">
      <b>${esc(other.username)}</b>
      <span class="muted" style="margin-left:auto;font-size:11px">${areFriends(currentUser.id,other.id)?"друзья":""}</span>
      <button class="btn btn-ghost small" onclick="openProfile('${other.id}')"><i class="fa-solid fa-user"></i></button>
    </div>
    <div class="chat-messages" id="chat-messages">
      ${chat.messages.map(m=>{
        const isMe=m.senderId===currentUser.id;
        return `<div class="msg ${isMe?'me':'them'}"><div class="msg-bubble">${esc(m.text).replace(/\n/g,'<br>')}<span class="msg-time">${new Date(m.at).toLocaleTimeString().slice(0,5)} ${m.readBy?.length>1?'<i class="fa-solid fa-check-double" style="color:var(--accent)"></i>':''}</span></div></div>`;
      }).join("") || `<div class="muted" style="text-align:center;padding:20px">Нет сообщений — напиши первым 👋</div>`}
    </div>
    <div class="chat-input">
      <input id="chat-input" placeholder="Напиши сообщение..." maxlength="2000" onkeydown="if(event.key==='Enter') sendCurrentMessage()">
      <button class="btn btn-primary" onclick="sendCurrentMessage()"><i class="fa-solid fa-paper-plane"></i></button>
    </div>
  `;
  const msgs=document.getElementById("chat-messages");
  if(msgs) msgs.scrollTop=msgs.scrollHeight;
  const inp=document.getElementById("chat-input");
  if(inp) inp.focus();
}

function sendCurrentMessage(){
  const inp=document.getElementById("chat-input");
  if(!inp) return;
  const text=inp.value.trim();
  if(!text) return;
  const chat=DB.chats.find(c=>c.id===currentChatId);
  if(!chat) return;
  const otherId=chat.participants.find(id=>id!==currentUser.id);
  sendMessage(otherId, text);
  inp.value="";
}

// ===== SETTINGS =====
function renderSettings(){
  const el=document.getElementById("view-settings");
  if(!el) return;
  if(!currentUser){
    el.innerHTML=`<div class="card empty"><i class="fa-solid fa-lock"></i><h3>Войди чтобы открыть настройки</h3><button class="btn btn-primary" onclick="openAuth()">Войти</button></div>`;
    return;
  }
  const p=currentUser.privacy || DEFAULT_PRIVACY;
  const s=currentUser.settings || DEFAULT_SETTINGS;
  el.innerHTML=`
    <div class="section-head">
      <h2><i class="fa-solid fa-gear"></i> Настройки</h2>
      <span class="muted">FluxHub • ${esc(currentUser.username)}</span>
    </div>
    <div class="settings-layout">
      <div class="card">
        <h3><i class="fa-solid fa-shield-halved"></i> Приватность</h3>
        <p class="muted small" style="margin:6px 0 12px">Управляй видимостью профиля</p>
        <label>Кто видит ваших друзей</label>
        <select id="set-friendsVis" onchange="updatePrivacy('friendsVisibility', this.value)">
          <option value="all" ${p.friendsVisibility==="all"?"selected":""}>Все</option>
          <option value="friends" ${p.friendsVisibility==="friends"?"selected":""}>Только друзья</option>
          <option value="none" ${p.friendsVisibility==="none"?"selected":""}>Никто</option>
        </select>
        <p class="muted small" style="margin:4px 0 10px">Сейчас: <b>${privacyLabel(p.friendsVisibility)}</b> • ${p.friendsVisibility==="all"?"Видят все пользователи":p.friendsVisibility==="friends"?"Только твои друзья": "Никто кроме тебя"}</p>

        <label>Кто видит ваши игры</label>
        <select id="set-gamesVis" onchange="updatePrivacy('gamesVisibility', this.value)">
          <option value="all" ${p.gamesVisibility==="all"?"selected":""}>Все</option>
          <option value="friends" ${p.gamesVisibility==="friends"?"selected":""}>Только друзья</option>
          <option value="none" ${p.gamesVisibility==="none"?"selected":""}>Никто</option>
        </select>
        <p class="muted small" style="margin:4px 0 10px">Сейчас: <b>${privacyLabel(p.gamesVisibility)}</b> • ${p.gamesVisibility==="all"?"Все видят твою библиотеку игр":p.gamesVisibility==="friends"?"Только друзья видят твои игры":"Скрыто для всех"}</p>

        <div class="check" style="margin-top:12px"><input type="checkbox" ${s.showOnline?"checked":""} onchange="updateSetting('showOnline', this.checked)"> <span>Показывать онлайн-статус</span></div>
      </div>

      <div class="card">
        <h3><i class="fa-solid fa-bell"></i> Уведомления</h3>
        <p class="muted small" style="margin:6px 0 12px">Настрой оповещения</p>
        <div class="check"><input type="checkbox" ${s.notifyFriendRequest?"checked":""} onchange="updateSetting('notifyFriendRequest', this.checked)"> <span>Заявки в друзья</span></div>
        <div class="check"><input type="checkbox" ${s.notifyMessages?"checked":""} onchange="updateSetting('notifyMessages', this.checked)"> <span>Личные сообщения</span></div>
        <div class="check"><input type="checkbox" ${s.soundEnabled?"checked":""} onchange="updateSetting('soundEnabled', this.checked)"> <span>Звуки FluxHub</span></div>
        <div style="margin-top:12px" class="muted small">Язык интерфейса</div>
        <select onchange="updateSetting('language', this.value)">
          <option value="ru" ${s.language==="ru"?"selected":""}>Русский</option>
          <option value="en" ${s.language==="en"?"selected":""}>English</option>
        </select>
      </div>

      <div class="card">
        <h3><i class="fa-solid fa-user-pen"></i> Профиль</h3>
        <label>Био / статус</label>
        <input id="set-bio" value="${esc(currentUser.bio||"")}" placeholder="Твой статус...">
        <button class="btn btn-primary small" style="margin-top:8px" onclick="saveBioSetting()"><i class="fa-solid fa-floppy-disk"></i> Сохранить био</button>
        <div style="margin-top:14px">
          <label>Аватарка</label>
          <div style="display:flex;gap:10px;align-items:center;margin-top:6px">
            <img src="${currentUser.avatar}" style="width:56px;height:56px;border-radius:50%;border:2px solid var(--primary)" onerror="this.src='https://i.pravatar.cc/80'">
            <button class="btn btn-ghost small" onclick="triggerAvatarPicker()"><i class="fa-solid fa-camera"></i> Сменить</button>
          </div>
        </div>
        <div style="margin-top:14px">
          <label>Аккаунт</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
            <button class="btn btn-ghost small" onclick="changePasswordPrompt()"><i class="fa-solid fa-key"></i> Сменить пароль</button>
            <button class="btn btn-danger small" onclick="if(confirm('Выйти из аккаунта?')) logout()"><i class="fa-solid fa-right-from-bracket"></i> Выйти</button>
          </div>
        </div>
      </div>

      <div class="card">
        <h3><i class="fa-solid fa-paintbrush"></i> Внешний вид</h3>
        <p class="muted small">Скоро: темы, неон, акценты. Сейчас — фирменный Flux Dark.</p>
        <div style="display:flex;gap:8px;margin-top:10px">
          <span style="width:24px;height:24px;border-radius:50%;background:var(--primary);border:2px solid var(--border)"></span>
          <span style="width:24px;height:24px;border-radius:50%;background:var(--accent);border:2px solid var(--border)"></span>
          <span style="width:24px;height:24px;border-radius:50%;background:var(--accent2);border:2px solid var(--border)"></span>
        </div>
        <button class="btn btn-ghost small" style="margin-top:10px" onclick="toast('Темы появятся в следующем апдейте 🎨','info')">Предпросмотр темы</button>
        <div style="margin-top:14px" class="muted small">Быстрые действия</div>
        <button class="btn btn-ghost small" onclick="localStorage.clear();location.reload()"><i class="fa-solid fa-rotate"></i> Сбросить кэш</button>
      </div>
    </div>
  `;
}

async function updatePrivacy(key, value){
  if(!currentUser) return;
  if(!["all","friends","none"].includes(value)) return;
  if(!currentUser.privacy) currentUser.privacy={...DEFAULT_PRIVACY};
  currentUser.privacy[key]=value;
  const idx=DB.users.findIndex(u=>u.id===currentUser.id);
  if(idx>=0) DB.users[idx]=currentUser;
  await saveDB();
  toast(`Приватность обновлена: ${key} = ${privacyLabel(value)}`,"success");
  renderSettings();
  renderAllSocial();
}

async function updateSetting(key, value){
  if(!currentUser) return;
  if(!currentUser.settings) currentUser.settings={...DEFAULT_SETTINGS};
  currentUser.settings[key]=value;
  const idx=DB.users.findIndex(u=>u.id===currentUser.id);
  if(idx>=0) DB.users[idx]=currentUser;
  await saveDB();
  toast("Настройки сохранены","success");
  renderSettings();
}

async function saveBioSetting(){
  const inp=document.getElementById("set-bio");
  if(!inp) return;
  currentUser.bio=inp.value.slice(0,120);
  const idx=DB.users.findIndex(u=>u.id===currentUser.id);
  if(idx>=0) DB.users[idx]=currentUser;
  localStorage.setItem("flux_user", JSON.stringify(currentUser));
  await saveDB();
  toast("Био обновлено","success");
  renderUserArea();
  renderSettings();
}

async function changePasswordPrompt(){
  const np=prompt("Новый пароль (мин 6):");
  if(np===null) return;
  if(np.length<6) return toast("Пароль минимум 6","error");
  currentUser.password=np;
  const idx=DB.users.findIndex(u=>u.id===currentUser.id);
  if(idx>=0) DB.users[idx]=currentUser;
  localStorage.setItem("flux_user", JSON.stringify(currentUser));
  await saveDB(true);
  toast("Пароль изменён","success");
}

// expose
if(typeof window!=="undefined") window._friendsTab="friends";
