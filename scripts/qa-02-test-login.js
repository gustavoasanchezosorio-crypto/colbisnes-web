const fs = require("fs");
const { login, api } = require("./qa-lib");

async function main() {
  const accounts = JSON.parse(fs.readFileSync("/tmp/qa-test/accounts.json", "utf8"));
  const seller1 = accounts.find(a => a.email.includes("seller1"));

  const { cookie, session, loginStatus } = await login(seller1.email, seller1.password);
  console.log("login status:", loginStatus);
  console.log("session:", JSON.stringify(session));

  if (!session?.user?.id) {
    console.error("LOGIN FALLÓ — no se obtuvo sesión.");
    process.exit(1);
  }

  // Probar KYC bypass: debería poder crear un producto sin estar aprobado
  const { status, body } = await api("/api/products", {
    method: "POST",
    cookie,
    body: {
      title: "QA TEST — producto de prueba (borrar)",
      description: "Este es un producto de prueba creado por el script de QA. Será eliminado.",
      priceCOP: 50000,
      city: seller1.city,
      condition: "USADO",
      category: "Otros",
    },
  });
  console.log("create product status:", status);
  console.log("create product body:", JSON.stringify(body));
}

main().catch(e => { console.error(e); process.exit(1); });
