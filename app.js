import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// 1) Replace these values with your Firebase Web App configuration.
const firebaseConfig = {
  apiKey: "AIzaSyAqxYpR7aoOVi4zReeQTsZ2qVj0Gxcpy-A",
  authDomain: "bakecupbysaba.firebaseapp.com",
  projectId: "bakecupbysaba",
  storageBucket: "bakecupbysaba.firebasestorage.app",
  messagingSenderId: "917816981517",
  appId: "1:917816981517:web:4305ec17b20d6ec5903d44",
  measurementId: "G-4JJ75M6XM2"
};
// 2) Replace with the Gmail address that owns this bakery project.
const OWNER_EMAIL = "rashid418418@gmail.com";

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const $ = id => document.getElementById(id);
let currentUser = null, currentProfile = null, allOrders = [], allUsers = [], activeOrderTab = "orders", reminderTimer = null, currentReportRows = [];

const money = n => "Rs. " + Number(n || 0).toLocaleString("en-PK");
const isOwner = () => currentProfile?.role === "owner";
const toast = msg => { $("toast").textContent=msg; $("toast").classList.add("show"); setTimeout(()=>$("toast").classList.remove("show"),2600); };
const showAuthMessage = msg => $("authMessage").textContent = msg;

$("authForm").addEventListener("submit", async e => {
  e.preventDefault(); showAuthMessage("");
  try { await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value); }
  catch(err){ showAuthMessage(err.message); }
});
$("registerBtn").addEventListener("click", async () => {
  showAuthMessage("");
  const email=$("email").value.trim(), password=$("password").value;
  if(!email || password.length<6){ showAuthMessage("Enter an email and a password of at least 6 characters."); return; }
  try { await createUserWithEmailAndPassword(auth,email,password); }
  catch(err){ showAuthMessage(err.message); }
});
$("logoutBtn").addEventListener("click",()=>signOut(auth));
onAuthStateChanged(auth, async user => {
  currentUser=user;
  if(!user){ $("authView").classList.remove("hidden"); $("appView").classList.add("hidden"); return; }
  try {
    const ref=doc(db,"users",user.uid), snap=await getDoc(ref);
    if(!snap.exists()){
      const owner=user.email?.toLowerCase()===OWNER_EMAIL.toLowerCase();
      await setDoc(ref,{email:user.email,role:owner?"owner":"staff",active:true,createdAt:serverTimestamp()});
      currentProfile={email:user.email,role:owner?"owner":"staff",active:true};
    } else currentProfile=snap.data();
    if(currentProfile.active!==true){ await signOut(auth); showAuthMessage("This account is inactive. Please contact the owner."); return; }
    $("authView").classList.add("hidden"); $("appView").classList.remove("hidden");
    $("userLabel").textContent=user.email; $("helloName").textContent="Bakecupbysaba";
    document.querySelectorAll(".owner-only").forEach(el=>el.classList.toggle("hidden",!isOwner()));
    $("paymentsTab").classList.toggle("hidden",!isOwner());
    $("teamTab").classList.toggle("hidden",!isOwner());
    $("reportsTab").classList.toggle("hidden",!isOwner());
    await refreshData();
  } catch(err){ toast("Account setup error: "+err.message); }
});

