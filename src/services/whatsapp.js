const PROVIDER = process.env.WHATSAPP_PROVIDER || "cloud";

export async function sendWhatsApp(text) {
  if (!text) return;

  if (PROVIDER === "cloud") {
    const id = process.env.WA_PHONE_NUMBER_ID;
    const token = process.env.WA_ACCESS_TOKEN;
    const to = (process.env.WA_TO || "").replace(/\D+/g, "");
    if (!id || !token || !to) {
      console.warn("WA cloud missing env: WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN, WA_TO");
      return;
    }
    const url = `https://graph.facebook.com/v19.0/${id}/messages`;
    const payload = { messaging_product: "whatsapp", to: `+${to}`, type: "text", text: { body: text.slice(0, 4000) } };
    const r = await fetch(url, { method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type":"application/json" }, body: JSON.stringify(payload) });
    if (!r.ok) console.warn("WA cloud error:", r.status, await r.text().catch(()=>"?"));
    return;
  }

  if (PROVIDER === "twilio") {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const auth = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WA_FROM;
    const to = process.env.TWILIO_WA_TO;
    if (!sid || !auth || !from || !to) {
      console.warn("Twilio missing env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WA_FROM, TWILIO_WA_TO");
      return;
    }
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const body = new URLSearchParams({ From: from, To: to, Body: text });
    const r = await fetch(url, { method: "POST", headers: { "Authorization": "Basic " + Buffer.from(`${sid}:${auth}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body });
    if (!r.ok) console.warn("Twilio WA error:", r.status, await r.text().catch(()=>"?"));
  }
}
