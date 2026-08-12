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
let productionProgress = [];
let orderFinance = [];
let expenses = [];
let legacySettings = null;
let legacyPrices = [];
let legacyInventory = [];
let legacyCollectibles = [];
let legacyObligations = [];
let legacyCashEntries = [];

const $ = id => document.getElementById(id);
const peso = n => "₱" + Number(n || 0).toLocaleString("en-PH", {maximumFractionDigits:2});
const todayISO = () => new Date().toISOString().slice(0,10);
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
  await loadOperationsData();
  await loadLegacyData();
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
  await loadOperationsData();
  await loadLegacyData();
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
      <label>${p.category==="stationery" ? "Design" : "Size"}
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
   DASHBOARD TABS
------------------------------ */

document.querySelectorAll(".admin-tab").forEach(button=>{
  button.addEventListener("click",()=>{
    const tab = button.dataset.tab;
    document.querySelectorAll(".admin-tab").forEach(b=>b.classList.toggle("active",b===button));
    $("ordersPanel").hidden = tab!=="orders";
    $("productionPanel").hidden = tab!=="production";
    $("financePanel").hidden = tab!=="finance";
    $("legacyPanel").hidden = tab!=="legacy";

    if(tab==="production") renderProductionSummary();
    if(tab==="finance") renderFinance();
    if(tab==="legacy") renderLegacy();
  });
});

$("refreshProductionBtn").addEventListener("click", async ()=>{
  await loadOperationsData();
  renderProductionSummary();
  showToast("Production summary refreshed");
});

$("refreshFinanceBtn").addEventListener("click", async ()=>{
  await loadOperationsData();
  renderFinance();
  showToast("Finance refreshed");
});

/* ------------------------------
   OPERATIONS DATA
------------------------------ */

async function loadOperationsData(){
  const [progressRes, financeRes, expenseRes] = await Promise.all([
    sb.from("merch_production_progress")
      .select("product_id,variant,produced_qty,note,updated_at"),
    sb.from("merch_order_finance")
      .select("order_id,amount_received,amount_refunded,updated_at"),
    sb.from("merch_expenses")
      .select("id,category,description,quantity,unit_cost,amount,status,expense_date,created_at,updated_at")
      .order("expense_date",{ascending:false})
      .order("created_at",{ascending:false})
  ]);

  if(progressRes.error){
    console.error(progressRes.error);
    showToast("Run the V12 SQL patch to enable Production & Finance.");
    return;
  }
  if(financeRes.error){
    console.error(financeRes.error);
    showToast("Finance tables are not available yet.");
    return;
  }
  if(expenseRes.error){
    console.error(expenseRes.error);
    return;
  }

  productionProgress = progressRes.data || [];
  orderFinance = financeRes.data || [];
  expenses = expenseRes.data || [];

  renderProductionSummary();
  renderFinance();
}

function isCommittedOrder(order){
  return ["Confirmed","For Production","Ready for Claim","Completed"].includes(order.order_status);
}

function isActiveOrder(order){
  return order.order_status !== "Cancelled";
}

function productionKey(productId,variant){
  return `${productId}::${variant || ""}`;
}

function productionRows(){
  const map = new Map();

  function ensure(item){
    const key = productionKey(item.product_id,item.variant);
    if(!map.has(key)){
      const p = productById(item.product_id);
      map.set(key,{
        key,
        product_id:item.product_id,
        product_name:item.product_name || p?.name || "Item",
        variant:item.variant || "",
        committed:0,
        pending:0,
        autoReady:0,
        manualProduced:0,
        produced:0,
        remaining:0
      });
    }
    return map.get(key);
  }

  for(const order of orders){
    if(!isActiveOrder(order)) continue;

    for(const item of order.merch_order_items || []){
      const p = productById(item.product_id);
      if(
        p?.category==="stationery" ||
        ["anniversary-sublimation-polo","anniversary-embroidered-polo-maroon","anniversary-two-tone-tote"].includes(p?.id)
      ) continue;

      const row = ensure(item);
      const qty = Number(item.quantity || 0);

      if(isCommittedOrder(order)){
        row.committed += qty;
      } else {
        row.pending += qty;
      }

      if(["Ready for Claim","Completed"].includes(order.order_status)){
        row.autoReady += qty;
      }
    }
  }

  for(const progress of productionProgress){
    const progressProduct = productById(progress.product_id);
    if(
      progressProduct?.category==="stationery" ||
      ["anniversary-sublimation-polo","anniversary-embroidered-polo-maroon","anniversary-two-tone-tote"].includes(progressProduct?.id)
    ) continue;

    const key = productionKey(progress.product_id,progress.variant);
    let row = map.get(key);

    if(!row){
      const p = productById(progress.product_id);
      row = {
        key,
        product_id:progress.product_id,
        product_name:p?.name || "Item",
        variant:progress.variant || "",
        committed:0,
        pending:0,
        autoReady:0,
        manualProduced:0,
        produced:0,
        remaining:0
      };
      map.set(key,row);
    }

    row.manualProduced = Number(progress.produced_qty || 0);
  }

  const rows = [...map.values()];
  for(const row of rows){
    row.produced = Math.max(row.manualProduced,row.autoReady);
    row.remaining = Math.max(row.committed-row.produced,0);
  }

  return rows.sort((a,b)=>{
    const pa = catalogProducts.findIndex(p=>p.id===a.product_id);
    const pb = catalogProducts.findIndex(p=>p.id===b.product_id);
    if(pa!==pb) return (pa<0?999:pa)-(pb<0?999:pb);
    return String(a.variant).localeCompare(String(b.variant));
  });
}

