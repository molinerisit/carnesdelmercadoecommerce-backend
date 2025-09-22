# Deploy Notes (Railway)

## Variables de entorno (Railway - Backend)
- `NODE_ENV=production`
- `FRONTEND_ORIGIN=https://carnesdelmercadoecommerce-frontend.vercel.app`
- `DATABASE_URL` = (usa la de PostgreSQL de Railway o tu propia cadena)
- `ADMIN_EMAIL` = admin@carnesdelmercado.com
- `ADMIN_PASSWORD` = (elige una MUY fuerte)
- `MP_ACCESS_TOKEN` = (si usas Mercado Pago, ponelo acá)

> Previews de Vercel están permitidos por regex `*.vercel.app`, no hace falta listarlas.

## Frontend (Vercel)
- `VITE_BACKEND_URL=https://carnesdelmercadoecommerce-backend-production.up.railway.app`

