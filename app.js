const cfg = window.MERCH_CONFIG || {};
const isConfigured = Boolean(cfg.supabaseUrl && cfg.supabasePublishableKey);
const sb = isConfigured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;

const fallbackProducts = [
  {id:"shirt-upm-shs",name:"UPM SHS 50 Shirt",description:"Classic UPM SHS identity shirt",category:"shirt",price:350,image_key:"shirt-upm-shs.jpg",sizes:["XS","S","M","L","XL","2XL","3XL"],estimated_weight_g:250,active:true,sort_order:1},
  {id:"shirt-midwifery",name:"Midwifery Shirt",description:"UPM SHS Midwifery edition",category:"shirt",price:350,image_key:"shirt-midwifery.jpg",sizes:["XS","S","M","L","XL","2XL","3XL"],estimated_weight_g:250,active:true,sort_order:2},
  {id:"shirt-nursing",name:"Nursing Shirt",description:"UPM SHS Nursing edition",category:"shirt",price:350,image_key:"shirt-nursing.jpg",sizes:["XS","S","M","L","XL","2XL","3XL"],estimated_weight_g:250,active:true,sort_order:3},
  {id:"shirt-medicine",name:"Medicine Shirt",description:"UPM SHS Medicine edition",category:"shirt",price:350,image_key:"shirt-medicine.jpg",sizes:["XS","S","M","L","XL","2XL","3XL"],estimated_weight_g:250,active:true,sort_order:4},
  {id:"lanyard-shs",name:"SHS Commemorative Lanyard",description:"UPM SHS commemorative design",category:"lanyard",price:100,image_key:"lanyard-shs.jpg",sizes:null,estimated_weight_g:50,active:true,sort_order:5},
  {id:"lanyard-medicine",name:"Medicine Lanyard",description:"UPM SHS Medicine lanyard",category:"lanyard",price:100,image_key:"lanyard-medicine.jpg",sizes:null,estimated_weight_g:50,active:true,sort_order:6},
  {id:"lanyard-nursing",name:"Nursing Lanyard",description:"UPM SHS Nursing lanyard",category:"lanyard",price:100,image_key:"lanyard-nursing.jpg",sizes:null,estimated_weight_g:50,active:true,sort_order:7},
  {id:"lanyard-midwifery",name:"Midwifery Lanyard",description:"UPM SHS Midwifery lanyard",category:"lanyard",price:100,image_key:"lanyard-midwifery.jpg",sizes:null,estimated_weight_g:50,active:true,sort_order:8},

  {id:"stationery-mirror-keychain",name:"Mirror Keychain",description:"58 mm anniversary mirror keychain • limited legacy stock",category:"stationery",price:40,image_key:"stationery-mirror-keychain.jpg",sizes:["UP Seal","SHS Seal","IskoLar","Iskolar ng Bayan","Matapang at Matilino","Serve the People","Honor Excellence Service","SHS Pattern","Padayon Iskolar"],estimated_weight_g:45,active:true,sort_order:20},
  {id:"stationery-acrylic-keychain",name:"Acrylic Keychain",description:"2 × 2 in anniversary acrylic keychain • limited legacy stock",category:"stationery",price:35,image_key:"stationery-acrylic-keychain.jpg",sizes:["UPM SHS 50 Year","UPM SHS @50","50th Anniversary Logo","Honor Excellence Service","Serve the People"],estimated_weight_g:35,active:true,sort_order:21},
  {id:"stationery-button-pin-small",name:"Button Pin — Small (25 mm)",description:"Anniversary button pin • choose your design",category:"stationery",price:20,image_key:"stationery-button-pins.jpg",sizes:["UP Seal","SHS Seal","IskoLar","UPM SHS 50 Year","Iskolar ng Bayan","Matapang at Matilino","Serve the People","50th Anniversary Logo","Honor Excellence Service","SHS Pattern","Padayon Iskolar","UPM SHS @50"],estimated_weight_g:15,active:true,sort_order:22},
  {id:"stationery-button-pin-medium",name:"Button Pin — Medium (32 mm)",description:"Anniversary button pin • choose your design",category:"stationery",price:30,image_key:"stationery-button-pins.jpg",sizes:["UP Seal","SHS Seal","IskoLar","UPM SHS 50 Year","Iskolar ng Bayan","Matapang at Matilino","Serve the People","50th Anniversary Logo","Honor Excellence Service","SHS Pattern","Padayon Iskolar","UPM SHS @50"],estimated_weight_g:20,active:true,sort_order:23},
  {id:"stationery-button-pin-large",name:"Button Pin — Large (58 mm)",description:"Anniversary button pin • choose your design",category:"stationery",price:40,image_key:"stationery-button-pins.jpg",sizes:["UP Seal","SHS Seal","IskoLar","UPM SHS 50 Year","Iskolar ng Bayan","Matapang at Matilino","Serve the People","50th Anniversary Logo","Honor Excellence Service","SHS Pattern","Padayon Iskolar","UPM SHS @50"],estimated_weight_g:30,active:true,sort_order:24},
  {id:"stationery-memo-pad",name:"Memo Pad",description:"50-sheet anniversary memo pad • 5.8 × 8.3 in",category:"stationery",price:55,image_key:"stationery-memo-pad.jpg",sizes:["Design 1 — Dangal, Husay, Serbisyo","Design 2 — Honor, Excellence, Service","Design 3 — Matapang at Matilino"],estimated_weight_g:150,active:true,sort_order:25},
  {id:"stationery-sticky-notes",name:"Sticky Note Pad",description:"50-sheet 3 × 3 in anniversary sticky notes",category:"stationery",price:40,image_key:"stationery-sticky-notes.jpg",sizes:["Design 1","Design 2","Design 3","Design 4"],estimated_weight_g:80,active:true,sort_order:26}

];

