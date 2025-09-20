import dotenv from 'dotenv'
import Database from 'better-sqlite3'
import { nanoid } from 'nanoid'
import fs from 'fs'

dotenv.config()

const dbPath = process.env.SQLITE_PATH || './data/app.db'
fs.mkdirSync(dbPath.split('/').slice(0,-1).join('/') || '.', { recursive: true })

const db = new Database(dbPath)
db.exec('BEGIN')
try {
  const email = process.env.ADMIN_EMAIL || 'admin@carnesdelmercado.test'
  const pass  = process.env.ADMIN_PASSWORD || 'admin123'
  if (!db.prepare('SELECT id FROM users WHERE email=?').get(email)){
    db.prepare('INSERT INTO users (id,email,password,role) VALUES (?,?,?,?)').run('u_'+nanoid(10), email, pass, 'ADMIN')
  }

  const products = [
    ['Asado de tira','asado-de-tira','Corte clásico para parrilla, jugoso y sabroso.',8990,'kg','',40],
    ['Bife de chorizo','bife-de-chorizo','Tierna selección para grill o plancha.',10990,'kg','',30],
    ['Pechuga de pollo','pechuga-de-pollo','Magras y versátiles, ideales para milanesas.',6590,'kg','',50],
    ['Chorizo parrillero','chorizo-parrillero','Clásico argentino, perfecto para choripán.',2990,'unidad','',120]
  ]
  for (const p of products){
    if (!db.prepare('SELECT id FROM products WHERE slug=?').get(p[1])){
      db.prepare('INSERT INTO products (id,name,slug,description,price,unit,image_url,stock) VALUES (?,?,?,?,?,?,?,?)').run('p_'+nanoid(10), ...p)
    }
  }

  // pedidos demo
  const prods = db.prepare('SELECT id, price FROM products').all()
  const pick = arr => arr[Math.floor(Math.random()*arr.length)]
  const insOrder = db.prepare('INSERT INTO orders (id, code, status, customer, phone, notes, total_cents, paid_at) VALUES (?,?,?,?,?,?,?,?)')
  const insItem  = db.prepare('INSERT INTO order_items (id, quantity, price_cents, product_id, order_id) VALUES (?,?,?,?,?)')
  const updStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id=?')
  for (let i=0;i<6;i++){
    const p = pick(prods); const qty = 1 + (i%3); const total = p.price * qty
    const oid = 'o_'+nanoid(10); const code = 'CM-'+nanoid(6).toUpperCase()
    const paid = i%2===0 ? new Date().toISOString() : null
    const status = paid ? 'APPROVED' : 'PENDING'
    insOrder.run(oid, code, status, `Cliente ${i+1}`, '341-000-0000', '', total, paid)
    insItem.run('oi_'+nanoid(10), qty, p.price, p.id, oid)
    updStock.run(qty, p.id)
  }

  db.exec('COMMIT')
  console.log('Seed completo ✅')
} catch (e){
  db.exec('ROLLBACK'); console.error(e); process.exit(1)
} finally { db.close() }
