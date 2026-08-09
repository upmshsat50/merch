const cfg = window.MERCH_CONFIG || {};
const isConfigured = Boolean(cfg.supabaseUrl && cfg.supabasePublishableKey);
const sb = isConfigured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;

const fallbackProducts = [
  {id:"shirt-upm-shs",name:"UPM SHS 50 Shirt",description:"Classic UPM SHS identity shirt",category:"shirt",price:350,image_key:"shirt-upm-shs.jpg",sizes:["XS","S","M","L","XL","2XL","3XL"],active:true,sort_order:1},
  {id:"shirt-midwifery",name:"Midwifery Shirt",description:"UPM SHS Midwifery edition",category:"shirt",price:350,image_key:"shirt-midwifery.jpg",sizes:["XS","S","M","L","XL","2XL","3XL"],active:true,sort_order:2},
  {id:"shirt-nursing",name:"Nursing Shirt",description:"UPM SHS Nursing edition",category:"shirt",price:350,image_key:"shirt-nursing.jpg",sizes:["XS","S","M","L","XL","2XL","3XL"],active:true,sort_order:3},
  {id:"shirt-medicine",name:"Medicine Shirt",description:"UPM SHS Medicine edition",category:"shirt",price:350,image_key:"shirt-medicine.jpg",sizes:["XS","S","M","L","XL","2XL","3XL"],active:true,sort_order:4},
  {id:"lanyard-shs",name:"SHS Commemorative Lanyard",description:"Jafar M. Lomantong / School of Health Sciences design",category:"lanyard",price:100,image_key:"lanyard-shs.jpg",sizes:null,active:true,sort_order:5},
  {id:"lanyard-medicine",name:"Medicine Lanyard",description:"UPM SHS Medicine lanyard",category:"lanyard",price:175,image_key:"lanyard-medicine.jpg",sizes:null,active:true,sort_order:6},
  {id:"lanyard-nursing",name:"Nursing Lanyard",description:"UPM SHS Nursing lanyard",category:"lanyard",price:175,image_key:"lanyard-nursing.jpg",sizes:null,active:true,sort_order:7},
  {id:"lanyard-midwifery",name:"Midwifery Lanyard",description:"UPM SHS Midwifery lanyard",category:"lanyard",price:175,image_key:"lanyard-midwifery.jpg",sizes:null,active:true,sort_order:8}
];

let products = [...fallbackProducts];
let cart = JSON.parse(localStorage.getItem("shs50-v2-cart") || "[]");
let latestOrder = null;

const $ = id => document.getElementById(id);
const peso = n => "₱" + Number(n || 0).toLocaleString("en-PH");

function applyConfig(){
  $("deadlineText").textContent = cfg.preorderDeadline || "To be announced";
  $("deadlineTop").textContent = cfg.preorderDeadline ? `DEADLINE: ${cfg.preorderDeadline}` : "PRE-ORDER";
  $("pickupText").textContent = cfg.pickupNote || "Details to follow";
  $("gcashName").textContent = cfg.gcashName || "UPM SHS AT 50";
  $("gcashNumber").textContent = cfg.gcashNumber || "TO BE UPDATED";
  $("checkoutGcashName").textContent = cfg.gcashName || "UPM SHS AT 50";
  $("checkoutGcashNumber").textContent = cfg.gcashNumber || "TO BE UPDATED";
  $("gcashQr").src = cfg.gcashQrImage || "assets/gcash-qr-placeholder.svg";
  $("proofHint").textContent = `JPG, PNG, WEBP, or PDF • max ${cfg.proofMaxMB || 5} MB`;
  $("connectionNote").textContent = isConfigured
    ? "Secure order collection is connected to Supabase."
    : "PREVIEW MODE: Add your Supabase URL and publishable key in config.js to save orders online.";
}

async function loadProducts(){
  if(!sb){ renderProducts(); return; }
  const {data,error} = await sb.from("merch_products").select("id,name,description,category,price,image_key,sizes,active,sort_order").eq("active",true).order("sort_order");
  if(!error && data?.length) products = data;
  renderProducts();
}

function renderProducts(filter="all"){
  $("productGrid").innerHTML = products.filter(p=>filter==="all" || p.category===filter).map(p=>`
    <article class="product-card">
      <div class="product-image">
        <img src="assets/${p.image_key}" alt="${escapeHtml(p.name)}">
        <span class="product-tag">${p.category}</span>
      </div>
      <div class="product-body">
        <div class="product-line">
          <div><h3 class="product-title">${escapeHtml(p.name)}</h3><p class="product-sub">${escapeHtml(p.description || "")}</p></div>
          <span class="price">${peso(p.price)}</span>
        </div>
        ${p.sizes?.length ? `<div class="variant-row"><select id="size-${p.id}" aria-label="Size">${p.sizes.map(s=>`<option>${s}</option>`).join("")}</select></div>` : ""}
        <button class="add-btn" onclick="addToCart('${p.id}')">Add to pre-order</button>
      </div>
    </article>`).join("");
}

