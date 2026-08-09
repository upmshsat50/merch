const ORDER_ENDPOINT = ""; 
// OPTIONAL: Paste your deployed Google Apps Script / Formspree / backend endpoint above.
// If left blank, the site still creates a downloadable order receipt for the buyer.

const products = [
  {
    id:"shirt-upm-shs",
    name:"UPM SHS 50 Shirt",
    short:"Classic UPM SHS identity shirt",
    category:"shirt",
    price:350,
    image:"assets/shirt-upm-shs.jpg",
    sizes:["XS","S","M","L","XL","2XL","3XL"]
  },
  {
    id:"shirt-midwifery",
    name:"Midwifery Shirt",
    short:"UPM SHS Midwifery edition",
    category:"shirt",
    price:350,
    image:"assets/shirt-midwifery.jpg",
    sizes:["XS","S","M","L","XL","2XL","3XL"]
  },
  {
    id:"shirt-nursing",
    name:"Nursing Shirt",
    short:"UPM SHS Nursing edition",
    category:"shirt",
    price:350,
    image:"assets/shirt-nursing.jpg",
    sizes:["XS","S","M","L","XL","2XL","3XL"]
  },
  {
    id:"shirt-medicine",
    name:"Medicine Shirt",
    short:"UPM SHS Medicine edition",
    category:"shirt",
    price:350,
    image:"assets/shirt-medicine.jpg",
    sizes:["XS","S","M","L","XL","2XL","3XL"]
  },
  {
    id:"lanyard-shs",
    name:"SHS Commemorative Lanyard",
    short:"Jafar M. Lomantong / School of Health Sciences design",
    category:"lanyard",
    price:100,
    image:"assets/lanyard-shs.jpg"
  },
  {
    id:"lanyard-medicine",
    name:"Medicine Lanyard",
    short:"UPM SHS Medicine lanyard",
    category:"lanyard",
    price:175,
    image:"assets/lanyard-medicine.jpg"
  },
  {
    id:"lanyard-nursing",
    name:"Nursing Lanyard",
    short:"UPM SHS Nursing lanyard",
    category:"lanyard",
    price:175,
    image:"assets/lanyard-nursing.jpg"
  },
  {
    id:"lanyard-midwifery",
    name:"Midwifery Lanyard",
    short:"UPM SHS Midwifery lanyard",
    category:"lanyard",
    price:175,
    image:"assets/lanyard-midwifery.jpg"
  }
];

let cart = JSON.parse(localStorage.getItem("shs50-cart") || "[]");

const peso = n => "₱" + Number(n).toLocaleString("en-PH");
const productGrid = document.getElementById("productGrid");

function renderProducts(filter="all"){
  productGrid.innerHTML = products
    .filter(p => filter==="all" || p.category===filter)
    .map(p => `
      <article class="product-card">
        <div class="product-image">
          <img src="${p.image}" alt="${p.name}">
          <span class="product-tag">${p.category === "shirt" ? "Shirt" : "Lanyard"}</span>
        </div>
        <div class="product-body">
          <div class="product-line">
            <div>
              <h3 class="product-title">${p.name}</h3>
              <p class="product-sub">${p.short}</p>
            </div>
            <span class="price">${peso(p.price)}</span>
          </div>
          ${p.sizes ? `
            <div class="variant-row">
              <select id="size-${p.id}" aria-label="Select size for ${p.name}">
                ${p.sizes.map(s => `<option value="${s}">${s}</option>`).join("")}
              </select>
            </div>` : ""}
          <button class="add-btn" onclick="addToCart('${p.id}')">Add to pre-order</button>
        </div>
      </article>
    `).join("");
}

document.querySelectorAll(".filter").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".filter").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    renderProducts(btn.dataset.filter);
  });
});

function addToCart(id){
  const p = products.find(x=>x.id===id);
  const size = p.sizes ? document.getElementById(`size-${id}`).value : null;
  const key = `${id}__${size || "na"}`;
  const existing = cart.find(x=>x.key===key);
  if(existing) existing.qty += 1;
  else cart.push({key,id,size,qty:1});
  saveCart();
  showToast(`${p.name} added`);
}

function saveCart(){
  localStorage.setItem("shs50-cart", JSON.stringify(cart));
  renderCart();
}

function renderCart(){
  const totalQty = cart.reduce((s,x)=>s+x.qty,0);
  document.getElementById("cartCount").textContent = totalQty;
  const list = document.getElementById("cartItems");
  const empty = document.getElementById("cartEmpty");
  const footer = document.getElementById("cartFooter");

  if(!cart.length){
    list.innerHTML="";
    empty.style.display="block";
    footer.style.display="none";
    return;
  }
  empty.style.display="none";
  footer.style.display="block";

  list.innerHTML = cart.map(item=>{
    const p = products.find(x=>x.id===item.id);
    return `
      <div class="cart-item">
        <img src="${p.image}" alt="">
        <div>
          <h4>${p.name}</h4>
          <p>${item.size ? `Size ${item.size} • ` : ""}${peso(p.price)} each</p>
          <div class="qty">
            <button type="button" onclick="changeQty('${item.key}',-1)">−</button>
            <strong>${item.qty}</strong>
            <button type="button" onclick="changeQty('${item.key}',1)">+</button>
          </div>
          <button class="remove" type="button" onclick="removeItem('${item.key}')">Remove</button>
        </div>
        <strong>${peso(p.price*item.qty)}</strong>
      </div>
    `;
  }).join("");

  const total = cart.reduce((s,item)=>{
    const p = products.find(x=>x.id===item.id);
    return s + p.price*item.qty;
  },0);
  document.getElementById("cartTotal").textContent = peso(total);
  document.getElementById("checkoutTotal").textContent = peso(total);
  document.getElementById("checkoutItemCount").textContent = `${totalQty} item${totalQty===1?"":"s"}`;
}

