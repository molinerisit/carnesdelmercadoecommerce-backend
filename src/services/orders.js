export function initOrders(db) {
  db.prepare(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL DEFAULT 'pending',
    email TEXT NOT NULL,
    name TEXT,
    phone TEXT,
    notes TEXT,
    delivery_mode TEXT NOT NULL,
    delivery_address TEXT,
    total_amount REAL NOT NULL DEFAULT 0,
    mp_preference_id TEXT,
    mp_init_point TEXT,
    mp_payment_id TEXT,
    mp_status TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    currency TEXT DEFAULT 'ARS',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
  )`).run();
}

export function createOrder(db, payload) {
  const { email, customer = {}, delivery = {}, items = [], total } = payload;
  const delivery_mode = delivery.mode || 'delivery';
  const delivery_address = delivery_mode === 'delivery' ? JSON.stringify(delivery.address || {}) : null;
  const name = customer.name || null;
  const phone = customer.phone || null;
  const notes = customer.notes || null;
  const total_amount = Number.isFinite(total) ? total : items.reduce((a,i)=>a + (i.unit_price * i.quantity), 0);

  const ins = db.prepare(`INSERT INTO orders
    (status, email, name, phone, notes, delivery_mode, delivery_address, total_amount)
    VALUES ('pending', ?, ?, ?, ?, ?, ?, ?)`);
  const r = ins.run(email, name, phone, notes, delivery_mode, delivery_address, total_amount);
  const orderId = r.lastInsertRowid;

  const insItem = db.prepare(`INSERT INTO order_items
    (order_id, title, quantity, unit_price, currency)
    VALUES (?, ?, ?, ?, 'ARS')`);
  const tx = db.transaction((arr) => {
    for (const it of arr) insItem.run(orderId, String(it.title||'Producto').slice(0,256), Math.max(1, it.quantity||1), Number(it.unit_price||0));
  });
  tx(items);

  return orderId;
}

export function attachPreference(db, orderId, prefId, initPoint) {
  db.prepare(`UPDATE orders SET mp_preference_id = ?, mp_init_point = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(prefId, initPoint || null, orderId);
}

export function updateByExternalReference(db, externalRef, paymentId, status) {
  const id = parseInt(externalRef, 10);
  if (!id) return;
  db.prepare(`UPDATE orders SET status = ?, mp_payment_id = ?, mp_status = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(status || null, paymentId || null, status || null, id);
}

export function getOrderById(db, id) {
  const o = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id);
  if (!o) return null;
  const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ? ORDER BY id`).all(id);
  return { ...o, items };
}