function renderProductionSummary(){
  if(!$("productionBody")) return;
  const rows = productionRows();

  const committed = rows.reduce((s,r)=>s+r.committed,0);
  const pending = rows.reduce((s,r)=>s+r.pending,0);
  const produced = rows.reduce((s,r)=>s+Math.min(r.produced,r.committed),0);
  const remaining = rows.reduce((s,r)=>s+r.remaining,0);

  $("prodCommittedUnits").textContent = committed.toLocaleString();
  $("prodPendingUnits").textContent = pending.toLocaleString();
  $("prodProducedUnits").textContent = produced.toLocaleString();
  $("prodRemainingUnits").textContent = remaining.toLocaleString();

  $("productionEmpty").hidden = rows.length>0;
  $("productionBody").innerHTML = rows.map(row=>`
    <tr>
      <td><strong>${esc(row.product_name)}</strong></td>
      <td>${row.variant ? esc(row.variant) : "—"}</td>
      <td><strong>${row.committed}</strong></td>
      <td>${row.pending}</td>
      <td>${row.committed+row.pending}</td>
      <td>${row.produced}${row.autoReady>row.manualProduced ? `<span class="auto-produced-note">incl. ${row.autoReady} ready/completed</span>` : ""}</td>
      <td><strong class="${row.remaining>0 ? "remaining-count" : ""}">${row.remaining}</strong></td>
      <td>
        <div class="production-update">
          <input type="number" min="0" step="1" id="prod-${safeId(row.key)}" value="${row.manualProduced}">
          <button type="button" class="ghost-btn" onclick="saveProductionProgress('${escAttr(row.product_id)}','${escAttr(row.variant)}','${safeId(row.key)}')">Save</button>
        </div>
      </td>
    </tr>
  `).join("");
}

async function saveProductionProgress(productId,variant,inputId){
  const qty = Math.max(0,Number($(`prod-${inputId}`).value || 0));

  const {error} = await sb
    .from("merch_production_progress")
    .upsert({
      product_id:productId,
      variant:variant || "",
      produced_qty:qty,
      updated_at:new Date().toISOString()
    },{onConflict:"product_id,variant"});

  if(error){
    console.error(error);
    showToast("Could not update produced quantity.");
    return;
  }

  const existing = productionProgress.find(p=>p.product_id===productId && (p.variant||"")===(variant||""));
  if(existing) existing.produced_qty = qty;
  else productionProgress.push({product_id:productId,variant:variant||"",produced_qty:qty});

  renderProductionSummary();
  showToast("Produced quantity updated");
}

/* ------------------------------
   FINANCE
------------------------------ */

function financeForOrder(order){
  return orderFinance.find(f=>f.order_id===order.id) || {
    amount_received: order.payment_status==="Verified" ? Number(order.total||0) : 0,
    amount_refunded: order.payment_status==="Refunded" ? Number(order.total||0) : 0
  };
}

function financeSnapshot(){
  const active = orders.filter(isActiveOrder);
  let activeSales = 0;
  let grossReceived = 0;
  let refunds = 0;
  let receivables = 0;
  let cashReceivable = 0;
  let gcashPending = 0;
  let refundDue = 0;
  const outstandingRows = [];

  for(const order of orders){
    const f = financeForOrder(order);
    const received = Number(f.amount_received || 0);
    const refunded = Number(f.amount_refunded || 0);
    const netReceived = Math.max(received-refunded,0);

    grossReceived += received;
    refunds += refunded;

    if(!isActiveOrder(order)) continue;

    const total = Number(order.total || 0);
    activeSales += total;

    const due = Math.max(total-netReceived,0);
    const over = Math.max(netReceived-total,0);

    receivables += due;
    refundDue += over;

    if(order.payment_method==="Cash on Pick-up"){
      cashReceivable += due;
    } else {
      gcashPending += due;
    }

    if(due>0){
      outstandingRows.push({
        order,
        total,
        received:netReceived,
        due
      });
    }
  }

  const netCollected = grossReceived-refunds;
  const paidExpenses = expenses
    .filter(e=>e.status==="Paid")
    .reduce((s,e)=>s+Number(e.amount||0),0);
  const projectedCosts = expenses.reduce((s,e)=>s+Number(e.amount||0),0);
  const cashBalance = netCollected-paidExpenses;
  const projectedSurplus = activeSales-projectedCosts;

  return {
    activeSales,
    grossReceived,
    refunds,
    netCollected,
    receivables,
    cashReceivable,
    gcashPending,
    refundDue,
    paidExpenses,
    projectedCosts,
    cashBalance,
    projectedSurplus,
    outstandingRows
  };
}