function changeQty(key,delta){
  const item = cart.find(x=>x.key===key);
  if(!item) return;
  item.qty += delta;
  if(item.qty<=0) cart = cart.filter(x=>x.key!==key);
  saveCart();
}
function removeItem(key){
  cart = cart.filter(x=>x.key!==key);
  saveCart();
}

const drawer = document.getElementById("cartDrawer");
const backdrop = document.getElementById("drawerBackdrop");
function openCart(){
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden","false");
  backdrop.hidden=false;
}
function closeCart(){
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden","true");
  backdrop.hidden=true;
}
window.openCart = openCart;
document.getElementById("cartButton").onclick=openCart;
document.getElementById("closeCart").onclick=closeCart;
backdrop.onclick=closeCart;

const checkoutModal = document.getElementById("checkoutModal");
document.getElementById("checkoutBtn").onclick=()=>{
  if(!cart.length) return;
  closeCart();
  checkoutModal.hidden=false;
  document.body.style.overflow="hidden";
};
document.getElementById("closeCheckout").onclick=closeCheckout;
checkoutModal.addEventListener("click",e=>{if(e.target===checkoutModal) closeCheckout();});
function closeCheckout(){
  checkoutModal.hidden=true;
  document.body.style.overflow="";
}

function makeOrder(formData){
  const lines = cart.map(item=>{
    const p=products.find(x=>x.id===item.id);
    return {
      product:p.name,
      variant:item.size || "",
      quantity:item.qty,
      unitPrice:p.price,
      subtotal:p.price*item.qty
    };
  });
  const total = lines.reduce((s,x)=>s+x.subtotal,0);
  const ref = `SHS50-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
  return {
    reference:ref,
    submittedAt:new Date().toISOString(),
    customer:Object.fromEntries(formData.entries()),
    items:lines,
    total
  };
}

function downloadReceipt(order){
  const text = [
    "UPM SHS AT 50 — SALUBONG 2026 MERCH PRE-ORDER",
    `Reference: ${order.reference}`,
    "",
    `Name: ${order.customer.fullName}`,
    `Program/Affiliation: ${order.customer.program}`,
    `Email: ${order.customer.email}`,
    `Mobile: ${order.customer.mobile}`,
    `Campus/Location: ${order.customer.campus}`,
    `Fulfillment: ${order.customer.fulfillment}`,
    `Notes: ${order.customer.notes || "-"}`,
    "",
    "ORDER:",
    ...order.items.map(x=>`- ${x.product}${x.variant?` (${x.variant})`:""} x${x.quantity} = ${peso(x.subtotal)}`),
    "",
    `TOTAL: ${peso(order.total)}`,
    "",
    "This receipt records the buyer's submitted pre-order. Payment and fulfillment remain subject to organizer confirmation."
  ].join("\n");
  const blob = new Blob([text],{type:"text/plain;charset=utf-8"});
  const a = document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`${order.reference}.txt`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

document.getElementById("orderForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!cart.length){showToast("Your pre-order bag is empty.");return;}
  const formData = new FormData(e.currentTarget);
  const order = makeOrder(formData);
  const btn=e.currentTarget.querySelector('button[type="submit"]');
  btn.disabled=true;
  btn.textContent="Submitting…";

  try{
    if(ORDER_ENDPOINT){
      const res=await fetch(ORDER_ENDPOINT,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(order)
      });
      if(!res.ok) throw new Error("Submission failed");
    }
    downloadReceipt(order);
    localStorage.removeItem("shs50-cart");
    cart=[];
    renderCart();
    e.currentTarget.reset();
    closeCheckout();
    showToast(ORDER_ENDPOINT ? `Pre-order submitted: ${order.reference}` : `Receipt created: ${order.reference}`);
  }catch(err){
    showToast("Could not submit. Please try again.");
  }finally{
    btn.disabled=false;
    btn.textContent="Submit pre-order";
  }
});

document.getElementById("endpointNote").textContent = ORDER_ENDPOINT
  ? "Your order will be sent to the configured organizer endpoint."
  : "Demo mode: the site will download an order receipt. Add your organizer endpoint in app.js to collect orders online.";

function showToast(msg){
  const toast=document.getElementById("toast");
  toast.textContent=msg;
  toast.classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer=setTimeout(()=>toast.classList.remove("show"),2300);
}

renderProducts();
renderCart();
