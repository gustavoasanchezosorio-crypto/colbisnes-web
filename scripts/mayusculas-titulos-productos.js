// Script manual, de un solo uso (2026-10-27). Pone en MAYÚSCULAS el título de todos los
// productos que ya estaban publicados antes de este cambio (ver lib/normalizarTitulo.ts,
// que ahora aplica esto mismo a cada publicación/edición nueva en
// app/api/products/route.ts y app/api/products/[id]/route.ts).
//
// Solo toca Product.title. No cambia description, city, ni nada más. Usa exactamente la
// misma regla que el helper (trim + toUpperCase) para que quede idéntico a lo que produce
// el formulario de ahora en adelante.
//
// Uso:
//   node --env-file=.env scripts/mayusculas-titulos-productos.js              (dry-run, solo lee)
//   node --env-file=.env scripts/mayusculas-titulos-productos.js --confirmar  (aplica el cambio)

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function normalizarTituloProducto(title) {
  return title.trim().toUpperCase();
}

async function main() {
  const confirmar = process.argv.includes("--confirmar");

  const productos = await prisma.product.findMany({ select: { id: true, title: true } });
  const aCambiar = productos
    .map((p) => ({ id: p.id, antes: p.title, despues: normalizarTituloProducto(p.title) }))
    .filter((p) => p.antes !== p.despues);

  if (aCambiar.length === 0) {
    console.log("Todos los títulos ya están en mayúsculas. Nada que hacer.");
    process.exit(0);
  }

  console.log(`Productos a actualizar: ${aCambiar.length} de ${productos.length}`);
  for (const p of aCambiar) {
    console.log(`  "${p.antes}"  ->  "${p.despues}"`);
  }

  if (!confirmar) {
    console.log("\nDRY-RUN (no se aplicó ningún cambio). Vuelve a correr con --confirmar para aplicar.");
    process.exit(0);
  }

  const resultado = await prisma.$transaction(
    aCambiar.map((p) => prisma.product.update({ where: { id: p.id }, data: { title: p.despues } }))
  );
  console.log(`\nAPLICADO. ${resultado.length} títulos actualizados.`);
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
