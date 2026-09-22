// AUTHENTICATION CREDENTIALS
const VALID_EMAIL = 'kimpogi123@gmail.com';
const VALID_PASSWORD = 'kimpogi123';

// STATE
let products = [];
let skuCounter = 1000;
let pendingDeleteSku = null;
let stockMovements = [];
let activities = [];

let orders = [];
let orderCounter = 100;
let selectedOrderId = null;
let draftOrderLines = [];

let inventoryFilter = 'all';
let inventorySearchTerm = '';
let viewingProductSku = null;

let ordersFilter = 'all';

let movementFilter = 'all';
let movementSearchTerm = '';
let viewingMovementId = null;

let reportsTab = 'notifications';
let notifFilter = 'all';

let pendingReceipt = null;


// HELPERS
function $(id) { return document.getElementById(id); }

function computeStatus(qty) {
  if (qty <= 0) return { label: 'Out of Stock', cls: 'badge-danger' };
  if (qty <= 10) return { label: 'Low Stock', cls: 'badge-warning' };
  return { label: 'In Stock', cls: 'badge-success' };
}

function computeOrderStatusCls(status) {
  if (status === 'Pending') return 'badge-info';
  if (status === 'Picking') return 'badge-warning';
  if (status === 'Ready') return 'badge-success';
  return 'badge-success';
}

function generateSku() {
  skuCounter += 1;
  return `W-${skuCounter}`;
}

function generateOrderId() {
  orderCounter += 1;
  return `ORD-${orderCounter}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateTime(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateShort(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}

function formatDateHuman(inputDate) {
  if (!inputDate) return '—';
  const d = new Date(inputDate + 'T00:00:00');
  if (isNaN(d.getTime())) return inputDate;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// TOAST
let toastTimeout;
function showToast(message) {
  const toast = $('toast');
  const toastMsg = $('toastMsg');
  if (!toast || !toastMsg) return;
  toastMsg.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2800);
}


// INVENTORY
function getFilteredProducts() {
  const term = inventorySearchTerm.toLowerCase().trim();
  return products.filter(p => {
    const matchesCategory = (inventoryFilter === 'all') || (p.category === inventoryFilter);
    const matchesName = !term || p.name.toLowerCase().includes(term);
    return matchesCategory && matchesName;
  });
}

function renderInventory() {
  const inventoryBody = $('inventoryBody');
  const inventoryCount = $('inventoryCount');
  if (!inventoryBody) return;

  const filtered = getFilteredProducts();

  if (products.length === 0) {
    inventoryBody.innerHTML = '<tr class="empty-row"><td colspan="8">No products in inventory.</td></tr>';
    if (inventoryCount) inventoryCount.textContent = 'Showing 0 of 0 products';
    return;
  }
  if (filtered.length === 0) {
    inventoryBody.innerHTML = '<tr class="empty-row"><td colspan="8">No products match your filter or search.</td></tr>';
    if (inventoryCount) inventoryCount.textContent = `Showing 0 of ${products.length} products`;
    return;
  }

  inventoryBody.innerHTML = '';
  filtered.forEach((p) => {
    const status = computeStatus(p.quantity);
    const tr = document.createElement('tr');
    tr.dataset.clickable = 'true';
    tr.dataset.sku = p.sku;
    tr.innerHTML = `
      <td>${escapeHtml(p.sku)}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.category)}</td>
      <td>${p.quantity}</td>
      <td>${escapeHtml(p.location || '—')}</td>
      <td>${escapeHtml(p.supplier || '—')}</td>
      <td><span class="badge ${status.cls}">${status.label}</span></td>
      <td class="row-actions">
        <button class="icon-btn edit" data-action="edit" data-sku="${escapeHtml(p.sku)}" aria-label="Edit ${escapeHtml(p.name)}" type="button">
          <i class="fas fa-edit" aria-hidden="true"></i>
        </button>
        <button class="icon-btn delete" data-action="delete" data-sku="${escapeHtml(p.sku)}" aria-label="Delete ${escapeHtml(p.name)}" type="button">
          <i class="fas fa-trash" aria-hidden="true"></i>
        </button>
      </td>
    `;
    inventoryBody.appendChild(tr);
  });
  if (inventoryCount) inventoryCount.textContent = `Showing ${filtered.length} of ${products.length} products`;
}

function renderReceivingProductOptions() {
  const sel = $('product');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="" disabled>Select a product</option>';
  if (products.length === 0) {
    const opt = document.createElement('option');
    opt.value = ''; opt.disabled = true;
    opt.textContent = 'No products available — add one in Inventory first.';
    sel.appendChild(opt);
    return;
  }
  products.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.sku;
    opt.textContent = `${p.name} (${p.sku})`;
    sel.appendChild(opt);
  });
  sel.value = (current && products.some(p => p.sku === current)) ? current : '';
}

// MOVEMENT HELPERS
function movementBadgeClass(type) {
  if (type === 'Received') return 'received';
  if (type === 'Released') return 'released';
  if (type === 'Transferred') return 'transferred';
  return 'adjusted';
}
function movementIconClass(type) {
  if (type === 'Received') return 'fa-arrow-down';
  if (type === 'Released') return 'fa-arrow-up';
  if (type === 'Transferred') return 'fa-right-left';
  return 'fa-sliders';
}
function movementIconWrapperClass(type) {
  if (type === 'Received') return 'is-in';
  if (type === 'Released') return 'is-out';
  if (type === 'Transferred') return 'is-adjust';
  return 'is-adjust';
}
function qtyClass(type) {
  if (type === 'Received') return 'mv-qty-in';
  if (type === 'Released') return 'mv-qty-out';
  return 'mv-qty-adj';
}

function getFilteredMovements() {
  const term = movementSearchTerm.toLowerCase().trim();
  return stockMovements.filter(m => {
    const matchType = (movementFilter === 'all') || (m.type === movementFilter);
    const matchTerm = !term
      || m.productName.toLowerCase().includes(term)
      || m.user.toLowerCase().includes(term);
    return matchType && matchTerm;
  });
}

function renderMovementSummary() {
  const total = stockMovements.length;
  const received = stockMovements.filter(m => m.type === 'Received').length;
  const releasedOrAdjusted = stockMovements.filter(m => m.type === 'Released' || m.type === 'Adjusted').length;
  const transferred = stockMovements.filter(m => m.type === 'Transferred').length;
  const setVal = (id, val) => {
    const el = $(id);
    if (!el) return;
    el.textContent = val.toLocaleString();
    el.setAttribute('value', val);
  };
  setVal('mvTotal', total);
  setVal('mvReceived', received);
  setVal('mvReleased', releasedOrAdjusted);
  setVal('mvTransferred', transferred);
}

function renderStockMovements() {
  const body = $('movementBody');
  const countEl = $('movementCount');
  if (!body) return;

  const filtered = getFilteredMovements();

  if (stockMovements.length === 0) {
    body.innerHTML = '<tr class="empty-row"><td colspan="7">No stock movements recorded.</td></tr>';
    if (countEl) countEl.textContent = 'Showing 0 of 0 movements';
    return;
  }
  if (filtered.length === 0) {
    body.innerHTML = '<tr class="empty-row"><td colspan="7">No movements match your filter or search.</td></tr>';
    if (countEl) countEl.textContent = `Showing 0 of ${stockMovements.length} movements`;
    return;
  }

  body.innerHTML = '';
  [...filtered].reverse().forEach((m) => {
    const realIdx = stockMovements.indexOf(m);
    const tr = document.createElement('tr');
    tr.dataset.clickable = 'true';
    tr.dataset.movementIdx = realIdx;
    const sign = m.qtyDelta > 0 ? '+' : '';
    tr.innerHTML = `
      <td>${escapeHtml(m.dateTime)}</td>
      <td>${escapeHtml(m.productName)}</td>
      <td><span class="mv-badge ${movementBadgeClass(m.type)}"><i class="fas ${movementIconClass(m.type)}"></i> ${escapeHtml(m.type)}</span></td>
      <td><span class="${qtyClass(m.type)}">${sign}${m.qtyDelta}</span></td>
      <td>${m.prevStock}</td>
      <td>${m.newStock}</td>
      <td>${escapeHtml(m.user)}</td>
    `;
    body.appendChild(tr);
  });

  if (countEl) countEl.textContent = `Showing ${filtered.length} of ${stockMovements.length} movements`;
}

// ACTIVITIES
function renderActivities() {
  const list = $('activityList');
  if (!list) return;
  if (activities.length === 0) {
    list.innerHTML = '<li class="empty-row">No recent activities.</li>';
    return;
  }
  list.innerHTML = '';
  [...activities].reverse().slice(0, 8).forEach(a => {
    const li = document.createElement('li');
    li.innerHTML = `<i class="${a.icon}" aria-hidden="true"></i> ${escapeHtml(a.text)}`;
    list.appendChild(li);
  });
}

// NOTIFICATIONS (Reports > Notifications tab)
// Build a list of notification objects from current state.
function buildNotifications() {
  const items = [];
  const now = formatDateTime(new Date());

  // Low-stock alerts
  products.forEach(p => {
    if (p.quantity === 0) {
      items.push({
        kind: 'lowstock',
        unread: true,
        title: `Out of stock: ${p.name}`,
        detail: `${p.sku} • ${p.category} • Supplier: ${p.supplier || 'N/A'}. Immediate restock needed.`,
        time: now
      });
    } else if (p.quantity <= 10) {
      items.push({
        kind: 'lowstock',
        unread: true,
        title: `Low stock: ${p.name}`,
        detail: `${p.sku} • Only ${p.quantity} unit${p.quantity === 1 ? '' : 's'} remaining. Consider restocking soon.`,
        time: now
      });
    }
  });

  // Pending orders
  orders.filter(o => o.status === 'Pending').forEach(o => {
    items.push({
      kind: 'order',
      unread: true,
      title: `Pending order ${o.id}`,
      detail: `${o.customer} • ${o.lines.length} line item(s) awaiting picking.`,
      time: now
    });
  });

  // Picking orders
  orders.filter(o => o.status === 'Picking').forEach(o => {
    items.push({
      kind: 'order',
      unread: false,
      title: `Order ${o.id} in progress`,
      detail: `${o.customer} • Currently being picked.`,
      time: now
    });
  });

  // Ready orders
  orders.filter(o => o.status === 'Ready').forEach(o => {
    items.push({
      kind: 'order',
      unread: false,
      title: `Order ${o.id} is Ready`,
      detail: `${o.customer} • Ready for completion and shipment.`,
      time: now
    });
  });

  // Completed orders
  orders.filter(o => o.status === 'Completed').forEach(o => {
    items.push({
      kind: 'completed',
      unread: false,
      title: `Order ${o.id} completed`,
      detail: `${o.customer} • Order fully fulfilled.`,
      time: now
    });
  });

  // New deliveries (Received movements today)
  const today = new Date().toISOString().slice(0, 10);
  stockMovements
    .filter(m => m.type === 'Received' && m.dateTime.startsWith(today))
    .slice(-5)
    .reverse()
    .forEach(m => {
      items.push({
        kind: 'delivery',
        unread: true,
        title: `New delivery received`,
        detail: `${m.qtyDelta} × ${m.productName} • Logged by ${m.user} at ${m.dateTime}.`,
        time: m.dateTime
      });
    });

  // Stock adjustments
  stockMovements
    .filter(m => m.type === 'Adjusted')
    .slice(-5)
    .reverse()
    .forEach(m => {
      items.push({
        kind: 'adjustment',
        unread: false,
        title: `Stock adjusted: ${m.productName}`,
        detail: `${m.qtyDelta > 0 ? '+' : ''}${m.qtyDelta} units • New total: ${m.newStock} • ${m.user}`,
        time: m.dateTime
      });
    });

  return items;
}

function getFilteredNotifications() {
  const all = buildNotifications();
  if (notifFilter === 'all') return all;
  return all.filter(n => n.kind === notifFilter);
}

function notifIconClass(kind) {
  if (kind === 'lowstock') return 'fas fa-triangle-exclamation';
  if (kind === 'order') return 'fas fa-clipboard-list';
  if (kind === 'delivery') return 'fas fa-truck';
  if (kind === 'adjustment') return 'fas fa-sliders';
  if (kind === 'completed') return 'fas fa-circle-check';
  return 'fas fa-bell';
}

function renderNotifications() {
  // Update tab count
  const all = buildNotifications();
  const countEl = $('notifTabCount');
  if (countEl) countEl.textContent = all.length;

  // Update summary cards
  const lowStockCount = products.filter(p => p.quantity <= 10).length;
  const pendingOrdersCount = orders.filter(o => o.status === 'Pending').length;
  const today = new Date().toISOString().slice(0, 10);
  const todaysDeliveries = stockMovements.filter(m => m.type === 'Received' && m.dateTime.startsWith(today)).length;
  const completedOrdersCount = orders.filter(o => o.status === 'Completed').length;

  const setVal = (id, val) => {
    const el = $(id);
    if (!el) return;
    el.textContent = val.toLocaleString();
    el.setAttribute('value', val);
  };
  setVal('notifLowStock', lowStockCount);
  setVal('notifPendingOrders', pendingOrdersCount);
  setVal('notifNewDeliveries', todaysDeliveries);
  setVal('notifCompletedOrders', completedOrdersCount);

  // Render detailed list
  const list = $('notificationListDetailed');
  if (!list) return;
  const filtered = getFilteredNotifications();
  if (filtered.length === 0) {
    list.innerHTML = '<li class="empty-row">No notifications match this filter.</li>';
    return;
  }
  list.innerHTML = '';
  filtered.forEach(n => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="notif-icon ${n.kind}"><i class="${notifIconClass(n.kind)}" aria-hidden="true"></i></div>
      <div class="notif-content">
        <span class="notif-title">${escapeHtml(n.title)}</span>
        <span class="notif-detail">${escapeHtml(n.detail)}</span>
      </div>
      <span class="notif-time">${escapeHtml(n.time)}</span>
    `;
    list.appendChild(li);
  });
}

