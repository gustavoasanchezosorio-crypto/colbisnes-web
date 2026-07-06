// Verifica en vivo el fix de autenticacion de Socket.IO (auditoria 2026-07-06):
// - io.use ya no confia en un `auth.token` sin verificar (ni siquiera el literal
//   "anonymous"): la identidad real del socket sale de la cookie de sesion de
//   NextAuth, verificada contra NEXTAUTH_SECRET.
// - join-room ya no guarda un userId mandado por el cliente.
// - send-message exige socket.data.userId (autenticado) Y que fromUserId
//   coincida con esa identidad verificada (no se puede suplantar a otro).
// - de paso, verifica el fix de global.io: que /api/offers PATCH (aceptar oferta)
//   efectivamente emita "product-status-changed" a los sockets unidos a la sala
//   del producto (antes fallaba en silencio via un require("@/server.js") roto).
//
// Requiere: servidor local en localhost:3006 corriendo con el server.js nuevo.
const fs = require("fs");
for (const line of fs.readFileSync("/tmp/qa-prod.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { io: ioClient } = require("socket.io-client");
process.env.QA_BASE = "http://localhost:3006";
const { login, api, BASE } = require("./qa-lib");

const prisma = new PrismaClient();
const PASSWORD = "QaTest#2026reFix";

function conectar(cookieHeader) {
  return ioClient(BASE, {
    transports: ["websocket"],
    extraHeaders: cookieHeader ? { Cookie: cookieHeader } : {},
    forceNew: true,
  });
}

function esperarEvento(socket, evento, ms) {
  return new Promise((resolve) => {
    let resuelto = false;
    const timer = setTimeout(() => { if (!resuelto) { resuelto = true; resolve(null); } }, ms);
    socket.once(evento, (data) => {
      if (!resuelto) { resuelto = true; clearTimeout(timer); resolve(data); }
    });
  });
}

function espera(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const stamp = Date.now();
  const sellerEmail = `qa.socketfix.seller+${stamp}@colbisnes-qa.test`;
  const buyerEmail = `qa.socketfix.buyer+${stamp}@colbisnes-qa.test`;
  const hashed = await bcrypt.hash(PASSWORD, 12);

  const seller = await prisma.user.create({ data: { email: sellerEmail, password: hashed, name: "QA Socket Fix Seller", city: "Bogotá", role: "USER", kycStatus: "approved" } });
  const buyer = await prisma.user.create({ data: { email: buyerEmail, password: hashed, name: "QA Socket Fix Buyer", city: "Bogotá", role: "USER", kycStatus: "approved" } });
  console.log("Seller:", seller.id, "| Buyer:", buyer.id);

  const { cookie: sellerCookie } = await login(sellerEmail, PASSWORD);
  const { cookie: buyerCookie } = await login(buyerEmail, PASSWORD);

  const title = `[QA-TEST] Socket auth fix ${stamp}`;
  const prodRes = await api("/api/products", {
    method: "POST", cookie: sellerCookie,
    body: { title, description: "QA: verificacion del fix de auth de sockets. Se eliminara.", priceCOP: 200000, city: "Bogotá", condition: "USADO", category: "Otros" },
  });
  if (prodRes.status !== 201) { console.error("No se pudo crear producto", JSON.stringify(prodRes.body)); return; }
  const productId = prodRes.body.id;
  console.log("Producto:", productId);

  const resultados = [];
  const room = `product-${productId}`;

  // Socket "testigo" — se une a la sala y solo escucha, para comprobar qué le llega de verdad.
  const testigo = conectar(null);
  await esperarEvento(testigo, "connect", 3000);
  testigo.emit("join-room", { productId });
  await espera(200);

  console.log("\n=== CASO A: socket SIN cookie (anonimo) intenta enviar mensaje suplantando al buyer ===");
  {
    const atacante = conectar(null);
    await esperarEvento(atacante, "connect", 3000);
    atacante.emit("join-room", { productId });
    await espera(100);
    const escucha = esperarEvento(testigo, "new-message", 1200);
    atacante.emit("send-message", { fromUserId: buyer.id, toUserId: seller.id, productId, content: "[ATAQUE] soy el buyer (sin cookie)" });
    const recibido = await escucha;
    console.log("¿Testigo recibió algo?:", recibido);
    resultados.push(["A: socket anonimo no puede enviar mensajes -> testigo NO debe recibir nada", recibido === null]);
    atacante.disconnect();
  }

  console.log("\n=== CASO B: socket con cookie de sesión FALSIFICADA (garbage) intenta enviar mensaje ===");
  {
    const atacante2 = conectar("next-auth.session-token=esto-es-basura-forjada-1234567890; __Secure-next-auth.session-token=esto-es-basura-forjada-1234567890");
    await esperarEvento(atacante2, "connect", 3000);
    atacante2.emit("join-room", { productId });
    await espera(100);
    const escucha = esperarEvento(testigo, "new-message", 1200);
    atacante2.emit("send-message", { fromUserId: buyer.id, toUserId: seller.id, productId, content: "[ATAQUE] soy el buyer (cookie falsa)" });
    const recibido = await escucha;
    console.log("¿Testigo recibió algo?:", recibido);
    resultados.push(["B: cookie de sesión inválida no otorga identidad -> testigo NO debe recibir nada", recibido === null]);
    atacante2.disconnect();
  }

  console.log("\n=== CASO C: buyer autenticado (cookie real) envía un mensaje como sí mismo ===");
  {
    const socketBuyer = conectar(buyerCookie);
    await esperarEvento(socketBuyer, "connect", 3000);
    socketBuyer.emit("join-room", { productId });
    await espera(100);
    const escucha = esperarEvento(testigo, "new-message", 1500);
    socketBuyer.emit("send-message", { fromUserId: buyer.id, toUserId: seller.id, productId, content: "hola, mensaje legítimo del buyer" });
    const recibido = await escucha;
    console.log("¿Testigo recibió algo?:", recibido);
    resultados.push(["C: usuario autenticado enviando como sí mismo -> testigo SÍ debe recibir el mensaje", recibido?.content === "hola, mensaje legítimo del buyer" && recibido?.fromUserId === buyer.id]);

    console.log("\n=== CASO D: el MISMO socket autenticado como buyer intenta suplantar al seller ===");
    const escucha2 = esperarEvento(testigo, "new-message", 1200);
    socketBuyer.emit("send-message", { fromUserId: seller.id, toUserId: buyer.id, productId, content: "[ATAQUE] soy el seller (suplantación)" });
    const recibido2 = await escucha2;
    console.log("¿Testigo recibió algo?:", recibido2);
    resultados.push(["D: usuario autenticado NO puede suplantar a otro -> testigo NO debe recibir nada", recibido2 === null]);
    socketBuyer.disconnect();
  }

  console.log("\n=== CASO E: global.io — aceptar oferta debe emitir product-status-changed en tiempo real ===");
  {
    const escuchaEstado = esperarEvento(testigo, "product-status-changed", 4000);
    const offerRes = await api("/api/offers", { method: "POST", cookie: buyerCookie, body: { productId, amountCOP: 150000, message: "oferta QA" } });
    if (offerRes.status !== 201) {
      console.error("No se pudo crear oferta:", JSON.stringify(offerRes.body));
      resultados.push(["E: crear oferta", false]);
    } else {
      const offerId = offerRes.body.id;
      const acceptRes = await api("/api/offers", { method: "PATCH", cookie: sellerCookie, body: { offerId, status: "ACCEPTED" } });
      console.log("Aceptar oferta:", acceptRes.status, JSON.stringify(acceptRes.body));
      const evento = await escuchaEstado;
      console.log("Evento product-status-changed recibido por el testigo:", evento);
      resultados.push(["E: aceptar oferta emite product-status-changed via global.io -> debe llegar {productId, status: PAYMENT_PENDING}", evento?.productId === productId && evento?.status === "PAYMENT_PENDING"]);
    }
  }

  testigo.disconnect();

  console.log("\n\n================ RESUMEN ================");
  let algunFallo = false;
  for (const [desc, ok] of resultados) {
    console.log((ok ? "✅ PASS" : "❌ FAIL") + " — " + desc);
    if (!ok) algunFallo = true;
  }
  console.log(algunFallo ? "\n❌ ALGUNA VERIFICACION FALLO — revisar de inmediato." : "\n✅ TODAS LAS VERIFICACIONES PASARON.");

  // Limpieza (orden por FK: Offer -> Product -> User)
  await prisma.offer.deleteMany({ where: { productId } });
  await prisma.product.delete({ where: { id: productId } });
  await prisma.user.delete({ where: { id: buyer.id } });
  await prisma.user.delete({ where: { id: seller.id } });
  console.log("\nLimpieza completa: producto, ofertas y usuarios QA eliminados.");
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => { prisma.$disconnect(); process.exit(0); });
