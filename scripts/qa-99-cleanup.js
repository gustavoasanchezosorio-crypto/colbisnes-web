// Limpieza completa de todos los datos de prueba (QA) creados durante la ronda de testing:
// cuentas @colbisnes-qa.test, sus 50+ productos [QA-TEST], y todas las filas relacionadas
// (ofertas, órdenes, disputas, reviews, mensajes, favoritos) para dejar la base de datos
// de producción exactamente como estaba antes de empezar.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const testUsers = await prisma.user.findMany({
    where: { email: { endsWith: "@colbisnes-qa.test" } },
    select: { id: true, email: true },
  });
  const userIds = testUsers.map(u => u.id);
  console.log(`Cuentas de prueba encontradas: ${userIds.length}`);
  testUsers.forEach(u => console.log("  -", u.email));

  const testProducts = await prisma.product.findMany({
    where: { OR: [{ sellerId: { in: userIds } }, { title: { startsWith: "[QA-TEST]" } }] },
    select: { id: true, title: true },
  });
  const productIds = testProducts.map(p => p.id);
  console.log(`\nProductos de prueba encontrados: ${productIds.length}`);

  const testOrders = await prisma.order.findMany({
    where: { OR: [{ productId: { in: productIds } }, { buyerEmail: { in: testUsers.map(u => u.email) } }] },
    select: { id: true },
  });
  const orderIds = testOrders.map(o => o.id);
  console.log(`Órdenes de prueba encontradas: ${orderIds.length}`);

  // --- Borrado en orden seguro (hijos antes que padres) ---
  const r1 = await prisma.message.deleteMany({ where: { OR: [{ fromUserId: { in: userIds } }, { toUserId: { in: userIds } }, { productId: { in: productIds } }] } });
  console.log(`Mensajes borrados: ${r1.count}`);

  const r2 = await prisma.review.deleteMany({ where: { OR: [{ fromUserId: { in: userIds } }, { toUserId: { in: userIds } }, { productId: { in: productIds } }] } });
  console.log(`Reviews borradas: ${r2.count}`);

  const r3 = await prisma.dispute.deleteMany({ where: { OR: [{ raisedByUserId: { in: userIds } }, { raisedAgainstUserId: { in: userIds } }, { orderId: { in: orderIds } }] } });
  console.log(`Disputas borradas: ${r3.count}`);

  const r4 = await prisma.offer.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { productId: { in: productIds } }] } });
  console.log(`Ofertas borradas: ${r4.count}`);

  const r5 = await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  console.log(`Órdenes borradas: ${r5.count}`);

  const r6 = await prisma.favorite.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { productId: { in: productIds } }] } });
  console.log(`Favoritos borrados: ${r6.count}`);

  const r7 = await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  console.log(`AuditLogs borrados: ${r7.count}`);

  const r8 = await prisma.productImage.deleteMany({ where: { productId: { in: productIds } } });
  console.log(`Imágenes de producto borradas: ${r8.count}`);

  const r9 = await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  console.log(`Productos borrados: ${r9.count}`);

  const r10 = await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  const r11 = await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
  console.log(`Sesiones borradas: ${r10.count}, Cuentas OAuth borradas: ${r11.count}`);

  const r12 = await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  console.log(`Usuarios de prueba borrados: ${r12.count}`);

  // Verificación final: no debe quedar ningún residuo
  const remainingUsers = await prisma.user.count({ where: { email: { endsWith: "@colbisnes-qa.test" } } });
  const remainingProducts = await prisma.product.count({ where: { title: { startsWith: "[QA-TEST]" } } });
  console.log(`\n=== Verificación final: usuarios restantes=${remainingUsers}, productos restantes=${remainingProducts} ===`);
  if (remainingUsers === 0 && remainingProducts === 0) {
    console.log("✅ Limpieza completa. No queda ningún dato de prueba en producción.");
  } else {
    console.log("⚠️ Aún quedan residuos — revisar manualmente.");
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