// REPORTS
function renderInventoryReport() {
  // Summary
  const totalProducts = products.length;
  const totalQty = products.reduce((sum, p) => sum + p.quantity, 0);
  const categories = new Set(products.map(p => p.category));
  const suppliers = new Set(products.map(p => p.supplier).filter(Boolean));

  const setVal = (id, val) => {
    const el = $(id);
    if (!el) return;
    el.textContent = typeof val === 'number' ? val.toLocaleString() : val;
  };
  setVal('rptTotalProducts', totalProducts);
  setVal('rptTotalQty', totalQty);
  setVal('rptCategoryCount', categories.size);
  setVal('rptSupplierCount', suppliers.size);

  // Breakdown by category
  const body = $('rptInventoryBody');
  if (!body) return;
  if (products.length === 0) {
    body.innerHTML = '<tr class="empty-row"><td colspan="5">No report data available.</td></tr>';
  } else {
    const map = {};
    products.forEach(p => {
      if (!map[p.category]) map[p.category] = { products: 0, qty: 0, low: 0, out: 0 };
      map[p.category].products += 1;
      map[p.category].qty += p.quantity;
      if (p.quantity === 0) map[p.category].out += 1;
      else if (p.quantity <= 10) map[p.category].low += 1;
    });
    body.innerHTML = '';
    Object.entries(map).forEach(([cat, data]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(cat)}</td>
        <td>${data.products}</td>
        <td>${data.qty}</td>
        <td>${data.low}</td>
        <td>${data.out}</td>
      `;
      body.appendChild(tr);
    });
  }

  // Full product list
  const listBody = $('rptInventoryListBody');
  if (!listBody) return;
  if (products.length === 0) {
    listBody.innerHTML = '<tr class="empty-row"><td colspan="6">No products in inventory.</td></tr>';
    return;
  }
  listBody.innerHTML = '';
  [...products].sort((a, b) => a.sku.localeCompare(b.sku)).forEach(p => {
    const status = computeStatus(p.quantity);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(p.sku)}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.category)}</td>
      <td>${p.quantity}</td>
      <td><span class="badge ${status.cls}">${status.label}</span></td>
      <td>${escapeHtml(p.supplier || '—')}</td>
    `;
    listBody.appendChild(tr);
  });
}

