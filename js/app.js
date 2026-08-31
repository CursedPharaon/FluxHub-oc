function isMobileViewport(){ return window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent); }

function toggleDrawer(force){
  const drawer=document.getElementById("mobile-drawer");
  const overlay=document.getElementById("drawer-overlay");
  if(!drawer||!overlay) return;
  const shouldOpen = typeof force==="boolean" ? force : !drawer.classList.contains("open");
  drawer.classList.toggle("open", shouldOpen);
  overlay.classList.toggle("open", shouldOpen);
  drawer.setAttribute("aria-hidden", shouldOpen? "false":"true");
  document.body.style.overflow = shouldOpen ? "hidden" : "";
}
function toggleMobileSearch(force){
  const box=document.getElementById("mobile-search");
  const inp=document.getElementById("search-mobile");
  if(!box) return;
  const shouldOpen = typeof force==="boolean" ? force : !box.classList.contains("open");
  box.classList.toggle("open", shouldOpen);
  if(shouldOpen && inp) setTimeout(()=>inp.focus(), 100);
  if(!shouldOpen){
    const main=document.getElementById("search");
    const mob=document.getElementById("search-mobile");
    if(main && mob) mob.value=main.value;
  }
}
function syncMobileNav(view){
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===view));
  document.querySelectorAll(".drawer-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===view));
  document.querySelectorAll(".bnav-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===view));
  // close mobile search after nav on small
  if(isMobileViewport()){
    const ms=document.getElementById("mobile-search");
    if(ms) ms.classList.remove("open");
  }
}

function router(view){
  // ban check
  if(currentUser && isBanned(currentUser)){
    toast(`Ты забанен ⛔ Осталось ${banTimeLeft(currentUser)}`,"error");
  }
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  const el=document.getElementById("view-"+view);
  if(el) el.classList.add("active");
  syncMobileNav(view);
  // hero only on store
  const hero=document.getElementById("hero");
  if(hero) hero.style.display = view==="store"?"block":"none";
  if(view==="store") renderStore();
  if(view==="library") renderLibrary();
  if(view==="friends") renderFriends();
  if(view==="chat") renderChat();
  if(view==="settings") renderSettings();
  if(view==="profile") { /* openProfile already */ }
  if(view==="admin"){
    if(!currentUser) return openAuth();
    if(!isAdmin(currentUser)) { toast("Доступ только для админов 🛡️","error"); return router("store"); }
    renderAdminMod(); renderAdminUsers(); renderAdminGames(); renderAdminStats();
  }
  if(currentUser && typeof updateSocialBadges==="function") updateSocialBadges();
  // ensure drawer closed after navigation
  const drawer=document.getElementById("mobile-drawer");
  if(drawer && drawer.classList.contains("open")) toggleDrawer(false);
  window.scrollTo({top:0,behavior:"smooth"});
}

function toast(msg, type="info"){
  const c=document.getElementById("toast-container");
  const el=document.createElement("div");
  el.className=`toast ${type}`;
  const icon = type==="success"?"fa-circle-check":type==="error"?"fa-circle-xmark":"fa-circle-info";
  el.innerHTML=`<i class="fa-solid ${icon}"></i><span style="flex:1;font-size:13px;line-height:1.4">${msg}</span><button onclick="this.parentElement.remove()" style="background:transparent;border:none;color:var(--muted);cursor:pointer"><i class="fa-solid fa-xmark"></i></button>`;
  c.appendChild(el);
  setTimeout(()=>{ el.style.opacity="0"; el.style.transform="translateY(4px)"; setTimeout(()=>el.remove(),300)}, 3200);
}

function renderAll(){
  renderStore();
  renderLibrary();
  if(isAdmin(currentUser)){
    renderAdminMod(); renderAdminUsers(); renderAdminGames(); renderAdminStats();
  }
  if(typeof updateSocialBadges==="function") updateSocialBadges();
  if(typeof renderFriends==="function" && document.getElementById("view-friends")?.classList.contains("active")) renderFriends();
  if(typeof renderChat==="function" && document.getElementById("view-chat")?.classList.contains("active")) renderChat();
  if(typeof renderSettings==="function" && document.getElementById("view-settings")?.classList.contains("active")) renderSettings();
}

// ESC to close modals & drawer
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){ closeGame(); closePlay(); closeAuth(); toggleDrawer(false); const ms=document.getElementById("mobile-search"); if(ms) ms.classList.remove("open"); }
});

window.addEventListener("DOMContentLoaded", async ()=>{
  await loadDB();
  initAuth();
  renderAll();
  if(typeof updateSocialBadges==="function") updateSocialBadges();
  // mobile: detect phone and add body class for extra tweaks, keep desktop untouched
  const applyMobileClass=()=> document.body.classList.toggle("is-mobile", isMobileViewport());
  applyMobileClass();
  window.addEventListener("resize", applyMobileClass);
  // swipe to open drawer (touch from left edge)
  let touchStartX=0;
  document.addEventListener("touchstart", e=>{ touchStartX=e.touches[0].clientX; }, {passive:true});
  document.addEventListener("touchend", e=>{
    const dx=e.changedTouches[0].clientX - touchStartX;
    if(touchStartX<20 && dx>60) toggleDrawer(true);
    if(dx<-60) toggleDrawer(false);
  }, {passive:true});
  // check ban on interval
  setInterval(()=>{
    if(currentUser){
      const real=DB.users.find(u=>u.id===currentUser.id);
      if(real){
        // sync friends/requests/privacy in case of remote update
        if(real.friends) currentUser.friends=real.friends;
        if(real.friendRequestsIncoming) currentUser.friendRequestsIncoming=real.friendRequestsIncoming;
        if(real.friendRequestsOutgoing) currentUser.friendRequestsOutgoing=real.friendRequestsOutgoing;
        if(real.privacy) currentUser.privacy=real.privacy;
        if(isBanned(real)){
          // update currentUser bannedUntil
          currentUser.bannedUntil=real.bannedUntil;
        } else if(!isBanned(real) && currentUser.bannedUntil){
          currentUser.bannedUntil=null;
          toast("Бан истёк, добро пожаловать обратно 🎉","success");
          renderUserArea();
        }
        if(typeof updateSocialBadges==="function") updateSocialBadges();
      }
    }
  }, 5000);
  console.log("%cFluxHub%c loaded • cursed_dev 👑 superadmin • JSONbin synced • friends+chat+settings", "background:#6c5cff;color:#fff;padding:4px 8px;border-radius:6px;font-weight:800", "color:#8b93b8");
});
