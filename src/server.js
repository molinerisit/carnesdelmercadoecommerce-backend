import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import { Parser as Json2CsvParser } from '@json2csv/plainjs'

import { createDb } from './services/db.js'
import checkoutRouter from './routes/checkout.js'
import webhookRouter from './routes/webhook.js'

const app = express()

// --- CORS ---
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

// --- DB (dual) ---
const db = await createDb()
console.log('DB mode:', db.kind)
app.set('db', db)

// --- Rutas públicas de productos dummy (podés reemplazar por tu modelo real) ---
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

// --- Auth mínima para admin ---
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

// --- Admin: listar y exportar órdenes ---
app.get('/api/admin/orders', async (req,res)=>{
  const auth = req.headers.authorization || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const expected = process.env.DEMO_TOKEN || 'demo-admin-token'
  if (token !== expected) return res.status(401).json({ error: 'unauthorized' })

  const rows = await (async () => {
    // Adapter con método getOrderById por id; para listar todas hacemos una consulta simple por motor
    if (db.kind === 'pg') {
      const r = await db.conn.query(`SELECT * FROM orders ORDER BY created_at DESC`)
      return r.rows
    } else {
      return db.conn.prepare(`SELECT * FROM orders ORDER BY datetime(created_at) DESC`).all()
    }
  })()

  res.json(rows)
})

app.get('/api/admin/orders/export', async (req,res)=>{
  const auth = req.headers.authorization || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const expected = process.env.DEMO_TOKEN || 'demo-admin-token'
  if (token !== expected) return res.status(401).json({ error: 'unauthorized' })

  let rows
  if (db.kind === 'pg') {
    rows = (await db.conn.query(`SELECT * FROM orders ORDER BY created_at DESC`)).rows
  } else {
    rows = db.conn.prepare(`SELECT * FROM orders ORDER BY datetime(created_at) DESC`).all()
  }

  const fields = ['id','status','email','name','phone','notes','delivery_mode','total_amount','mp_status','created_at']
  const parser = new Json2CsvParser({ fields })
  const csv = parser.parse(rows)

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"')
  res.send(csv)
})

// --- Checkout + Webhook ---
app.use('/api', checkoutRouter)
app.use('/api/mp', webhookRouter)

// --- Health ---
app.get('/health', (req,res)=>{
  res.json({ ok: true, db: db.kind, now: new Date().toISOString() })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log('Backend listo en http://localhost:' + PORT)
  console.log('CORS allow:', allowlist)
})
