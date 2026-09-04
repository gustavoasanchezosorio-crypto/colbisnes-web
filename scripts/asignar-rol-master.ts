/**
 * ============================================================================
 * ASIGNAR ROL "MASTER" A LA CUENTA DEL CREADOR
 * ============================================================================
 *
 * Script manual, de un solo uso (2026-09-04). Pone User.role = "MASTER" en la
 * cuenta cuyo correo coincide (sin importar mayúsculas/minúsculas) con la
 * variable de entorno ADMIN_EMAIL — la cuenta del creador de Colbisnes.
 *
 * Por qué hace falta: hasta ahora el acceso de admin dependía solo del
 * respaldo por variable de entorno (ver lib/adminAuth.ts), sin ningún rol
 * durable en la base. "MASTER" es un nuevo nivel por encima de "ADMIN": además
 * de todo lo que ya podía hacer el admin, habilita edición/desactivación de
 * cualquier producto o usuario y exención de las comisiones propias de
 * Colbisnes (ver lib/pricing.ts, lib/checkoutOnline.ts, checkout/*).
 *
 * OJO — repo público: este archivo NUNCA debe tener el correo real escrito a
 * mano. Todo pasa por process.env.ADMIN_EMAIL, y la salida en consola solo
 * muestra el correo enmascarado, nunca completo.
 *
 * ---------------------------------------------------------------------------
 * CÓMO EJECUTARLO — desde la RAÍZ del proyecto (colbisnes-web/)
 * ---------------------------------------------------------------------------
 *   1) Ensayo en seco (no escribe nada, solo muestra qué haría):
 *        node scripts/asignar-rol-master.ts
 *
 *   2) Aplicar de verdad:
 *        node scripts/asignar-rol-master.ts --confirmar
 *
 * ---------------------------------------------------------------------------
 * PROTECCIONES
 * ---------------------------------------------------------------------------
 * · Sin --confirmar no escribe nada.
 * · Aborta si ADMIN_EMAIL no está configurada.
 * · Aborta si no existe ningún usuario con ese correo (no crea cuentas).
 * · Idempotente: si el rol ya es "MASTER", lo reporta y no vuelve a escribir.
 * · Nunca imprime el correo completo, solo una versión enmascarada.
 * ============================================================================
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const enmascarar = (e: string) => (e || "").replace(/^(.{2})[^@]*@/, "$1***@");

async function main() {
  const confirmar = process.argv.slice(2).includes("--confirmar");

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.error("✋ Falta ADMIN_EMAIL en el entorno. No se hace nada.");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  const usuario = await prisma.user.findFirst({
    where: { email: { equals: adminEmail, mode: "insensitive" } },
    select: { id: true, email: true, role: true },
  });

  if (!usuario) {
    console.error("✋ ABORTADO. No existe ningún usuario con el correo de ADMIN_EMAIL.");
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`\n${confirmar ? "🚀 APLICANDO" : "🔍 ENSAYO EN SECO (no escribe nada)"}`);
  console.log(`   Cuenta: ${enmascarar(usuario.email)}`);
  console.log(`   Rol actual: ${usuario.role}`);

  if (usuario.role === "MASTER") {
    console.log("   ✅ Ya tiene rol MASTER. Nada que hacer.");
    await prisma.$disconnect();
    return;
  }

  if (!confirmar) {
    console.log(`   Rol nuevo (si se confirma): MASTER`);
    console.log(`\n(ensayo en seco. Añade --confirmar para que esto ocurra de verdad)`);
    await prisma.$disconnect();
    return;
  }

  await prisma.user.update({
    where: { id: usuario.id },
    data: { role: "MASTER" },
  });

  console.log("   ✅ Rol actualizado a MASTER.");
  console.log("   Nota: si la sesión ya estaba abierta en el navegador, el cambio tarda");
  console.log("   hasta 5 minutos en reflejarse (ver REFRESCO_SESION_MS en lib/auth.ts),");
  console.log("   o puede forzarse cerrando sesión y volviendo a entrar.");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
