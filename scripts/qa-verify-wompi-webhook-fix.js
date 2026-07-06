// Verifica en vivo el fix de firma del webhook de Wompi (auditoria 2026-07-06):
// - signature.properties ya no se confia a ciegas: debe cubrir transaction.id,
//   transaction.status y transaction.amount_in_cents, o se rechaza.
// - La comparacion del checksum es timing-safe.
// - El monto aprobado se cruza contra orden.totalPagado (no solo se confia en la firma).
//
// Usa un secreto FALSO de prueba (WOMPI_EVENTS_SECRET temporal en .env.local, NO el real
// de Railway) para poder firmar payloads sinteticos localmente sin tocar el secreto real.
//
// Requiere: servidor local en localhost:3006 reiniciado con ese secreto de prueba cargado.
const fs = require("fs");
for (const line of fs.readFileSync("/tmp/qa-prod.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
process.env.QA_BASE = "http://localhost:3006";
const { login, api, BASE } = require("./qa-lib");

const prisma = new PrismaClient();
const PASSWORD = "QaTest#2026reFix";
// Debe ser IDENTICO al valor puesto en .env.local para esta prueba (ver comentario ahi).
const FAKE_SECRET = "qa-test-fake-secret-do-not-use-in-prod-12345";

function firmar(properties, data, timestamp, secret) {
  let concatenado = "";
  for (const prop of properties) {
    const partes = prop.split(".");
    let valor = data;
    for (const p of partes) valor = valor?.[p];
    concatenado += String(valor);
  }
  return crypto.createHash("sha256").update(concatenado + timestamp + secret).digest("hex");
}

async function enviarWebhook({ properties, data, timestamp, checksumOverride }) {
  const checksum = checksumOverride ?? firmar(properties, data, timestamp, FAKE_SECRET);
  return api("/api/webhooks/wompi", {
    method: "POST",
    body: {
      event: "transaction.updated",
      data,
      timestamp,
      signature: { properties, checksum },
    },
  });
}

async function main() {
  const stamp = Date.now();
  const sellerEmail = `qa.wompifix.seller+${stamp}@colbisnes-qa.test`;
  const buyerEmail = `qa.wompifix.buyer+${stamp}@colbisnes-qa.test`;
  const hashed = await bcrypt.hash(PASSWORD, 12);

  const seller = await prisma.user.create({ data: { email: sellerEmail, password: hashed, name: "QA Wompi Fix Seller", city: "Bogotá", role: "USER", kycStatus: "approved" } });
  const buyer = await prisma.user.create({ data: { email: buyerEmail, password: hashed, name: "QA Wompi Fix Buyer", city: "Bogotá", role: "USER", kycStatus: "approved" } });
  console.log("Seller:", seller.id, "| Buyer:", buyer.id);

  const { cookie: sellerCookie } = await login(sellerEmail, PASSWORD);
  const title = `[QA-TEST] Wompi webhook fix ${stamp}`;
  const prodRes = await api("/api/products", {
    method: "POST", cookie: sellerCookie,
    body: { title, description: "QA: verificacion del fix de firma webhook Wompi. Se eliminara.", priceCOP: 100000, city: "Bogotá", condition: "USADO", category: "Otros" },
  });
  if (prodRes.status !== 201) { console.error("No se pudo crear producto", JSON.stringify(prodRes.body)); return; }
  const productId = prodRes.body.id;
  console.log("Producto:", productId);

  const TOTAL_PAGADO = 105000; // COP, valor arbitrario para la orden de prueba
  const orden = await prisma.order.create({
    data: {
      productId, buyerEmail, metodoPago: "ONLINE", estado: "PENDIENTE",
      totalPagado: TOTAL_PAGADO, comision: 5000, recibeVendedor: 100000,
    },
  });
  console.log("Orden creada:", orden.id, "| totalPagado:", TOTAL_PAGADO);

  const referencia = "colbisnes" + orden.id + Date.now();
  const timestamp = Math.floor(Date.now() / 1000);
  const REQUERIDAS = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];

  const resultados = [];
  async function checkEstado(label) {
    const o = await prisma.order.findUnique({ where: { id: orden.id } });
    const p = await prisma.product.findUnique({ where: { id: productId } });
    console.log(`   -> tras "${label}": orden.estado=${o.estado} | producto.status=${p.status}`);
    return { orden: o, producto: p };
  }

  console.log("\n=== CASO A: properties NO cubre los campos requeridos (falta transaction.status) ===");
  {
    const data = { transaction: { id: "txn-A-" + stamp, status: "APPROVED", amount_in_cents: TOTAL_PAGADO * 100, reference: referencia } };
    const properties = ["transaction.id", "transaction.amount_in_cents"]; // falta transaction.status a propósito
    const r = await enviarWebhook({ properties, data, timestamp });
    console.log("Respuesta:", r.status, JSON.stringify(r.body));
    const { orden: o } = await checkEstado("Caso A");
    resultados.push(["A: properties incompletas -> debe rechazar (401) y NO tocar la orden", r.status === 401 && o.estado === "PENDIENTE"]);
  }

  console.log("\n=== CASO B: checksum tamperado (firma incorrecta) ===");
  {
    const data = { transaction: { id: "txn-B-" + stamp, status: "APPROVED", amount_in_cents: TOTAL_PAGADO * 100, reference: referencia } };
    const real = firmar(REQUERIDAS, data, timestamp, FAKE_SECRET);
    const tamperado = real.slice(0, -1) + (real.slice(-1) === "0" ? "1" : "0");
    const r = await enviarWebhook({ properties: REQUERIDAS, data, timestamp, checksumOverride: tamperado });
    console.log("Respuesta:", r.status, JSON.stringify(r.body));
    const { orden: o } = await checkEstado("Caso B");
    resultados.push(["B: checksum invalido -> debe rechazar (401) y NO tocar la orden", r.status === 401 && o.estado === "PENDIENTE"]);
  }

  console.log("\n=== CASO C: firma valida, propiedades completas, pero amount_in_cents NO coincide con la orden ===");
  {
    const montoFalso = 1000; // muy por debajo del totalPagado real (105000 * 100)
    const data = { transaction: { id: "txn-C-" + stamp, status: "APPROVED", amount_in_cents: montoFalso, reference: referencia } };
    const r = await enviarWebhook({ properties: REQUERIDAS, data, timestamp });
    console.log("Respuesta:", r.status, JSON.stringify(r.body));
    const { orden: o } = await checkEstado("Caso C");
    resultados.push(["C: amount_in_cents no coincide -> debe rechazar (400) y NO marcar PAGADO", r.status === 400 && o.estado === "PENDIENTE"]);
  }

  console.log("\n=== CASO D (happy path): firma valida, propiedades completas, monto correcto ===");
  {
    const data = { transaction: { id: "txn-D-" + stamp, status: "APPROVED", amount_in_cents: TOTAL_PAGADO * 100, reference: referencia } };
    const r = await enviarWebhook({ properties: REQUERIDAS, data, timestamp });
    console.log("Respuesta:", r.status, JSON.stringify(r.body));
    const { orden: o, producto: p } = await checkEstado("Caso D");
    resultados.push(["D: pago legitimo -> debe aceptar (200), orden PAGADO, producto IN_ESCROW", r.status === 200 && o.estado === "PAGADO" && p.status === "IN_ESCROW"]);

    console.log("\n=== CASO E: reintento del MISMO webhook aprobado (idempotencia) ===");
    const r2 = await enviarWebhook({ properties: REQUERIDAS, data, timestamp });
    console.log("Respuesta:", r2.status, JSON.stringify(r2.body));
    const { orden: o2 } = await checkEstado("Caso E");
    resultados.push(["E: reintento del mismo pago aprobado -> duplicate:true, sin efectos secundarios", r2.status === 200 && r2.body?.duplicate === true && o2.estado === "PAGADO"]);
  }

  console.log("\n\n================ RESUMEN ================");
  let algunFallo = false;
  for (const [desc, ok] of resultados) {
    console.log((ok ? "✅ PASS" : "❌ FAIL") + " — " + desc);
    if (!ok) algunFallo = true;
  }
  console.log(algunFallo ? "\n❌ ALGUNA VERIFICACION FALLO — revisar de inmediato." : "\n✅ TODAS LAS VERIFICACIONES PASARON.");

  fs.writeFileSync("/tmp/qa-test/wompi-webhook-fix-verify.json", JSON.stringify({ sellerEmail, buyerEmail, productId, orderId: orden.id, title }, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