const fallbackShippingRates = {
  "Visayas":[[0.5,85],[1,155],[3,180],[4,270],[5,360],[6,455]],
  "Metro Manila":[[0.5,100],[1,180],[3,200],[4,300],[5,400],[6,500]],
  "Luzon":[[0.5,100],[1,180],[3,200],[4,300],[5,400],[6,500]],
  "Mindanao":[[0.5,105],[1,175],[3,200],[4,290],[5,380],[6,475]],
  "Island":[[0.5,115],[1,185],[3,210],[4,300],[5,390],[6,485]]
};

let products = [...fallbackProducts];
let shippingRates = structuredClone(fallbackShippingRates);
let cart = JSON.parse(localStorage.getItem("shs50-cart") || "[]");
let latestOrder = null;

const $ = id => document.getElementById(id);
const peso = n => "₱" + Number(n || 0).toLocaleString("en-PH");
const isShipping = () => $("fulfillmentSelect")?.value === "J&T Express shipping";

function applyConfig(){
  $("gcashName").textContent = cfg.gcashName || "GCash / InstaPay";
  $("gcashNumber").textContent = cfg.gcashNumber || "Scan the QR code to pay";
  $("gcashQr").src = cfg.gcashQrImage || "assets/gcash-qr.jpeg";
  $("proofHint").textContent = `JPG, PNG, WEBP, or PDF • max ${cfg.proofMaxMB || 5} MB`;

  if(!isConfigured){
    $("submitOrderBtn").disabled = true;
    $("connectionNote").hidden = false;
    $("connectionNote").textContent = `Online ordering is temporarily unavailable. Please contact ${cfg.contactEmail || "upmshsat50@gmail.com"}.`;
  }
}

async function loadData(){
  if(!sb){ renderProducts(); renderCart(); return; }

  const [{data:productData},{data:rateData}] = await Promise.all([
    sb.from("merch_products").select("id,name,description,category,price,image_key,sizes,estimated_weight_g,active,sort_order").eq("active",true).order("sort_order"),
    sb.from("shipping_rates").select("destination_zone,weight_max_kg,fee").eq("origin_zone","Visayas").order("weight_max_kg")
  ]);

  if(productData?.length) products = productData;
  if(rateData?.length){
    shippingRates = {};
    for(const r of rateData){
      (shippingRates[r.destination_zone] ||= []).push([Number(r.weight_max_kg),Number(r.fee)]);
    }
  }
  renderProducts();
  renderCart();
}