document.querySelectorAll(".filter").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".filter").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active"); renderProducts(btn.dataset.filter);
}));

function addToCart(id){
  const p=products.find(x=>x.id===id); if(!p)return;
  const size=p.sizes?.length ? $(`size-${id}`).value : "";
  const key=`${id}__${size || "na"}`;
  const existing=cart.find(x=>x.key===key);
  if(existing) existing.qty++;
  else cart.push({key,id,size,qty:1});
  saveCart(); showToast(`${p.name} added`);
}
function saveCart(){localStorage.setItem("shs50-v2-cart",JSON.stringify(cart));renderCart()}
function changeQty(key,d){const x=cart.find(i=>i.key===key);if(!x)return;x.qty+=d;if(x.qty<=0)cart=cart.filter(i=>i.key!==key);saveCart()}
function removeItem(key){cart=cart.filter(i=>i.key!==key);saveCart()}
function cartTotal(){return cart.reduce((sum,i)=>sum+(products.find(p=>p.id===i.id)?.price||0)*i.qty,0)}

function renderCart(){
  const qty=cart.reduce((s,x)=>s+x.qty,0);
  $("cartCount").textContent=qty;
  if(!cart.length){
    $("cartItems").innerHTML="";$("cartEmpty").style.display="block";$("cartFooter").style.display="none";
  }else{
    $("cartEmpty").style.display="none";$("cartFooter").style.display="block";
    $("cartItems").innerHTML=cart.map(i=>{
      const p=products.find(x=>x.id===i.id) || fallbackProducts.find(x=>x.id===i.id); if(!p)return "";
      return `<div class="cart-item">
        <img src="assets/${p.image_key}" alt="">
        <div><h4>${escapeHtml(p.name)}</h4><p>${i.size?`Size ${i.size} • `:""}${peso(p.price)} each</p>
        <div class="qty"><button onclick="changeQty('${i.key}',-1)">−</button><strong>${i.qty}</strong><button onclick="changeQty('${i.key}',1)">+</button></div>
        <button class="remove" onclick="removeItem('${i.key}')">Remove</button></div>
        <strong>${peso(p.price*i.qty)}</strong>
      </div>`;
    }).join("");
    $("cartTotal").textContent=peso(cartTotal());
  }
  renderCheckoutSummary();
}
function renderCheckoutSummary(){
  const qty=cart.reduce((s,x)=>s+x.qty,0);
  $("checkoutTotal").textContent=peso(cartTotal());
  $("checkoutItemCount").textContent=`${qty} item${qty===1?"":"s"}`;
  $("checkoutItems").innerHTML=cart.map(i=>{
    const p=products.find(x=>x.id===i.id) || fallbackProducts.find(x=>x.id===i.id); if(!p)return "";
    return `<div class="checkout-item"><span>${escapeHtml(p.name)}${i.size?` • ${i.size}`:""} × ${i.qty}</span><strong>${peso(p.price*i.qty)}</strong></div>`;
  }).join("");
}

function openCart(){$("cartDrawer").classList.add("open");$("cartDrawer").setAttribute("aria-hidden","false");$("drawerBackdrop").hidden=false}
function closeCart(){$("cartDrawer").classList.remove("open");$("cartDrawer").setAttribute("aria-hidden","true");$("drawerBackdrop").hidden=true}
window.openCart=openCart; window.addToCart=addToCart; window.changeQty=changeQty; window.removeItem=removeItem;
$("cartButton").onclick=openCart;$("closeCart").onclick=closeCart;$("drawerBackdrop").onclick=closeCart;
$("checkoutBtn").onclick=()=>{if(!cart.length)return;closeCart();renderCheckoutSummary();$("checkoutModal").hidden=false;document.body.style.overflow="hidden"};
$("closeCheckout").onclick=closeCheckout;
$("checkoutModal").addEventListener("click",e=>{if(e.target===$("checkoutModal"))closeCheckout()});
function closeCheckout(){$("checkoutModal").hidden=true;document.body.style.overflow=""}

document.querySelectorAll('input[name="paymentMethod"]').forEach(r=>r.addEventListener("change",()=>{
  $("proofArea").style.display = document.querySelector('input[name="paymentMethod"]:checked').value==="GCash" ? "block" : "none";
}));