function renderLowStockReport() {
  const low = products.filter(p => p.quantity > 0 && p.quantity <= 10);
  const out = products.filter(p => p.quantity === 0);
  const needsRestock = low.length + out.length;

  // Highest shortage = item with minimum quantity (excluding 0? no, include 0 as most urgent)
  let highestShortage = '—';
  if (needsRestock > 0) {
    const sorted = [...low, ...out].sort((a, b) => a.quantity - b.quantity);
    highestShortage = `${sorted[0].name} (${sorted[0].quantity})`;
  }

  const setVal = (id, val) => {
    const el = $(id);
    if (!el) return;
    el.textContent = typeof val === 'number' ? val.toLocaleString() : val;
  };
  setVal('rptLowCount', low.length);
  setVal('rptOutCount', out.length);
  setVal('rptRestockCount', needsRestock);
  setVal('rptHighestShortage', highestShortage);

  const body = $('rptLowStockBody');
  if (!body) return;
  const items = [...out, ...low].sort((a, b) => a.quantity - b.quantity);
  if (items.length === 0) {
    body.innerHTML = '<tr class="empty-row"><td colspan="6">No low-stock items.</td></tr>';
    return;
  }
  body.innerHTML = '';
  items.forEach(p => {
    const status = computeStatus(p.quantity);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(p.sku)}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.category)}</td>
      <td>${p.quantity}</td>
      <td><span class="badge ${status.cls}">${status.label}</span></td>
      <td>${escapeHtml(p.supplier || '—')}</td>
    `;
    body.appendChild(tr);
  });
}

function renderMovementReport() {
  const total = stockMovements.length;
  const receivedUnits = stockMovements.filter(m => m.type === 'Received').reduce((sum, m) => sum + m.qtyDelta, 0);
  const releasedUnits = stockMovements.filter(m => m.type === 'Released').reduce((sum, m) => sum + Math.abs(m.qtyDelta), 0);
  const adjustedNet = stockMovements.filter(m => m.type === 'Adjusted').reduce((sum, m) => sum + m.qtyDelta, 0);
  const netChange = receivedUnits - releasedUnits + adjustedNet;

  const setVal = (id, val) => {
    const el = $(id);
    if (!el) return;
    el.textContent = typeof val === 'number' ? val.toLocaleString() : val;
  };
  setVal('rptMvTotal', total);
  setVal('rptMvIn', receivedUnits);
  setVal('rptMvOut', releasedUnits);
  setVal('rptMvNet', netChange);

  // Breakdown by type
  const typeBody = $('rptMovementByTypeBody');
  if (typeBody) {
    if (stockMovements.length === 0) {
      typeBody.innerHTML = '<tr class="empty-row"><td colspan="3">No movement data available.</td></tr>';
    } else {
      const map = {};
      stockMovements.forEach(m => {
        if (!map[m.type]) map[m.type] = { count: 0, total: 0 };
        map[m.type].count += 1;
        map[m.type].total += Math.abs(m.qtyDelta);
      });
      typeBody.innerHTML = '';
      ['Received', 'Released', 'Transferred', 'Adjusted'].forEach(type => {
        if (!map[type]) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><span class="mv-badge ${movementBadgeClass(type)}"><i class="fas ${movementIconClass(type)}"></i> ${type}</span></td>
          <td>${map[type].count}</td>
          <td>${map[type].total}</td>
        `;
        typeBody.appendChild(tr);
      });
    }
  }

  // By product
  const prodBody = $('rptMovementByProductBody');
  if (!prodBody) return;
  if (stockMovements.length === 0) {
    prodBody.innerHTML = '<tr class="empty-row"><td colspan="5">No movement data available.</td></tr>';
    return;
  }
  const byProduct = {};
  stockMovements.forEach(m => {
    if (!byProduct[m.productName]) byProduct[m.productName] = { received: 0, released: 0, adjusted: 0 };
    if (m.type === 'Received') byProduct[m.productName].received += m.qtyDelta;
    else if (m.type === 'Released') byProduct[m.productName].released += Math.abs(m.qtyDelta);
    else if (m.type === 'Adjusted') byProduct[m.productName].adjusted += m.qtyDelta;
  });
  prodBody.innerHTML = '';
  Object.entries(byProduct).forEach(([name, data]) => {
    const net = data.received - data.released + data.adjusted;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(name)}</td>
      <td class="mv-qty-in">+${data.received}</td>
      <td class="mv-qty-out">-${data.released}</td>
      <td class="mv-qty-adj">${data.adjusted > 0 ? '+' : ''}${data.adjusted}</td>
      <td class="${net > 0 ? 'mv-qty-in' : net < 0 ? 'mv-qty-out' : ''}">${net > 0 ? '+' : ''}${net}</td>
    `;
    prodBody.appendChild(tr);
  });
}

function renderOrderReport() {
  const total = orders.length;
  const pending = orders.filter(o => o.status === 'Pending').length;
  const inProgress = orders.filter(o => o.status === 'Picking' || o.status === 'Ready').length;
  const completed = orders.filter(o => o.status === 'Completed').length;

  const setVal = (id, val) => {
    const el = $(id);
    if (!el) return;
    el.textContent = typeof val === 'number' ? val.toLocaleString() : val;
  };
  setVal('rptOrderTotal', total);
  setVal('rptOrderPending', pending);
  setVal('rptOrderInProgress', inProgress);
  setVal('rptOrderCompleted', completed);

  // By status
  const statusBody = $('rptOrderByStatusBody');
  if (statusBody) {
    if (orders.length === 0) {
      statusBody.innerHTML = '<tr class="empty-row"><td colspan="3">No order data available.</td></tr>';
    } else {
      const map = {};
      orders.forEach(o => {
        if (!map[o.status]) map[o.status] = { count: 0, items: 0 };
        map[o.status].count += 1;
        map[o.status].items += o.lines.length;
      });
      statusBody.innerHTML = '';
      ['Pending', 'Picking', 'Ready', 'Completed'].forEach(status => {
        if (!map[status]) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><span class="badge ${computeOrderStatusCls(status)}">${status}</span></td>
          <td>${map[status].count}</td>
          <td>${map[status].items}</td>
        `;
        statusBody.appendChild(tr);
      });
    }
  }

  // By customer
  const custBody = $('rptOrderByCustomerBody');
  if (!custBody) return;
  if (orders.length === 0) {
    custBody.innerHTML = '<tr class="empty-row"><td colspan="4">No order data available.</td></tr>';
    return;
  }
  const byCust = {};
  orders.forEach(o => {
    if (!byCust[o.customer]) byCust[o.customer] = { orders: 0, completed: 0, inProgress: 0 };
    byCust[o.customer].orders += 1;
    if (o.status === 'Completed') byCust[o.customer].completed += 1;
    else byCust[o.customer].inProgress += 1;
  });
  custBody.innerHTML = '';
  Object.entries(byCust).forEach(([name, data]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(name)}</td>
      <td>${data.orders}</td>
      <td>${data.completed}</td>
      <td>${data.inProgress}</td>
    `;
    custBody.appendChild(tr);
  });
}

function renderReports() {
  try { renderNotifications(); } catch (e) { console.warn(e); }
  try { renderInventoryReport(); } catch (e) { console.warn(e); }
  try { renderLowStockReport(); } catch (e) { console.warn(e); }
  try { renderMovementReport(); } catch (e) { console.warn(e); }
  try { renderOrderReport(); } catch (e) { console.warn(e); }
}


// DASHBOARD
function updateDashboardCounts() {
  const totalProducts = products.length;
  const availableStock = products.reduce((sum, p) => sum + p.quantity, 0);
  const lowStock = products.filter(p => p.quantity > 0 && p.quantity <= 10).length;
  const today = new Date().toISOString().slice(0, 10);
  const todaysReceipts = stockMovements.filter(m => m.type === 'Received' && m.dateTime.startsWith(today)).length;

  const dashCards = document.querySelectorAll('#panel-dashboard .stat-card .value');
  if (dashCards.length >= 4) {
    dashCards[0].textContent = totalProducts.toLocaleString();
    dashCards[0].setAttribute('value', totalProducts);
    dashCards[1].textContent = availableStock.toLocaleString();
    dashCards[1].setAttribute('value', availableStock);
    dashCards[2].textContent = lowStock.toLocaleString();
    dashCards[2].setAttribute('value', lowStock);
    dashCards[3].textContent = todaysReceipts.toLocaleString();
    dashCards[3].setAttribute('value', todaysReceipts);
  }
}

function renderDashboardOrders() {
  const body = $('dashboardOrdersBody');
  if (!body) return;
  const activeOrders = orders.filter(o => o.status !== 'Completed');
  if (activeOrders.length === 0) {
    body.innerHTML = '<tr class="empty-row"><td colspan="4">No pending orders.</td></tr>';
    return;
  }
  body.innerHTML = '';
  activeOrders.slice(0, 5).forEach(o => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(o.id)}</td>
      <td>${escapeHtml(o.customer)}</td>
      <td><span class="badge ${computeOrderStatusCls(o.status)}">${escapeHtml(o.status)}</span></td>
      <td>${o.lines.length}</td>
    `;
    body.appendChild(tr);
  });
}


