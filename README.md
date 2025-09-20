# Carnes del Mercado — Backend Web (E‑commerce)

API del e‑commerce (catálogo, órdenes, auth) consumida por el frontend **React + Vite**.  
Este backend es **independiente** del servicio `bot-api` (IA/RAG).

---

## 🚀 Quick Start

```bash
# 1) Instalar dependencias
npm install

# 2) Variables de entorno
cp .env.example .env
# Editá .env con tus credenciales (DB, JWT, etc.)

# 3) Levantar en desarrollo
npm run dev
# o
npm start

# Por defecto: http://localhost:4000  (ajustable con PORT)
```

> Si usás Docker/PM2, agregá tu configuración de orquestación en este directorio.

---

## 🔐 Variables de entorno (sugeridas)

```
# App
PORT=4000
NODE_ENV=development

# Base de datos
DATABASE_URL=postgresql://USER:PASS@HOST:5432/DB

# Auth
JWT_SECRET=change_me_super_secret
TOKEN_TTL_HOURS=240

# CORS (en dev permitir localhost:5173)
CORS_ORIGIN=http://localhost:5173

# Pagos (opcional, si aplica)
# MP_ACCESS_TOKEN=...
```

> `JWT` se guarda en el cliente como `cm_token` (el frontend lo usa para `/me` y rutas protegidas).

---

## 📚 Endpoints principales

> Los paths pueden variar según tu router. Abajo están los utilizados por el frontend actual.

### Auth
- `POST /api/login` → devuelve JWT
- `GET  /api/me` → verifica sesión

### Productos
- `GET    /api/products` → lista de productos (pública)
- `GET    /api/products/:slug` → detalle de producto (público)
- `POST   /api/admin/products` → **crear** (requiere JWT admin)
- `PUT    /api/admin/products/:id` → **actualizar** (admin)
- `DELETE /api/admin/products/:id` → **eliminar** (admin)

### Órdenes
- `GET  /api/admin/orders` → listado administrable (admin)
- `GET  /api/admin/export.csv` → export **CSV** (admin)

> El frontend llama `adminExportCsvUrl()` para construir la URL del CSV.

### Checkout (si aplica)
- `POST /api/checkout` → inicia checkout
- `POST /api/checkout/webhook` → callback del proveedor de pagos
- `GET  /api/order/:code` → estado de orden

---

## 🧱 Modelo de datos (mínimo esperado por el frontend)

**products**
- `id` (int, PK)
- `name` (text)
- `slug` (text, único)
- `description` (text)
- `price` (int, centavos ARS)
- `unit` (text: `"kg"` | `"unidad"`)
- `imageUrl` (text, URL pública)
- `stock` (int)
- `isActive` (bool, default true) ← usado por el bot y la tienda

**orders**
- `id` (int, PK)
- `code` (text, único)
- `customer` (text)
- `status` (text)
- `totalCents` (int)
- `createdAt` (timestamptz)

> El bot (servicio `bot-api`) **solo lee** de `products`; no modifica esta tabla.

---

## 🔁 Flujo Admin en frontend

- `GET /api/me` → si OK, muestra rutas protegidas.
- **Productos**:
  - `POST /api/admin/products` (crear)
  - `PUT /api/admin/products/:id` (editar)
  - `DELETE /api/admin/products/:id` (eliminar)
- **Pedidos**:
  - `GET /api/admin/orders`
  - `GET /api/admin/export.csv` (botón "Export CSV")

---

## 🧪 Scripts

```bash
npm run dev      # desarrollo con autoreload (según package.json)
npm start        # producción simple
npm run lint     # (opcional) lint
npm run test     # (opcional) tests
```

---

## 🔒 Seguridad & CORS

- Habilitá **CORS** solo para el dominio del frontend. En dev: `http://localhost:5173`.
- Protegé rutas `/api/admin/*` con **JWT** (rol admin).
- Sanitizá entradas (crear/editar producto) y validá tipos/formatos.

---

## 🧩 Integración con el Bot (opcional)

No es obligatorio, pero podés exponer endpoints que `bot-api` consuma como fuente adicional en tiempo real (en vez de SQL directo), por ejemplo:

- `GET /api/inventory?cutType=tira` → listado de productos activos (stock, precio, margen)
- `GET /api/promos` → campañas/vigencias
- `GET /api/overstock` → ids con sobrestock

En ese caso, configurá `bot-api` para llamar a tus endpoints en su **tool de inventario**.

---

## 🐞 Troubleshooting

- **401 en /api/me** → verificá `cm_token` en `localStorage` y `JWT_SECRET` en el server.
- **CORS en dev** → setear `CORS_ORIGIN=http://localhost:5173` o usar proxy de Vite.
- **CSV no descarga** → revisá `adminExportCsvUrl()` y el path real del endpoint.
- **Stock/Precio no reflejan** → confirmá que el frontend refresque tras `POST/PUT/DELETE` o invalidá caché en el cliente.

---

## 📦 Deploy

- Env: `NODE_ENV=production`, `PORT` apropiado.
- Reverse proxy (Nginx/Caddy) para TLS y compresión.
- Conexión a DB gestionada (RDS/Cloud SQL/Neon/etc.).
- Logs y métricas (p. ej. PM2, pino, Datadog).

---

© Carnes del Mercado