function variantLabel(p){
  if(p.category==="shirt") return "Size";
  if(p.category==="stationery") return "Design";
  return "Option";
}

function productCard(p){
  return `
    <article class="product-card">
      <div class="product-image">
        <img src="assets/${p.image_key}" alt="${esc(p.name)}">
        <span class="product-tag">${p.category==="stationery" ? "Anniversary" : esc(p.category)}</span>
      </div>
      <div class="product-body">
        <div class="product-line">
          <div><h3 class="product-title">${esc(p.name)}</h3><p class="product-sub">${esc(p.description || "")}</p></div>
          <span class="price">${peso(p.price)}</span>
        </div>
        ${p.sizes?.length ? `
          <div class="variant-row">
            <label class="variant-label" for="size-${p.id}">${variantLabel(p)}</label>
            <select id="size-${p.id}" aria-label="${variantLabel(p)} for ${esc(p.name)}">
              ${p.sizes.map(s=>`<option>${esc(s)}</option>`).join("")}
            </select>
          </div>` : ""}
        <button class="add-btn" type="button" onclick="addToCart('${p.id}')">Add to pre-order</button>
      </div>
    </article>`;
}

function renderProducts(filter="all"){
  const salubongProducts = products
    .filter(p=>["shirt","lanyard"].includes(p.category))
    .filter(p=>filter==="all" || p.category===filter);

  $("productGrid").innerHTML = salubongProducts.map(productCard).join("");

  const stationeryProducts = products.filter(p=>p.category==="stationery");
  if($("stationeryGrid")){
    $("stationeryGrid").innerHTML = stationeryProducts.map(productCard).join("");
  }
}

document.querySelectorAll(".filter").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".filter").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active");
  renderProducts(btn.dataset.filter);
}));

function addToCart(id){
  const p = products.find(x=>x.id===id); if(!p) return;
  const size = p.sizes?.length ? $(`size-${id}`).value : "";
  const key = `${id}__${size || "na"}`;
  const existing = cart.find(x=>x.key===key);
  if(existing) existing.qty += 1;
  else cart.push({key,id,size,qty:1});
  saveCart();
  showToast(`${p.name} added`);
}
function saveCart(){localStorage.setItem("shs50-cart",JSON.stringify(cart));renderCart()}
function changeQty(key,d){const x=cart.find(i=>i.key===key);if(!x)return;x.qty+=d;if(x.qty<=0)cart=cart.filter(i=>i.key!==key);saveCart()}
function removeItem(key){cart=cart.filter(i=>i.key!==key);saveCart()}
function merchTotal(){return cart.reduce((sum,i)=>sum+(findProduct(i.id)?.price||0)*i.qty,0)}
function findProduct(id){return products.find(p=>p.id===id) || fallbackProducts.find(p=>p.id===id)}

function estimatedPackedWeightG(){
  if(!cart.length) return 0;
  return Number(cfg.packagingWeightG || 100) + cart.reduce((sum,i)=>{
    const p=findProduct(i.id); return sum + Number(p?.estimated_weight_g || 0)*i.qty;
  },0);
}
function rateFor(zone, weightKg){
  const rows=shippingRates[zone] || [];
  const row=rows.find(([max])=>weightKg <= max);
  return row ? Number(row[1]) : null;
}
function currentShipping(){
  if(!isShipping()) return {weightG:0,fee:0,zone:""};
  const zone=$("destinationZone")?.value || "";
  const weightG=estimatedPackedWeightG();
  const fee=zone ? rateFor(zone,weightG/1000) : null;
  return {weightG,fee,zone};
}
function orderTotal(){
  const s=currentShipping();
  return merchTotal() + (Number.isFinite(s.fee) ? s.fee : 0);
}

