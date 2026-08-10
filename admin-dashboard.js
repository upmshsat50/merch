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

const $ = id => document.getElementById(id);
const peso = n => "₱" + Number(n || 0).toLocaleString("en-PH");
const paymentStatuses = ["Pending","Verified","Rejected","Refunded"];
const orderStatuses = ["New","Confirmed","For Production","Ready for Claim","Completed","Cancelled"];

function showToast(message) {
  const t = $("toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(window._toast);
  window._toast = setTimeout(() => t.classList.remove("show"), 2100);
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
  await loadOrders();
}

$("logoutBtn").addEventListener("click", async () => {
  $("logoutBtn").disabled = true;
  $("logoutBtn").textContent = "Signing out…";
  await sb.auth.signOut();
  redirectToLogin();
});

$("refreshBtn").addEventListener("click", loadOrders);
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
    destination_zone,estimated_weight_kg,created_at,
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
      o.shipping_city,o.shipping_province
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
      <td><span class="ref">${esc(o.reference)}</span></td>

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
        <select class="status-select" onchange="updateStatus('${o.id}','payment_status',this.value)">
          ${paymentStatuses.map(s => `<option ${s === o.payment_status ? "selected" : ""}>${s}</option>`).join("")}
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
  showToast("Status updated");
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

guardDashboard();
