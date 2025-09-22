// src/services/orders.pg.js
export async function initOrders(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      email TEXT NOT NULL,
      name TEXT,
      phone TEXT,
      notes TEXT,
      delivery_mode TEXT NOT NULL,
      delivery_address JSONB,
      total_amount NUMERIC NOT NULL DEFAULT 0,
      mp_preference_id TEXT,
      mp_init_point TEXT,
      mp_payment_id TEXT,
      mp_status TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price NUMERIC NOT NULL,
      currency TEXT DEFAULT 'ARS',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function createOrder(pool, payload) {
  const { email, customer = {}, delivery = {}, items = [], total } = payload;
  const delivery_mode = delivery.mode || 'delivery';
  const address = delivery_mode === 'delivery' ? (delivery.address || {}) : null;
  const name = customer.name || null;
  const phone = customer.phone || null;
  const notes = customer.notes || null;
  const total_amount = Number.isFinite(total) ? total :
    items.reduce((a,i)=> a + (Number(i.unit_price)||0) * (Number(i.quantity)||1), 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO orders (status,email,name,phone,notes,delivery_mode,delivery_address,total_amount)
       VALUES ('pending',$1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [email, name, phone, notes, delivery_mode, address, total_amount]
    );
    const orderId = ins.rows[0].id;

    for (const it of items) {
      await client.query(
        `INSERT INTO order_items (order_id,title,quantity,unit_price,currency)
         VALUES ($1,$2,$3,$4,'ARS')`,
        [orderId, String(it.title||'Producto').slice(0,256), Math.max(1, it.quantity||1), Number(it.unit_price||0)]
      );
    }
    await client.query('COMMIT');
    return orderId;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function attachPreference(pool, orderId, prefId, initPoint) {
  await pool.query(
    `UPDATE orders
       SET mp_preference_id = $1, mp_init_point = $2, updated_at = NOW()
     WHERE id = $3`,
    [prefId, initPoint || null, orderId]
  );
}

export async function updateByExternalReference(pool, externalRef, paymentId, status) {
  const id = parseInt(externalRef, 10);
  if (!id) return;
  await pool.query(
    `UPDATE orders
       SET status = $1, mp_payment_id = $2, mp_status = $1, updated_at = NOW()
     WHERE id = $3`,
    [status || null, paymentId || null, id]
  );
}

export async function getOrderById(pool, id) {
  const o = await pool.query(`SELECT * FROM orders WHERE id = $1`, [id]);
  if (!o.rowCount) return null;
  const items = await pool.query(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY id`, [id]);
  return { ...o.rows[0], items: items.rows };
}
