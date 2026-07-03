// Reintento aislado del Escenario A (Wompi online + webhook firmado) tras corregir la carga
// del WOMPI_EVENTS_SECRET. Reutiliza el mismo producto/orden — el endpoint es idempotente.
const fs = require("fs");
const crypto = require("crypto");
for (const line of fs.readFileSync("/tmp/qa-prod.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { login, api, BASE } = require("./qa-lib");

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + JSON.stringify(detail) : ""}`);
}

function buildWompiWebhook(reference, transactionId, status, amountEnCentavos) {
  const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
  const data = { transaction: { id: transactionId, status, amount_in_cents: amountEnCentavos, reference } };
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const secret = process.env.WOMPI_EVENTS_SECRET;
  if (!secret) throw new Error("WOMPI_EVENTS_SECRET no disponible localmente");
  let concatenado = "";
  for (const prop of properties) {
    const partes = prop.split(".");
    let valor = data;
    for (const p of partes) valor = valor?.[p];
    concatenado += String(valor);
  }
  const checksum = crypto.createHash("sha256").update(concatenado + timestamp + secret).digest("hex");
  return { event: "transaction.updated", data, signature: { properties, checksum }, timestamp };
}

async function main() {
  const accounts = JSON.parse(fs.readFileSync("/tmp/qa-test/accounts.json", "utf8"));
  const products = JSON.parse(fs.readFileSync("/tmp/qa-test/products.json", "utf8"));
  const buyer1acc = accounts.find(a => a.email.includes("buyer1"));
  const seller1acc = accounts.find(a => a.email.includes("seller1"));
  const { cookie: buyerCookie } = await login(buyer1acc.email, buyer1acc.password);
  const { cookie: sellerCookie } = await login(seller1acc.email, seller1acc.password);

  const productoA = products.find(p => p.sellerEmail === seller1acc.email); // primero de seller1

  const res = await fetch(`${BASE}/api/checkout/wompi?productoId=${productoA.id}`, { headers: { Cookie: buyerCookie }, redirect: "manual" });
  const location = res.headers.get("location");
  if (!location) { record("A1. Redirect Wompi", false, { status: res.status, body: await res.text() }); return finish(); }

  const wompiUrl = new URL(location);
  const reference = wompiUrl.searchParams.get("reference");
  const amountInCents = wompiUrl.searchParams.get("amount-in-cents");
  const orderId = new URL(wompiUrl.searchParams.get("redirect-url")).searchParams.get("orderId");
  record("A1. Checkout Wompi genera redirect con referencia/orderId", !!(reference && orderId), { reference, orderId });

  const estadoAntes = await api(`/api/checkout/estado?orderId=${orderId}`, { cookie: buyerCookie });
  record("A2. Estado orden antes del pago = PENDIENTE", estadoAntes.body?.estado === "PENDIENTE", estadoAntes.body?.estado);

  // Webhook con FIRMA INVALIDA primero (ataque simulado) -> debe ser rechazado
  const badPayload = buildWompiWebhook(reference, "qa-txn-bad-" + Date.now(), "APPROVED", amountInCents);
  badPayload.signature.checksum = "0".repeat(64);
  const badRes = await api("/api/webhooks/wompi", { method: "POST", body: badPayload });
  record("A3. Webhook con firma inválida es rechazado (401)", badRes.status === 401, badRes.body);

  // Webhook válido
  const goodPayload = buildWompiWebhook(reference, "qa-txn-" + Date.now(), "APPROVED", amountInCents);
  const whRes = await api("/api/webhooks/wompi", { method: "POST", body: goodPayload });
  record("A4. Webhook firmado APPROVED aceptado (200)", whRes.status === 200 && whRes.body?.ok === true, whRes.body);

  // Reintento (replay) del mismo webhook válido -> debe ser idempotente
  const whRetry = await api("/api/webhooks/wompi", { method: "POST", body: goodPayload });
  record("A5. Replay del mismo webhook es idempotente", whRetry.body?.duplicate === true, whRetry.body);

  const estadoDespues = await api(`/api/checkout/estado?orderId=${orderId}`, { cookie: buyerCookie });
  record("A6. Estado orden tras webhook = PAGADO", estadoDespues.body?.estado === "PAGADO", estadoDespues.body?.estado);

  const confirm = await api("/api/payments/confirm-delivery", { method: "POST", cookie: buyerCookie, body: { productId: productoA.id } });
  record("A7. Comprador confirma entrega -> producto SOLD", confirm.status === 200 && confirm.body?.product?.status === "SOLD", confirm.body?.product?.status);

  const revBuyer = await api("/api/reviews", { method: "POST", cookie: buyerCookie, body: { productId: productoA.id, rating: 5, comment: "Excelente vendedor, prueba QA" } });
  record("A8. Comprador deja review al vendedor", revBuyer.status === 201, revBuyer.body);
  const revSeller = await api("/api/reviews", { method: "POST", cookie: sellerCookie, body: { productId: productoA.id, rating: 5, comment: "Excelente comprador, prueba QA" } });
  record("A9. Vendedor deja review al comprador", revSeller.status === 201, revSeller.body);

  finish();
}

function finish() {
  const prev = fs.existsSync("/tmp/qa-test/scenario-results.json") ? JSON.parse(fs.readFileSync("/tmp/qa-test/scenario-results.json", "utf8")) : [];
  const merged = [...prev.filter(r => !r.name.startsWith("A") && !r.name.includes("ESCENARIO A")), ...results];
  fs.writeFileSync("/tmp/qa-test/scenario-results.json", JSON.stringify(merged, null, 2));
  const passed = results.filter(r => r.ok).length;
  console.log(`\n=== Escenario A: ${passed}/${results.length} pasaron ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
