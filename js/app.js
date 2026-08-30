function router(view){
  // ban check
  if(currentUser && isBanned(currentUser)){
    toast(`Ты забанен ⛔ Осталось ${banTimeLeft(currentUser)}`,"error");
  }
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));
  const el=document.getElementById("view-"+view);
  if(el) el.classList.add("active");
  const nav=document.querySelector(`.nav-btn[data-view="${view}"]`);
  if(nav) nav.classList.add("active");
  // hero only on store
  document.getElementById("hero").style.display = view==="store"?"block":"none";
  if(view==="store") renderStore();
  if(view==="library") renderLibrary();
  if(view==="admin"){
    if(!currentUser) return openAuth();
    if(!isAdmin(currentUser)) { toast("Доступ только для админов 🛡️","error"); return router("store"); }
    renderAdminMod(); renderAdminUsers(); renderAdminGames(); renderAdminStats();
  }
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
}

// ESC to close modals
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){ closeGame(); closePlay(); closeAuth(); }
});

window.addEventListener("DOMContentLoaded", async ()=>{
  await loadDB();
  initAuth();
  renderAll();
  // check ban on interval
  setInterval(()=>{
    if(currentUser){
      const real=DB.users.find(u=>u.id===currentUser.id);
      if(real && isBanned(real)){
        // update currentUser bannedUntil
        currentUser.bannedUntil=real.bannedUntil;
      } else if(real && !isBanned(real) && currentUser.bannedUntil){
        currentUser.bannedUntil=null;
        toast("Бан истёк, добро пожаловать обратно 🎉","success");
        renderUserArea();
      }
    }
  }, 5000);
  console.log("%cFluxHub%c loaded • cursed_dev 👑 superadmin • JSONbin synced", "background:#6c5cff;color:#fff;padding:4px 8px;border-radius:6px;font-weight:800", "color:#8b93b8");
});
