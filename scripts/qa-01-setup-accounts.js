// QA: crea cuentas de prueba (patrón +qatest@ para activar el bypass de KYC)
// Dominio .test es reservado por IANA para pruebas — nunca resuelve a un correo real.
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const fs = require("fs");

const prisma = new PrismaClient();
const PASSWORD = "QaTest#2026";
const CITIES = ["Bogotá", "Medellín", "Cali", "Barranquilla", "Bucaramanga"];

async function main() {
  const hashed = await bcrypt.hash(PASSWORD, 12);
  const accounts = [];

  for (let i = 1; i <= 5; i++) {
    const email = `qa.seller${i}+qatest@colbisnes-qa.test`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        password: hashed,
        name: `QA Seller ${i}`,
        city: CITIES[i - 1],
        role: "USER",
      },
    });
    accounts.push({ role: "seller", email, password: PASSWORD, id: user.id, city: user.city });
  }

  for (let i = 1; i <= 5; i++) {
    const email = `qa.buyer${i}+qatest@colbisnes-qa.test`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        password: hashed,
        name: `QA Buyer ${i}`,
        city: CITIES[i % CITIES.length],
        role: "USER",
      },
    });
    accounts.push({ role: "buyer", email, password: PASSWORD, id: user.id, city: user.city });
  }

  fs.writeFileSync("/tmp/qa-test/accounts.json", JSON.stringify(accounts, null, 2));
  console.log(`Creadas/verificadas ${accounts.length} cuentas de prueba.`);
  accounts.forEach(a => console.log(` - [${a.role}] ${a.email} (${a.id})`));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