function renderCart(){
  const qty=cart.reduce((s,x)=>s+x.qty,0);
  $("cartCount").textContent=qty;
  if(!cart.length){
    $("cartItems").innerHTML="";
    $("cartEmpty").style.display="block";
    $("cartFooter").style.display="none";
  }else{
    $("cartEmpty").style.display="none";
    $("cartFooter").style.display="block";
    $("cartItems").innerHTML=cart.map(i=>{
      const p=findProduct(i.id); if(!p)return "";
      return `<div class="cart-item">
        <img src="assets/${p.image_key}" alt="">
        <div><h4>${esc(p.name)}</h4><p>${i.size?`${variantLabel(p)}: ${esc(i.size)} • `:""}${peso(p.price)} each</p>
          <div class="qty"><button type="button" onclick="changeQty('${i.key}',-1)">−</button><strong>${i.qty}</strong><button type="button" onclick="changeQty('${i.key}',1)">+</button></div>
          <button class="remove" type="button" onclick="removeItem('${i.key}')">Remove</button>
        </div>
        <strong>${peso(Number(p.price)*i.qty)}</strong>
      </div>`;
    }).join("");
    $("cartTotal").textContent=peso(merchTotal());
  }
  renderCheckoutSummary();
}

function renderCheckoutSummary(){
  const s=currentShipping();
  $("checkoutMerchTotal").textContent=peso(merchTotal());
  $("checkoutShipping").textContent = isShipping() ? (s.fee===null ? "Select zone" : peso(s.fee)) : "₱0";
  $("checkoutTotal").textContent = (isShipping() && s.fee===null) ? "—" : peso(orderTotal());
  $("amountToSend").textContent = (isShipping() && s.fee===null) ? "—" : peso(orderTotal());
  if($("cashAmountDue")) $("cashAmountDue").textContent = peso(orderTotal());
  $("estimatedWeight").textContent = isShipping() ? `${(s.weightG/1000).toFixed(2)} kg` : "—";
  $("shippingFee").textContent = isShipping() ? (s.fee===null ? "Select zone" : peso(s.fee)) : "—";
  $("checkoutItems").innerHTML=cart.map(i=>{
    const p=findProduct(i.id); if(!p)return "";
    return `<div class="checkout-item"><span>${esc(p.name)}${i.size?` • ${esc(i.size)}`:""} × ${i.qty}</span><strong>${peso(Number(p.price)*i.qty)}</strong></div>`;
  }).join("");
}

function selectedPaymentMethod(){
  return document.querySelector('input[name="paymentMethod"]:checked')?.value || "GCash";
}

function updatePaymentUI(){
  const shipping=isShipping();
  const cashOption=$("cashPaymentOption");
  const gcashRadio=document.querySelector('input[name="paymentMethod"][value="GCash"]');
  const cashRadio=document.querySelector('input[name="paymentMethod"][value="Cash on Pick-up"]');

  // Cash is only allowed for Palo campus pick-up.
  cashOption.hidden=shipping || !$("fulfillmentSelect").value;

  if(shipping && cashRadio.checked){
    gcashRadio.checked=true;
  }

  const method=selectedPaymentMethod();
  const cash=method==="Cash on Pick-up";

  $("gcashPaymentPanel").hidden=cash;
  $("cashPaymentPanel").hidden=!cash;
  $("proofInput").required=!cash;
  $("cashAmountDue").textContent=peso(orderTotal());

  renderCheckoutSummary();
}

function toggleShippingFields(){
  const shipping=isShipping();
  $("shippingFields").hidden=!shipping;
  document.querySelectorAll("[data-shipping-required]").forEach(el=>el.required=shipping);
  updatePaymentUI();
}
$("fulfillmentSelect").addEventListener("change",toggleShippingFields);
$("destinationZone").addEventListener("change",renderCheckoutSummary);
document.querySelectorAll('input[name="paymentMethod"]').forEach(radio=>{
  radio.addEventListener("change",updatePaymentUI);
});

