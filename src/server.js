import express from "express"
import cors from "cors"
import morgan from "morgan"
import bodyParser from "body-parser"
import dotenv from "dotenv"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import Database from "better-sqlite3"
import { stringify } from "csv-stringify"
import { nanoid } from "nanoid"

dotenv.config()
const app = express()

const PORT = process.env.PORT || 8787
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173"
const SQLITE_PATH = process.env.SQLITE_PATH || "./data/app.db"
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || ""
const DEMO_TOKEN = process.env.DEMO_TOKEN || "demo-admin-token"

// asegurar carpeta DB
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbFullPath = path.isAbsolute(SQLITE_PATH) ? SQLITE_PATH : path.join(__dirname, "..", SQLITE_PATH)
fs.mkdirSync(path.dirname(dbFullPath), { recursive: true })

const db = new Database(dbFullPath); db.pragma('journal_mode = WAL')

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }))
app.use(morgan("dev"))
app.use(bodyParser.json({ limit: "1mb" }))
app.use(bodyParser.urlencoded({ extended: true }))

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@carnesdelmercado.test"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123"

// ---------- Auth ----------
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {}
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) return res.json({ token: DEMO_TOKEN, email })
  res.status(401).json({ error: "Credenciales inválidas" })
})
app.get("/api/auth/me", (req, res) => {
  const auth = req.headers.authorization || ""
  if (auth === "Bearer " + DEMO_TOKEN) return res.json({ email: ADMIN_EMAIL, role: "ADMIN" })
  res.status(401).json({ error: "No autenticado" })
})
function requireAdmin(req, res, next){
  const auth = req.headers.authorization || ""
  if (auth === "Bearer " + DEMO_TOKEN) return next()
  res.status(401).json({ error: "No autorizado" })
}

