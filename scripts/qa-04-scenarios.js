// QA: escenarios funcionales completos (ofertas, compra directa, checkout online/contraentrega/USDT,
// webhook firmado simulado de Wompi, marcar enviado, confirmar entrega, reviews, disputa, favoritos,
// mensajes, trust score).
const fs = require("fs");
// Carga manual y simple del .env de producción (evitamos depender del formato/versión de dotenv)
for (const line of fs.readFileSync("/tmp/qa-prod.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const crypto = require("crypto");
const { login, api, BASE } = require("./qa-lib");

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + JSON.stringify(detail) : ""}`);
}

// 1x1 PNG transparente válido, para probar subida de "comprobante de envío"
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

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

  return {
    event: "transaction.updated",
    data,
    signature: { properties, checksum },
    timestamp,
  };
}

async function getRedirectLocation(url, cookie) {
  const res = await fetch(url, { headers: { Cookie: cookie }, redirect: "manual" });
  return { status: res.status, location: res.headers.get("location") };
}

async function main() {
  const accounts = JSON.parse(fs.readFileSync("/tmp/qa-test/accounts.json", "utf8"));
  const products = JSON.parse(fs.readFileSync("/tmp/qa-test/products.json", "utf8"));
  const byEmail = {};
  for (const a of accounts) {
    const { cookie, session } = await login(a.email, a.password);
    byEmail[a.email] = { ...a, cookie, userId: session?.user?.id };
  }
  console.log("Sesiones listas para", Object.keys(byEmail).length, "cuentas.\n");

  const seller1 = byEmail["qa.seller1+qatest@colbisnes-qa.test"];
  const seller2 = byEmail["qa.seller2+qatest@colbisnes-qa.test"];
  const seller3 = byEmail["qa.seller3+qatest@colbisnes-qa.test"];
  const buyer1 = byEmail["qa.buyer1+qatest@colbisnes-qa.test"];
  const buyer2 = byEmail["qa.buyer2+qatest@colbisnes-qa.test"];
  const buyer3 = byEmail["qa.buyer3+qatest@colbisnes-qa.test"];
  const buyer4 = byEmail["qa.buyer4+qatest@colbisnes-qa.test"];
  const buyer5 = byEmail["qa.buyer5+qatest@colbisnes-qa.test"];

  const prodBySeller = (sellerId) => products.filter(p => p.sellerId === sellerId);
  const s1prods = prodBySeller(seller1.id);
  const s2prods = prodBySeller(seller2.id);
  const s3prods = prodBySeller(seller3.id);

  // ============ ESCENARIO A: Compra directa ONLINE (Wompi) + webhook firmado + entrega + reviews ============
  try {
    const productoA = s1prods[0];
    const { status: redirStatus, location } = await getRedirectLocation(
      `${BASE}/api/checkout/wompi?productoId=${productoA.id}`, buyer1.cookie
    );
    if (redirStatus !== 307 && redirStatus !== 302 && redirStatus !== 303) {
      record("A1. Checkout Wompi genera redirect", false, { redirStatus, location });
    } else {
      const wompiUrl = new URL(location);
      const reference = wompiUrl.searchParams.get("reference");
      const redirectUrlParam = wompiUrl.searchParams.get("redirect-url");
      const amountInCents = wompiUrl.searchParams.get("amount-in-cents");
      const orderId = new URL(redirectUrlParam).searchParams.get("orderId");
      record("A1. Checkout Wompi genera redirect con referencia/orderId", !!(reference && orderId), { reference, orderId });

      // Verificar estado antes del webhook
      const estadoAntes = await api(`/api/checkout/estado?orderId=${orderId}`, { cookie: buyer1.cookie });
      record("A2. Estado orden antes del pago = PENDIENTE", estadoAntes.body?.estado === "PENDIENTE", estadoAntes.body);

      // Simular webhook firmado de Wompi (APPROVED)
      const webhookPayload = buildWompiWebhook(reference, "qa-txn-" + Date.now(), "APPROVED", amountInCents);
      const whRes = await api("/api/webhooks/wompi", { method: "POST", body: webhookPayload });
      record("A3. Webhook firmado APPROVED aceptado (200)", whRes.status === 200 && whRes.body?.ok === true, whRes.body);

      // Reintento del mismo webhook -> debe detectar duplicado (idempotencia)
      const whRetry = await api("/api/webhooks/wompi", { method: "POST", body: webhookPayload });
      record("A4. Reintento del webhook es idempotente (duplicate:true)", whRetry.body?.duplicate === true, whRetry.body);

      const estadoDespues = await api(`/api/checkout/estado?orderId=${orderId}`, { cookie: buyer1.cookie });
      record("A5. Estado orden tras webhook = PAGADO", estadoDespues.body?.estado === "PAGADO", estadoDespues.body);

      // Confirmar entrega (comprador)
      const confirm = await api("/api/payments/confirm-delivery", { method: "POST", cookie: buyer1.cookie, body: { productId: productoA.id } });
      record("A6. Comprador confirma entrega -> producto SOLD", confirm.status === 200 && confirm.body?.product?.status === "SOLD", confirm.body);

      // Reviews cruzadas
      const revBuyer = await api("/api/reviews", { method: "POST", cookie: buyer1.cookie, body: { productId: productoA.id, rating: 5, comment: "Excelente vendedor, prueba QA" } });
      record("A7. Comprador deja review al vendedor", revBuyer.status === 201, revBuyer.body);
      const revSeller = await api("/api/reviews", { method: "POST", cookie: seller1.cookie, body: { productId: productoA.id, rating: 5, comment: "Excelente comprador, prueba QA" } });
      record("A8. Vendedor deja review al comprador", revSeller.status === 201, revSeller.body);

      // Doble review debe rechazarse
      const revDup = await api("/api/reviews", { method: "POST", cookie: buyer1.cookie, body: { productId: productoA.id, rating: 1, comment: "duplicado" } });
      record("A9. Segunda review del mismo usuario es rechazada", revDup.status === 400, revDup.body);
    }
  } catch (e) {
    record("ESCENARIO A (Wompi online)", false, { error: e.message });
  }

  // ============ ESCENARIO B: Oferta rechazada + oferta aceptada + CONTRA_ENTREGA + marcar enviado ============
  try {
    const productoB = s1prods[1];
    const productoB2 = s1prods[2];

    // Oferta baja -> rechazada
    const ofertaBaja = await api("/api/offers", { method: "POST", cookie: buyer2.cookie, body: { productId: productoB.id, amountCOP: Math.floor(productoB.priceCOP * 0.5), message: "Oferta baja QA" } });
    record("B1. Comprador crea oferta baja", ofertaBaja.status === 201, { id: ofertaBaja.body?.id });
    const rechazo = await api("/api/offers", { method: "PATCH", cookie: seller1.cookie, body: { offerId: ofertaBaja.body.id, status: "REJECTED" } });
    record("B2. Vendedor rechaza la oferta", rechazo.status === 200 && rechazo.body?.status === "REJECTED", rechazo.body);

    // Oferta al precio completo -> aceptada
    const ofertaFull = await api("/api/offers", { method: "POST", cookie: buyer2.cookie, body: { productId: productoB2.id, amountCOP: productoB2.priceCOP, message: "Compra QA precio completo" } });
    record("B3. Comprador crea oferta al precio completo", ofertaFull.status === 201, { id: ofertaFull.body?.id });
    const aceptar = await api("/api/offers", { method: "PATCH", cookie: seller1.cookie, body: { offerId: ofertaFull.body.id, status: "ACCEPTED" } });
    record("B4. Vendedor acepta la oferta -> producto PAYMENT_PENDING", aceptar.status === 200 && aceptar.body?.product?.status === "PAYMENT_PENDING", aceptar.body?.product?.status);

    // Checkout contra-entrega usando la oferta aceptada
    const cod = await api("/api/checkout/contra-entrega", { method: "POST", cookie: buyer2.cookie, body: { productoId: productoB2.id } });
    record("B5. Checkout contra-entrega crea orden (vía oferta aceptada)", cod.status === 200 && !!cod.body?.ordenId, cod.body);

    if (cod.body?.ordenId) {
      // Marcar como enviado (vendedor) con comprobante real
      const fd = new FormData();
      fd.append("orderId", cod.body.ordenId);
      fd.append("numeroGuia", "123456789");
      fd.append("transportadora", "Servientrega");
      fd.append("comprobante", new Blob([TINY_PNG], { type: "image/png" }), "guia.png");

      const marcarEnviado = await api("/api/orders/marcar-enviado", { method: "POST", cookie: seller1.cookie, body: fd, isForm: true });
      record("B6. Vendedor marca como enviado (con comprobante)", marcarEnviado.status === 200, marcarEnviado.body);

      // Guía con formato inválido debe rechazarse
      const fd2 = new FormData();
      fd2.append("orderId", cod.body.ordenId);
      fd2.append("numeroGuia", "abc");
      fd2.append("transportadora", "Servientrega");
      fd2.append("comprobante", new Blob([TINY_PNG], { type: "image/png" }), "guia.png");
      const guiaInvalida = await api("/api/orders/marcar-enviado", { method: "POST", cookie: seller1.cookie, body: fd2, isForm: true });
      record("B7. Guía con formato inválido es rechazada", guiaInvalida.status === 400, guiaInvalida.body);

      // Confirmar entrega
      const confirmB = await api("/api/payments/confirm-delivery", { method: "POST", cookie: buyer2.cookie, body: { productId: productoB2.id } });
      record("B8. Comprador confirma entrega (contra-entrega)", confirmB.status === 200 && confirmB.body?.product?.status === "SOLD", confirmB.body);
    }
  } catch (e) {
    record("ESCENARIO B (oferta + contra-entrega)", false, { error: e.message });
  }

  // ============ ESCENARIO C: Oferta aceptada + USDT ============
  try {
    const productoC = s2prods[0];
    const ofertaUsdt = await api("/api/offers", { method: "POST", cookie: buyer3.cookie, body: { productId: productoC.id, amountCOP: productoC.priceCOP, message: "Compra QA USDT" } });
    const aceptarUsdt = await api("/api/offers", { method: "PATCH", cookie: seller2.cookie, body: { offerId: ofertaUsdt.body.id, status: "ACCEPTED" } });
    record("C1. Oferta aceptada para flujo USDT", aceptarUsdt.body?.product?.status === "PAYMENT_PENDING", aceptarUsdt.body?.product?.status);

    const usdt = await api("/api/checkout/usdt", { method: "POST", cookie: buyer3.cookie, body: { productoId: productoC.id } });
    record("C2. Checkout USDT crea orden con wallet/red", usdt.status === 200 && !!usdt.body?.wallet && !!usdt.body?.totalUSDT, usdt.body);

    const confirmC = await api("/api/payments/confirm-delivery", { method: "POST", cookie: buyer3.cookie, body: { productId: productoC.id } });
    record("C3. Comprador confirma entrega (USDT)", confirmC.status === 200 && confirmC.body?.product?.status === "SOLD", confirmC.body);
  } catch (e) {
    record("ESCENARIO C (USDT)", false, { error: e.message });
  }

  // ============ ESCENARIO D: Disputa ============
  try {
    const productoD = s2prods[1];
    const compraD = await api("/api/checkout/contra-entrega", { method: "POST", cookie: buyer4.cookie, body: { productoId: productoD.id } });
    record("D1. Compra contra-entrega directa (sin oferta previa)", compraD.status === 200 && !!compraD.body?.ordenId, compraD.body);

    if (compraD.body?.ordenId) {
      const disputa = await api("/api/disputes", {
        method: "POST", cookie: buyer4.cookie,
        body: { orderId: compraD.body.ordenId, reason: "PRODUCTO_NO_LLEGO", detalle: "Prueba QA: simulando que el producto nunca llegó." },
      });
      record("D2. Comprador levanta disputa", disputa.status === 200 && !!disputa.body?.dispute?.id, disputa.body);

      // Duplicado -> debe rechazarse con 409
      const disputaDup = await api("/api/disputes", { method: "POST", cookie: buyer4.cookie, body: { orderId: compraD.body.ordenId, reason: "OTRO" } });
      record("D3. Disputa duplicada sobre misma orden es rechazada (409)", disputaDup.status === 409, disputaDup.body);

      // El vendedor (parte contraria) sí debe poder verla en su listado
      const listaVendedor = await api("/api/disputes", { cookie: seller2.cookie });
      const laVe = listaVendedor.body?.disputes?.some(d => d.id === disputa.body.dispute.id);
      record("D4. Vendedor involucrado puede ver la disputa en su listado", !!laVe);

      // Un tercero no involucrado NO debe verla en su propio listado (ya está implícitamente filtrado por OR de su propio id)
      const listaTercero = await api("/api/disputes", { cookie: buyer5.cookie });
      const noLaVe = !listaTercero.body?.disputes?.some(d => d.id === disputa.body.dispute.id);
      record("D5. Tercero no involucrado no ve la disputa ajena", noLaVe);
    }
  } catch (e) {
    record("ESCENARIO D (disputas)", false, { error: e.message });
  }

  // ============ Favoritos ============
  try {
    const productoFav = s3prods[0];
    const fav1 = await api("/api/favorites", { method: "POST", cookie: buyer5.cookie, body: { productId: productoFav.id } });
    record("FAV1. Marcar favorito", fav1.status === 200 && fav1.body?.esFavorito === true, fav1.body);
    const fav2 = await api("/api/favorites", { method: "POST", cookie: buyer5.cookie, body: { productId: productoFav.id } });
    record("FAV2. Toggle quita favorito", fav2.status === 200 && fav2.body?.esFavorito === false, fav2.body);
  } catch (e) {
    record("FAVORITOS", false, { error: e.message });
  }

  // ============ Mensajes ============
  try {
    const productoMsg = s3prods[1];
    const msg1 = await api("/api/messages", { method: "POST", cookie: buyer5.cookie, body: { toUserId: seller3.id, productId: productoMsg.id, content: "Hola, ¿sigue disponible? (prueba QA)" } });
    record("MSG1. Enviar mensaje normal", msg1.status === 200 && !!msg1.body?.message?.id, msg1.body);

    const conv = await api(`/api/messages?withUserId=${seller3.id}&productId=${productoMsg.id}`, { cookie: buyer5.cookie });
    record("MSG2. Leer conversación", conv.status === 200 && Array.isArray(conv.body) && conv.body.length >= 1, { count: conv.body?.length });

    // Un tercero NO debe poder leer la conversación entre buyer5 y seller3 (IDOR)
    const idorMsg = await api(`/api/messages?withUserId=${seller3.id}&productId=${productoMsg.id}`, { cookie: buyer1.cookie });
    const idorFiltrado = Array.isArray(idorMsg.body) && idorMsg.body.length === 0;
    record("MSG3. Tercero no ve mensajes ajenos (aislamiento por conversación)", idorFiltrado, { status: idorMsg.status, count: idorMsg.body?.length });
  } catch (e) {
    record("MENSAJES", false, { error: e.message });
  }

  // ============ Trust score ============
  try {
    const scoreConVentas = await api(`/api/trust-score/${seller1.id}`, {});
    record("TRUST1. Trust score vendedor con ventas completadas", scoreConVentas.status === 200 && typeof scoreConVentas.body?.score === "number", scoreConVentas.body);

    const buyerSinHistorial = byEmail["qa.buyer1+qatest@colbisnes-qa.test"];
    const scoreNuevo = await api(`/api/trust-score/${buyer2.id}`, {});
    record("TRUST2. Trust score de cuenta con poco historial responde OK", scoreNuevo.status === 200, scoreNuevo.body);
  } catch (e) {
    record("TRUST SCORE", false, { error: e.message });
  }

  fs.writeFileSync("/tmp/qa-test/scenario-results.json", JSON.stringify(results, null, 2));
  const passed = results.filter(r => r.ok).length;
  console.log(`\n=== RESUMEN ESCENARIOS: ${passed}/${results.length} pasaron ===`);
  results.filter(r => !r.ok).forEach(r => console.log(`FALLÓ: ${r.name} -> ${JSON.stringify(r.detail)}`));
}

main().catch(e => { console.error(e); process.exit(1); });