async function refreshData(){
  const q=query(collection(db,"orders"),orderBy("createdAt","desc"));
  const snap=await getDocs(q); allOrders=snap.docs.map(d=>({id:d.id,...d.data()}));
  if(isOwner()){
    const us=await getDocs(collection(db,"users")); allUsers=us.docs.map(d=>({id:d.id,...d.data()}));
    const finance=await getDocs(collection(db,"orderFinance"));
    const financeById=Object.fromEntries(finance.docs.map(d=>[d.id,d.data()]));
    const notes=await getDocs(collection(db,"orderPrivateNotes"));
    const notesById=Object.fromEntries(notes.docs.map(d=>[d.id,d.data()]));
    allOrders=allOrders.map(o=>({...o,...(financeById[o.id]||{}),...(notesById[o.id]||{})}));
  }
  render();
}
function render(){
  const active=allOrders.filter(o=>!["Delivered","Cancelled"].includes(o.status));
  $("activeCount").textContent=active.length;
  $("readyCount").textContent=allOrders.filter(o=>o.status==="Ready").length;
  $("dueAmount").textContent=money(allOrders.filter(o=>o.status!=="Cancelled").reduce((s,o)=>s+Math.max(0,Number(o.price||0)-Number(o.advance||0)),0));
  renderOrders();
  if(isOwner()){ renderPayments(); renderTeam(); renderReports(); }
}
function renderOrders(){
  const term=$("searchBox").value.toLowerCase();
  const list=allOrders.filter(o=>{const match=(o.customer||"").toLowerCase().includes(term)||(o.phone||"").includes(term); const tabMatch=activeOrderTab==="pending"?!["Delivered","Cancelled"].includes(o.status):activeOrderTab==="fulfilled"?o.status==="Delivered":activeOrderTab==="cancelled"?o.status==="Cancelled":true; return match&&tabMatch;});
  $("ordersList").innerHTML=list.length?list.map(o=>{
    const balance=Math.max(0,Number(o.price||0)-Number(o.advance||0));
    return `<article class="order-card">
      <div><h3>${esc(o.customer)} <span class="pill ${o.status==="Ready"?"ready":""}">${esc(o.status||"Pending")}</span></h3>
      <p>${esc(o.description)} · ${esc(o.weight||"Weight not set")}</p><p>${esc(o.phone||"No phone")} · ${esc(o.deliveryText||"")}</p>${o.reminderAt?`<p>Reminder: ${esc(new Date(o.reminderAt).toLocaleString())}</p>`:""}${o.status==="Cancelled"?`<p>Reason: ${esc(o.cancelReason||"Not recorded")} · Refund: ${money(o.refundAmount)} (${esc(o.refundStatus||"Not set")})</p>`:""}</div>
      <div><p>Flavour(s)</p><strong>${esc(o.flavours||"Not specified")}</strong></div>
      ${isOwner()?`<div class="money">${money(o.price)}<p>Advance ${money(o.advance)} · Balance ${money(balance)}</p></div>`:`<div><p>Order type</p><strong>${esc(o.orderType||"Regular")}</strong></div>`}
      <div class="card-actions"><button class="small-btn" data-edit="${o.id}">Edit</button>${isOwner()?`<button class="small-btn" data-delete="${o.id}">Delete</button>`:""}</div>
    </article>`;
  }).join(""):'<div class="empty">No matching orders yet. Add your first cake order.</div>';
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openEdit(b.dataset.edit));
  document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>removeOrder(b.dataset.delete));
}

