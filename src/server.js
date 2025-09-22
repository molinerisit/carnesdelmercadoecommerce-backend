import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import Database from 'better-sqlite3'
import { Parser } from 'json2csv'

import checkoutRouter from './routes/checkout.js'
import webhookRouter from './routes/webhook.js'

const app = express()

// CORS
const DEFAULT_ORIGINS = [
  /^https:\/\/([a-z0-9-]+\.)*vercel\.app$/i,
  'http://localhost:5173',
  'http://localhost:3000'
]
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN
const allowlist = [...DEFAULT_ORIGINS, ...(FRONTEND_ORIGIN ? [FRONTEND_ORIGIN] : [])]

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true) // curl / server-to-server
    const ok = allowlist.some(rule => (rule instanceof RegExp ? rule.test(origin) : rule === origin))
    return cb(ok ? null : new Error('CORS blocked: ' + origin), ok)
  },
  credentials: true
}))

app.use(cookieParser())
app.use(bodyParser.json({ limit: '1mb' }))
app.use(bodyParser.urlencoded({ extended: true }))

// DB
const dbPath = process.env.DATABASE_URL || process.env.SQLITE_PATH || 'data.db'
const db = new Database(dbPath)
app.set('db', db)

// Productos demo (ajustá a tu modelo real)
const products = [
  { id: 1, slug: 'milanesa', name: 'Milanesa', price_cents: 19990 },
  { id: 2, slug: 'asado', name: 'Asado', price_cents: 45990 },
]
app.get('/api/products', (req, res) => res.json(products.map(p => ({ id: p.id, slug: p.slug, name: p.name, price_cents: p.price_cents }))))
app.get('/api/products/:slug', (req, res) => {
  const p = products.find(x => x.slug === req.params.slug)
  if (!p) return res.status(404).json({ error: 'not_found' })
  res.json(p)
})

// Auth mínima (token estático o por email/pass)
app.post('/api/auth/login', (req,res) => {
  const { email, password } = req.body || {}
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@carnesdelmercado.com'
  const adminPass = process.env.ADMIN_PASSWORD || '2746'
  const token = process.env.DEMO_TOKEN || 'demo-admin-token'
  if (email === adminEmail && password === adminPass) {
      return res.json({ token })
  }
  return res.status(401).json({ error: 'invalid_credentials' })
})
app.get('/api/auth/me', (req,res)=>{
  const auth = req.headers.authorization || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const expected = process.env.DEMO_TOKEN || 'demo-admin-token'
  if (token === expected) return res.json({ email: process.env.ADMIN_EMAIL || 'admin@carnesdelmercado.com' })
  return res.status(401).json({ error: 'unauthorized' })
})

// Admin: listar órdenes simple
app.get('/api/admin/orders', (req,res)=>{
  const auth = req.headers.authorization || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const expected = process.env.DEMO_TOKEN || 'demo-admin-token'
  if (token !== expected) return res.status(401).json({ error: 'unauthorized' })
  const rows = db.prepare(`SELECT * FROM orders ORDER BY created_at DESC`).all()
  const itemsStmt = db.prepare(`SELECT * FROM order_items WHERE order_id = ? ORDER BY id`)
  const result = rows.map(o => ({ ...o, delivery_address: o.delivery_address ? JSON.parse(o.delivery_address) : null, items: itemsStmt.all(o.id) }))
  res.json(result)
})

app.get('/api/admin/orders/export', (req,res)=>{
  const auth = req.headers.authorization || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const expected = process.env.DEMO_TOKEN || 'demo-admin-token'
  if (token !== expected) return res.status(401).json({ error: 'unauthorized' })
  const rows = db.prepare(`SELECT * FROM orders ORDER BY created_at DESC`).all()
  const parser = new Parser()
  const csv = parser.parse(rows)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"')
  res.send(csv)
})

// Rutas de checkout y webhook
app.use('/api', checkoutRouter)
app.use('/api/mp', webhookRouter)

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log('Backend listo en http://localhost:' + PORT)
  console.log('CORS allow:', allowlist)
})
