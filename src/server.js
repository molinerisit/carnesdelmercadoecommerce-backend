// ESM (package.json debe tener: "type": "module")
import express from "express";
import cors from "cors";
import morgan from "morgan";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
// Si tu deploy falla con el subpath /sync, usa la línea de abajo y borra la de /sync:
// import { stringify } from "csv-stringify";
import { stringify } from "csv-stringify/sync";
import { nanoid } from "nanoid";

dotenv.config();
const app = express();

const PORT = process.env.PORT || 8787;

// ===== CORS (origen sin barra final) =====
const rawOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const FRONTEND_ORIGIN = rawOrigin.replace(/\/+$/, "");
const ALLOWED_ORIGINS = [
  FRONTEND_ORIGIN,
  "http://localhost:5173",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: (origin, cb) => {
      // Permitir tools sin Origin (curl/Postman) y chequear whitelist para navegador
      if (!origin) return cb(null, true);
      const ok = ALLOWED_ORIGINS.includes(origin);
      return cb(ok ? null : new Error("Not allowed by CORS"), ok);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.options("*", cors()); // Preflight

// ===== middleware =====
app.use(morgan("dev"));
app.use(bodyParser.json({ limit: "2mb" }));

// ===== paths/helpers =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

// ===== DB (SQLite) =====
const dbPath = path.join(dataDir, "cdm.sqlite");
const db = new Database(dbPath);

// tablas
db.exec(`
  PRAGMA journal_mode=WAL;

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    price INTEGER NOT NULL,            -- centavos
    unit TEXT DEFAULT 'kg',
    image_url TEXT,
    stock INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending|paid|cancelled
    customer TEXT,
    phone TEXT,
    notes TEXT,
    total_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    paid_at TEXT
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity REAL NOT NULL,
    price_cents INTEGER NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
`);

// ===== auth minimal =====
const DEMO_TOKEN = process.env.DEMO_TOKEN || "demo-admin-token";

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (token === DEMO_TOKEN) return next();
  return res.status(401).json({ error: "unauthorized" });
}

// ===== utils =====
const toProductDto = (r) => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  description: r.description,
  price: r.price, // centavos
  unit: r.unit,
  imageUrl: r.image_url,
  stock: r.stock,
  createdAt: r.created_at,
});

// ===== root + health =====
app.get("/", (_req, res) => {
  res.type("text/plain").send("cdm-backend: ok");
});
app.get("/health", (_req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || "dev" });
});

// ===== auth endpoints =====
app.post("/api/auth/login", (req, res) => {
  const { username } = req.body || {};
  return res.json({
    token: DEMO_TOKEN,
    user: { name: username || "Admin", role: "admin" },
  });
});

app.get("/api/auth/me", (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (token !== DEMO_TOKEN) return res.status(401).json({ error: "unauthorized" });
  return res.json({ user: { name: "Admin", role: "admin" } });
});

// ===== products public =====
app.get("/api/products", (_req, res) => {
  const rows = db.prepare("SELECT * FROM products ORDER BY created_at DESC").all();
  res.json(rows.map(toProductDto));
});

app.get("/api/product/:slug", (req, res) => {
  const r = db.prepare("SELECT * FROM products WHERE slug=?").get(req.params.slug);
  if (!r) return res.status(404).json({ error: "not found" });
  res.json(toProductDto(r));
});