function orderCreatedDate(o){
  const v=o.createdAt;
  if(v?.toDate) return v.toDate();
  if(v?.seconds) return new Date(v.seconds*1000);
  if(typeof v==="string"||typeof v==="number") return new Date(v);
  return null;
}
function renderReports(){
  if(!isOwner()) return;
  const status=$("reportStatus").value||"all", from=$("reportFrom").value, to=$("reportTo").value;
  const start=from?new Date(from+"T00:00:00"):null, end=to?new Date(to+"T23:59:59.999"):null;
  const filtered=allOrders.filter(o=>{
    const d=orderCreatedDate(o); if(!d||Number.isNaN(d.getTime())) return false;
    if(start&&d<start) return false; if(end&&d>end) return false;
    if(status==="pending") return !["Delivered","Cancelled"].includes(o.status);
    if(status==="fulfilled") return o.status==="Delivered";
    if(status==="cancelled") return o.status==="Cancelled";
    return true;
  });
  currentReportRows = filtered.slice();
  $("reportMessage").textContent = `Report generated: ${filtered.length} order(s) found.`;
  const sales=filtered.filter(o=>o.status!=="Cancelled");
  const total=sales.reduce((n,o)=>n+Number(o.price||0),0), paid=sales.reduce((n,o)=>n+Number(o.advance||0),0);
  $("reportSummary").innerHTML=`<div class="report-summary"><article class="stat"><span>Orders</span><strong>${filtered.length}</strong></article><article class="stat"><span>Order value</span><strong>${money(total)}</strong></article><article class="stat"><span>Advance received</span><strong>${money(paid)}</strong></article><article class="stat"><span>Balance</span><strong>${money(Math.max(0,total-paid))}</strong></article></div>`;
  const months={}; filtered.forEach(o=>{const d=orderCreatedDate(o);const key=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");(months[key]??=[]).push(o);});
  const keys=Object.keys(months).sort().reverse();
  $("monthlyReportRows").innerHTML=keys.length?keys.map(k=>{const rows=months[k], valid=rows.filter(o=>o.status!=="Cancelled"), value=valid.reduce((n,o)=>n+Number(o.price||0),0), advance=valid.reduce((n,o)=>n+Number(o.advance||0),0);const [y,m]=k.split("-").map(Number);return `<tr><td>${new Date(y,m-1,1).toLocaleDateString("en-PK",{month:"long",year:"numeric"})}</td><td>${rows.length}</td><td>${money(value)}</td><td>${money(advance)}</td><td>${money(Math.max(0,value-advance))}</td></tr>`;}).join(""):'<tr><td colspan="5">No orders found for this report period.</td></tr>';
}
$("runReportBtn").addEventListener("click",renderReports);
$("reportStatus").addEventListener("change",renderReports);

$("exportExcelBtn").addEventListener("click",()=>{
  if(!currentReportRows.length){toast("No report data to export.");return;}
  const cols=["Customer","Phone","Order Date","Delivery","Status","Description","Weight","Flavours","Order Value","Advance","Balance"];
  const rows=currentReportRows.map(o=>{const d=orderCreatedDate(o),p=Number(o.price||0),a=Number(o.advance||0);return [o.customer,o.phone,d?d.toLocaleDateString("en-PK"):"",o.deliveryText,o.status,o.description,o.weight,o.flavours,p,a,Math.max(0,p-a)];});
  const csv=[cols,...rows].map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download="My-Cake-Manager-Report.csv";a.click();URL.revokeObjectURL(url);
});
$("exportPdfBtn").addEventListener("click",()=>{
  if(!currentReportRows.length){toast("No report data to export.");return;}
  const rows=currentReportRows.map(o=>{const d=orderCreatedDate(o),p=Number(o.price||0),a=Number(o.advance||0);return `<tr><td>${esc(o.customer||"")}</td><td>${esc(o.phone||"")}</td><td>${d?d.toLocaleDateString("en-PK"):""}</td><td>${esc(o.status||"Pending")}</td><td>${money(p)}</td><td>${money(a)}</td><td>${money(Math.max(0,p-a))}</td></tr>`;}).join("");
  const w=window.open("","_blank");if(!w){toast("Allow pop-ups to create PDF.");return;}
  w.document.write(`<!doctype html><html><head><title>My Cake Manager Report</title><style>body{font-family:Arial;color:#38251f;padding:28px}h1{color:#784535}table{width:100%;border-collapse:collapse;margin-top:20px}th{background:#f4e7df}th,td{padding:9px;border:1px solid #eadbd2;text-align:left;font-size:12px}</style></head><body><h1>My Cake Manager</h1><h2>Order Report</h2><p>From: ${esc($("reportFrom").value||"All dates")} To: ${esc($("reportTo").value||"All dates")} · ${esc($("reportStatus").selectedOptions[0].text)}</p><table><thead><tr><th>Customer</th><th>Phone</th><th>Order date</th><th>Status</th><th>Value</th><th>Advance</th><th>Balance</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print();<\/script></body></html>`);w.document.close();
});

function renderPayments(){
  const rows=allOrders.filter(o=>o.status!=="Cancelled");
  const total=rows.reduce((s,o)=>s+Number(o.price||0),0), paid=rows.reduce((s,o)=>s+Number(o.advance||0),0);
  $("paymentSummary").innerHTML=`<div class="stats"><article class="stat"><span>Total order value</span><strong>${money(total)}</strong></article><article class="stat"><span>Advance collected</span><strong>${money(paid)}</strong></article><article class="stat"><span>Outstanding</span><strong>${money(total-paid)}</strong></article></div>`+
    rows.map(o=>`<div class="payment-row"><span><b>${esc(o.customer)}</b><br><small class="muted">${esc(o.deliveryText||"")}</small></span><span>${money(o.advance)} / ${money(o.price)}<br><small class="muted">Balance ${money(Number(o.price||0)-Number(o.advance||0))}</small></span></div>`).join("");
}
function renderTeam(){
  $("teamList").innerHTML=allUsers.map(u=>`<div class="team-row"><span>${esc(u.email||u.id)}<br><small class="muted">${esc(u.role||"staff")}</small></span><span><button class="small-btn" data-toggle-user="${u.id}" data-active="${u.active!==false}">${u.active===false?"Activate":"Deactivate"}</button></span></div>`).join("");
  document.querySelectorAll("[data-toggle-user]").forEach(b=>b.onclick=async()=>{
    const uid=b.dataset.toggleUser, active=b.dataset.active==="true";
    if(uid===currentUser.uid){toast("You cannot deactivate your own signed-in account.");return;}
    await updateDoc(doc(db,"users",uid),{active:!active}); await refreshData(); toast("Staff access updated.");
  });
}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function openNew(){
  $("orderForm").reset(); $("orderId").value=""; $("advance").value="0"; $("status").value="Pending";
  $("privateNotes").value=""; $("reminderAt").value=""; $("cancelReason").value=""; $("refundAmount").value="0"; $("refundStatus").value="Not applicable"; $("dialogTitle").textContent="New cake order"; $("orderError").textContent="";
  $("orderDialog").showModal();
}
function openEdit(id){
  const o=allOrders.find(x=>x.id===id); if(!o)return;
  $("orderId").value=id; $("customer").value=o.customer||""; $("phone").value=o.phone||"";
  $("description").value=o.description||""; $("weight").value=o.weight||""; $("flavours").value=o.flavours||"";
  $("delivery").value=o.delivery||""; $("orderType").value=o.orderType||"Regular";
  $("price").value=o.price||0; $("advance").value=o.advance||0; $("status").value=o.status||"Pending";
  $("customerNotes").value=o.customerNotes||""; $("privateNotes").value=isOwner()?(o.privateNotes||""):"";
  $("reminderAt").value=o.reminderAt||""; $("cancelReason").value=isOwner()?(o.cancelReason||""):""; $("refundAmount").value=isOwner()?(o.refundAmount||0):0; $("refundStatus").value=isOwner()?(o.refundStatus||"Not applicable"):"Not applicable";
  $("dialogTitle").textContent="Edit cake order"; $("orderError").textContent=""; $("orderDialog").showModal();
}
$("orderForm").addEventListener("submit",async e=>{
  e.preventDefault(); $("orderError").textContent="";
  const price=Number($("price").value||0), advance=Number($("advance").value||0);
  if(advance>price){$("orderError").textContent="Advance cannot be greater than the total price.";return;}
  const id=$("orderId").value;
  const data={customer:$("customer").value.trim(),phone:$("phone").value.trim(),description:$("description").value.trim(),
    weight:$("weight").value.trim(),flavours:$("flavours").value.trim(),delivery:$("delivery").value,
    deliveryText:$("delivery").value?new Date($("delivery").value).toLocaleString():"",orderType:$("orderType").value,
    status:$("status").value,customerNotes:$("customerNotes").value.trim(),reminderAt:$("reminderAt").value||"",updatedAt:serverTimestamp()};
  try{
    let orderId=id;
    if(id){await updateDoc(doc(db,"orders",id),data);}
    else{data.createdBy=currentUser.uid;data.createdAt=serverTimestamp();const created=await addDoc(collection(db,"orders"),data);orderId=created.id;}
    if(isOwner()){
      if(data.status==="Cancelled"){data.cancelReason=$("cancelReason").value;data.refundAmount=Number($("refundAmount").value||0);data.refundStatus=$("refundStatus").value;await updateDoc(doc(db,"orders",orderId),{cancelReason:data.cancelReason,refundAmount:data.refundAmount,refundStatus:data.refundStatus});}
      await setDoc(doc(db,"orderFinance",orderId),{price,advance,updatedAt:serverTimestamp()});
      await setDoc(doc(db,"orderPrivateNotes",orderId),{privateNotes:$("privateNotes").value.trim(),updatedAt:serverTimestamp()});
    }
    $("orderDialog").close();await refreshData();if(data.reminderAt&&"Notification" in window&&Notification.permission==="default"){try{await Notification.requestPermission();}catch(e){}}toast("Order saved successfully.");
  }catch(err){$("orderError").textContent="Could not save: "+err.message;}
});
async function removeOrder(id){if(!confirm("Delete this order permanently?"))return;try{await deleteDoc(doc(db,"orders",id));await refreshData();toast("Order deleted.");}catch(e){toast(e.message);}}
$("newOrderBtn").onclick=openNew;$("closeDialog").onclick=()=>$("orderDialog").close();$("cancelOrder").onclick=()=>$("orderDialog").close();
$("searchBox").addEventListener("input",renderOrders);
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));
  activeOrderTab=["orders","pending","fulfilled","cancelled"].includes(b.dataset.tab)?b.dataset.tab:"orders";
  const ordersTab=["orders","pending","fulfilled","cancelled"].includes(b.dataset.tab);
  $("ordersPanel").classList.toggle("hidden",!ordersTab); $("paymentsPanel").classList.toggle("hidden",b.dataset.tab!=="payments"); $("teamPanel").classList.toggle("hidden",b.dataset.tab!=="team"); $("reportsPanel").classList.toggle("hidden",b.dataset.tab!=="reports");
  if(ordersTab)renderOrders(); if(b.dataset.tab==="reports")renderReports();
}));
function checkReminders(){if(!currentUser||!allOrders.length||!("Notification" in window)||Notification.permission!=="granted")return;const now=Date.now();allOrders.filter(o=>o.status!=="Delivered"&&o.status!=="Cancelled"&&o.reminderAt&&!o.reminderSentAt&&new Date(o.reminderAt).getTime()<=now).forEach(async o=>{new Notification("Cake order reminder",{body:`${o.customer}: ${o.description||"Pending order"}`});try{await updateDoc(doc(db,"orders",o.id),{reminderSentAt:new Date().toISOString()});}catch(e){console.warn(e);}});}
if("Notification" in window && Notification.permission==="default") { /* permission is requested when a reminder is first saved */ }
if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));

setInterval(checkReminders,30000);
