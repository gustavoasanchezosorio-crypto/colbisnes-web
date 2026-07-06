// Verifica en vivo el fix de exposicion de ofertas (auditoria 2026-07-06):
// - GET /api/offers?productId=X y GET /api/products/[id] ya NO devuelven a
//   cualquiera (ni siquiera sin sesion) el monto, mensaje e identidad de
//   TODAS las ofertas de un producto.
// - Reglas esperadas:
//     * El vendedor ve TODAS las ofertas completas (necesita decidir aceptar/rechazar).
//     * Cada comprador ve el detalle COMPLETO de su propia oferta.
//     * Un comprador NO ve la oferta de otro comprador (ni monto, ni mensaje, ni nombre)
//       mientras esa oferta no haya sido aceptada -> no debe aparecer para nada.
//     * La oferta YA ACEPTADA se expone a cualquiera (incluso anonimo) SOLO con
//       {id, productId, amountCOP, status} -- sin mensaje ni identidad del comprador --
//       porque /checkout/[id] necesita ese amountCOP para cobrar el precio pactado.
//
// Requiere: servidor local en localhost:3006 corriendo con las rutas nuevas.
const fs = require("fs");
for (const line of fs.readFileSync("/tmp/qa-prod.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
process.env.QA_BASE = "http://localhost:3006";
const { login, api } = require("./qa-lib");

const prisma = new PrismaClient();
const PASSWORD = "QaTest#2026reFix2";

const resultados = [];
function check(desc, ok) {
  resultados.push([desc, ok]);
  console.log((ok ? "✅ PASS" : "❌ FAIL") + " — " + desc);
}

// Compara que un array de ofertas "visto por X" tenga EXACTAMENTE las claves esperadas
// (nada de mensaje/identidad filtrándose donde no debería).
function tieneSoloClavesRedactadas(o) {
  const claves = Object.keys(o).sort().join(",");
  return claves === ["amountCOP", "id", "productId", "status"].sort().join(",");
}

async function main() {
  const stamp = Date.now();
  const sellerEmail = `qa.offerredact.seller+${stamp}@colbisnes-qa.test`;
  const buyer1Email = `qa.offerredact.buyer1+${stamp}@colbisnes-qa.test`;
  const buyer2Email = `qa.offerredact.buyer2+${stamp}@colbisnes-qa.test`;
  const hashed = await bcrypt.hash(PASSWORD, 12);

  const seller = await prisma.user.create({ data: { email: sellerEmail, password: hashed, name: "QA Redact Seller", city: "Bogotá", role: "USER", kycStatus: "approved" } });
  const buyer1 = await prisma.user.create({ data: { email: buyer1Email, password: hashed, name: "QA Redact Buyer1", city: "Bogotá", role: "USER", kycStatus: "approved" } });
  const buyer2 = await prisma.user.create({ data: { email: buyer2Email, password: hashed, name: "QA Redact Buyer2", city: "Bogotá", role: "USER", kycStatus: "approved" } });
  console.log("Seller:", seller.id, "| Buyer1:", buyer1.id, "| Buyer2:", buyer2.id);

  const { cookie: sellerCookie } = await login(sellerEmail, PASSWORD);
  const { cookie: buyer1Cookie } = await login(buyer1Email, PASSWORD);
  const { cookie: buyer2Cookie } = await login(buyer2Email, PASSWORD);

  const title = `[QA-TEST] Offer redaction fix ${stamp}`;
  const prodRes = await api("/api/products", {
    method: "POST", cookie: sellerCookie,
    body: { title, description: "QA: verificacion del fix de redaccion de ofertas. Se eliminara.", priceCOP: 300000, city: "Bogotá", condition: "USADO", category: "Otros" },
  });
  if (prodRes.status !== 201) { console.error("No se pudo crear producto", JSON.stringify(prodRes.body)); return; }
  const productId = prodRes.body.id;
  console.log("Producto:", productId);

  const MENSAJE_BUYER1 = "mensaje privado de buyer1 - jamas debe verlo buyer2 ni un anonimo";
  const MENSAJE_BUYER2 = "mensaje privado de buyer2 - jamas debe verlo buyer1 ni un anonimo";
  const MONTO_BUYER1 = 250000;
  const MONTO_BUYER2 = 200000;

  const offer1Res = await api("/api/offers", { method: "POST", cookie: buyer1Cookie, body: { productId, amountCOP: MONTO_BUYER1, message: MENSAJE_BUYER1 } });
  const offer2Res = await api("/api/offers", { method: "POST", cookie: buyer2Cookie, body: { productId, amountCOP: MONTO_BUYER2, message: MENSAJE_BUYER2 } });
  if (offer1Res.status !== 201 || offer2Res.status !== 201) {
    console.error("No se pudieron crear ofertas:", JSON.stringify(offer1Res.body), JSON.stringify(offer2Res.body));
    return;
  }
  const offer1Id = offer1Res.body.id;
  const offer2Id = offer2Res.body.id;
  console.log("Oferta1 (buyer1):", offer1Id, "| Oferta2 (buyer2):", offer2Id);

  // Helper: trae ambas vistas (endpoint plano de ofertas y el embebido en el producto) para un cookie dado (o "" para anonimo).
  async function verComo(cookie) {
    const offersDirecto = await api(`/api/offers?productId=${productId}`, { cookie });
    const productoRes = await api(`/api/products/${productId}`, { cookie });
    return { offersDirecto: offersDirecto.body, offersEmbebido: productoRes.body.offers };
  }

  console.log("\n=== FASE 1: ANTES de aceptar ninguna oferta ===");
  {
    const vistaSeller = await verComo(sellerCookie);
    check("Fase1 Seller ve AMBAS ofertas completas en /api/offers", vistaSeller.offersDirecto.length === 2 &&
      vistaSeller.offersDirecto.some(o => o.id === offer1Id && o.amountCOP === MONTO_BUYER1 && o.message === MENSAJE_BUYER1 && o.userId === buyer1.id) &&
      vistaSeller.offersDirecto.some(o => o.id === offer2Id && o.amountCOP === MONTO_BUYER2 && o.message === MENSAJE_BUYER2 && o.userId === buyer2.id));
    check("Fase1 Seller ve AMBAS ofertas completas embebidas en /api/products/[id]", vistaSeller.offersEmbebido.length === 2 &&
      vistaSeller.offersEmbebido.some(o => o.id === offer1Id && o.amountCOP === MONTO_BUYER1 && o.message === MENSAJE_BUYER1) &&
      vistaSeller.offersEmbebido.some(o => o.id === offer2Id && o.amountCOP === MONTO_BUYER2 && o.message === MENSAJE_BUYER2));

    const vistaBuyer1 = await verComo(buyer1Cookie);
    check("Fase1 Buyer1 ve SOLO su propia oferta (completa) en /api/offers, NO la de buyer2", vistaBuyer1.offersDirecto.length === 1 &&
      vistaBuyer1.offersDirecto[0].id === offer1Id && vistaBuyer1.offersDirecto[0].amountCOP === MONTO_BUYER1 && vistaBuyer1.offersDirecto[0].message === MENSAJE_BUYER1);
    check("Fase1 Buyer1 ve SOLO su propia oferta embebida en /api/products/[id], NO la de buyer2", vistaBuyer1.offersEmbebido.length === 1 &&
      vistaBuyer1.offersEmbebido[0].id === offer1Id);

    const vistaBuyer2 = await verComo(buyer2Cookie);
    check("Fase1 Buyer2 ve SOLO su propia oferta (completa) en /api/offers, NO la de buyer1", vistaBuyer2.offersDirecto.length === 1 &&
      vistaBuyer2.offersDirecto[0].id === offer2Id && vistaBuyer2.offersDirecto[0].amountCOP === MONTO_BUYER2 && vistaBuyer2.offersDirecto[0].message === MENSAJE_BUYER2);

    const vistaAnonima = await verComo("");
    check("Fase1 Anonimo NO ve ninguna oferta (nada aceptado aun) en /api/offers", Array.isArray(vistaAnonima.offersDirecto) && vistaAnonima.offersDirecto.length === 0);
    check("Fase1 Anonimo NO ve ninguna oferta embebida en /api/products/[id]", Array.isArray(vistaAnonima.offersEmbebido) && vistaAnonima.offersEmbebido.length === 0);
  }

  console.log("\n=== Vendedor acepta la oferta de buyer1 ===");
  const acceptRes = await api("/api/offers", { method: "PATCH", cookie: sellerCookie, body: { offerId: offer1Id, status: "ACCEPTED" } });
  check("Aceptar oferta responde 200/success", acceptRes.status === 200 && acceptRes.body.success === true);

  console.log("\n=== FASE 2: DESPUES de aceptar la oferta de buyer1 ===");
  {
    const vistaSeller = await verComo(sellerCookie);
    check("Fase2 Seller sigue viendo AMBAS ofertas completas (buyer1 ahora ACCEPTED)", vistaSeller.offersDirecto.length === 2 &&
      vistaSeller.offersDirecto.some(o => o.id === offer1Id && o.status === "ACCEPTED" && o.message === MENSAJE_BUYER1) &&
      vistaSeller.offersDirecto.some(o => o.id === offer2Id && o.status === "PENDING" && o.message === MENSAJE_BUYER2));

    const vistaBuyer1 = await verComo(buyer1Cookie);
    check("Fase2 Buyer1 ve su propia oferta completa como ACCEPTED, sigue sin ver la de buyer2", vistaBuyer1.offersDirecto.length === 1 &&
      vistaBuyer1.offersDirecto[0].id === offer1Id && vistaBuyer1.offersDirecto[0].status === "ACCEPTED" && vistaBuyer1.offersDirecto[0].message === MENSAJE_BUYER1);

    const vistaBuyer2 = await verComo(buyer2Cookie);
    const propiaBuyer2 = vistaBuyer2.offersDirecto.find(o => o.id === offer2Id);
    const ajenaAceptadaParaBuyer2 = vistaBuyer2.offersDirecto.find(o => o.id === offer1Id);
    check("Fase2 Buyer2 sigue viendo su propia oferta completa (PENDING)", vistaBuyer2.offersDirecto.length === 2 &&
      !!propiaBuyer2 && propiaBuyer2.amountCOP === MONTO_BUYER2 && propiaBuyer2.message === MENSAJE_BUYER2 && propiaBuyer2.userId === buyer2.id);
    check("Fase2 Buyer2 ve la oferta ACEPTADA de buyer1 SOLO redactada (sin mensaje ni identidad)", !!ajenaAceptadaParaBuyer2 &&
      tieneSoloClavesRedactadas(ajenaAceptadaParaBuyer2) && ajenaAceptadaParaBuyer2.amountCOP === MONTO_BUYER1 && ajenaAceptadaParaBuyer2.status === "ACCEPTED");
    check("Fase2 Buyer2 -> objeto redactado NO contiene 'message' ni 'userId' en ninguna forma", ajenaAceptadaParaBuyer2.message === undefined && ajenaAceptadaParaBuyer2.userId === undefined && ajenaAceptadaParaBuyer2.user === undefined);

    const vistaAnonima = await verComo("");
    check("Fase2 Anonimo ve EXACTAMENTE 1 oferta (la aceptada), no la pendiente de buyer2", vistaAnonima.offersDirecto.length === 1 && vistaAnonima.offersDirecto[0].id === offer1Id);
    check("Fase2 Anonimo -> la oferta aceptada esta redactada (solo id/productId/amountCOP/status)", tieneSoloClavesRedactadas(vistaAnonima.offersDirecto[0]));
    check("Fase2 Anonimo -> amountCOP redactado coincide con el monto realmente pactado (no el precio de lista)", vistaAnonima.offersDirecto[0].amountCOP === MONTO_BUYER1 && vistaAnonima.offersDirecto[0].amountCOP !== 300000);

    // Mismo chequeo pero contra el endpoint embebido /api/products/[id], que es el que consume /checkout/[id].
    check("Fase2 Anonimo -> /api/products/[id] embebe la misma oferta aceptada redactada", vistaAnonima.offersEmbebido.length === 1 &&
      tieneSoloClavesRedactadas(vistaAnonima.offersEmbebido[0]) && vistaAnonima.offersEmbebido[0].amountCOP === MONTO_BUYER1);

    // Simulacion exacta de la logica de app/checkout/[id]/page.tsx (linea ~49):
    // ofertaAceptada = producto.offers.find(o => o.id === producto.acceptedOfferId)
    // monto = ofertaAceptada ? ofertaAceptada.amountCOP : producto.priceCOP
    const productoParaAnonimo = await api(`/api/products/${productId}`, { cookie: "" });
    const acceptedOfferId = productoParaAnonimo.body.acceptedOfferId;
    const ofertaAceptadaVistaCheckout = productoParaAnonimo.body.offers.find(o => o.id === acceptedOfferId);
    const montoQueCobrariaCheckout = ofertaAceptadaVistaCheckout ? ofertaAceptadaVistaCheckout.amountCOP : productoParaAnonimo.body.priceCOP;
    check("Checkout (viendo como no-dueno/anonimo) cobraria el MONTO PACTADO, no el precio de lista", montoQueCobrariaCheckout === MONTO_BUYER1);

    // Y para buyer2 (comprador autenticado que no gano la puja) tambien debe resolver el precio correcto.
    const productoParaBuyer2 = await api(`/api/products/${productId}`, { cookie: buyer2Cookie });
    const ofertaAceptadaVistaBuyer2 = productoParaBuyer2.body.offers.find(o => o.id === productoParaBuyer2.body.acceptedOfferId);
    check("Checkout (viendo como buyer2, que no gano la puja) tambien cobraria el MONTO PACTADO correcto", ofertaAceptadaVistaBuyer2?.amountCOP === MONTO_BUYER1);
  }

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
  await prisma.user.delete({ where: { id: buyer1.id } });
  await prisma.user.delete({ where: { id: buyer2.id } });
  await prisma.user.delete({ where: { id: seller.id } });
  console.log("\nLimpieza completa: producto, ofertas y usuarios QA eliminados.");
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => { prisma.$disconnect(); process.exit(0); });
