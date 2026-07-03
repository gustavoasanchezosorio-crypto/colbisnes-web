const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SELLER_IDS = [
  'cmqnb793l0000kz04swoassqc',
  'cmqnbe60u0001kz04wvkhwl74',
];

async function run() {
  for (const id of SELLER_IDS) {
    try {
      const u = await prisma.user.update({
        where: { id },
        data: {
          kycStatus: 'approved',
          kycLevel: 2,
          kycApprovedAt: new Date(),
          kycDocumentId: JSON.stringify({ demo: true }),
        },
        select: { id: true, name: true, email: true, kycStatus: true },
      });
      console.log('✅ KYC aprobado:', u.name, u.email);
    } catch (e) {
      console.warn('⚠️  Usuario no encontrado:', id);
    }
  }
  await prisma.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