// ORDERS
function updateOrderTabCounts() {
  const counts = {
    all: orders.length,
    Pending: orders.filter(o => o.status === 'Pending').length,
    Picking: orders.filter(o => o.status === 'Picking').length,
    Ready: orders.filter(o => o.status === 'Ready').length,
    Completed: orders.filter(o => o.status === 'Completed').length
  };
  const set = (id, n) => { const el = $(id); if (el) el.textContent = n; };
  set('tabCountAll', counts.all);
  set('tabCountPending', counts.Pending);
  set('tabCountPicking', counts.Picking);
  set('tabCountReady', counts.Ready);
  set('tabCountCompleted', counts.Completed);
}

function renderOrdersList() {
  const body = $('ordersBody');
  if (!body) return;
  const search = ($('orderSearch')?.value || '').toLowerCase().trim();
  const filtered = orders.filter(o => {
    const matchesFilter = (ordersFilter === 'all') || (o.status === ordersFilter);
    const matchesSearch = !search
      || o.id.toLowerCase().includes(search)
      || o.customer.toLowerCase().includes(search);
    return matchesFilter && matchesSearch;
  });
  if (filtered.length === 0) {
    body.innerHTML = `<tr class="empty-row"><td colspan="6">${
      orders.length === 0 ? 'No orders available.' : 'No orders match the current filter.'
    }</td></tr>`;
    return;
  }
  body.innerHTML = '';
  filtered.slice().reverse().forEach(o => {
    const tr = document.createElement('tr');
    tr.dataset.clickable = 'true';
    tr.dataset.orderId = o.id;
    tr.innerHTML = `
      <td>${escapeHtml(o.id)}</td>
      <td>${escapeHtml(o.customer)}</td>
      <td>${o.lines.length}</td>
      <td>${escapeHtml(o.createdAt)}</td>
      <td><span class="badge ${computeOrderStatusCls(o.status)}">${escapeHtml(o.status)}</span></td>
      <td><button class="btn btn-sm btn-primary" data-open-order="${escapeHtml(o.id)}" type="button">Open</button></td>
    `;
    body.appendChild(tr);
  });
}

function renderOrderDetails() {
  const section = $('orderDetailsSection');
  const title = $('orderDetailsTitle');
  const meta = $('orderMeta');
  const flow = $('orderStatusFlow');
  const body = $('orderLinesBody');
  const actions = $('orderActions');
  const progressBar = $('progressBar');
  const progressText = $('progressText');
  const stockWarning = $('stockWarning');
  const stockWarningText = $('stockWarningText');
  if (!section) return;
  if (!selectedOrderId) { section.style.display = 'none'; return; }
  const order = orders.find(o => o.id === selectedOrderId);
  if (!order) { section.style.display = 'none'; return; }

  section.style.display = 'block';
  title.textContent = `Order ${order.id}`;
  meta.textContent = `${order.customer} • Created ${order.createdAt} • ${order.lines.length} line item(s)`;

  const steps = ['Pending', 'Picking', 'Ready', 'Completed'];
  const currentIdx = steps.indexOf(order.status);
  flow.querySelectorAll('.status-step').forEach((li, idx) => {
    li.classList.remove('active', 'completed');
    if (idx < currentIdx) li.classList.add('completed');
    if (idx === currentIdx) li.classList.add('active');
  });

  const pickedCount = order.lines.filter(l => l.picked).length;
  const totalCount = order.lines.length;
  const pct = totalCount === 0 ? 0 : Math.round((pickedCount / totalCount) * 100);
  if (progressBar) progressBar.style.width = pct + '%';
  if (progressText) progressText.textContent = `${pickedCount} of ${totalCount} item${totalCount === 1 ? '' : 's'} picked`;

  const issues = [];
  order.lines.forEach(line => {
    const product = products.find(p => p.sku === line.sku);
    const available = product ? product.quantity : 0;
    if (!product) issues.push(`"${line.name}" was removed from inventory.`);
    else if (available < line.qty) issues.push(`"${line.name}" needs ${line.qty} but only ${available} in stock.`);
  });
  if (issues.length > 0) {
    stockWarning.hidden = false;
    stockWarningText.textContent = issues.join(' ');
  } else {
    stockWarning.hidden = true;
    stockWarningText.textContent = '';
  }

  if (order.lines.length === 0) {
    body.innerHTML = '<tr class="empty-row"><td colspan="5">No items to pick.</td></tr>';
  } else {
    body.innerHTML = '';
    order.lines.forEach((line, idx) => {
      const product = products.find(p => p.sku === line.sku);
      const available = product ? product.quantity : 0;
      let stockClass = 'stock-ok';
      let stockLabel = String(available);
      if (available === 0) { stockClass = 'stock-out'; stockLabel = `${available} (Out)`; }
      else if (available < line.qty) { stockClass = 'stock-low'; stockLabel = `${available} (Short)`; }
      let statusHtml = '';
      let actionHtml = '';
      if (line.picked) {
        statusHtml = '<span class="pick-status picked"><i class="fas fa-check-circle"></i> Picked</span>';
        actionHtml = `<button class="btn btn-sm btn-secondary" data-unpick-line="${idx}" type="button"><i class="fas fa-rotate-left"></i> Undo</button>`;
      } else if (!product || available < line.qty) {
        statusHtml = '<span class="pick-status blocked"><i class="fas fa-circle-xmark"></i> Insufficient</span>';
        actionHtml = `<button class="btn btn-sm btn-secondary" disabled type="button" title="Not enough stock"><i class="fas fa-ban"></i> Cannot pick</button>`;
      } else {
        statusHtml = '<span class="pick-status pending"><i class="fas fa-circle"></i> Pending</span>';
        actionHtml = `<button class="btn btn-sm btn-primary" data-pick-line="${idx}" type="button"><i class="fas fa-check"></i> Pick</button>`;
      }
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(line.name)} <small style="color:#a78bfa;">(${escapeHtml(line.sku)})</small></td>
        <td>${line.qty}</td>
        <td><span class="${stockClass}">${stockLabel}</span></td>
        <td>${statusHtml}</td>
        <td>${actionHtml}</td>
      `;
      body.appendChild(tr);
    });
  }

  actions.innerHTML = '';
  const allPicked = totalCount > 0 && pickedCount === totalCount;
  const allAvailable = order.lines.every(line => {
    const product = products.find(p => p.sku === line.sku);
    return product && product.quantity >= line.qty;
  });

  if (order.status === 'Pending') {
    actions.innerHTML = `<button class="btn btn-primary" data-order-action="start-picking" type="button"><i class="fas fa-play"></i> Start Picking</button>`;
  } else if (order.status === 'Picking') {
    if (allPicked) {
      actions.innerHTML = `<button class="btn btn-success" data-order-action="mark-ready" type="button"><i class="fas fa-check-double"></i> Mark as Ready</button>`;
    } else {
      actions.innerHTML = `<span class="field-hint">Pick all items to enable "Mark as Ready".</span>`;
    }
  } else if (order.status === 'Ready') {
    if (allAvailable) {
      actions.innerHTML = `<button class="btn btn-success" data-order-action="complete-order" type="button"><i class="fas fa-check-circle"></i> Complete Order</button>`;
    } else {
      actions.innerHTML = `<button class="btn btn-success" disabled type="button"><i class="fas fa-ban"></i> Cannot Complete</button>
      <span class="field-hint">Some items don't have enough stock.</span>`;
    }
  } else if (order.status === 'Completed') {
    actions.innerHTML = `<span class="field-hint"><i class="fas fa-circle-check"></i> This order is already completed.</span>`;
  }
}

function renderNewOrderLineOptions() {
  const sel = $('orderLineProduct');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="" disabled>Select a product</option>';
  if (products.length === 0) {
    const opt = document.createElement('option');
    opt.value = ''; opt.disabled = true;
    opt.textContent = 'No products in inventory.';
    sel.appendChild(opt);
    return;
  }
  products.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.sku;
    opt.textContent = `${p.name} (${p.sku}) — ${p.quantity} in stock`;
    sel.appendChild(opt);
  });
  sel.value = (current && products.some(p => p.sku === current)) ? current : '';
}