function openCart(){$("cartDrawer").classList.add("open");$("cartDrawer").setAttribute("aria-hidden","false");$("drawerBackdrop").hidden=false}
function closeCart(){$("cartDrawer").classList.remove("open");$("cartDrawer").setAttribute("aria-hidden","true");$("drawerBackdrop").hidden=true}
window.openCart=openCart;window.addToCart=addToCart;window.changeQty=changeQty;window.removeItem=removeItem;
$("cartButton").onclick=openCart;$("closeCart").onclick=closeCart;$("drawerBackdrop").onclick=closeCart;
$("checkoutBtn").onclick=()=>{if(!cart.length)return;closeCart();renderCheckoutSummary();$("checkoutModal").hidden=false;document.body.style.overflow="hidden"};
$("closeCheckout").onclick=closeCheckout;
$("checkoutModal").addEventListener("click",e=>{if(e.target===$("checkoutModal"))closeCheckout()});
function closeCheckout(){$("checkoutModal").hidden=true;document.body.style.overflow=""}

$("proofInput").addEventListener("change",()=>{
  const f=$("proofInput").files[0];
  $("proofFileName").textContent=f?f.name:"No file selected";
});

async function uploadProof(file){
  if(!file) return null;
  const max=(cfg.proofMaxMB||5)*1024*1024;
  if(file.size>max) throw new Error(`Payment receipt must be ${cfg.proofMaxMB||5} MB or smaller.`);
  const allowed=["image/jpeg","image/png","image/webp","application/pdf"];
  if(!allowed.includes(file.type)) throw new Error("Please upload JPG, PNG, WEBP, or PDF.");
  const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"");
  const path=`pending/${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}.${ext}`;
  const {error}=await sb.storage.from("payment-proofs").upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});
  if(error) throw error;
  return path;
}

function buildItems(){return cart.map(i=>({product_id:i.id,variant:i.size||"",quantity:i.qty}))}

$("orderForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!isConfigured){showToast("Online ordering is temporarily unavailable.");return}
  if(!cart.length){showToast("Your pre-order bag is empty.");return}

  const fd=new FormData(e.currentTarget);
  const paymentMethod=selectedPaymentMethod();
  const proof=$("proofInput").files[0];

  if(isShipping() && paymentMethod!=="GCash"){
    showToast("J&T shipping orders must be fully paid through GCash/InstaPay.");
    return;
  }

  if(paymentMethod==="GCash" && !proof){
    showToast("Please upload your GCash/InstaPay payment receipt.");
    return;
  }

  if(isShipping()){
    const s=currentShipping();
    if(!s.zone){showToast("Please select your J&T destination zone.");return}
    if(s.fee===null){showToast("This order exceeds the online J&T rate table. Please contact the merch team.");return}
  }

  const btn=$("submitOrderBtn");btn.disabled=true;btn.textContent="Submitting…";

  try{
    const proofPath=paymentMethod==="GCash" ? await uploadProof(proof) : null;
    const payload={
      p_full_name:String(fd.get("fullName")||"").trim(),
      p_program:String(fd.get("program")||""),
      p_email:String(fd.get("email")||"").trim(),
      p_mobile:String(fd.get("mobile")||"").trim(),
      p_campus:String(fd.get("campus")||""),
      p_fulfillment:String(fd.get("fulfillment")||""),
      p_shipping_address:isShipping()?String(fd.get("shippingAddress")||"").trim():"",
      p_shipping_city:isShipping()?String(fd.get("shippingCity")||"").trim():"",
      p_shipping_province:isShipping()?String(fd.get("shippingProvince")||"").trim():"",
      p_shipping_postal:isShipping()?String(fd.get("shippingPostal")||"").trim():"",
      p_destination_zone:isShipping()?String(fd.get("destinationZone")||""):"",
      p_payment_method:paymentMethod,
      p_proof_path:proofPath,
      p_notes:String(fd.get("notes")||"").trim(),
      p_items:buildItems()
    };

    const {data,error}=await sb.rpc("submit_merch_order",payload);
    if(error) throw error;

    const result=typeof data==="string" ? {reference:data,merch_total:merchTotal(),shipping_fee:currentShipping().fee||0,total:orderTotal(),estimated_weight_kg:estimatedPackedWeightG()/1000} : data;
    latestOrder={
      reference:result.reference,
      fullName:fd.get("fullName"),program:fd.get("program"),email:fd.get("email"),mobile:fd.get("mobile"),
      campus:fd.get("campus"),fulfillment:fd.get("fulfillment"),
      shippingAddress:fd.get("shippingAddress")||"",shippingCity:fd.get("shippingCity")||"",
      shippingProvince:fd.get("shippingProvince")||"",shippingPostal:fd.get("shippingPostal")||"",
      destinationZone:fd.get("destinationZone")||"",paymentMethod,notes:fd.get("notes")||"",
      items:cart.map(i=>({...i})),merchTotal:Number(result.merch_total ?? merchTotal()),
      shippingFee:Number(result.shipping_fee ?? 0),total:Number(result.total ?? orderTotal()),
      estimatedWeightKg:Number(result.estimated_weight_kg ?? estimatedPackedWeightG()/1000),
      submittedAt:new Date().toISOString()
    };

    $("successRef").textContent=latestOrder.reference;
    $("successNote").textContent = paymentMethod==="Cash on Pick-up"
      ? "Your Palo pick-up pre-order is reserved. Please pay in cash when you claim your order and keep this reference."
      : "Your payment receipt was submitted for verification. Your pre-order will be confirmed once the Merch Team verifies your payment.";
    $("checkoutModal").hidden=true;
    $("successModal").hidden=false;
    cart=[];localStorage.removeItem("shs50-cart");renderCart();
    e.currentTarget.reset();document.querySelector('input[name="paymentMethod"][value="GCash"]').checked=true;toggleShippingFields();$("proofFileName").textContent="No file selected";
  }catch(err){
    console.error(err);
    showToast(err.message || "Could not submit your order.");
  }finally{
    btn.disabled=!isConfigured;
    btn.textContent="Submit pre-order";
  }
});