function renderFinance(){
  if(!$("finCollected")) return;
  const f = financeSnapshot();

  $("finCollected").textContent = peso(f.netCollected);
  $("finReceivables").textContent = peso(f.receivables);
  $("finPaidExpenses").textContent = peso(f.paidExpenses);
  $("finCashBalance").textContent = peso(f.cashBalance);

  $("finActiveSales").textContent = peso(f.activeSales);
  $("finCashReceivable").textContent = peso(f.cashReceivable);
  $("finGcashPending").textContent = peso(f.gcashPending);
  $("finProjectedCosts").textContent = peso(f.projectedCosts);
  $("finProjectedSurplus").textContent = peso(f.projectedSurplus);
  $("finRefundDue").textContent = peso(f.refundDue);

  renderReceivables(f.outstandingRows);
  renderExpenses();
}

function renderReceivables(rows){
  $("receivablesEmpty").hidden = rows.length>0;
  $("receivablesBody").innerHTML = rows
    .sort((a,b)=>b.due-a.due)
    .map(({order,total,received,due})=>`
      <tr>
        <td><span class="ref">${esc(order.reference)}</span></td>
        <td><strong>${esc(order.full_name)}</strong><span class="date-small">${esc(order.mobile || "")}</span></td>
        <td>${esc(paymentMethodLabel(order))}</td>
        <td>${peso(total)}</td>
        <td>${peso(received)}</td>
        <td><strong class="receivable-due">${peso(due)}</strong></td>
        <td>${esc(order.payment_status)} / ${esc(order.order_status)}</td>
      </tr>
    `).join("");
}

function updateExpenseAmountFromUnits(){
  const qty = Number($("expenseQty").value || 0);
  const unit = Number($("expenseUnitCost").value || 0);
  if(qty>0 && unit>0){
    $("expenseAmount").value = (qty*unit).toFixed(2);
  }
}

$("expenseQty").addEventListener("input",updateExpenseAmountFromUnits);
$("expenseUnitCost").addEventListener("input",updateExpenseAmountFromUnits);

$("expenseForm").addEventListener("submit",async event=>{
  event.preventDefault();

  const button = $("addExpenseBtn");
  button.disabled = true;
  button.textContent = "Adding…";

  const payload = {
    category:$("expenseCategory").value,
    description:$("expenseDescription").value.trim(),
    quantity:$("expenseQty").value ? Number($("expenseQty").value) : null,
    unit_cost:$("expenseUnitCost").value ? Number($("expenseUnitCost").value) : null,
    amount:Number($("expenseAmount").value),
    status:$("expenseStatus").value,
    expense_date:$("expenseDate").value
  };

  const {data,error} = await sb.from("merch_expenses").insert(payload).select().single();

  button.disabled = false;
  button.textContent = "Add cost / expense";

  if(error){
    console.error(error);
    showToast("Could not add cost / expense.");
    return;
  }

  expenses.unshift(data);
  event.currentTarget.reset();
  $("expenseCategory").value = "Production";
  $("expenseStatus").value = "Planned";
  $("expenseDate").value = todayISO();
  renderFinance();
  showToast("Cost / expense added");
});

function renderExpenses(){
  $("expenseEmpty").hidden = expenses.length>0;
  $("expenseBody").innerHTML = expenses.map(e=>{
    const computation = e.quantity && e.unit_cost
      ? `${Number(e.quantity).toLocaleString()} × ${peso(e.unit_cost)}`
      : "—";

    return `
      <tr>
        <td>${new Date(`${e.expense_date}T00:00:00`).toLocaleDateString("en-PH")}</td>
        <td><strong>${esc(e.category)}</strong><span class="date-small">${esc(e.description)}</span></td>
        <td>${computation}</td>
        <td><strong>${peso(e.amount)}</strong></td>
        <td>
          <select class="status-select" onchange="updateExpenseStatus('${e.id}',this.value)">
            <option value="Planned" ${e.status==="Planned"?"selected":""}>Planned / payable</option>
            <option value="Paid" ${e.status==="Paid"?"selected":""}>Paid</option>
          </select>
        </td>
        <td><button type="button" class="expense-delete-btn" onclick="deleteExpense('${e.id}')">Delete</button></td>
      </tr>
    `;
  }).join("");
}

