const cfg = window.MERCH_CONFIG || {};
const configured = Boolean(cfg.supabaseUrl && cfg.supabasePublishableKey);

const sb = configured
  ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

let orders = [];
let catalogProducts = [];
let shippingRates = {};
let editingOrder = null;
let editItems = [];

const $ = id => document.getElementById(id);
const peso = n => "₱" + Number(n || 0).toLocaleString("en-PH");
const paymentStatuses = ["Pending","Verified","Rejected","Refunded"];
const orderStatuses = ["New","Confirmed","For Production","Ready for Claim","Completed","Cancelled"];

function paymentStatusOptions(order){
  if(order.payment_method==="Cash on Pick-up"){
    return [
      ["Pending","Cash due on pick-up"],
      ["Verified","Paid"],
      ["Rejected","Payment issue"],
      ["Refunded","Refunded"]
    ];
  }
  return [
    ["Pending","Pending verification"],
    ["Verified","Verified"],
    ["Rejected","Needs correction"],
    ["Refunded","Refunded"]
  ];
}

function paymentMethodLabel(order){
  return order.payment_method==="Cash on Pick-up" ? "Cash on Pick-up" : "GCash / InstaPay";
}

function showToast(message) {
  const t = $("toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(window._toast);
  window._toast = setTimeout(() => t.classList.remove("show"), 2400);
}

function redirectToLogin() {
  window.location.replace("admin.html");
}

async function isAuthorizedAdmin(userId) {
  const { data, error } = await sb
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Admin access check failed:", error);
    return false;
  }
  return Boolean(data?.user_id);
}

async function guardDashboard() {
  if (!configured || !sb) {
    redirectToLogin();
    return;
  }

  const { data, error } = await sb.auth.getUser();

  if (error || !data?.user) {
    redirectToLogin();
    return;
  }

  const allowed = await isAuthorizedAdmin(data.user.id);

  if (!allowed) {
    await sb.auth.signOut();
    redirectToLogin();
    return;
  }

  $("adminEmail").textContent = data.user.email || "Admin";
  $("dashboardLoading").hidden = true;
  $("dashboardView").hidden = false;

  await loadCatalog();
  await loadOrders();
}

async function loadCatalog(){
  const [{data:productData,error:productError},{data:rateData,error:rateError}] = await Promise.all([
    sb.from("merch_products")
      .select("id,name,category,price,sizes,estimated_weight_g,sort_order,active")
      .eq("active",true)
      .order("sort_order"),
    sb.from("shipping_rates")
      .select("destination_zone,weight_max_kg,fee")
      .eq("origin_zone","Visayas")
      .order("weight_max_kg")
  ]);

  if(productError){
    console.error(productError);
    showToast("Could not load merch catalog.");
  } else {
    catalogProducts = productData || [];
  }

  if(rateError){
    console.error(rateError);
  } else {
    shippingRates = {};
    for(const r of rateData || []){
      (shippingRates[r.destination_zone] ||= []).push([
        Number(r.weight_max_kg),
        Number(r.fee)
      ]);
    }
  }
}

$("logoutBtn").addEventListener("click", async () => {
  $("logoutBtn").disabled = true;
  $("logoutBtn").textContent = "Signing out…";
  await sb.auth.signOut();
  redirectToLogin();
});

$("refreshBtn").addEventListener("click", async () => {
  await loadCatalog();
  await loadOrders();
});
$("searchInput").addEventListener("input", renderOrders);
$("paymentFilter").addEventListener("change", renderOrders);
$("orderFilter").addEventListener("change", renderOrders);
$("exportBtn").addEventListener("click", exportCSV);

async function loadOrders() {
  showToast("Refreshing orders…");

  const { data, error } = await sb.from("merch_orders").select(`
    id,reference,full_name,program,email,mobile,campus,fulfillment,notes,
    merch_total,shipping_fee,total,payment_method,payment_status,order_status,
    proof_path,shipping_address,shipping_city,shipping_province,shipping_postal,
    destination_zone,estimated_weight_kg,created_at,updated_at,
    merch_order_items(id,product_id,product_name,variant,quantity,unit_price,subtotal)
  `).order("created_at", { ascending:false });

  if (error) {
    console.error(error);
    showToast("Could not load orders.");
    return;
  }

  orders = data || [];
  renderOrders();
}