// ===== products admin =====
app.post("/api/admin/products", requireAdmin, (req, res) => {
  const p = req.body || {};
  const id = nanoid();
  try {
    db.prepare(
      `INSERT INTO products (id,name,slug,description,price,unit,image_url,stock)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(
      id,
      p.name,
      p.slug,
      p.description || "",
      Number(p.price ?? 0),
      p.unit || "kg",
      p.imageUrl || null,
      Number(p.stock ?? 0)
    );
    const r = db.prepare("SELECT * FROM products WHERE id=?").get(id);
    res.json(toProductDto(r));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.put("/api/admin/products/:id", requireAdmin, (req, res) => {
  const p = req.body || {};
  try {
    db.prepare(
      `UPDATE products SET name=?, slug=?, description=?, price=?, unit=?, image_url=?, stock=? WHERE id=?`
    ).run(
      p.name,
      p.slug,
      p.description || "",
      Number(p.price ?? 0),
      p.unit || "kg",
      p.imageUrl || null,
      Number(p.stock ?? 0),
      req.params.id
    );
    const r = db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id);
    res.json(toProductDto(r));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.delete("/api/admin/products/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM products WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ===== orders/admin reports =====
app.get("/api/admin/orders", requireAdmin, (_req, res) => {
  const orders = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
  const items = db
    .prepare(
      `SELECT oi.*, p.name as product_name
       FROM order_items oi JOIN products p ON p.id = oi.product_id`
    )
    .all();

  const itemsByOrder = items.reduce((acc, it) => {
    (acc[it.order_id] ||= []).push({
      id: it.id,
      quantity: it.quantity,
      priceCents: it.price_cents,
      product: { name: it.product_name },
    });
    return acc;
  }, {});

  const resp = orders.map((o) => ({
    id: o.id,
    code: o.code,
    status: o.status,
    customer: o.customer,
    phone: o.phone,
    notes: o.notes,
    totalCents: o.total_cents,
    createdAt: o.created_at,
    paidAt: o.paid_at,
    items: itemsByOrder[o.id] || [],
  }));
  res.json(resp);
});

// ===== CSV export =====
// Si /sync te diera error en deploy, cambia el import arriba y usa esta versión tipo stream:
// app.get("/api/admin/orders/export", requireAdmin, (_req, res) => {
//   const orders = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
//   res.setHeader("Content-Type", "text/csv");
//   res.setHeader("Content-Disposition", 'attachment; filename="orders.csv"');
//   stringify(orders, { header: true }).pipe(res);
// });
app.get("/api/admin/orders/export", requireAdmin, (_req, res) => {
  const orders = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
  const csv = stringify(orders, { header: true });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="orders.csv"');
  res.send(csv);
});

app.get("/api/admin/stats", requireAdmin, (_req, res) => {
  const totalOrders = db.prepare("SELECT COUNT(*) as c FROM orders").get().c;
  const totalRevenue = db
    .prepare("SELECT COALESCE(SUM(total_cents),0) as s FROM orders WHERE status='paid'")
    .get().s;
  const topProducts = db
    .prepare(
      `SELECT p.name, SUM(oi.quantity) as qty
       FROM order_items oi JOIN products p ON p.id = oi.product_id
       GROUP BY p.name ORDER BY qty DESC LIMIT 5`
    )
    .all();
  res.json({ totalOrders, totalRevenue, topProducts });
});

// ===== checkout (demo) =====
app.post("/api/checkout", (req, res) => {
  const payload = req.body || {};
  const items = Array.isArray(payload.items) ? payload.items : []; // [{productId, quantity, priceCents}]
  const customer = payload.customer || "";
  const phone = payload.phone || "";
  const notes = payload.notes || "";

  if (!items.length) return res.status(400).json({ error: "items required" });

  // calcular total
  let total = 0;
  for (const it of items) {
    total += Number(it.priceCents || 0) * Number(it.quantity || 0);
  }

  const orderId = nanoid();
  const code = orderId.slice(0, 8).toUpperCase();

  db.prepare(
    `INSERT INTO orders (id, code, status, customer, phone, notes, total_cents)
     VALUES (?,?,?,?,?,?,?)`
  ).run(orderId, code, "pending", customer, phone, notes, total);

  for (const it of items) {
    db.prepare(
      `INSERT INTO order_items (id, order_id, product_id, quantity, price_cents)
       VALUES (?,?,?,?,?)`
    ).run(nanoid(), orderId, it.productId, Number(it.quantity || 0), Number(it.priceCents || 0));
  }

  const redirectUrl = `${FRONTEND_ORIGIN}/order-success?code=${encodeURIComponent(code)}`;

  if (String(req.query.redirect) === "1") {
    return res.redirect(302, redirectUrl);
  }

  res.json({ ok: true, orderId, code, redirectUrl });
});

// ===== ejemplo de fallo/pago (demo) =====
app.get("/api/checkout/failure", (_req, res) => {
  const redirectUrl = `${FRONTEND_ORIGIN}/order-failure`;
  res.redirect(302, redirectUrl);
});

// ===== seed mínima si no hay productos =====
const count = db.prepare("SELECT COUNT(*) as c FROM products").get().c;
if (!count) {
  const demo = [
    { name: "Bife Ancho", slug: "bife-ancho", price: 89900, unit: "kg", stock: 12 },
    { name: "Asado", slug: "asado", price: 79900, unit: "kg", stock: 20 },
    { name: "Milanesa", slug: "milanesa", price: 74900, unit: "kg", stock: 15 },
  ];
  for (const p of demo) {
    db.prepare(
      `INSERT INTO products (id,name,slug,description,price,unit,image_url,stock)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(nanoid(), p.name, p.slug, "", p.price, p.unit, null, p.stock);
  }
}

// ===== start =====
app.listen(PORT, () => {
  console.log(`Backend listo en http://localhost:${PORT}`);
  console.log(`CORS allow: ${ALLOWED_ORIGINS.join(", ")}`);
});
