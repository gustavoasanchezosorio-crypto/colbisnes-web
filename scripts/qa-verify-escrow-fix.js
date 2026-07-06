// Verifica en vivo el fix del bug P0 de escrow bypass (auditoria 2026-07-06):
// contra-entrega/route.ts ya no marca el producto IN_ESCROW al crear la orden (solo
// PAYMENT_PENDING); confirm-delivery/route.ts ahora tambien rechaza si hay una orden
// todavia esperando pago. Esta prueba reintenta el exploit original EXACTO:
// crear una orden contra-entrega y llamar confirm-delivery de inmediato, sin pagar
// absolutamente nada. Antes del fix esto marcaba el producto SOLD gratis para siempre.
const fs = require("fs");
for (const line of fs.readFileSync("/tmp/qa-prod.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { login, api } = require("./qa-lib");

const prisma = new PrismaClient();
const PASSWORD = "QaTest#2026reFix";

async function main() {
  const stamp = Date.now();
  const sellerEmail = `qa.escrowfix.seller+${stamp}@colbisnes-qa.test`;
  const buyerEmail = `qa.escrowfix.buyer+${stamp}@colbisnes-qa.test`;
  const hashed = await bcrypt.hash(PASSWORD, 12);

  // kycStatus aprobado directo en el fixture (cuentas sinteticas @colbisnes-qa.test, se borran
  // despues) - no es una accion de admin real, solo precondicion de la prueba (resulta que
  // /api/products tambien exige KYC, no solo el checkout; no es lo que estamos probando aqui).
  const seller = await prisma.user.create({ data: { email: sellerEmail, password: hashed, name: "QA Escrow Fix Seller", city: "Bogotá", role: "USER", kycStatus: "approved" } });
  const buyer = await prisma.user.create({ data: { email: buyerEmail, password: hashed, name: "QA Escrow Fix Buyer", city: "Bogotá", role: "USER", kycStatus: "approved" } });

  console.log("Seller:", seller.id, seller.email);
  console.log("Buyer:", buyer.id, buyer.email, "(kycStatus aprobado via fixture)");

  const { cookie: sellerCookie, session: sellerSession } = await login(sellerEmail, PASSWORD);
  if (!sellerSession?.user?.id) { console.error("Login seller fallo"); return; }

  const title = `[QA-TEST] Reintento exploit escrow ${stamp}`;
  const prodRes = await api("/api/products", {
    method: "POST", cookie: sellerCookie,
    body: { title, description: "QA: verificacion del fix de escrow bypass. Se eliminara.", priceCOP: 100000, city: "Bogotá", condition: "USADO", category: "Otros" },
  });
  console.log("Producto creado:", prodRes.status, prodRes.body?.id);
  if (prodRes.status !== 201) { console.error("No se pudo crear producto", JSON.stringify(prodRes.body)); return; }
  const productId = prodRes.body.id;

  const { cookie: buyerCookie, session: buyerSession } = await login(buyerEmail, PASSWORD);
  if (!buyerSession?.user?.id) { console.error("Login buyer fallo"); return; }

  console.log("\n=== PASO 1: comprador crea orden contra-entrega (sin pagar nada) ===");
  const checkoutRes = await api("/api/checkout/contra-entrega", {
    method: "POST", cookie: buyerCookie, body: { productoId: productId },
  });
  console.log("checkout/contra-entrega:", checkoutRes.status, JSON.stringify(checkoutRes.body));
  if (!checkoutRes.body?.ordenId) { console.error("No se creo la orden, abortando"); return; }
  const orderId = checkoutRes.body.ordenId;

  const productoTrasCheckout = await prisma.product.findUnique({ where: { id: productId } });
  const ordenTrasCheckout = await prisma.order.findUnique({ where: { id: orderId } });
  console.log("Producto tras checkout -> status:", productoTrasCheckout.status, "(esperado: PAYMENT_PENDING, NO IN_ESCROW)");
  console.log("Orden tras checkout   -> estado:", ordenTrasCheckout.estado, "(esperado: ESPERANDO_COMISION)");

  console.log("\n=== PASO 2: REINTENTO DEL EXPLOIT ORIGINAL — confirm-delivery inmediato, sin pagar comision ===");
  const exploitRes = await api("/api/payments/confirm-delivery", {
    method: "POST", cookie: buyerCookie, body: { productId },
  });
  console.log("confirm-delivery (exploit):", exploitRes.status, JSON.stringify(exploitRes.body));

  const productoTrasExploit = await prisma.product.findUnique({ where: { id: productId } });
  const ordenTrasExploit = await prisma.order.findUnique({ where: { id: orderId } });
  console.log("\n=== RESULTADO ===");
  console.log("Producto tras intento de exploit -> status:", productoTrasExploit.status);
  console.log("Orden tras intento de exploit   -> estado:", ordenTrasExploit.estado);

  const bloqueado = exploitRes.status !== 200 && productoTrasExploit.status !== "SOLD" && ordenTrasExploit.estado !== "COMPLETADO";
  console.log(bloqueado
    ? "\n✅ FIX CONFIRMADO: el exploit ya NO funciona — el producto sigue sin venderse y sin cobrar nada."
    : "\n❌ FALLO: el exploit todavia funciona, revisar de inmediato.");

  fs.writeFileSync("/tmp/qa-test/escrow-fix-verify.json", JSON.stringify({ sellerEmail, buyerEmail, productId, orderId, title }, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