function filteredOrders() {
  const q = $("searchInput").value.trim().toLowerCase();
  const pf = $("paymentFilter").value;
  const of = $("orderFilter").value;

  return orders.filter(o => {
    const hay = [
      o.reference,o.full_name,o.email,o.mobile,o.program,o.campus,
      o.shipping_city,o.shipping_province,
      ...(o.merch_order_items || []).map(i=>`${i.product_name} ${i.variant}`)
    ].join(" ").toLowerCase();

    return (!q || hay.includes(q)) &&
      (!pf || o.payment_status === pf) &&
      (!of || o.order_status === of);
  });
}

function renderOrders() {
  const rows = filteredOrders();
  $("emptyState").hidden = rows.length > 0;

  $("ordersBody").innerHTML = rows.map(o => `
    <tr>
      <td>
        <span class="ref">${esc(o.reference)}</span>
        <button class="edit-order-btn" type="button" onclick="openEditOrder('${o.id}')">Edit order</button>
      </td>

      <td class="customer">
        <strong>${esc(o.full_name)}</strong>
        <span>${esc(o.program)} • ${esc(o.campus)}</span>
        <span>${esc(o.email)}</span>
        <span>${esc(o.mobile)}</span>
      </td>

      <td class="items-cell">
        ${(o.merch_order_items || []).map(i =>
          `<span class="item-line">${esc(i.product_name)}${i.variant ? ` • ${esc(i.variant)}` : ""} × ${i.quantity}</span>`
        ).join("")}
      </td>

      <td class="shipping-cell">
        ${o.fulfillment === "J&T Express shipping"
          ? `<strong>J&T • ${esc(o.destination_zone || "")}</strong>
             <span>${esc(o.shipping_address || "")}, ${esc(o.shipping_city || "")}, ${esc(o.shipping_province || "")} ${esc(o.shipping_postal || "")}</span>
             <span>${peso(o.shipping_fee || 0)} • ${Number(o.estimated_weight_kg || 0).toFixed(2)} kg</span>`
          : `<strong>${esc(o.fulfillment || "Pick-up")}</strong><span>No courier fee</span>`}
      </td>

      <td>
        <strong>${peso(o.total)}</strong>
        <span class="date-small">Merch ${peso(o.merch_total || 0)}</span>
      </td>

      <td>
        <span class="payment-method-label">${esc(paymentMethodLabel(o))}</span>
        <select class="status-select" onchange="updateStatus('${o.id}','payment_status',this.value)">
          ${paymentStatusOptions(o).map(([value,label]) => `<option value="${value}" ${value === o.payment_status ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </td>

      <td>
        <select class="status-select" onchange="updateStatus('${o.id}','order_status',this.value)">
          ${orderStatuses.map(s => `<option ${s === o.order_status ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </td>

      <td>
        ${o.proof_path
          ? `<button class="proof-btn" onclick="viewProof('${escAttr(o.proof_path)}')">Open proof</button>`
          : `<span class="no-proof">None</span>`}
      </td>

      <td>
        <span>${new Date(o.created_at).toLocaleDateString("en-PH")}</span>
        <span class="date-small">${new Date(o.created_at).toLocaleTimeString("en-PH",{hour:"2-digit",minute:"2-digit"})}</span>
      </td>
    </tr>
  `).join("");

  updateStats();
}

function updateStats() {
  $("statOrders").textContent = orders.length;
  $("statSales").textContent = peso(
    orders
      .filter(o => o.order_status !== "Cancelled")
      .reduce((s,o) => s + Number(o.total || 0), 0)
  );
  $("statPending").textContent = orders.filter(o => o.payment_status === "Pending").length;
  $("statReady").textContent = orders.filter(o => o.order_status === "Ready for Claim").length;
}

async function updateStatus(id, column, value) {
  if (!["payment_status","order_status"].includes(column)) return;

  const { error } = await sb
    .from("merch_orders")
    .update({ [column]:value, updated_at:new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error(error);
    showToast("Could not update status.");
    return;
  }

  const order = orders.find(x => x.id === id);
  if (order) order[column] = value;

  updateStats();

  const updated = orders.find(x => x.id === id);
  if(column==="payment_status" && value==="Verified"){
    showToast(updated?.payment_method==="Cash on Pick-up" ? "Cash payment marked paid" : "Payment verified");
  } else {
    showToast("Status updated");
  }
}

async function viewProof(path) {
  const { data, error } = await sb.storage
    .from("payment-proofs")
    .createSignedUrl(path, 60);

  if (error) {
    console.error(error);
    showToast("Could not open payment proof.");
    return;
  }

  window.open(data.signedUrl, "_blank", "noopener");
}

/* ------------------------------
   ORDER EDITING
------------------------------ */

function productById(id){
  return catalogProducts.find(p=>p.id===id);
}

function rateFor(zone, weightKg){
  const rows = shippingRates[zone] || [];
  const found = rows.find(([max]) => weightKg <= max);
  return found ? Number(found[1]) : null;
}

function openEditOrder(id){
  const source = orders.find(o=>o.id===id);
  if(!source) return;

  if(!catalogProducts.length){
    showToast("Product catalog is still loading. Please refresh and try again.");
    return;
  }

  editingOrder = JSON.parse(JSON.stringify(source));
  editItems = (source.merch_order_items || []).map(i=>({
    product_id:i.product_id,
    variant:i.variant || "",
    quantity:Number(i.quantity || 1)
  }));

  $("editOrderRef").textContent = source.reference;
  $("editFullName").value = source.full_name || "";
  $("editProgram").value = source.program || "";
  $("editEmail").value = source.email || "";
  $("editMobile").value = source.mobile || "";
  $("editCampus").value = source.campus || "";
  $("editFulfillment").value = source.fulfillment || "Campus pick-up";
  $("editShippingAddress").value = source.shipping_address || "";
  $("editShippingCity").value = source.shipping_city || "";
  $("editShippingProvince").value = source.shipping_province || "";
  $("editShippingPostal").value = source.shipping_postal || "";
  $("editDestinationZone").value = source.destination_zone || "";
  $("editBuyerNotes").value = source.notes || "";
  $("editAdminNote").value = "";
  $("editPreviousTotal").textContent = peso(source.total);

  const shippingOption = $("editFulfillment").querySelector('option[value="J&T Express shipping"]');
  shippingOption.disabled = source.payment_method === "Cash on Pick-up";

  $("editPaymentBadge").textContent = `${paymentMethodLabel(source)} • ${paymentStatusOptions(source).find(x=>x[0]===source.payment_status)?.[1] || source.payment_status}`;

  toggleEditShipping();
  renderEditItems();
  recalculateEditTotals();
  loadEditHistory(source.id);

  $("editOrderModal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeEditOrder(){
  $("editOrderModal").hidden = true;
  document.body.style.overflow = "";
  editingOrder = null;
  editItems = [];
}

function toggleEditShipping(){
  if(!editingOrder) return;

  if(editingOrder.payment_method === "Cash on Pick-up" &&
     $("editFulfillment").value === "J&T Express shipping"){
    $("editFulfillment").value = "Campus pick-up";
    showToast("Cash orders can only be fulfilled through Palo campus pick-up.");
  }

  const shipping = $("editFulfillment").value === "J&T Express shipping";
  $("editShippingFields").hidden = !shipping;
  recalculateEditTotals();
}

function productOptions(selectedId){
  return catalogProducts.map(p=>
    `<option value="${escAttr(p.id)}" ${p.id===selectedId ? "selected" : ""}>${esc(p.name)} — ${peso(p.price)}</option>`
  ).join("");
}

function variantControl(item, index){
  const p = productById(item.product_id);
  if(p?.sizes?.length){
    const current = p.sizes.includes(item.variant) ? item.variant : p.sizes[0];
    item.variant = current;
    return `
      <label>Size
        <select onchange="editItemVariantChanged(${index},this.value)">
          ${p.sizes.map(s=>`<option ${s===current ? "selected" : ""}>${esc(s)}</option>`).join("")}
        </select>
      </label>`;
  }
  item.variant = "";
  return `
    <label>Variation
      <input value="Design is selected above" disabled>
    </label>`;
}

function renderEditItems(){
  if(!editItems.length){
    $("editItemsList").innerHTML = `<div class="edit-empty-items">No items. Add at least one item before saving.</div>`;
    recalculateEditTotals();
    return;
  }

  $("editItemsList").innerHTML = editItems.map((item,index)=>{
    const p = productById(item.product_id);
    const lineTotal = Number(p?.price || 0) * Number(item.quantity || 0);

    return `
      <div class="edit-item-row">
        <label class="edit-product-label">Product / Design
          <select onchange="editItemProductChanged(${index},this.value)">
            ${productOptions(item.product_id)}
          </select>
        </label>

        ${variantControl(item,index)}

        <label>Qty
          <input type="number" min="1" max="20" value="${Number(item.quantity || 1)}"
            oninput="editItemQtyChanged(${index},this.value)">
        </label>

        <div class="edit-line-total">
          <span>Line total</span>
          <strong>${peso(lineTotal)}</strong>
        </div>

        <button type="button" class="remove-edit-item" onclick="removeEditItem(${index})" aria-label="Remove item">Remove</button>
      </div>`;
  }).join("");

  recalculateEditTotals();
}

function editItemProductChanged(index, productId){
  const item = editItems[index];
  const p = productById(productId);
  if(!item || !p) return;

  item.product_id = productId;
  item.variant = p.sizes?.length ? p.sizes[0] : "";
  renderEditItems();
}

function editItemVariantChanged(index, variant){
  if(!editItems[index]) return;
  editItems[index].variant = variant;
  recalculateEditTotals();
}

function editItemQtyChanged(index, qty){
  if(!editItems[index]) return;
  editItems[index].quantity = Math.max(1, Math.min(20, Number(qty || 1)));
  recalculateEditTotals();
}

function removeEditItem(index){
  editItems.splice(index,1);
  renderEditItems();
}

function addEditItem(){
  const first = catalogProducts[0];
  if(!first){
    showToast("No active products found.");
    return;
  }
  editItems.push({
    product_id:first.id,
    variant:first.sizes?.[0] || "",
    quantity:1
  });
  renderEditItems();
}

function calculateEditedOrder(){
  const merchTotal = editItems.reduce((sum,item)=>{
    const p = productById(item.product_id);
    return sum + Number(p?.price || 0) * Number(item.quantity || 0);
  },0);

  const shipping = $("editFulfillment").value === "J&T Express shipping";
  let weightG = 0;
  let shippingFee = 0;
  let shippingRateAvailable = true;

  if(shipping){
    weightG = Number(cfg.packagingWeightG || 100) + editItems.reduce((sum,item)=>{
      const p = productById(item.product_id);
      return sum + Number(p?.estimated_weight_g || 0) * Number(item.quantity || 0);
    },0);

    const zone = $("editDestinationZone").value;
    shippingFee = zone ? rateFor(zone,weightG/1000) : null;
    shippingRateAvailable = Number.isFinite(shippingFee);
  }

  const total = merchTotal + (Number.isFinite(shippingFee) ? shippingFee : 0);

  return {
    merchTotal,
    shippingFee,
    weightG,
    total,
    shipping,
    shippingRateAvailable
  };
}

function recalculateEditTotals(){
  if(!editingOrder) return;
  const calc = calculateEditedOrder();
  const oldTotal = Number(editingOrder.total || 0);
  const diff = calc.total - oldTotal;

  $("editNewTotal").textContent = calc.shipping && !calc.shippingRateAvailable
    ? "Rate unavailable"
    : peso(calc.total);

  const diffEl = $("editDifference");
  if(calc.shipping && !calc.shippingRateAvailable){
    diffEl.textContent = "Cannot calculate";
    diffEl.dataset.type = "warning";
  } else if(Math.abs(diff) < 0.001){
    diffEl.textContent = "No change";
    diffEl.dataset.type = "same";
  } else if(diff > 0){
    diffEl.textContent = `+${peso(diff)} due`;
    diffEl.dataset.type = "increase";
  } else {
    diffEl.textContent = `${peso(Math.abs(diff))} refund / credit`;
    diffEl.dataset.type = "decrease";
  }

  if(calc.shipping){
    $("editShippingEstimate").textContent = calc.shippingRateAvailable
      ? `Estimated parcel: ${(calc.weightG/1000).toFixed(2)} kg • J&T fee: ${peso(calc.shippingFee)}`
      : `Estimated parcel: ${(calc.weightG/1000).toFixed(2)} kg • No matching online J&T rate.`;
  } else {
    $("editShippingEstimate").textContent = "Palo campus pick-up • no courier fee.";
  }

  const impact = $("editPaymentImpact");
  impact.className = "edit-payment-impact";

  if(calc.shipping && !calc.shippingRateAvailable){
    impact.textContent = "Select a valid destination zone or reduce the parcel size before saving.";
    impact.classList.add("warning");
  } else if(diff > 0 && editingOrder.payment_status === "Verified"){
    impact.textContent = `This order was already marked paid/verified. Saving a higher total will return its payment status to Pending so the additional ${peso(diff)} can be collected and verified.`;
    impact.classList.add("warning");
  } else if(diff < 0 && editingOrder.payment_status === "Verified"){
    impact.textContent = `The revised order is ${peso(Math.abs(diff))} lower than the paid amount. The edit history will record this as a possible refund/credit due.`;
    impact.classList.add("refund");
  } else if(diff > 0){
    impact.textContent = `Additional amount due after this edit: ${peso(diff)}.`;
    impact.classList.add("warning");
  } else if(diff < 0){
    impact.textContent = `The new total is ${peso(Math.abs(diff))} lower than the previous total.`;
    impact.classList.add("refund");
  } else {
    impact.textContent = "The order total will not change.";
    impact.classList.add("same");
  }
}

async function loadEditHistory(orderId){
  $("editHistory").innerHTML = `<span class="muted">Loading edit history…</span>`;

  const {data,error} = await sb
    .from("merch_order_edits")
    .select("id,admin_email,edit_note,old_total,new_total,amount_difference,created_at")
    .eq("order_id",orderId)
    .order("created_at",{ascending:false})
    .limit(8);

  if(error){
    console.error(error);
    $("editHistory").innerHTML = `<span class="muted">Edit history will be available after the V11 SQL patch is installed.</span>`;
    return;
  }

  if(!data?.length){
    $("editHistory").innerHTML = `<span class="muted">No previous edits.</span>`;
    return;
  }

  $("editHistory").innerHTML = data.map(row=>{
    const diff = Number(row.amount_difference || 0);
    const change = Math.abs(diff) < .001
      ? "Total unchanged"
      : diff > 0
        ? `Total +${peso(diff)}`
        : `Total −${peso(Math.abs(diff))}`;

    return `
      <div class="edit-history-entry">
        <div>
          <strong>${esc(row.admin_email || "Admin")}</strong>
          <span>${new Date(row.created_at).toLocaleString("en-PH")}</span>
        </div>
        <p>${esc(row.edit_note)}</p>
        <small>${change} • ${peso(row.old_total)} → ${peso(row.new_total)}</small>
      </div>`;
  }).join("");
}

async function saveEditedOrder(event){
  event.preventDefault();
  if(!editingOrder) return;

  if(!editItems.length){
    showToast("Add at least one order item.");
    return;
  }

  const editNote = $("editAdminNote").value.trim();
  if(editNote.length < 3){
    showToast("Please add a short admin edit note.");
    $("editAdminNote").focus();
    return;
  }

  const shipping = $("editFulfillment").value === "J&T Express shipping";
  const calc = calculateEditedOrder();

  if(shipping && editingOrder.payment_method === "Cash on Pick-up"){
    showToast("Cash-on-pick-up orders cannot be changed to J&T shipping.");
    return;
  }

  if(shipping){
    if(!$("editShippingAddress").value.trim() ||
       !$("editShippingCity").value.trim() ||
       !$("editShippingProvince").value.trim() ||
       !$("editDestinationZone").value){
      showToast("Complete the J&T shipping details first.");
      return;
    }

    if(!calc.shippingRateAvailable){
      showToast("No J&T rate is available for this edited order.");
      return;
    }
  }

  const payloadItems = editItems.map(item=>({
    product_id:item.product_id,
    variant:item.variant || "",
    quantity:Number(item.quantity)
  }));

  const button = $("saveEditBtn");
  button.disabled = true;
  button.textContent = "Saving…";

  try{
    const {data,error} = await sb.rpc("admin_update_merch_order",{
      p_order_id:editingOrder.id,
      p_full_name:$("editFullName").value.trim(),
      p_program:$("editProgram").value.trim(),
      p_email:$("editEmail").value.trim(),
      p_mobile:$("editMobile").value.trim(),
      p_campus:$("editCampus").value.trim(),
      p_fulfillment:$("editFulfillment").value,
      p_shipping_address:shipping ? $("editShippingAddress").value.trim() : "",
      p_shipping_city:shipping ? $("editShippingCity").value.trim() : "",
      p_shipping_province:shipping ? $("editShippingProvince").value.trim() : "",
      p_shipping_postal:shipping ? $("editShippingPostal").value.trim() : "",
      p_destination_zone:shipping ? $("editDestinationZone").value : "",
      p_notes:$("editBuyerNotes").value.trim(),
      p_items:payloadItems,
      p_edit_note:editNote
    });

    if(error) throw error;

    const result = typeof data === "string" ? {} : (data || {});
    closeEditOrder();
    await loadOrders();

    if(result.payment_reset){
      showToast(`Order updated • ${peso(result.amount_difference)} additional payment due`);
    } else if(Number(result.refund_or_credit_due || 0) > 0){
      showToast(`Order updated • ${peso(result.refund_or_credit_due)} refund/credit to review`);
    } else {
      showToast("Order updated successfully");
    }
  }catch(error){
    console.error(error);
    showToast(error.message || "Could not save the order edit.");
  }finally{
    button.disabled = false;
    button.textContent = "Save changes";
  }
}

$("editOrderForm").addEventListener("submit",saveEditedOrder);
$("editFulfillment").addEventListener("change",toggleEditShipping);
$("editDestinationZone").addEventListener("change",recalculateEditTotals);
$("addEditItemBtn").addEventListener("click",addEditItem);
$("closeEditModalBtn").addEventListener("click",closeEditOrder);
$("cancelEditBtn").addEventListener("click",closeEditOrder);
document.querySelector("[data-close-edit]").addEventListener("click",closeEditOrder);
document.addEventListener("keydown",event=>{
  if(event.key==="Escape" && !$("editOrderModal").hidden) closeEditOrder();
});

/* ------------------------------
   CSV EXPORT
------------------------------ */

function exportCSV() {
  const rows = filteredOrders();

  const header = [
    "Reference","Full Name","Program","Email","Mobile","Campus","Fulfillment",
    "Shipping Address","Destination Zone","Estimated Weight kg",
    "Merch Subtotal","Shipping Fee","Total","Items",
    "Payment Method","Payment Status","Order Status","Submitted"
  ];

  const data = rows.map(o => [
    o.reference,o.full_name,o.program,o.email,o.mobile,o.campus,o.fulfillment,
    [o.shipping_address,o.shipping_city,o.shipping_province,o.shipping_postal].filter(Boolean).join(", "),
    o.destination_zone,o.estimated_weight_kg,o.merch_total,o.shipping_fee,o.total,
    (o.merch_order_items || [])
      .map(i => `${i.product_name}${i.variant ? ` (${i.variant})` : ""} x${i.quantity}`)
      .join(" | "),
    o.payment_method,o.payment_status,o.order_status,o.created_at
  ]);

  const csv = [header, ...data]
    .map(row => row.map(csvCell).join(","))
    .join("\n");

  const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `shs50-merch-orders-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();

  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function csvCell(value) {
  const s = String(value ?? "");
  return `"${s.replaceAll('"','""')}"`;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[char]));
}

function escAttr(value) {
  return String(value ?? "")
    .replace(/\\/g,"\\\\")
    .replace(/'/g,"\\'");
}

window.updateStatus = updateStatus;
window.viewProof = viewProof;
window.openEditOrder = openEditOrder;
window.editItemProductChanged = editItemProductChanged;
window.editItemVariantChanged = editItemVariantChanged;
window.editItemQtyChanged = editItemQtyChanged;
window.removeEditItem = removeEditItem;

guardDashboard();
