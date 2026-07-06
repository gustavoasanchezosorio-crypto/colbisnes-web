// Verifica en vivo el fix de sobreescritura de referencia en "destacar producto"
// (auditoria 2026-07-06):
// - Antes, CADA GET a /api/checkout/destacar?productoId=X generaba una wompiReference
//   nueva y la sobreescribia en la fila PENDIENTE reutilizada -- incluso si esa fila ya
//   tenia una referencia vigente (p.ej. el vendedor volvio atras, reintento por una red
//   lenta, o dio doble clic). Eso dejaba huerfana cualquier pagina de pago de Wompi ya
//   abierta con la referencia vieja: si el vendedor pagaba ahi, el webhook
//   (app/api/webhooks/wompi/route.ts -> procesarWebhookDestacado) busca
//   featuredListing.findUnique({ where: { wompiReference } }) con la referencia vieja y
//   ya no la encuentra -- pago real aprobado en Wompi, nunca reflejado en Colbisnes.
// - El fix: la referencia solo se genera y persiste la PRIMERA vez (wompiReference
//   todavia null). Toda solicitud posterior sobre la MISMA fila PENDIENTE debe reusar
//   exactamente la misma referencia (y por lo tanto la misma firma, ya que la firma es
//   una funcion pura de referencia+monto+moneda+secreto).
//
// Requiere: servidor local en localhost:3006 corriendo con la ruta nueva.
const fs = require("fs");
for (const line of fs.readFileSync("/tmp/qa-prod.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
process.env.QA_BASE = "http://localhost:3006";
const { login, api, BASE } = require("./qa-lib");

const prisma = new PrismaClient();
const PASSWORD = "QaTest#2026reFix3";

const resultados = [];
function check(desc, ok) {
  resultados.push([desc, ok]);
  console.log((ok ? "✅ PASS" : "❌ FAIL") + " — " + desc);
}

function extraerParam(location, nombre) {
  const regex = new RegExp("[?&]" + nombre + "=([^&]+)");
  const m = location ? location.match(regex) : null;
  return m ? decodeURIComponent(m[1]) : null;
}

// Llamada GET cruda que NO sigue redirecciones, para poder inspeccionar el header Location
// (la URL de Wompi con la referencia y la firma horneadas) sin de verdad navegar al sitio
// externo de Wompi.
async function golpearDestacar(cookie, productoId) {
  const res = await fetch(`${BASE}/api/checkout/destacar?productoId=${productoId}`, {
    method: "GET",
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  const location = res.headers.get("location") || "";
  return { status: res.status, location };
}

async function main() {
  const stamp = Date.now();
  const sellerEmail = `qa.destacarfix.seller+${stamp}@colbisnes-qa.test`;
  const otroEmail = `qa.destacarfix.otro+${stamp}@colbisnes-qa.test`;
  const hashed = await bcrypt.hash(PASSWORD, 12);

  const seller = await prisma.user.create({ data: { email: sellerEmail, password: hashed, name: "QA Destacar Seller", city: "Bogotá", role: "USER", kycStatus: "approved" } });
  const otro = await prisma.user.create({ data: { email: otroEmail, password: hashed, name: "QA Destacar Otro", city: "Bogotá", role: "USER", kycStatus: "approved" } });
  console.log("Seller:", seller.id, "| Otro usuario:", otro.id);

  const { cookie: sellerCookie } = await login(sellerEmail, PASSWORD);
  const { cookie: otroCookie } = await login(otroEmail, PASSWORD);

  const title = `[QA-TEST] Destacar reference fix ${stamp}`;
  const prodRes = await api("/api/products", {
    method: "POST", cookie: sellerCookie,
    body: { title, description: "QA: verificacion del fix de referencia de destacar. Se eliminara.", priceCOP: 150000, city: "Bogotá", condition: "USADO", category: "Otros" },
  });
  if (prodRes.status !== 201) { console.error("No se pudo crear producto", JSON.stringify(prodRes.body)); return; }
  const productId = prodRes.body.id;
  console.log("Producto:", productId);

  console.log("\n=== Simulando 3 solicitudes sucesivas (retry / doble clic / volver atras) ===");
  const intento1 = await golpearDestacar(sellerCookie, productId);
  const intento2 = await golpearDestacar(sellerCookie, productId);
  const intento3 = await golpearDestacar(sellerCookie, productId);

  check("Intento 1 redirige (30x) a checkout.wompi.co", intento1.status >= 300 && intento1.status < 400 && intento1.location.startsWith("https://checkout.wompi.co/p/"));
  check("Intento 2 redirige (30x) a checkout.wompi.co", intento2.status >= 300 && intento2.status < 400 && intento2.location.startsWith("https://checkout.wompi.co/p/"));
  check("Intento 3 redirige (30x) a checkout.wompi.co", intento3.status >= 300 && intento3.status < 400 && intento3.location.startsWith("https://checkout.wompi.co/p/"));

  const ref1 = extraerParam(intento1.location, "reference");
  const ref2 = extraerParam(intento2.location, "reference");
  const ref3 = extraerParam(intento3.location, "reference");
  console.log("reference intento1:", ref1);
  console.log("reference intento2:", ref2);
  console.log("reference intento3:", ref3);
  check("La referencia NO cambia entre intento1 e intento2 (antes se regeneraba en cada GET)", !!ref1 && ref1 === ref2);
  check("La referencia NO cambia entre intento2 e intento3 (estable en llamadas repetidas)", !!ref2 && ref2 === ref3);

  const firma1 = extraerParam(intento1.location, "signature:integrity");
  const firma2 = extraerParam(intento2.location, "signature:integrity");
  const firma3 = extraerParam(intento3.location, "signature:integrity");
  check("La firma (signature:integrity) tambien es estable entre los 3 intentos", !!firma1 && firma1 === firma2 && firma2 === firma3);

  const filas = await prisma.featuredListing.findMany({ where: { productId, userId: seller.id } });
  check("Se creo UNA SOLA fila FeaturedListing pese a las 3 solicitudes (sin duplicados)", filas.length === 1);
  check("La wompiReference guardada en la BD coincide EXACTAMENTE con la enviada a Wompi (lo que el webhook buscara)", filas.length === 1 && filas[0].wompiReference === ref1);
  check("El estado sigue PENDIENTE (no se toco por solo generar el link de pago)", filas.length === 1 && filas[0].estado === "PENDIENTE");

  console.log("\n=== Regresion: un usuario que NO es el dueno no puede destacar el producto ===");
  const intentoAjeno = await golpearDestacar(otroCookie, productId);
  const bodyAjeno = intentoAjeno.status === 403 ? null : null; // status alcanza, no hace falta el body para un 403 JSON directo
  check("Usuario ajeno recibe 403 (no redirige a Wompi)", intentoAjeno.status === 403);

  console.log("\n=== Regresion: anonimo (sin sesion) es enviado a login, no a Wompi ===");
  const intentoAnonimo = await golpearDestacar("", productId);
  check("Anonimo es redirigido a /auth/login, no a checkout.wompi.co", intentoAnonimo.status >= 300 && intentoAnonimo.status < 400 && intentoAnonimo.location.includes("/auth/login"));

  console.log("\n\n================ RESUMEN ================");
  let algunFallo = false;
  for (const [desc, ok] of resultados) {
    console.log((ok ? "✅ PASS" : "❌ FAIL") + " — " + desc);
    if (!ok) algunFallo = true;
  }
  console.log(algunFallo ? "\n❌ ALGUNA VERIFICACION FALLO — revisar de inmediato." : "\n✅ TODAS LAS VERIFICACIONES PASARON.");

  // Limpieza (orden por FK: FeaturedListing -> Product -> User)
  await prisma.featuredListing.deleteMany({ where: { productId } });
  await prisma.product.delete({ where: { id: productId } });
  await prisma.user.delete({ where: { id: seller.id } });
  await prisma.user.delete({ where: { id: otro.id } });
  console.log("\nLimpieza completa: producto, featured listings y usuarios QA eliminados.");
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => { prisma.$disconnect(); process.exit(0); });
