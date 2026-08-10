const cfg=window.MERCH_CONFIG||{};
const configured=Boolean(cfg.supabaseUrl&&cfg.supabasePublishableKey);
const sb=configured?window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey):null;
let orders=[];

const $=id=>document.getElementById(id);
const peso=n=>"₱"+Number(n||0).toLocaleString("en-PH");
const paymentStatuses=["Pending","Verified","Rejected","Refunded"];
const orderStatuses=["New","Confirmed","For Production","Ready for Claim","Completed","Cancelled"];

$("setupNote").textContent=configured
  ?"Supabase is configured. Only users listed in admin_users can open the dashboard."
  :"Setup required: add your Supabase Project URL and browser-safe publishable key in config.js, then run supabase-schema.sql.";

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!sb){$("loginMessage").textContent="Supabase is not configured yet.";return}
  $("loginMessage").textContent="Signing in…";
  const {data,error}=await sb.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
  if(error){$("loginMessage").textContent=error.message;return}
  const {data:isAdmin,error:adminErr}=await sb.rpc("is_merch_admin");
  if(adminErr||!isAdmin){
    await sb.auth.signOut();$("loginMessage").textContent="This account is not authorized as a merch admin.";return;
  }
  showDashboard(data.user);
});

$("logoutBtn").onclick=async()=>{await sb.auth.signOut();location.reload()};
$("refreshBtn").onclick=loadOrders;
$("searchInput").oninput=renderOrders;$("paymentFilter").onchange=renderOrders;$("orderFilter").onchange=renderOrders;$("exportBtn").onclick=exportCSV;

async function restoreSession(){
  if(!sb)return;
  const {data:{session}}=await sb.auth.getSession();
  if(!session)return;
  const {data:isAdmin}=await sb.rpc("is_merch_admin");
  if(isAdmin)showDashboard(session.user);
}
async function showDashboard(user){
  $("loginView").hidden=true;$("dashboardView").hidden=false;$("adminEmail").textContent=user.email||"Admin";await loadOrders();
}
async function loadOrders(){
  showToast("Refreshing orders…");
  const {data,error}=await sb.from("merch_orders").select(`
    id,reference,full_name,program,email,mobile,campus,fulfillment,notes,total,payment_method,
    payment_status,order_status,proof_path,created_at,
    merch_order_items(id,product_id,product_name,variant,quantity,unit_price,subtotal)
  `).order("created_at",{ascending:false});
  if(error){showToast(error.message);return}
  orders=data||[];renderOrders();
}
function filteredOrders(){
  const q=$("searchInput").value.trim().toLowerCase(),pf=$("paymentFilter").value,of=$("orderFilter").value;
  return orders.filter(o=>{
    const hay=[o.reference,o.full_name,o.email,o.mobile,o.program,o.campus].join(" ").toLowerCase();
    return (!q||hay.includes(q))&&(!pf||o.payment_status===pf)&&(!of||o.order_status===of);
  });
}
function renderOrders(){
  const rows=filteredOrders();
  $("emptyState").hidden=rows.length>0;
  $("ordersBody").innerHTML=rows.map(o=>`
    <tr>
      <td><span class="ref">${esc(o.reference)}</span></td>
      <td class="customer"><strong>${esc(o.full_name)}</strong><span>${esc(o.program)} • ${esc(o.campus)}</span><span>${esc(o.email)}</span><span>${esc(o.mobile)}</span></td>
      <td class="items-cell">${(o.merch_order_items||[]).map(i=>`<span class="item-line">${esc(i.product_name)}${i.variant?` • ${esc(i.variant)}`:""} × ${i.quantity}</span>`).join("")}</td>
      <td><strong>${peso(o.total)}</strong></td>
      <td><select class="status-select" onchange="updateStatus('${o.id}','payment_status',this.value)">${paymentStatuses.map(s=>`<option ${s===o.payment_status?"selected":""}>${s}</option>`).join("")}</select></td>
      <td><select class="status-select" onchange="updateStatus('${o.id}','order_status',this.value)">${orderStatuses.map(s=>`<option ${s===o.order_status?"selected":""}>${s}</option>`).join("")}</select></td>
      <td>${o.proof_path?`<button class="proof-btn" onclick="viewProof('${escAttr(o.proof_path)}')">Open proof</button>`:`<span class="no-proof">None</span>`}</td>
      <td><span>${new Date(o.created_at).toLocaleDateString("en-PH")}</span><span class="date-small">${new Date(o.created_at).toLocaleTimeString("en-PH",{hour:"2-digit",minute:"2-digit"})}</span></td>
    </tr>`).join("");
  updateStats();
}
function updateStats(){
  $("statOrders").textContent=orders.length;
  $("statSales").textContent=peso(orders.filter(o=>o.order_status!=="Cancelled").reduce((s,o)=>s+Number(o.total||0),0));
  $("statPending").textContent=orders.filter(o=>o.payment_status==="Pending").length;
  $("statReady").textContent=orders.filter(o=>o.order_status==="Ready for Claim").length;
}
async function updateStatus(id,column,value){
  const {error}=await sb.from("merch_orders").update({[column]:value,updated_at:new Date().toISOString()}).eq("id",id);
  if(error){showToast(error.message);return}
  const o=orders.find(x=>x.id===id);if(o)o[column]=value;updateStats();showToast("Status updated");
}
async function viewProof(path){
  const {data,error}=await sb.storage.from("payment-proofs").createSignedUrl(path,60);
  if(error){showToast(error.message);return}
  window.open(data.signedUrl,"_blank","noopener");
}
function exportCSV(){
  const rows=filteredOrders();
  const header=["Reference","Full Name","Program","Email","Mobile","Campus","Fulfillment","Items","Total","Payment Method","Payment Status","Order Status","Submitted"];
  const data=rows.map(o=>[
    o.reference,o.full_name,o.program,o.email,o.mobile,o.campus,o.fulfillment,
    (o.merch_order_items||[]).map(i=>`${i.product_name}${i.variant?` (${i.variant})`:""} x${i.quantity}`).join(" | "),
    o.total,o.payment_method,o.payment_status,o.order_status,o.created_at
  ]);
  const csv=[header,...data].map(r=>r.map(csvCell).join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`shs50-merch-orders-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function csvCell(v){const s=String(v??"");return `"${s.replaceAll('"','""')}"`}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function escAttr(v){return String(v??"").replace(/\\/g,"\\\\").replace(/'/g,"\\'")}
function showToast(m){const t=$("toast");t.textContent=m;t.classList.add("show");clearTimeout(window._t);window._t=setTimeout(()=>t.classList.remove("show"),2000)}
window.updateStatus=updateStatus;window.viewProof=viewProof;
restoreSession();
