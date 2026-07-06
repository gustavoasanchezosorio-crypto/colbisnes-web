// Parte 2 de la verificacion del fix de escrow bypass: el comprador sube el comprobante
// Nequi (simulado) para la orden creada por qa-verify-escrow-fix.js, dejandola lista para
// que el admin la confirme desde /admin (paso manual, requiere sesion real de admin).
const fs = require("fs");
for (const line of fs.readFileSync("/tmp/qa-prod.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { login, api, BASE } = require("./qa-lib");

const PASSWORD = "QaTest#2026reFix";
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

async function main() {
  const data = JSON.parse(fs.readFileSync("/tmp/qa-test/escrow-fix-verify.json", "utf8"));
  console.log("Orden:", data.orderId, "| Producto:", data.title);

  const { cookie: buyerCookie, session } = await login(data.buyerEmail, PASSWORD);
  if (!session?.user?.id) { console.error("Login buyer fallo"); return; }

  const fd = new FormData();
  fd.append("orderId", data.orderId);
  fd.append("referencia", "QA-ESCROWFIX-" + Date.now());
  fd.append("comprobante", new Blob([TINY_PNG], { type: "image/png" }), "comprobante.png");
  const subida = await fetch(`${BASE}/api/checkout/confirmar-comision-nequi`, {
    method: "POST", headers: { Cookie: buyerCookie }, body: fd,
  });
  console.log("confirmar-comision-nequi (buyer, sube comprobante):", subida.status, await subida.text());

  console.log("\nListo. El producto '" + data.title + "' deberia aparecer ahora en");
  console.log(BASE + "/admin -> seccion 'Comisiones Nequi pendientes de confirmar', con comprobante adjunto.");
}
main().catch(e => { console.error(e); process.exit(1); });
