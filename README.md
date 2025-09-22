# Backend — Dual DB (SQLite local / Postgres Railway)

## Variables de entorno
### Local (SQLite)
```
DATABASE_URL=./data/cdm.db
MP_ACCESS_TOKEN=APP_USR-xxxxxxxxxxxxxxxxxxxxxxxx
FRONTEND_ORIGIN=http://localhost:5173
PORT=3001
```

### Railway (Postgres)
```
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DBNAME
MP_ACCESS_TOKEN=APP_USR-xxxxxxxxxxxxxxxxxxxxxxxx
FRONTEND_ORIGIN=https://carnesdelmercadoecommerce-frontend.vercel.app
PORT=8080
```

## Comandos
```bash
npm i
npm start
```

## Endpoints
- `POST /api/checkout`
- `POST /api/mp/webhook`
- `GET /api/admin/orders` (Bearer DEMO_TOKEN)
- `GET /api/admin/orders/export` (CSV)
- `GET /health`