// ---------- Products ----------
app.get("/api/products", (_req, res) => {
  const rows = db.prepare("SELECT * FROM products ORDER BY name ASC").all()
  res.json(rows.map(r => ({
    id: r.id, name: r.name, slug: r.slug, description: r.description,
    price: r.price, unit: r.unit, imageUrl: r.image_url, stock: r.stock, createdAt: r.created_at
  })))
})
app.get("/api/products/:slug", (req, res) => {
  const r = db.prepare("SELECT * FROM products WHERE slug=?").get(req.params.slug)
  if (!r) return res.status(404).json({ error: "No encontrado" })
  res.json({ id: r.id, name: r.name, slug: r.slug, description: r.description, price: r.price, unit: r.unit, imageUrl: r.image_url, stock: r.stock, createdAt: r.created_at })
})
app.post("/api/admin/products", requireAdmin, (req, res) => {
  const p = req.body || {}
  const id = "p_" + nanoid(10)
  try{
    db.prepare(`INSERT INTO products (id,name,slug,description,price,unit,image_url,stock) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, p.name, p.slug, p.description, p.price, p.unit, p.imageUrl || null, p.stock || 0)
    const r = db.prepare("SELECT * FROM products WHERE id=?").get(id)
    res.json({ id: r.id, name: r.name, slug: r.slug, description: r.description, price: r.price, unit: r.unit, imageUrl: r.image_url, stock: r.stock })
  }catch(e){ res.status(400).json({ error: String(e) }) }
})
app.put("/api/admin/products/:id", requireAdmin, (req, res) => {
  const p = req.body || {}
  try{
    db.prepare(`UPDATE products SET name=?, slug=?, description=?, price=?, unit=?, image_url=?, stock=? WHERE id=?`)
      .run(p.name, p.slug, p.description, p.price, p.unit, p.imageUrl || null, p.stock, req.params.id)
    const r = db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id)
    res.json({ id: r.id, name: r.name, slug: r.slug, description: r.description, price: r.price, unit: r.unit, imageUrl: r.image_url, stock: r.stock })
  }catch(e){ res.status(400).json({ error: String(e) }) }
})
app.delete("/api/admin/products/:id", requireAdmin, (req, res) => {
  try{ db.prepare("DELETE FROM products WHERE id=?").run(req.params.id); res.json({ ok: true }) }
  catch(e){ res.status(400).json({ error: String(e) }) }
})

// ---------- Checkout / Orders ----------
app.post("/api/checkout", async (req, res) => {
  const { cart, customer, phone, notes } = req.body || {}
  if (!cart?.length) return res.status(400).json({ error: "Carrito vacío" })

  const ids = cart.map(c => c.productId)
  const placeholders = ids.map(()=>'?').join(',')
  const prods = db.prepare(`SELECT * FROM products WHERE id IN (${placeholders})`).all(...ids)
  const map = Object.fromEntries(prods.map(p => [p.id, p]))
  let total = 0
  for (const item of cart) {
    const prod = map[item.productId]
    if (!prod) return res.status(400).json({ error: "Producto inexistente" })
    if (prod.stock < item.quantity) return res.status(400).json({ error: `Sin stock: ${prod.name}` })
    total += prod.price * item.quantity
  }

  const orderId = "o_" + nanoid(10)
  const code = "CM-" + nanoid(8).toUpperCase()

  const insOrder = db.prepare(`INSERT INTO orders (id, code, status, customer, phone, notes, total_cents) VALUES (?,?,?,?,?,?,?)`)
  const insItem  = db.prepare(`INSERT INTO order_items (id, quantity, price_cents, product_id, order_id) VALUES (?,?,?,?,?)`)
  const updStock = db.prepare(`UPDATE products SET stock = stock - ? WHERE id=?`)
  const tx = db.transaction(() => {
    insOrder.run(orderId, code, 'PENDING', customer, phone, notes, total)
    for (const it of cart) {
      insItem.run('oi_'+nanoid(10), it.quantity, map[it.productId].price, it.productId, orderId)
      updStock.run(it.quantity, it.productId)
    }
  })
  tx()

  if (MP_ACCESS_TOKEN) {
    try{
      const mp = await import("mercadopago")
      const clientMP = new mp.MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN })
      const preference = new mp.Preference(clientMP)
      const items = cart.map(it => ({
        title: map[it.productId].name,
        quantity: it.quantity,
        currency_id: "ARS",
        unit_price: map[it.productId].price / 100
      }))
      const backUrlBase = FRONTEND_ORIGIN
      const pref = await preference.create({
        body: {
          items,
          external_reference: orderId,
          back_urls: {
            success: `${backUrlBase}/order-success`,
            failure: `${backUrlBase}/order-failure`,
            pending: `${backUrlBase}/order-pending`
          },
          auto_return: "approved",
          notification_url: process.env.WEBHOOK_URL || "http://localhost:8787/api/webhooks/mercadopago"
        }
      })
      return res.json({ orderId, code, init_point: pref.init_point, sandbox_init_point: pref.sandbox_init_point })
    }catch(e){ console.error("MercadoPago error:", e) }
  }

  // Mock
  res.json({ orderId, code, init_point: `/mock/payment?orderId=${orderId}` })
})

app.get("/mock/payment", (req, res) => {
  const { orderId } = req.query
  res.setHeader("Content-Type", "text/html; charset=utf-8")
  res.end(`
    <html><body style="font-family:sans-serif;padding:24px">
      <h1>Pago simulado</h1>
      <p>Order ID: ${orderId}</p>
      <form method="post" action="/api/mock/pay">
        <input type="hidden" name="orderId" value="${orderId}"/>
        <button>Confirmar pago APROBADO</button>
      </form>
      <br/>
      <form method="post" action="/api/mock/fail">
        <input type="hidden" name="orderId" value="${orderId}"/>
        <button>Simular pago RECHAZADO</button>
      </form>
    </body></html>`)
})
app.post("/api/mock/pay", (req, res) => {
  const { orderId } = req.body
  db.prepare("UPDATE orders SET status='APPROVED', paid_at=datetime('now') WHERE id=?").run(orderId)
  res.redirect(`${FRONTEND_ORIGIN}/order-success?code=${orderId}`)
})
app.post("/api/mock/fail", (req, res) => {
  const { orderId } = req.body
  db.prepare("UPDATE orders SET status='REJECTED' WHERE id=?").run(orderId)
  res.redirect(`${FRONTEND_ORIGIN}/order-failure?code=${orderId}`)
})

// ---------- Admin ----------
app.get("/api/admin/orders", requireAdmin, (_req, res) => {
  const orders = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all()
  const items = db.prepare(`SELECT oi.*, p.name as product_name FROM order_items oi JOIN products p ON p.id = oi.product_id`).all()
  const itemsByOrder = items.reduce((acc, it) => {
    (acc[it.order_id] ||= []).push({ id: it.id, quantity: it.quantity, priceCents: it.price_cents, product: { name: it.product_name } })
    return acc
  }, {})
  const resp = orders.map(o => ({
    id: o.id, code: o.code, status: o.status, customer: o.customer, phone: o.phone,
    notes: o.notes, totalCents: o.total_cents, createdAt: o.created_at, paidAt: o.paid_at,
    items: itemsByOrder[o.id] || []
  }))
  res.json(resp)
})

app.get("/api/admin/orders/export", requireAdmin, (_req, res) => {
  const orders = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all()
  res.setHeader("Content-Type", "text/csv")
  res.setHeader("Content-Disposition", "attachment; filename=orders.csv")
  const stringifier = stringify({ header: true, columns: ["code","status","customer","phone","totalCents","createdAt"] })
  stringifier.pipe(res)
  for (const o of orders) {
    stringifier.write([o.code, o.status, o.customer, o.phone || "", o.total_cents, o.created_at])
  }
  stringifier.end()
})

app.get("/api/admin/stats", requireAdmin, (_req, res) => {
  const orders = db.prepare("SELECT * FROM orders").all()
  const byDay = {}
  for (const o of orders){
    const day = (o.created_at || '').slice(0,10)
    byDay[day] = (byDay[day] || 0) + o.total_cents
  }
  const salesByDay = Object.entries(byDay).sort((a,b)=>a[0].localeCompare(b[0])).map(([date, total])=>({ date, total: total/100 }))
  const total = orders.reduce((a,o)=>a+o.total_cents,0)/100
  const resp = {
    totals: { revenue: total, orders: orders.length, ticket: orders.length ? total/orders.length : 0 },
    ordersStatus: {
      approved: orders.filter(o=>o.status==='APPROVED').length,
      pending: orders.filter(o=>o.status==='PENDING').length,
      rejected: orders.filter(o=>o.status==='REJECTED').length,
    },
    salesByDay
  }
  res.json(resp)
})

app.listen(PORT, () => console.log(`Backend listo en http://localhost:${PORT}`))