async function updateExpenseStatus(id,status){
  const {error} = await sb
    .from("merch_expenses")
    .update({status,updated_at:new Date().toISOString()})
    .eq("id",id);

  if(error){
    console.error(error);
    showToast("Could not update expense status.");
    return;
  }

  const item = expenses.find(e=>String(e.id)===String(id));
  if(item) item.status = status;
  renderFinance();
  showToast("Expense status updated");
}

async function deleteExpense(id){
  if(!confirm("Delete this cost / expense entry?")) return;

  const {error} = await sb.from("merch_expenses").delete().eq("id",id);
  if(error){
    console.error(error);
    showToast("Could not delete expense.");
    return;
  }

  expenses = expenses.filter(e=>String(e.id)!==String(id));
  renderFinance();
  showToast("Expense deleted");
}

function safeId(value){
  return String(value).replace(/[^a-zA-Z0-9_-]/g,"_");
}

$("expenseDate").value = todayISO();

window.saveProductionProgress = saveProductionProgress;
window.updateExpenseStatus = updateExpenseStatus;
window.deleteExpense = deleteExpense;


/* ------------------------------
   LEGACY / BACKLOGS
------------------------------ */

$("refreshLegacyBtn").addEventListener("click", async ()=>{
  await loadLegacyData();
  showToast("Legacy/backlogs refreshed");
});

async function loadLegacyData(){
  const [
    settingsRes,
    priceRes,
    inventoryRes,
    collectiblesRes,
    obligationsRes,
    cashRes
  ] = await Promise.all([
    sb.from("merch_legacy_settings").select("*").eq("id","legacy_2026").maybeSingle(),
    sb.from("merch_legacy_price_list").select("*").order("product_name"),
    sb.from("merch_legacy_inventory").select("*").order("product_name").order("variant"),
    sb.from("merch_legacy_collectibles").select("*").order("person_name"),
    sb.from("merch_legacy_obligations").select("*").order("category").order("recipient_name"),
    sb.from("merch_legacy_cash_entries").select("*").order("entry_date",{ascending:false}).order("created_at",{ascending:false})
  ]);

  const firstError = [
    settingsRes.error,priceRes.error,inventoryRes.error,
    collectiblesRes.error,obligationsRes.error,cashRes.error
  ].find(Boolean);

  if(firstError){
    console.error(firstError);
    return;
  }

  legacySettings = settingsRes.data || {
    id:"legacy_2026",
    opening_date:"2026-08-06",
    opening_cash:69360,
    notes:""
  };
  legacyPrices = priceRes.data || [];
  legacyInventory = inventoryRes.data || [];
  legacyCollectibles = collectiblesRes.data || [];
  legacyObligations = obligationsRes.data || [];
  legacyCashEntries = cashRes.data || [];

  renderLegacy();
}

function legacyCashEffect(entry){
  const amount = Number(entry.amount || 0);
  return entry.direction === "outflow" ? -amount : amount;
}

function legacySnapshot(){
  const opening = Number(legacySettings?.opening_cash || 0);
  const cashMovement = legacyCashEntries.reduce((sum,e)=>sum+legacyCashEffect(e),0);
  const cashBalance = opening + cashMovement;

  const collectibleBalance = legacyCollectibles.reduce((sum,c)=>
    sum + Math.max(Number(c.total_due||0)-Number(c.amount_collected||0),0),0
  );

  const pendingGiveawayUnits = legacyObligations
    .filter(o=>!["Released","Cancelled"].includes(o.status))
    .reduce((sum,o)=>sum+Number(o.quantity||0),0);

  const inventoryUnits = legacyInventory.reduce((sum,i)=>sum+Number(i.qty_on_hand||0),0);
  const inventoryAvailableUnits = legacyInventory.reduce((sum,i)=>
    sum+Math.max(Number(i.qty_on_hand||0)-Number(i.reserved_qty||0),0),0
  );
  const inventoryAvailableValue = legacyInventory.reduce((sum,i)=>{
    const available = Math.max(Number(i.qty_on_hand||0)-Number(i.reserved_qty||0),0);
    return sum + available*Number(i.selling_price||0);
  },0);

  return {
    opening,cashBalance,collectibleBalance,pendingGiveawayUnits,
    inventoryUnits,inventoryAvailableUnits,inventoryAvailableValue
  };
}