$("downloadReceiptBtn").onclick=()=>{if(latestOrder)downloadReceipt(latestOrder)};
$("closeSuccessBtn").onclick=()=>{$("successModal").hidden=true;document.body.style.overflow=""};

function downloadReceipt(o){
  const lines=o.items.map(i=>{
    const p=findProduct(i.id);
    return `- ${p?.name||i.id}${i.size?` (${i.size})`:""} x${i.qty} = ${peso((p?.price||0)*i.qty)}`;
  });
  const shippingLines=o.fulfillment==="J&T Express shipping" ? [
    `Ship to: ${o.shippingAddress}, ${o.shippingCity}, ${o.shippingProvince} ${o.shippingPostal}`,
    `J&T zone: ${o.destinationZone}`,
    `Estimated packed weight: ${o.estimatedWeightKg.toFixed(2)} kg`,
    `Shipping: ${peso(o.shippingFee)}`
  ] : ["Fulfillment: Campus pick-up / distribution — Palo"];

  const txt=[
    "UPM SHS AT 50 — SALUBONG 2026 MERCH PRE-ORDER",
    `Reference: ${o.reference}`,
    `Submitted: ${new Date(o.submittedAt).toLocaleString("en-PH")}`,"",
    `Name: ${o.fullName}`,`Program/Affiliation: ${o.program}`,`Email: ${o.email}`,`Mobile: ${o.mobile}`,`SHS Campus/Affiliation: ${o.campus}`,
    ...shippingLines,`Payment method: ${o.paymentMethod}`,"","ORDER:",...lines,"",`Merch subtotal: ${peso(o.merchTotal)}`,`Shipping: ${peso(o.shippingFee)}`,`TOTAL: ${peso(o.total)}`,"",
    o.paymentMethod==="Cash on Pick-up"
      ? "Cash payment is due when you claim your order in Palo. Please keep this reference."
      : "Your GCash/InstaPay payment is subject to verification by the Merch Team. Please keep this reference."
  ].join("\n");

  const blob=new Blob([txt],{type:"text/plain;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`${o.reference}.txt`;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function showToast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(window._toast);window._toast=setTimeout(()=>t.classList.remove("show"),2400)}

applyConfig();
toggleShippingFields();
updatePaymentUI();
loadData();