function renderDraftOrderLines() {
  const body = $('orderLinesDraftBody');
  if (!body) return;
  if (draftOrderLines.length === 0) {
    body.innerHTML = '<tr class="empty-row"><td colspan="4">No items added yet.</td></tr>';
    return;
  }
  body.innerHTML = '';
  draftOrderLines.forEach((line, idx) => {
    const product = products.find(p => p.sku === line.sku);
    const avail = product ? product.quantity : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(line.name)} <small style="color:#a78bfa;">(${escapeHtml(line.sku)})</small></td>
      <td>${line.qty}</td>
      <td>${avail}</td>
      <td>
        <button class="icon-btn delete" data-remove-draft-line="${idx}" aria-label="Remove line" type="button">
          <i class="fas fa-trash" aria-hidden="true"></i>
        </button>
      </td>
    `;
    body.appendChild(tr);
  });
}


// MASTER RENDER
function renderAll() {
  try { renderInventory(); } catch (e) { console.warn(e); }
  try { renderReceivingProductOptions(); } catch (e) { console.warn(e); }
  try { renderMovementSummary(); } catch (e) { console.warn(e); }
  try { renderStockMovements(); } catch (e) { console.warn(e); }
  try { renderActivities(); } catch (e) { console.warn(e); }
  try { updateDashboardCounts(); } catch (e) { console.warn(e); }
  try { renderDashboardOrders(); } catch (e) { console.warn(e); }
  try { updateOrderTabCounts(); } catch (e) { console.warn(e); }
  try { renderOrdersList(); } catch (e) { console.warn(e); }
  try { renderOrderDetails(); } catch (e) { console.warn(e); }
  try { renderNewOrderLineOptions(); } catch (e) { console.warn(e); }
  try { renderDraftOrderLines(); } catch (e) { console.warn(e); }
  try { updateReceivingReview(); } catch (e) { console.warn(e); }
  try { renderReports(); } catch (e) { console.warn(e); }
}

// MODAL HELPERS
function openModal(id) { const m = $(id); if (m) m.classList.add('open'); }
function closeModal(id) {
  const m = $(id);
  if (m) m.classList.remove('open');
  if (id === 'deleteConfirmModal') pendingDeleteSku = null;
  if (id === 'viewProductModal') viewingProductSku = null;
  if (id === 'viewMovementModal') viewingMovementId = null;
}

// VIEW PRODUCT DETAILS
function openViewProductModal(sku) {
  const product = products.find(p => p.sku === sku);
  if (!product) return;
  viewingProductSku = sku;
  const status = computeStatus(product.quantity);
  $('detailProductName').textContent = product.name;
  $('detailProductSku').textContent = product.sku;
  const statusEl = $('detailProductStatus');
  statusEl.textContent = status.label;
  statusEl.className = `badge ${status.cls}`;
  $('detailCategory').textContent = product.category;
  $('detailQuantity').textContent = `${product.quantity} unit${product.quantity === 1 ? '' : 's'}`;
  $('detailLocation').textContent = product.location || '—';
  $('detailSupplier').textContent = product.supplier || '—';
  $('detailStatusText').textContent = status.label;
  const lastMovement = [...stockMovements].reverse().find(m => m.productName === product.name);
  $('detailUpdated').textContent = lastMovement ? lastMovement.dateTime : '—';
  openModal('viewProductModal');
}

// VIEW MOVEMENT DETAILS
function openViewMovementModal(index) {
  const m = stockMovements[index];
  if (!m) return;

  viewingMovementId = index;

  $('mvDetailType').textContent = m.type;
  $('mvDetailDateTime').textContent = m.dateTime;
  const badge = $('mvDetailBadge');
  badge.textContent = m.type;
  badge.className = `badge ${m.type === 'Received' ? 'badge-success' : m.type === 'Released' ? 'badge-warning' : 'badge-info'}`;

  const iconWrapper = $('mvDetailIconWrapper');
  const icon = $('mvDetailIcon');
  iconWrapper.className = `movement-details-icon ${movementIconWrapperClass(m.type)}`;
  icon.className = `fas ${movementIconClass(m.type)}`;

  $('mvDetailProduct').textContent = m.productName;
  const sign = m.qtyDelta > 0 ? '+' : '';
  $('mvDetailQuantity').textContent = `${sign}${m.qtyDelta} unit${Math.abs(m.qtyDelta) === 1 ? '' : 's'}`;
  $('mvDetailPrev').textContent = `${m.prevStock} unit${m.prevStock === 1 ? '' : 's'}`;
  $('mvDetailNew').textContent = `${m.newStock} unit${m.newStock === 1 ? '' : 's'}`;
  $('mvDetailUser').textContent = m.user;

  let effectText = '';
  if (m.type === 'Received') effectText = 'Stock increased (added to inventory)';
  else if (m.type === 'Released') effectText = 'Stock decreased (removed from inventory)';
  else if (m.type === 'Transferred') effectText = 'Stock moved between locations';
  else effectText = 'Stock corrected or adjusted';
  $('mvDetailEffect').textContent = effectText;

  const direction = m.qtyDelta > 0 ? 'increased' : m.qtyDelta < 0 ? 'decreased' : 'unchanged';
  const verb = m.qtyDelta > 0 ? 'added' : m.qtyDelta < 0 ? 'removed' : 'adjusted';
  let narrative = '';
  if (m.type === 'Received') {
    narrative = `On <strong>${escapeHtml(m.dateTime)}</strong>, <strong>${m.qtyDelta}</strong> unit${m.qtyDelta === 1 ? '' : 's'} of <strong>${escapeHtml(m.productName)}</strong> ${verb} by <strong>${escapeHtml(m.user)}</strong>. ` +
      `The stock <strong>${direction}</strong> from <strong>${m.prevStock}</strong> to <strong>${m.newStock}</strong>.`;
  } else if (m.type === 'Released') {
    narrative = `On <strong>${escapeHtml(m.dateTime)}</strong>, <strong>${Math.abs(m.qtyDelta)}</strong> unit${Math.abs(m.qtyDelta) === 1 ? '' : 's'} of <strong>${escapeHtml(m.productName)}</strong> ${verb} by <strong>${escapeHtml(m.user)}</strong>. ` +
      `The stock <strong>${direction}</strong> from <strong>${m.prevStock}</strong> to <strong>${m.newStock}</strong>.`;
  } else if (m.type === 'Adjusted') {
    narrative = `On <strong>${escapeHtml(m.dateTime)}</strong>, the stock of <strong>${escapeHtml(m.productName)}</strong> was <strong>adjusted</strong> by <strong>${escapeHtml(m.user)}</strong>. ` +
      `The quantity changed by <strong>${sign}${m.qtyDelta}</strong>, moving from <strong>${m.prevStock}</strong> to <strong>${m.newStock}</strong>.`;
  } else {
    narrative = `On <strong>${escapeHtml(m.dateTime)}</strong>, <strong>${Math.abs(m.qtyDelta)}</strong> unit${Math.abs(m.qtyDelta) === 1 ? '' : 's'} of <strong>${escapeHtml(m.productName)}</strong> were <strong>transferred</strong> by <strong>${escapeHtml(m.user)}</strong>. ` +
      `The stock went from <strong>${m.prevStock}</strong> to <strong>${m.newStock}</strong>.`;
  }
  $('mvDetailNarrative').innerHTML = narrative;

  openModal('viewMovementModal');
}

// RECEIVING
function updateReceivingReview() {
  const supplier = $('supplier')?.value || '';
  const deliveryNo = $('deliveryNo')?.value.trim() || '';
  const productSku = $('product')?.value || '';
  const product = productSku ? products.find(p => p.sku === productSku) : null;
  const qtyRaw = $('quantity')?.value || '';
  const qty = parseInt(qtyRaw, 10);
  const recvDate = $('recvDate')?.value || '';
  const condition = $('condition')?.value || '';

  const setVal = (id, value) => {
    const el = $(id);
    if (!el) return;
    if (value) { el.textContent = value; el.classList.remove('empty'); }
    else { el.textContent = '—'; el.classList.add('empty'); }
  };
  setVal('reviewSupplier', supplier);
  setVal('reviewDeliveryNo', deliveryNo);
  setVal('reviewProduct', product ? `${product.name} (${product.sku})` : '');
  setVal('reviewQuantity', (!isNaN(qty) && qty > 0) ? `${qty} unit${qty === 1 ? '' : 's'}` : '');
  setVal('reviewDate', recvDate ? formatDateHuman(recvDate) : '');
  setVal('reviewCondition', condition);

  const steps = $('impactSteps');
  if (!steps) return;

  if (!product || isNaN(qty) || qty <= 0) {
    steps.innerHTML = '<li>Select a product and enter a quantity to see the impact on stock.</li>';
    return;
  }

  const prevStock = product.quantity;
  const newStock = prevStock + qty;
  const newStatus = computeStatus(newStock);

  steps.innerHTML = `
    <li>Current stock of <strong>${escapeHtml(product.name)}</strong>: <strong>${prevStock}</strong> ${prevStock === 1 ? 'unit' : 'units'}</li>
    <li>Add <strong>+${qty}</strong> ${qty === 1 ? 'unit' : 'units'} → new stock: <strong>${newStock}</strong> ${newStock === 1 ? 'unit' : 'units'}</li>
    <li>Status will become: <strong>${newStatus.label}</strong></li>
    <li>A stock movement will be logged (Type: <strong>Received</strong>)</li>
    <li>A recent activity will appear on your dashboard</li>
  `;
}

function handleReviewReceipt(e) {
  e.preventDefault();
  e.stopPropagation();
  const error = $('receivingError');
  error.innerHTML = '';
  const supplier = $('supplier').value;
  const deliveryNo = $('deliveryNo').value.trim();
  const productSku = $('product').value;
  const quantityRaw = $('quantity').value;
  const quantity = parseInt(quantityRaw, 10);
  const recvDate = $('recvDate').value;
  const condition = $('condition').value;

  if (!supplier) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Please select a supplier.'; return; }
  if (!deliveryNo) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Delivery Number is required.'; return; }
  if (!productSku) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Please select a product.'; return; }
  if (isNaN(quantity) || quantity <= 0) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Quantity must be greater than 0.'; return; }
  if (!recvDate) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Date is required.'; return; }
  if (!condition) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Please select a condition.'; return; }

  const product = products.find(p => p.sku === productSku);
  if (!product) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Product not found.'; return; }

  pendingReceipt = {
    supplier, deliveryNo, productSku,
    productName: product.name,
    quantity, recvDate, condition,
    prevStock: product.quantity,
    newStock: product.quantity + quantity
  };

  $('confirmSupplier').textContent = pendingReceipt.supplier;
  $('confirmDeliveryNo').textContent = pendingReceipt.deliveryNo;
  $('confirmProduct').textContent = `${pendingReceipt.productName} (${pendingReceipt.productSku})`;
  $('confirmQuantity').textContent = `${pendingReceipt.quantity} unit${pendingReceipt.quantity === 1 ? '' : 's'}`;
  $('confirmDate').textContent = formatDateHuman(pendingReceipt.recvDate);
  $('confirmCondition').textContent = pendingReceipt.condition;

  $('confirmImpactSteps').innerHTML = `
    <li><strong>${escapeHtml(pendingReceipt.productName)}</strong> stock: <strong>${pendingReceipt.prevStock}</strong> → <strong>${pendingReceipt.newStock}</strong></li>
    <li>Status updates to: <strong>${computeStatus(pendingReceipt.newStock).label}</strong></li>
    <li>A <strong>Received</strong> stock movement will be logged</li>
    <li>A recent activity will appear on your Dashboard</li>
  `;
  openModal('receivingConfirmModal');
}

function commitReceipt() {
  if (!pendingReceipt) { closeModal('receivingConfirmModal'); return; }
  const product = products.find(p => p.sku === pendingReceipt.productSku);
  if (!product) { closeModal('receivingConfirmModal'); showToast('Product no longer exists.'); return; }

  const { supplier, deliveryNo, quantity } = pendingReceipt;
  const prevStock = product.quantity;
  product.quantity += quantity;

  stockMovements.push({
    dateTime: formatDateTime(new Date()),
    productName: product.name,
    type: 'Received',
    qtyDelta: quantity,
    prevStock,
    newStock: product.quantity,
    user: 'Kim Pogi'
  });
  activities.push({ icon: 'fas fa-truck', text: `Received ${quantity} × ${product.name} from ${supplier} (${deliveryNo})` });

  $('receivingForm').reset();
  pendingReceipt = null;

  renderAll();
  closeModal('receivingConfirmModal');
  showToast(`Received ${quantity} × ${product.name}. Stock updated to ${product.quantity}.`);
}

// LOGIN
function handleLogin(e) {
  if (e) e.preventDefault();
  const loginScreen = $('loginScreen');
  const mainApp = $('mainApp');
  const loginError = $('loginError');
  const usernameInput = $('username');
  const passwordInput = $('password');
  if (!loginScreen || !mainApp || !loginError || !usernameInput || !passwordInput) return;
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  if (!username || !password) {
    loginError.innerHTML = '<i class="fas fa-circle-exclamation"></i> Both fields are required.';
    return;
  }
  if (username !== VALID_EMAIL || password !== VALID_PASSWORD) {
    loginError.innerHTML = '<i class="fas fa-circle-exclamation"></i> The email or password is incorrect.';
    return;
  }
  loginError.innerHTML = '';
  loginScreen.style.display = 'none';
  mainApp.style.display = 'flex';
  showToast('Welcome back, Kim Pogi!');
}

// INIT
(function init() {
  const loginForm = $('loginForm');
  const loginBtn  = $('loginBtn');
  const usernameInput = $('username');
  const passwordInput = $('password');
  const loginError    = $('loginError');

  if (loginForm) loginForm.addEventListener('submit', handleLogin);
  if (loginBtn)  loginBtn.addEventListener('click', handleLogin);
  if (usernameInput) usernameInput.addEventListener('input', () => { if (loginError) loginError.innerHTML = ''; });
  if (passwordInput) passwordInput.addEventListener('input', () => { if (loginError) loginError.innerHTML = ''; });

  $('logoutBtn')?.addEventListener('click', () => {
    const loginScreen = $('loginScreen');
    const mainApp = $('mainApp');
    if (loginScreen && mainApp) {
      mainApp.style.display = 'none';
      loginScreen.style.display = 'flex';
    }
    if (loginError) loginError.innerHTML = '';
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
    showToast('Logged out successfully.');
  });

  // NAVIGATION
  const navItems = document.querySelectorAll('.nav-item[data-panel]');
  const panels   = document.querySelectorAll('.panel');
  const panelTitle = $('panelTitle');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const panelId = item.dataset.panel;
      if (!panelId) return;
      navItems.forEach(n => { n.classList.remove('active'); n.removeAttribute('aria-current'); });
      item.classList.add('active');
      item.setAttribute('aria-current', 'page');
      panels.forEach(p => p.classList.remove('active'));
      const target = $(`panel-${panelId}`);
      if (target) target.classList.add('active');

      const titles = {
        dashboard: 'Warehouse Dashboard',
        inventory: 'Inventory Management',
        receiving: 'Receiving Management',
        orders: 'Order / Picking Management',
        movement: 'Stock Movement & Tracking',
        reports: 'Reports & Notifications'
      };
      if (panelTitle) panelTitle.textContent = titles[panelId] || 'Dashboard';

      if (panelId === 'receiving') {
        renderReceivingProductOptions();
        updateReceivingReview();
      }
      if (panelId === 'orders') {
        updateOrderTabCounts();
        renderOrdersList();
        renderOrderDetails();
      }
      if (panelId === 'movement') {
        renderMovementSummary();
        renderStockMovements();
      }
      if (panelId === 'reports') {
        renderReports();
      }
    });
  });

  $('globalRefreshBtn')?.addEventListener('click', () => { renderAll(); showToast('Data refreshed.'); });

  // MODAL CLOSE
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  ['addProductModal', 'editProductModal', 'deleteConfirmModal', 'newOrderModal', 'viewProductModal', 'viewMovementModal', 'receivingConfirmModal'].forEach(id => {
    const modal = $(id);
    if (!modal) return;
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(id); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    ['addProductModal', 'editProductModal', 'deleteConfirmModal', 'newOrderModal', 'viewProductModal', 'viewMovementModal', 'receivingConfirmModal'].forEach(id => {
      const m = $(id);
      if (m && m.classList.contains('open')) closeModal(id);
    });
  });

  // INVENTORY SEARCH + FILTER
  $('inventorySearch')?.addEventListener('input', (e) => {
    inventorySearchTerm = e.target.value;
    renderInventory();
  });

  const filterToggleBtn = $('filterToggleBtn');
  const filterMenu = $('filterMenu');
  if (filterToggleBtn && filterMenu) {
    filterToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !filterMenu.hidden;
      filterMenu.hidden = isOpen;
      filterToggleBtn.setAttribute('aria-expanded', String(!isOpen));
    });
    document.addEventListener('click', (e) => {
      if (!filterMenu.hidden && !filterMenu.contains(e.target) && e.target !== filterToggleBtn) {
        filterMenu.hidden = true;
        filterToggleBtn.setAttribute('aria-expanded', 'false');
      }
    });
    filterMenu.addEventListener('click', (e) => {
      const opt = e.target.closest('.filter-option');
      if (!opt) return;
      inventoryFilter = opt.dataset.filter;
      filterMenu.querySelectorAll('.filter-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      const label = $('filterLabel');
      if (label) label.textContent = opt.textContent.trim();
      filterMenu.hidden = true;
      filterToggleBtn.setAttribute('aria-expanded', 'false');
      renderInventory();
    });
  }

  // ADD PRODUCT
  $('addProductBtn')?.addEventListener('click', () => {
    const form = $('addProductForm');
    const error = $('addProductError');
    const skuField = $('newSku');
    const qtyField = $('newQuantity');
    const statusField = $('newStatus');
    if (form) form.reset();
    if (error) error.innerHTML = '';
    if (skuField) skuField.value = `W-${skuCounter + 1}`;
    if (qtyField) qtyField.value = 0;
    if (statusField) statusField.value = '—';
    openModal('addProductModal');
    setTimeout(() => $('newProductName')?.focus(), 50);
  });

  $('newQuantity')?.addEventListener('input', (e) => {
    const qty = parseInt(e.target.value, 10);
    const s = $('newStatus');
    if (s) s.value = isNaN(qty) ? '—' : computeStatus(qty).label;
  });

  $('addProductForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const error = $('addProductError');
    const name = $('newProductName').value.trim();
    const category = $('newCategory').value;
    const quantity = parseInt($('newQuantity').value, 10);
    const location = $('newLocation').value.trim();
    const supplier = $('newSupplier').value;

    if (!name) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Product name is required.'; return; }
    if (!category) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Please select a category.'; return; }
    if (isNaN(quantity) || quantity < 0) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Quantity must be 0 or greater.'; return; }
    if (!location) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Location is required.'; return; }
    if (!supplier) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Please select a supplier.'; return; }

    const sku = generateSku();
    products.push({ sku, name, category, quantity, location, supplier });

    if (quantity > 0) {
      stockMovements.push({
        dateTime: formatDateTime(new Date()),
        productName: name,
        type: 'Received',
        qtyDelta: quantity,
        prevStock: 0,
        newStock: quantity,
        user: 'Kim Pogi'
      });
    }
    activities.push({ icon: 'fas fa-circle-check', text: `Added product ${name} (${sku})` });

    renderAll();
    closeModal('addProductModal');
    showToast(`Product "${name}" added with ${sku}.`);
  });

  ['newProductName','newCategory','newQuantity','newLocation','newSupplier'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', () => { const e = $('addProductError'); if (e) e.innerHTML = ''; });
    el.addEventListener('change', () => { const e = $('addProductError'); if (e) e.innerHTML = ''; });
  });

  // EDIT PRODUCT
  $('editQuantity')?.addEventListener('input', (e) => {
    const qty = parseInt(e.target.value, 10);
    const s = $('editStatus');
    if (s) s.value = isNaN(qty) ? '—' : computeStatus(qty).label;
  });

  $('editProductForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const error = $('editProductError');
    const sku = $('editSku').value;
    const product = products.find(p => p.sku === sku);
    if (!product) { closeModal('editProductModal'); return; }

    const name = $('editProductName').value.trim();
    const category = $('editCategory').value;
    const quantity = parseInt($('editQuantity').value, 10);
    const location = $('editLocation').value.trim();
    const supplier = $('editSupplier').value;

    if (!name) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Product name is required.'; return; }
    if (!category) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Please select a category.'; return; }
    if (isNaN(quantity) || quantity < 0) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Quantity must be 0 or greater.'; return; }
    if (!location) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Location is required.'; return; }
    if (!supplier) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Please select a supplier.'; return; }

    const prevQty = product.quantity;
    Object.assign(product, { name, category, quantity, location, supplier });

    if (prevQty !== quantity) {
      stockMovements.push({
        dateTime: formatDateTime(new Date()),
        productName: product.name,
        type: 'Adjusted',
        qtyDelta: quantity - prevQty,
        prevStock: prevQty,
        newStock: quantity,
        user: 'Kim Pogi'
      });
      activities.push({ icon: 'fas fa-pen', text: `Adjusted ${product.name} (${sku}) → ${quantity}` });
    }

    renderAll();
    closeModal('editProductModal');
    showToast(`Updated ${sku}.`);
  });

  ['editProductName','editCategory','editQuantity','editLocation','editSupplier'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', () => { const e = $('editProductError'); if (e) e.innerHTML = ''; });
    el.addEventListener('change', () => { const e = $('editProductError'); if (e) e.innerHTML = ''; });
  });

  $('viewEditBtn')?.addEventListener('click', () => {
    if (!viewingProductSku) return;
    const sku = viewingProductSku;
    closeModal('viewProductModal');
    setTimeout(() => {
      const product = products.find(p => p.sku === sku);
      if (!product) return;
      $('editSku').value = product.sku;
      $('editProductName').value = product.name;
      $('editCategory').value = product.category;
      $('editQuantity').value = product.quantity;
      $('editLocation').value = product.location || '';
      $('editSupplier').value = product.supplier || '';
      $('editStatus').value = computeStatus(product.quantity).label;
      $('editProductError').innerHTML = '';
      openModal('editProductModal');
      setTimeout(() => $('editProductName')?.focus(), 50);
    }, 180);
  });

  $('confirmDeleteBtn')?.addEventListener('click', () => {
    if (!pendingDeleteSku) return;
    const sku = pendingDeleteSku;
    const product = products.find(p => p.sku === sku);
    const name = product ? product.name : sku;
    products = products.filter(p => p.sku !== sku);
    activities.push({ icon: 'fas fa-trash', text: `Deleted product ${name} (${sku})` });
    renderAll();
    closeModal('deleteConfirmModal');
    showToast(`Deleted "${name}" (${sku}).`);
  });

  $('inventoryBody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.icon-btn');
    if (btn) {
      const sku = btn.dataset.sku;
      const action = btn.dataset.action;
      if (action === 'edit') {
        const product = products.find(p => p.sku === sku);
        if (!product) return;
        $('editSku').value = product.sku;
        $('editProductName').value = product.name;
        $('editCategory').value = product.category;
        $('editQuantity').value = product.quantity;
        $('editLocation').value = product.location || '';
        $('editSupplier').value = product.supplier || '';
        $('editStatus').value = computeStatus(product.quantity).label;
        $('editProductError').innerHTML = '';
        openModal('editProductModal');
        setTimeout(() => $('editProductName')?.focus(), 50);
      }
      if (action === 'delete') {
        const product = products.find(p => p.sku === sku);
        if (!product) return;
        pendingDeleteSku = sku;
        $('deleteProductName').textContent = `"${product.name}" (${product.sku})`;
        openModal('deleteConfirmModal');
      }
      return;
    }
    const row = e.target.closest('tr[data-clickable="true"]');
    if (row && row.dataset.sku) openViewProductModal(row.dataset.sku);
  });

  // RECEIVING
  ['supplier', 'deliveryNo', 'product', 'quantity', 'recvDate', 'condition'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', updateReceivingReview);
    el.addEventListener('change', updateReceivingReview);
  });

  $('cancelReceiving')?.addEventListener('click', () => {
    const f = $('receivingForm');
    if (f) f.reset();
    const e = $('receivingError');
    if (e) e.innerHTML = '';
    pendingReceipt = null;
    updateReceivingReview();
    showToast('Receiving cancelled.');
  });

  $('receivingForm')?.addEventListener('submit', handleReviewReceipt);
  $('confirmReceiptBtn')?.addEventListener('click', commitReceipt);

  // ORDERS TABS
  document.querySelectorAll('.order-tab[data-order-filter]').forEach(tab => {
    tab.addEventListener('click', () => {
      ordersFilter = tab.dataset.orderFilter;
      document.querySelectorAll('.order-tab[data-order-filter]').forEach(t => {
        t.classList.remove('active'); t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active'); tab.setAttribute('aria-selected', 'true');
      renderOrdersList();
    });
  });

  // NEW ORDER
  $('newOrderBtn')?.addEventListener('click', () => {
    const form = $('newOrderForm');
    const error = $('newOrderError');
    if (form) form.reset();
    if (error) error.innerHTML = '';
    draftOrderLines = [];
    renderNewOrderLineOptions();
    renderDraftOrderLines();
    openModal('newOrderModal');
    setTimeout(() => $('orderCustomer')?.focus(), 50);
  });

  $('addOrderLineBtn')?.addEventListener('click', () => {
    const error = $('newOrderError');
    error.innerHTML = '';
    const sku = $('orderLineProduct').value;
    const qty = parseInt($('orderLineQty').value, 10);
    if (!sku) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Please select a product.'; return; }
    if (isNaN(qty) || qty <= 0) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Quantity must be greater than 0.'; return; }
    const product = products.find(p => p.sku === sku);
    if (!product) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Product not found.'; return; }
    const alreadyOnDraft = draftOrderLines.filter(l => l.sku === sku).reduce((sum, l) => sum + l.qty, 0);
    if (alreadyOnDraft + qty > product.quantity) {
      error.innerHTML = `<i class="fas fa-circle-exclamation"></i> Only ${product.quantity - alreadyOnDraft} more available for "${product.name}".`;
      return;
    }
    draftOrderLines.push({ sku: product.sku, name: product.name, qty });
    $('orderLineQty').value = 1;
    renderDraftOrderLines();
  });

  $('orderLinesDraftBody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-draft-line]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.removeDraftLine, 10);
    draftOrderLines.splice(idx, 1);
    renderDraftOrderLines();
  });

  $('newOrderForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const error = $('newOrderError');
    error.innerHTML = '';
    const customer = $('orderCustomer').value.trim();
    if (!customer) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Customer name is required.'; return; }
    if (draftOrderLines.length === 0) { error.innerHTML = '<i class="fas fa-circle-exclamation"></i> Add at least one product to the order.'; return; }
    for (const line of draftOrderLines) {
      const product = products.find(p => p.sku === line.sku);
      if (!product || product.quantity < line.qty) {
        error.innerHTML = `<i class="fas fa-circle-exclamation"></i> Not enough stock for "${line.name}".`;
        return;
      }
    }
    const id = generateOrderId();
    const order = {
      id, customer,
      createdAt: formatDateShort(new Date()),
      status: 'Pending',
      lines: draftOrderLines.map(l => ({ sku: l.sku, name: l.name, qty: l.qty, picked: false }))
    };
    orders.push(order);
    activities.push({ icon: 'fas fa-clipboard-list', text: `New order ${id} for ${customer} (${order.lines.length} item(s))` });
    renderAll();
    closeModal('newOrderModal');
    showToast(`Order ${id} created for ${customer}.`);
    selectedOrderId = id;
    renderOrderDetails();
  });

  $('ordersBody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open-order]');
    if (btn) {
      selectedOrderId = btn.dataset.openOrder;
      renderOrderDetails();
      $('orderDetailsSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const row = e.target.closest('tr[data-clickable="true"]');
    if (row && row.dataset.orderId) {
      selectedOrderId = row.dataset.orderId;
      renderOrderDetails();
      $('orderDetailsSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  $('orderDetailsSection')?.addEventListener('click', (e) => {
    const order = orders.find(o => o.id === selectedOrderId);
    if (!order) return;

    const pickBtn = e.target.closest('[data-pick-line]');
    if (pickBtn) {
      const idx = parseInt(pickBtn.dataset.pickLine, 10);
      const line = order.lines[idx];
      if (!line) return;
      const product = products.find(p => p.sku === line.sku);
      if (!product || product.quantity < line.qty) { showToast(`Not enough stock for "${line.name}".`); return; }
      line.picked = true;
      renderOrderDetails();
      renderDashboardOrders();
      renderNotifications();
      return;
    }
    const unpickBtn = e.target.closest('[data-unpick-line]');
    if (unpickBtn) {
      const idx = parseInt(unpickBtn.dataset.unpickLine, 10);
      const line = order.lines[idx];
      if (!line) return;
      line.picked = false;
      renderOrderDetails();
      return;
    }
    const actionBtn = e.target.closest('[data-order-action]');
    if (!actionBtn) return;
    const action = actionBtn.dataset.orderAction;

    if (action === 'start-picking') {
      order.status = 'Picking';
      activities.push({ icon: 'fas fa-play', text: `Started picking ${order.id} (${order.customer})` });
      renderAll();
      showToast(`Order ${order.id} is now Picking.`);
    }
    if (action === 'mark-ready') {
      const allPicked = order.lines.every(l => l.picked);
      if (!allPicked) { showToast('Pick all items first.'); return; }
      order.status = 'Ready';
      activities.push({ icon: 'fas fa-box-open', text: `Order ${order.id} marked as Ready` });
      renderAll();
      showToast(`Order ${order.id} is now Ready.`);
    }
    if (action === 'complete-order') {
      for (const line of order.lines) {
        const product = products.find(p => p.sku === line.sku);
        if (!product || product.quantity < line.qty) { showToast(`Not enough stock for "${line.name}".`); return; }
      }
      order.lines.forEach(line => {
        const product = products.find(p => p.sku === line.sku);
        if (!product) return;
        const prevStock = product.quantity;
        product.quantity -= line.qty;
        stockMovements.push({
          dateTime: formatDateTime(new Date()),
          productName: product.name,
          type: 'Released',
          qtyDelta: -line.qty,
          prevStock,
          newStock: product.quantity,
          user: 'Kim Pogi'
        });
      });
      order.status = 'Completed';
      activities.push({ icon: 'fas fa-check-circle', text: `Order ${order.id} completed for ${order.customer}` });
      renderAll();
      showToast(`Order ${order.id} completed. Stock released.`);
    }
    if (action === 'close-details') {
      selectedOrderId = null;
      renderOrderDetails();
    }
  });

  $('orderSearch')?.addEventListener('input', () => {
    renderOrdersList();
  });

  // MOVEMENT FILTERS
  document.querySelectorAll('.order-tab[data-mv-filter]').forEach(tab => {
    tab.addEventListener('click', () => {
      movementFilter = tab.dataset.mvFilter;
      document.querySelectorAll('.order-tab[data-mv-filter]').forEach(t => {
        t.classList.remove('active'); t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active'); tab.setAttribute('aria-selected', 'true');
      renderStockMovements();
    });
  });

  $('movementSearch')?.addEventListener('input', (e) => {
    movementSearchTerm = e.target.value;
    renderStockMovements();
  });

  $('clearMovementFilters')?.addEventListener('click', () => {
    movementFilter = 'all';
    movementSearchTerm = '';
    const searchEl = $('movementSearch');
    if (searchEl) searchEl.value = '';
    document.querySelectorAll('.order-tab[data-mv-filter]').forEach(t => {
      t.classList.toggle('active', t.dataset.mvFilter === 'all');
      t.setAttribute('aria-selected', t.dataset.mvFilter === 'all' ? 'true' : 'false');
    });
    renderStockMovements();
    showToast('Movement filters cleared.');
  });

  $('movementBody')?.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-clickable="true"]');
    if (!row) return;
    const idx = parseInt(row.dataset.movementIdx, 10);
    if (isNaN(idx)) return;
    openViewMovementModal(idx);
  });

  // REPORTS TABS
  document.querySelectorAll('.order-tab[data-reports-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      reportsTab = tab.dataset.reportsTab;
      document.querySelectorAll('.order-tab[data-reports-tab]').forEach(t => {
        t.classList.remove('active'); t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active'); tab.setAttribute('aria-selected', 'true');
      document.querySelectorAll('.reports-panel').forEach(p => {
        p.classList.toggle('active', p.dataset.reportsContent === reportsTab);
      });
      renderReports();
    });
  });

  // NOTIFICATION FILTERS
  document.querySelectorAll('.notif-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      notifFilter = btn.dataset.notifFilter;
      document.querySelectorAll('.notif-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderNotifications();
    });
  });

  // EXPORT
  $('exportReportBtn')?.addEventListener('click', () => {
    const names = {
      notifications: 'Notifications',
      inventory: 'Inventory Report',
      lowstock: 'Low-stock Report',
      movement: 'Stock Movement Report',
      orders: 'Order Report'
    };
    showToast(`Exporting ${names[reportsTab] || 'Report'}…`);
  });

  // BOOTSTRAP
  renderAll();
  const loginScreen = $('loginScreen');
  const mainApp = $('mainApp');
  if (loginScreen) loginScreen.style.display = 'flex';
  if (mainApp) mainApp.style.display = 'none';

  console.log('[WarehouseFlow] Initialized. Reports & Notifications ready.');
})();