function renderLegacy(){
  if(!$("legacyOpeningCash")) return;

  const s = legacySnapshot();
  $("legacyOpeningCash").textContent = peso(s.opening);
  $("legacyCashBalance").textContent = peso(s.cashBalance);
  $("legacyCollectiblesBalance").textContent = peso(s.collectibleBalance);
  $("legacyGiveawayUnits").textContent = s.pendingGiveawayUnits.toLocaleString();
  $("legacyInventoryUnits").textContent = s.inventoryUnits.toLocaleString();
  $("legacyInventoryValue").textContent = peso(s.inventoryAvailableValue);

  $("legacyOpeningDate").value = legacySettings?.opening_date || "2026-08-06";
  $("legacyOpeningCashInput").value = Number(legacySettings?.opening_cash || 69360);
  $("legacySettingsNotes").value = legacySettings?.notes || "";

  $("legacyProductList").innerHTML = legacyPrices
    .map(p=>`<option value="${esc(p.product_name)}"></option>`)
    .join("");

  renderLegacyPrices();
  renderLegacyInventory();
  renderLegacyCollectibles();
  renderLegacyObligations();
  renderLegacyCashEntries();
}

function legacyPriceForProduct(name){
  return legacyPrices.find(p=>p.product_name.toLowerCase()===String(name||"").trim().toLowerCase());
}

$("legacyInventoryProduct").addEventListener("change",()=>{
  const p = legacyPriceForProduct($("legacyInventoryProduct").value);
  if(p) $("legacyInventoryPrice").value = Number(p.selling_price || 0);
});

$("legacySettingsForm").addEventListener("submit",async event=>{
  event.preventDefault();

  const payload = {
    id:"legacy_2026",
    opening_date:$("legacyOpeningDate").value,
    opening_cash:Number($("legacyOpeningCashInput").value),
    notes:$("legacySettingsNotes").value.trim(),
    updated_at:new Date().toISOString()
  };

  const {data,error} = await sb
    .from("merch_legacy_settings")
    .upsert(payload,{onConflict:"id"})
    .select()
    .single();

  if(error){
    console.error(error);
    showToast("Could not save legacy opening position.");
    return;
  }

  legacySettings = data;
  renderLegacy();
  showToast("Legacy opening position saved");
});

$("legacyCashDate").value = todayISO();

$("legacyCashForm").addEventListener("submit",async event=>{
  event.preventDefault();

  const type = $("legacyCashType").value;
  const outflowTypes = ["Legacy Expense","Transfer to Current Campaign","Refund","Other Outflow"];
  const payload = {
    entry_date:$("legacyCashDate").value,
    entry_type:type,
    direction:outflowTypes.includes(type) ? "outflow" : "inflow",
    description:$("legacyCashDescription").value.trim(),
    amount:Number($("legacyCashAmount").value)
  };

  const {data,error} = await sb
    .from("merch_legacy_cash_entries")
    .insert(payload)
    .select()
    .single();

  if(error){
    console.error(error);
    showToast("Could not add legacy cash entry.");
    return;
  }

  legacyCashEntries.unshift(data);
  event.currentTarget.reset();
  $("legacyCashType").value = "Collection";
  $("legacyCashDate").value = todayISO();
  renderLegacy();
  showToast("Legacy cash entry added");
});

function renderLegacyCashEntries(){
  $("legacyCashBody").innerHTML = legacyCashEntries.map(e=>{
    const effect = legacyCashEffect(e);
    return `
      <tr>
        <td>${new Date(`${e.entry_date}T00:00:00`).toLocaleDateString("en-PH")}</td>
        <td>${esc(e.entry_type)}</td>
        <td>${esc(e.description)}</td>
        <td><strong class="${effect<0?"legacy-outflow":"legacy-inflow"}">${effect<0?"−":"+"}${peso(Math.abs(effect))}</strong></td>
        <td><button type="button" class="expense-delete-btn" onclick="deleteLegacyCashEntry('${e.id}')">Delete</button></td>
      </tr>`;
  }).join("");
}

async function deleteLegacyCashEntry(id){
  if(!confirm("Delete this legacy cash entry?")) return;

  const {error} = await sb.from("merch_legacy_cash_entries").delete().eq("id",id);
  if(error){
    console.error(error);
    showToast("Could not delete legacy cash entry.");
    return;
  }

  legacyCashEntries = legacyCashEntries.filter(e=>e.id!==id);
  renderLegacy();
  showToast("Legacy cash entry deleted");
}

