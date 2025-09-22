// src/routes/checkout.js
import express from "express";

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

router.post("/checkout", async (req, res) => {
  try {
    const { email, items, meta } = req.body || {};
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: "email_required" });
    }
    const norm = normalizeItems(items);
    if (!norm.length) return res.status(400).json({ error: "items_required" });

    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) return res.status(400).json({ error: "mp_token_missing" });

    const FRONTEND = (process.env.FRONTEND_ORIGIN || "http://localhost:5173").replace(/\/+$/, "");

    const preference = {
      payer: { email },
      items: norm,
      back_urls: {
        success: `${FRONTEND}/success`,
        failure: `${FRONTEND}/failure`,
        pending: `${FRONTEND}/pending`,
      },
      auto_return: "approved",
      statement_descriptor: "Carnes del Mercado",
      external_reference: meta?.external_reference || undefined,
      metadata: meta || undefined,
      // notification_url: process.env.MP_WEBHOOK_URL || undefined,
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
    if (!r.ok) {
      return res.status(400).json({ error: "mp_error", details: data });
    }

    // data.init_point es la URL de pago (prod) / sandbox_init_point para cuentas de prueba
    return res.json({ id: data.id, init_point: data.init_point || data.sandbox_init_point });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server_error" });
  }
});

export default router;
