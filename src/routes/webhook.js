// Webhook de Mercado Pago
import express from "express";
import { updateByExternalReference } from "../services/orders.js";
import { sendWhatsApp } from "../services/whatsapp.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
  try {
    const db = req.app.get("db");
    if (!db) return res.status(200).json({ ok: true }); // ACK

    const token = process.env.MP_ACCESS_TOKEN;
    const body = req.body || {};
    const id = body.data?.id || body.resource || req.query?.id || null;

    res.status(200).json({ ok: true }); // ACK rápido

    if (!token || !id) return;

    const url = `https://api.mercadopago.com/v1/payments/${id}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const pay = await r.json().catch(()=>null);
    if (!pay || !pay.external_reference) return;

    const status = pay.status; // approved, pending, rejected, etc.
    updateByExternalReference(db, pay.external_reference, String(id), status);

    if (status === "approved") {
      await sendWhatsApp(`✅ Pago aprobado para orden #${pay.external_reference} (MP ${id}).`);
    } else if (status === "rejected") {
      await sendWhatsApp(`❌ Pago rechazado para orden #${pay.external_reference} (MP ${id}).`);
    }
  } catch (e) {
    console.error("webhook error", e);
  }
});

export default router;