$("legacyInventoryForm").addEventListener("submit",async event=>{
  event.preventDefault();

  const product = $("legacyInventoryProduct").value.trim();
  const variant = $("legacyInventoryVariant").value.trim();
  const qty = Number($("legacyInventoryQty").value || 0);
  const reserved = Number($("legacyInventoryReserved").value || 0);

  if(reserved > qty){
    showToast("Reserved quantity cannot be greater than stock on hand.");
    return;
  }

  const payload = {
    product_name:product,
    variant,
    qty_on_hand:qty,
    reserved_qty:reserved,
    selling_price:Number($("legacyInventoryPrice").value || 0),
    unit_cost:$("legacyInventoryCost").value ? Number($("legacyInventoryCost").value) : null,
    stock_location:$("legacyInventoryLocation").value.trim(),
    condition:$("legacyInventoryCondition").value.trim() || "Good",
    notes:$("legacyInventoryNotes").value.trim(),
    updated_at:new Date().toISOString()
  };

  const {data,error} = await sb
    .from("merch_legacy_inventory")
    .upsert(payload,{onConflict:"product_name,variant"})
    .select()
    .single();

  if(error){
    console.error(error);
    showToast("Could not save legacy inventory.");
    return;
  }

  const existingIndex = legacyInventory.findIndex(i=>
    i.product_name===data.product_name && (i.variant||"")===(data.variant||"")
  );
  if(existingIndex>=0) legacyInventory[existingIndex]=data;
  else legacyInventory.push(data);

  event.currentTarget.reset();
  $("legacyInventoryReserved").value = 0;
  $("legacyInventoryCondition").value = "Good";
  renderLegacy();
  showToast("Legacy stock saved");
});

function renderLegacyInventory(){
  $("legacyInventoryEmpty").hidden = legacyInventory.length>0;

  $("legacyInventoryBody").innerHTML = legacyInventory.map(i=>{
    const available = Math.max(Number(i.qty_on_hand||0)-Number(i.reserved_qty||0),0);
    const value = available*Number(i.selling_price||0);

    return `
      <tr>
        <td><strong>${esc(i.product_name)}</strong></td>
        <td>${esc(i.variant || "—")}</td>
        <td><input class="legacy-inline-num" type="number" min="0" value="${Number(i.qty_on_hand||0)}" id="li-q-${i.id}"></td>
        <td><input class="legacy-inline-num" type="number" min="0" value="${Number(i.reserved_qty||0)}" id="li-r-${i.id}"></td>
        <td><strong>${available}</strong></td>
        <td><input class="legacy-inline-price" type="number" min="0" step="0.01" value="${Number(i.selling_price||0)}" id="li-p-${i.id}"></td>
        <td>${peso(value)}</td>
        <td>
          <span>${esc(i.stock_location || "—")}</span>
          <span class="date-small">${esc(i.condition || "Good")}</span>
        </td>
        <td class="legacy-row-actions">
          <button type="button" class="ghost-btn" onclick="saveLegacyInventoryRow('${i.id}')">Save</button>
          <button type="button" class="expense-delete-btn" onclick="deleteLegacyInventoryRow('${i.id}')">Delete</button>
        </td>
      </tr>`;
  }).join("");
}

async function saveLegacyInventoryRow(id){
  const item = legacyInventory.find(i=>i.id===id);
  if(!item) return;

  const qty = Number($(`li-q-${id}`).value || 0);
  const reserved = Number($(`li-r-${id}`).value || 0);
  const price = Number($(`li-p-${id}`).value || 0);

  if(reserved>qty){
    showToast("Reserved quantity cannot exceed stock on hand.");
    return;
  }

  const {data,error} = await sb
    .from("merch_legacy_inventory")
    .update({
      qty_on_hand:qty,
      reserved_qty:reserved,
      selling_price:price,
      updated_at:new Date().toISOString()
    })
    .eq("id",id)
    .select()
    .single();

  if(error){
    console.error(error);
    showToast("Could not update stock.");
    return;
  }

  Object.assign(item,data);
  renderLegacy();
  showToast("Legacy stock updated");
}

async function deleteLegacyInventoryRow(id){
  if(!confirm("Delete this legacy inventory row?")) return;

  const {error} = await sb.from("merch_legacy_inventory").delete().eq("id",id);
  if(error){
    console.error(error);
    showToast("Could not delete stock row.");
    return;
  }

  legacyInventory = legacyInventory.filter(i=>i.id!==id);
  renderLegacy();
  showToast("Legacy stock row deleted");
}


$("legacyCollectibleForm").addEventListener("submit",async event=>{
  event.preventDefault();

  const total = Number($("legacyCollectibleTotal").value || 0);
  const collected = Number($("legacyCollectibleCollected").value || 0);

  if(collected > total){
    showToast("Already collected cannot be greater than total due.");
    return;
  }

  const status = collected <= 0
    ? "Unpaid"
    : collected >= total
      ? "Paid"
      : "Partial";

  const payload = {
    person_name:$("legacyCollectiblePerson").value.trim(),
    description:$("legacyCollectibleDescription").value.trim(),
    total_due:total,
    amount_collected:collected,
    status,
    notes:$("legacyCollectibleNotes").value.trim(),
    updated_at:new Date().toISOString()
  };

  const {data,error} = await sb
    .from("merch_legacy_collectibles")
    .insert(payload)
    .select()
    .single();

  if(error){
    console.error(error);
    showToast(error.code==="23505"
      ? "That collectible entry already exists."
      : "Could not add collectible.");
    return;
  }

  legacyCollectibles.push(data);
  event.currentTarget.reset();
  $("legacyCollectibleCollected").value = 0;
  renderLegacy();
  showToast("Collectible added");
});