$("proofInput").addEventListener("change",()=>{
  const f=$("proofInput").files[0]; $("proofFileName").textContent=f?f.name:"No file selected";
});

async function uploadProof(file){
  if(!file)return null;
  const max=(cfg.proofMaxMB||5)*1024*1024;
  if(file.size>max)throw new Error(`Payment proof must be ${cfg.proofMaxMB||5} MB or smaller.`);
  const allowed=["image/jpeg","image/png","image/webp","application/pdf"];
  if(!allowed.includes(file.type))throw new Error("Please upload JPG, PNG, WEBP, or PDF.");
  const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"");
  const token=crypto.randomUUID();
  const path=`pending/${new Date().toISOString().slice(0,10)}/${token}.${ext}`;
  const {error}=await sb.storage.from("payment-proofs").upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});
  if(error)throw error;
  return path;
}

function buildItems(){
  return cart.map(i=>({product_id:i.id,variant:i.size||"",quantity:i.qty}));
}

$("orderForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!cart.length){showToast("Your pre-order bag is empty.");return}
  const fd=new FormData(e.currentTarget);
  const method=fd.get("paymentMethod");
  const proof=$("proofInput").files[0];
  if(method==="GCash" && !proof){showToast("Please upload your GCash payment proof.");return}
  const btn=$("submitOrderBtn"); btn.disabled=true; btn.textContent="Submitting…";

  try{
    let ref;
    if(isConfigured){
      let proofPath=null;
      if(proof) proofPath=await uploadProof(proof);
      const payload={
        p_full_name:String(fd.get("fullName")||"").trim(),
        p_program:String(fd.get("program")||""),
        p_email:String(fd.get("email")||"").trim(),
        p_mobile:String(fd.get("mobile")||"").trim(),
        p_campus:String(fd.get("campus")||""),
        p_fulfillment:String(fd.get("fulfillment")||""),
        p_payment_method:String(method||""),
        p_proof_path:proofPath,
        p_notes:String(fd.get("notes")||"").trim(),
        p_items:buildItems()
      };
      const {data,error}=await sb.rpc("submit_merch_order",payload);
      if(error)throw error;
      ref=data;
    }else{
      ref=`DEMO-SHS50-${Date.now().toString().slice(-6)}`;
    }

    latestOrder={
      reference:ref, fullName:fd.get("fullName"), program:fd.get("program"), email:fd.get("email"),
      mobile:fd.get("mobile"), campus:fd.get("campus"), fulfillment:fd.get("fulfillment"),
      paymentMethod:method, notes:fd.get("notes"), items:cart.map(i=>({...i})),
      total:cartTotal(), submittedAt:new Date().toISOString()
    };
    $("successRef").textContent=ref;
    $("checkoutModal").hidden=true;$("successModal").hidden=false;
    cart=[];localStorage.removeItem("shs50-v2-cart");renderCart();e.currentTarget.reset();$("proofFileName").textContent="No file selected";
  }catch(err){
    console.error(err);
    showToast(err.message || "Could not submit your order.");
  }finally{btn.disabled=false;btn.textContent="Submit pre-order"}
});

$("downloadReceiptBtn").onclick=()=>{if(latestOrder)downloadReceipt(latestOrder)};
$("closeSuccessBtn").onclick=()=>{$("successModal").hidden=true;document.body.style.overflow=""};

function downloadReceipt(o){
  const lines=o.items.map(i=>{
    const p=products.find(x=>x.id===i.id)||fallbackProducts.find(x=>x.id===i.id);
    return `- ${p?.name||i.id}${i.size?` (${i.size})`:""} x${i.qty} = ${peso((p?.price||0)*i.qty)}`;
  });
  const txt=[
    "UPM SHS AT 50 — SALUBONG 2026 MERCH PRE-ORDER",`Reference: ${o.reference}`,`Submitted: ${new Date(o.submittedAt).toLocaleString("en-PH")}`,"",
    `Name: ${o.fullName}`,`Program/Affiliation: ${o.program}`,`Email: ${o.email}`,`Mobile: ${o.mobile}`,
    `Campus/Location: ${o.campus}`,`Fulfillment: ${o.fulfillment}`,`Payment: ${o.paymentMethod}`,"","ORDER:",...lines,"",`TOTAL: ${peso(o.total)}`,"",
    "Keep this reference for organizer confirmation and claiming."
  ].join("\n");
  const blob=new Blob([txt],{type:"text/plain;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`${o.reference}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1200);
}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function showToast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(window._toast);window._toast=setTimeout(()=>t.classList.remove("show"),2400)}

applyConfig();loadProducts().then(renderCart);
