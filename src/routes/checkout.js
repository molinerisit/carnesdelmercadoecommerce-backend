import express from "express";
import { sendWhatsApp } from "../services/whatsapp.js";

const router = express.Router();

function toARSUnitPrice(i) {
  if (typeof i.unit_price === "number" && isFinite(i.unit_price)) return i.unit_price;
  const cents = Number(i.unit_price_cents || 0);
  return Math.round(cents) / 100;
}
function normalizeItems(items) {
  return (items || []).map((i) => ({
    title: String(i.title || "Producto").slice(0, 256),
    quantity: Math.max(1, Number(i.quantity || 1)),
    unit_price: toARSUnitPrice(i),
    currency_id: i.currency_id || "ARS",
    picture_url: i.imageUrl || undefined,
    category_id: i.category_id || undefined,
    description: i.description || undefined,
  })).filter(i => i.unit_price > 0);
}
const emailOk = (e) => !!(e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
const addressOk = (a) => a && ["street","number","city","province","zip"].every(k => String(a[k]||"").trim());

router.post("/checkout", async (req, res) => {
  try {
    const db = req.app.get("db");
    await db.initOrders();

    const { email, items, delivery, customer } = req.body || {};
    if (!emailOk(email)) return res.status(400).json({ error: "email_required" });
    const norm = normalizeItems(items);
    if (!norm.length) return res.status(400).json({ error: "items_required" });
    const mode = delivery?.mode || "delivery";
    if (mode === "delivery" && !addressOk(delivery?.address)) return res.status(400).json({ error: "address_required" });

    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) return res.status(400).json({ error: "mp_token_missing" });

    const total = norm.reduce((a,i)=>a + i.unit_price * i.quantity, 0);
    const orderId = await db.createOrder({
      email,
      customer,
      delivery: { mode, address: mode === "delivery" ? delivery.address : null },
      items: norm,
      total
    });

    const FRONTEND = (process.env.FRONTEND_ORIGIN || "http://localhost:5173").replace(/\/+$/, "");
    const preference = {
      payer: { email, name: customer?.name || undefined },
      items: norm,
      back_urls: {
        success: `${FRONTEND}/success?order=${orderId}`,
        failure: `${FRONTEND}/failure?order=${orderId}`,
        pending: `${FRONTEND}/pending?order=${orderId}`,
      },
      external_reference: String(orderId),
      auto_return: "approved",
      statement_descriptor: "Carnes del Mercado",
      metadata: {
        delivery: { mode, address: mode === "delivery" ? delivery.address : null },
        customer: { phone: customer?.phone, notes: customer?.notes }
      },
    };

    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        ...(process.env.MP_INTEGRATOR_ID ? { "x-integrator-id": process.env.MP_INTEGRATOR_ID } : {}),
      },
      body: JSON.stringify(preference),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(400).json({ error: "mp_error", details: data });

    await db.attachPreference(orderId, data.id, data.init_point || data.sandbox_init_point);

    try {
      const a = preference.metadata?.delivery?.address;
      const lines = [
        "🧾 *Nuevo pedido*",
        `#${orderId}`,
        `Cliente: ${customer?.name || "-"} (${email}${customer?.phone ? " / " + customer.phone : ""})`,
        `Entrega: ${mode === "delivery" ? "Envío a domicilio" : "Retiro en tienda"}`,
        mode === "delivery" && a ? `Dirección: ${a.street} ${a.number}${a.floor? " piso "+a.floor:""}${a.apt? " dpto "+a.apt:""}, ${a.city}, ${a.province}, CP ${a.zip}` : null,
        "Items:",
        ...norm.map(i => `• ${i.title} x${i.quantity} — $${(i.unit_price*i.quantity).toFixed(2)}`),
        `Total: $${total.toFixed(2)}`,
      ].filter(Boolean);
      await sendWhatsApp(lines.join("\n"));
    } catch (e) { console.warn("WA notify failed:", e?.message || e); }

    return res.json({ order_id: orderId, id: data.id, init_point: data.init_point || data.sandbox_init_point });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server_error" });
  }
});

export default router;
