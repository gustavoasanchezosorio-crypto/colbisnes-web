// Ejecuta el borrado real de todos los datos de QA identificados en qa-cleanup-dryrun.js.
// Mismo criterio de identificacion (email @colbisnes-qa.test + titulo [QA-TEST]), ya verificado
// sin cruces con datos reales. Borrado en una sola transaccion, en orden seguro para FKs
// (hijos antes que padres).
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

  const qaProductsByTitle = await prisma.product.findMany({ where: { title: { startsWith: TITLE_PREFIX } }, select: { id: true } });
  const otrosDeUsuariosQa = await prisma.product.findMany({ where: { sellerId: { in: qaUserIds }, title: { not: { startsWith: TITLE_PREFIX } } }, select: { id: true } });
  const allProductIds = [...new Set([...qaProductsByTitle.map(p => p.id), ...otrosDeUsuariosQa.map(p => p.id)])];

  const ordenes = await prisma.order.findMany({ where: { OR: [{ productId: { in: allProductIds } }, { buyerEmail: { in: qaEmails } }] }, select: { id: true } });
  const ordenIds = ordenes.map(o => o.id);

  console.log(`Borrando: ${qaUserIds.length} usuarios, ${allProductIds.length} productos, ${ordenIds.length} ordenes...`);

  const resultados = await prisma.$transaction([
    prisma.dispute.deleteMany({ where: { OR: [{ orderId: { in: ordenIds } }, { raisedByUserId: { in: qaUserIds } }, { raisedAgainstUserId: { in: qaUserIds } }] } }),
    prisma.review.deleteMany({ where: { OR: [{ productId: { in: allProductIds } }, { fromUserId: { in: qaUserIds } }, { toUserId: { in: qaUserIds } }] } }),
    prisma.message.deleteMany({ where: { OR: [{ productId: { in: allProductIds } }, { fromUserId: { in: qaUserIds } }, { toUserId: { in: qaUserIds } }] } }),
    prisma.favorite.deleteMany({ where: { OR: [{ productId: { in: allProductIds } }, { userId: { in: qaUserIds } }] } }),
    prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: qaUserIds } }, { entityId: { in: [...ordenIds, ...allProductIds, ...qaUserIds] } }] } }),
    prisma.hotWalletPayout.deleteMany({ where: { orderId: { in: ordenIds } } }),
    prisma.featuredListing.deleteMany({ where: { OR: [{ productId: { in: allProductIds } }, { userId: { in: qaUserIds } }] } }),
    prisma.bluMessage.deleteMany({ where: { conversation: { OR: [{ userId: { in: qaUserIds } }, { userEmail: { in: qaEmails } }] } } }),
    prisma.bluConversation.deleteMany({ where: { OR: [{ userId: { in: qaUserIds } }, { userEmail: { in: qaEmails } }] } }),
    prisma.offer.deleteMany({ where: { OR: [{ productId: { in: allProductIds } }, { userId: { in: qaUserIds } }] } }),
    prisma.order.deleteMany({ where: { id: { in: ordenIds } } }),
    prisma.productImage.deleteMany({ where: { productId: { in: allProductIds } } }),
    prisma.product.deleteMany({ where: { id: { in: allProductIds } } }),
    prisma.blacklist.deleteMany({ where: { email: { in: qaEmails } } }),
    prisma.session.deleteMany({ where: { userId: { in: qaUserIds } } }),
    prisma.account.deleteMany({ where: { userId: { in: qaUserIds } } }),
    prisma.user.deleteMany({ where: { id: { in: qaUserIds } } }),
  ]);

  const labels = ["Dispute","Review","Message","Favorite","AuditLog","HotWalletPayout","FeaturedListing","BluMessage","BluConversation","Offer","Order","ProductImage","Product","Blacklist","Session","Account","User"];
  resultados.forEach((r, i) => console.log(`${labels[i]}: ${r.count} borrados`));

  console.log("\n--- Verificacion final ---");
  const remainingUsers = await prisma.user.count({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  const remainingProducts = await prisma.product.count({ where: { title: { startsWith: TITLE_PREFIX } } });
  console.log("Usuarios QA restantes:", remainingUsers, "| Productos QA restantes:", remainingProducts);

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