function renderLegacyCollectibles(){
  $("legacyCollectiblesBody").innerHTML = legacyCollectibles.map(c=>{
    const due = Number(c.total_due||0);
    const collected = Number(c.amount_collected||0);
    const balance = Math.max(due-collected,0);

    return `
      <tr>
        <td><strong>${esc(c.person_name)}</strong></td>
        <td>${esc(c.description)}</td>
        <td>${peso(due)}</td>
        <td>${peso(collected)}</td>
        <td><strong class="${balance>0?"receivable-due":""}">${peso(balance)}</strong></td>
        <td>
          ${balance>0 ? `
          <div class="legacy-collect-payment">
            <input type="number" min="0.01" step="0.01" max="${balance}" id="lc-pay-${c.id}" placeholder="₱">
            <button type="button" class="ghost-btn" onclick="recordLegacyCollection('${c.id}')">Record</button>
          </div>` : "—"}
        </td>
        <td>
          <div class="legacy-status-actions">
            <select class="status-select" onchange="updateLegacyCollectibleStatus('${c.id}',this.value)">
              ${["Unpaid","Partial","Paid","Waived"].map(s=>`<option ${s===c.status?"selected":""}>${s}</option>`).join("")}
            </select>
            <button type="button" class="expense-delete-btn" onclick="deleteLegacyCollectible('${c.id}')">Delete</button>
          </div>
        </td>
      </tr>`;
  }).join("");
}

async function recordLegacyCollection(id){
  const item = legacyCollectibles.find(c=>c.id===id);
  if(!item) return;

  const input = $(`lc-pay-${id}`);
  const amount = Number(input?.value || 0);
  const balance = Math.max(Number(item.total_due||0)-Number(item.amount_collected||0),0);

  if(amount<=0 || amount>balance){
    showToast("Enter a valid collection amount.");
    return;
  }

  const newCollected = Number(item.amount_collected||0)+amount;
  const newStatus = newCollected>=Number(item.total_due||0) ? "Paid" : "Partial";

  const {data,error} = await sb.rpc("record_legacy_collection",{
    p_collectible_id:id,
    p_amount:amount,
    p_entry_date:todayISO()
  });

  if(error){
    console.error(error);
    showToast("Could not record legacy collection.");
    return;
  }

  item.amount_collected = newCollected;
  item.status = newStatus;

  await loadLegacyData();
  showToast(`Recorded ${peso(amount)} collection`);
}

async function updateLegacyCollectibleStatus(id,status){
  const {data,error} = await sb
    .from("merch_legacy_collectibles")
    .update({status,updated_at:new Date().toISOString()})
    .eq("id",id)
    .select()
    .single();

  if(error){
    console.error(error);
    showToast("Could not update collectible status.");
    return;
  }

  const item = legacyCollectibles.find(c=>c.id===id);
  if(item) Object.assign(item,data);
  renderLegacy();
  showToast("Collectible status updated");
}


async function deleteLegacyCollectible(id){
  if(!confirm("Delete this collectible record?")) return;

  const {error} = await sb
    .from("merch_legacy_collectibles")
    .delete()
    .eq("id",id);

  if(error){
    console.error(error);
    showToast("Could not delete collectible.");
    return;
  }

  legacyCollectibles = legacyCollectibles.filter(c=>c.id!==id);
  renderLegacy();
  showToast("Collectible deleted");
}

$("legacyObligationForm").addEventListener("submit",async event=>{
  event.preventDefault();

  const payload = {
    recipient_name:$("legacyObligationRecipient").value.trim(),
    prize_item:$("legacyObligationPrize").value.trim(),
    quantity:Number($("legacyObligationQty").value || 1),
    category:$("legacyObligationCategory").value,
    status:"Pending",
    notes:$("legacyObligationNotes").value.trim(),
    updated_at:new Date().toISOString()
  };

  const {data,error} = await sb
    .from("merch_legacy_obligations")
    .insert(payload)
    .select()
    .single();

  if(error){
    console.error(error);
    showToast(error.code==="23505"
      ? "That giveaway entry already exists."
      : "Could not add raffle/giveaway entry.");
    return;
  }

  legacyObligations.push(data);
  event.currentTarget.reset();
  $("legacyObligationQty").value = 1;
  $("legacyObligationCategory").value = "Merch Raffle";
  renderLegacy();
  showToast("Raffle/giveaway added");
});

