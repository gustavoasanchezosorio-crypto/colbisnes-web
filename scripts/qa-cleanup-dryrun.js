// Dry-run de solo lectura: cuenta (sin borrar nada) todas las filas que se identifican
// inequivocamente como datos de QA, usando dos patrones que nunca deberian coincidir con
// datos reales de usuarios: email terminado en "@colbisnes-qa.test" y titulo de producto
// que empieza con "[QA-TEST]".
const fs = require("fs");
for (const line of fs.readFileSync("/tmp/qa-prod.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const EMAIL_SUFFIX = "@colbisnes-qa.test";
const TITLE_PREFIX = "[QA-TEST]";

async function main() {
  const qaUsers = await prisma.user.findMany({ where: { email: { endsWith: EMAIL_SUFFIX } }, select: { id: true, email: true } });
  const qaUserIds = qaUsers.map(u => u.id);
  const qaEmails = qaUsers.map(u => u.email);
  console.log("Usuarios QA:", qaUsers.length);

  const qaProducts = await prisma.product.findMany({ where: { title: { startsWith: TITLE_PREFIX } }, select: { id: true, title: true, sellerId: true } });
  const qaProductIds = qaProducts.map(p => p.id);
  console.log("Productos QA (por titulo):", qaProducts.length);

  const productosSellerNoQaEmail = qaProducts.filter(p => !qaUserIds.includes(p.sellerId));
  console.log("  -> de esos, con sellerId que NO esta en la lista de usuarios QA (raro, revisar):", productosSellerNoQaEmail.length, productosSellerNoQaEmail);

  const otrosProductosDeUsuariosQa = await prisma.product.findMany({ where: { sellerId: { in: qaUserIds }, title: { not: { startsWith: TITLE_PREFIX } } }, select: { id: true, title: true } });
  console.log("Productos de usuarios QA SIN el prefijo [QA-TEST] (raro, revisar):", otrosProductosDeUsuariosQa.length, otrosProductosDeUsuariosQa);

  const allProductIds = [...new Set([...qaProductIds, ...otrosProductosDeUsuariosQa.map(p => p.id)])];

  const ordenes = await prisma.order.findMany({ where: { OR: [{ productId: { in: allProductIds } }, { buyerEmail: { in: qaEmails } }] }, select: { id: true, estado: true, productId: true, buyerEmail: true } });
  console.log("Ordenes QA:", ordenes.length);
  const ordenIds = ordenes.map(o => o.id);

  const ofertas = await prisma.offer.count({ where: { OR: [{ productId: { in: allProductIds } }, { userId: { in: qaUserIds } }] } });
  console.log("Ofertas QA:", ofertas);

  const mensajes = await prisma.message.count({ where: { OR: [{ productId: { in: allProductIds } }, { fromUserId: { in: qaUserIds } }, { toUserId: { in: qaUserIds } }] } });
  console.log("Mensajes QA:", mensajes);

  const favoritos = await prisma.favorite.count({ where: { OR: [{ productId: { in: allProductIds } }, { userId: { in: qaUserIds } }] } });
  console.log("Favoritos QA:", favoritos);

  const reviews = await prisma.review.count({ where: { OR: [{ productId: { in: allProductIds } }, { fromUserId: { in: qaUserIds } }, { toUserId: { in: qaUserIds } }] } });
  console.log("Reviews QA:", reviews);

  const disputas = await prisma.dispute.count({ where: { OR: [{ orderId: { in: ordenIds } }, { raisedByUserId: { in: qaUserIds } }, { raisedAgainstUserId: { in: qaUserIds } }] } });
  console.log("Disputas QA:", disputas);

  const auditLogs = await prisma.auditLog.count({ where: { OR: [{ userId: { in: qaUserIds } }, { entityId: { in: [...ordenIds, ...allProductIds, ...qaUserIds] } }] } });
  console.log("AuditLog QA:", auditLogs);

  const hotWalletPayouts = await prisma.hotWalletPayout.count({ where: { orderId: { in: ordenIds } } });
  console.log("HotWalletPayout QA:", hotWalletPayouts);

  const featured = await prisma.featuredListing.count({ where: { OR: [{ productId: { in: allProductIds } }, { userId: { in: qaUserIds } }] } });
  console.log("FeaturedListing QA:", featured);

  const blacklist = await prisma.blacklist.count({ where: { email: { in: qaEmails } } });
  console.log("Blacklist QA (por email):", blacklist);

  const bluConvs = await prisma.bluConversation.count({ where: { OR: [{ userId: { in: qaUserIds } }, { userEmail: { in: qaEmails } }] } });
  console.log("BluConversation QA:", bluConvs);

  const productImages = await prisma.productImage.count({ where: { productId: { in: allProductIds } } });
  console.log("ProductImage QA (se borran en cascada con el producto):", productImages);

  const accounts = await prisma.account.count({ where: { userId: { in: qaUserIds } } });
  const sessions = await prisma.session.count({ where: { userId: { in: qaUserIds } } });
  console.log("Account/Session QA (se borran en cascada con el usuario):", accounts, sessions);

  console.log("\n--- Ordenes QA con detalle (revisar antes de borrar) ---");
  console.log(JSON.stringify(ordenes, null, 2));

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
