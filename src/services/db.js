// src/services/db.js
// Dual adapter: Postgres in prod (DATABASE_URL starts with postgres://), SQLite locally otherwise.
import fs from 'node:fs';
import path from 'node:path';

function isPg(url) { return /^postgres(ql)?:\/\//i.test(url || ''); }

export async function createDb() {
  const url = process.env.DATABASE_URL || '';

  if (isPg(url)) {
    const { Pool } = await import('pg').then(m => m.default ? m.default : m);
    const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
    const svc = await import('./orders.pg.js');
    return makeAdapter('pg', pool, svc);
  }

  const Database = (await import('better-sqlite3')).default;
  const file = path.resolve(url || 'data/cdm.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  const svc = await import('./orders.sqlite.js');
  return makeAdapter('sqlite', sqlite, svc);
}

function makeAdapter(kind, conn, svc) {
  return {
    kind,
    conn,
    initOrders: () => svc.initOrders(conn),
    createOrder: (payload) => svc.createOrder(conn, payload),
    attachPreference: (orderId, prefId, initPoint) => svc.attachPreference(conn, orderId, prefId, initPoint),
    updateByExternalReference: (externalRef, paymentId, status) => svc.updateByExternalReference(conn, externalRef, paymentId, status),
    getOrderById: (id) => svc.getOrderById(conn, id),
  };
}
