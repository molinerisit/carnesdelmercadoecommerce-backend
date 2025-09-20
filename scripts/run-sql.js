import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import Database from 'better-sqlite3'
dotenv.config()

const file = process.argv[2]
if (!file) { console.error('Uso: node scripts/run-sql.js <archivo.sql>'); process.exit(1) }
const dbPath = process.env.SQLITE_PATH || './data/app.db'
fs.mkdirSync(path.dirname(dbPath), { recursive: true })
const db = new Database(dbPath)
const sql = fs.readFileSync(file, 'utf8')
db.exec(sql)
console.log(`Ejecutado: ${file}`)
db.close()