function renderLegacyObligations(){
  $("legacyObligationsBody").innerHTML = legacyObligations.map(o=>`
    <tr>
      <td><strong>${esc(o.recipient_name)}</strong>${o.notes ? `<span class="date-small">${esc(o.notes)}</span>` : ""}</td>
      <td>${esc(o.prize_item)}</td>
      <td>${Number(o.quantity||1)}</td>
      <td>${esc(o.category)}</td>
      <td>
        <div class="legacy-status-actions">
          <select class="status-select" onchange="updateLegacyObligation('${o.id}',this.value)">
            ${["Pending","Reserved","Released","Cancelled"].map(s=>`<option ${s===o.status?"selected":""}>${s}</option>`).join("")}
          </select>
          <button type="button" class="expense-delete-btn" onclick="deleteLegacyObligation('${o.id}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

async function updateLegacyObligation(id,status){
  const {data,error} = await sb
    .from("merch_legacy_obligations")
    .update({status,updated_at:new Date().toISOString()})
    .eq("id",id)
    .select()
    .single();

  if(error){
    console.error(error);
    showToast("Could not update raffle/giveaway status.");
    return;
  }

  const item = legacyObligations.find(o=>o.id===id);
  if(item) Object.assign(item,data);
  renderLegacy();
  showToast("Giveaway status updated");
}


async function deleteLegacyObligation(id){
  if(!confirm("Delete this raffle/giveaway obligation?")) return;

  const {error} = await sb
    .from("merch_legacy_obligations")
    .delete()
    .eq("id",id);

  if(error){
    console.error(error);
    showToast("Could not delete raffle/giveaway entry.");
    return;
  }

  legacyObligations = legacyObligations.filter(o=>o.id!==id);
  renderLegacy();
  showToast("Raffle/giveaway entry deleted");
}

$("legacyPriceForm").addEventListener("submit",async event=>{
  event.preventDefault();

  const payload = {
    product_name:$("legacyPriceProduct").value.trim(),
    selling_price:Number($("legacyPriceAmount").value || 0),
    notes:$("legacyPriceNotes").value.trim(),
    updated_at:new Date().toISOString()
  };

  const {data,error} = await sb
    .from("merch_legacy_price_list")
    .upsert(payload,{onConflict:"product_name"})
    .select()
    .single();

  if(error){
    console.error(error);
    showToast("Could not save legacy price.");
    return;
  }

  const idx = legacyPrices.findIndex(p=>p.product_name===data.product_name);
  if(idx>=0) legacyPrices[idx]=data;
  else legacyPrices.push(data);

  legacyPrices.sort((a,b)=>a.product_name.localeCompare(b.product_name));
  event.currentTarget.reset();
  renderLegacy();
  showToast("Legacy price saved");
});

async function deleteLegacyPrice(id){
  if(!confirm("Delete this price-list entry?")) return;

  const {error} = await sb
    .from("merch_legacy_price_list")
    .delete()
    .eq("id",id);

  if(error){
    console.error(error);
    showToast("Could not delete price-list entry.");
    return;
  }

  legacyPrices = legacyPrices.filter(p=>p.id!==id);
  renderLegacy();
  showToast("Price-list entry deleted");
}

function renderLegacyPrices(){
  $("legacyPriceBody").innerHTML = legacyPrices.map(p=>`
    <tr>
      <td><strong>${esc(p.product_name)}</strong></td>
      <td>${peso(p.selling_price)}</td>
      <td>
        <span>${esc(p.notes || "")}</span>
        <button type="button" class="legacy-price-edit-btn" onclick="prefillLegacyPrice('${escAttr(p.id)}')">Edit</button>
        <button type="button" class="expense-delete-btn" onclick="deleteLegacyPrice('${escAttr(p.id)}')">Delete</button>
      </td>
    </tr>
  `).join("");
}


function prefillLegacyPrice(id){
  const item = legacyPrices.find(p=>p.id===id);
  if(!item) return;
  $("legacyPriceProduct").value = item.product_name;
  $("legacyPriceAmount").value = Number(item.selling_price || 0);
  $("legacyPriceNotes").value = item.notes || "";
  $("legacyPriceProduct").focus();
}

window.deleteLegacyCashEntry = deleteLegacyCashEntry;
window.saveLegacyInventoryRow = saveLegacyInventoryRow;
window.deleteLegacyInventoryRow = deleteLegacyInventoryRow;
window.recordLegacyCollection = recordLegacyCollection;
window.updateLegacyCollectibleStatus = updateLegacyCollectibleStatus;
window.updateLegacyObligation = updateLegacyObligation;
window.deleteLegacyCollectible = deleteLegacyCollectible;
window.deleteLegacyObligation = deleteLegacyObligation;
window.deleteLegacyPrice = deleteLegacyPrice;
window.prefillLegacyPrice = prefillLegacyPrice;

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
