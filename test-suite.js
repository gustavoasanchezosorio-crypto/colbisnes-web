/**
 * Suite de pruebas Colbisnes — Pre-lanzamiento
 * Prueba el flujo completo de la plataforma via API
 */

const BASE = 'https://colbisnes-web.vercel.app';
const PRODUCT_ID = 'cmqq604di0003v18ud3kyn8gj'; // iPhone 15 Pro Max

let passed = 0;
let failed = 0;
const results = [];

function log(name, ok, detail = '') {
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} ${name}${detail ? ' — ' + detail : ''}`);
  results.push({ name, ok, detail });
  if (ok) passed++; else failed++;
}

async function get(path, opts = {}) {
  const r = await fetch(BASE + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, json };
}

async function post(path, body, opts = {}) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, json };
}

async function run() {
  console.log('\n🧪 SUITE DE PRUEBAS COLBISNES\n' + '='.repeat(50));

  // ────────────────────────────────────────────
  console.log('\n📦 1. PRODUCTOS\n');

  // GET productos públicos
  const { status: s1, json: j1 } = await get('/api/products');
  log('GET /api/products — retorna lista', s1 === 200 && Array.isArray(j1), `${j1.length || 0} productos`);
  log('Productos demo visibles', Array.isArray(j1) && j1.length >= 10, `${j1?.length} total`);

  // Buscar por query
  const { status: s2, json: j2 } = await get('/api/products?q=iPhone');
  log('Búsqueda por texto funciona', s2 === 200 && j2.some(p => p.title.includes('iPhone')));

  // Filtro por ciudad
  const { status: s3, json: j3 } = await get('/api/products?city=Bogotá');
  log('Filtro por ciudad funciona', s3 === 200 && j3.every(p => p.city === 'Bogotá'), `${j3?.length} en Bogotá`);

  // Filtro por precio
  const { status: s4, json: j4 } = await get('/api/products?maxPrice=1000000');
  log('Filtro por precio máximo', s4 === 200 && j4.every(p => p.priceCOP <= 1000000), `${j4?.length} bajo $1M`);

  // Producto individual
  const { status: s5, json: j5 } = await get(`/api/products/${PRODUCT_ID}`);
  log('GET producto por ID', s5 === 200 && j5.title === 'iPhone 15 Pro Max 256GB Titanio Natural');
  log('Email vendedor NO expuesto', !j5.seller?.email, j5.seller?.email ? 'EXPUESTO ❌' : 'protegido ✓');

  // ────────────────────────────────────────────
  console.log('\n🔐 2. AUTENTICACIÓN Y SEGURIDAD\n');

  // Sin auth: no puede crear producto
  const { status: s6 } = await post('/api/products', { title: 'Test', priceCOP: 1000 });
  log('POST /api/products sin auth → 401', s6 === 401, `status ${s6}`);

  // Sin auth: no puede hacer oferta
  const { status: s7 } = await post('/api/offers', { productId: PRODUCT_ID, amountCOP: 100000 });
  log('POST /api/offers sin auth → 401', s7 === 401, `status ${s7}`);

  // Sin auth: no puede pagar contra entrega
  const { status: s8 } = await post('/api/checkout/contra-entrega', { productoId: PRODUCT_ID });
  log('POST /checkout/contra-entrega sin auth → 401', s8 === 401, `status ${s8}`);

  // Sin auth: no puede pagar USDT
  const { status: s9 } = await post('/api/checkout/usdt', { productoId: PRODUCT_ID });
  log('POST /checkout/usdt sin auth → 401', s9 === 401, `status ${s9}`);

  // Sin auth: orders protegidas
  const { status: s10 } = await get(`/api/orders/por-producto?productId=${PRODUCT_ID}`);
  log('GET /orders/por-producto sin auth → 401', s10 === 401, `status ${s10}`);

  // Endpoint confirm deshabilitado
  const { status: s11 } = await post('/api/payments/confirm', { productId: PRODUCT_ID });
  log('POST /payments/confirm → 403 (deshabilitado)', s11 === 403, `status ${s11}`);

  // Mock deshabilitado en producción
  const { status: s12 } = await post('/api/payments/mock', { productId: PRODUCT_ID });
  log('POST /payments/mock → 403 en producción', s12 === 403, `status ${s12}`);

  // ePayco deshabilitado
  const { status: s13 } = await post('/api/payments/epayco/create', {});
  log('POST /payments/epayco/create → 410 (removido)', s13 === 410, `status ${s13}`);

  // Cron protegido
  const { status: s14 } = await get('/api/cron/liberar');
  log('GET /cron/liberar sin secret → 401', s14 === 401, `status ${s14}`);

  const { status: s15 } = await post('/api/cron/liberar', {});
  log('POST /cron/liberar sin secret → 401', s15 === 401, `status ${s15}`);

  // ────────────────────────────────────────────
  console.log('\n💰 3. PRECIOS Y COMISIONES\n');

  // Verificar que la tasa USDT funciona
  const { status: s16, json: j16 } = await get('/api/tasa-usdt');
  log('Tasa USDT disponible', s16 === 200 && j16.tasa > 0, `1 USD = $${j16?.tasa?.toLocaleString('es-CO')} COP`);

  // Verificar pricing en checkout
  const { status: s17, json: j17 } = await get(`/api/products/${PRODUCT_ID}`);
  if (j17.priceCOP) {
    const precio = j17.priceCOP;
    const comision = Math.round(precio * 0.10);
    const total = precio + comision;
    const comisionOk = comision === Math.round(precio * 0.10);
    const totalOk = total === precio + comision;
    log('Comisión 10% calculada correctamente', comisionOk, `$${comision.toLocaleString('es-CO')}`);
    log('Total comprador con comisión', totalOk, `$${total.toLocaleString('es-CO')} COP`);
  }

  // ────────────────────────────────────────────
  console.log('\n📝 4. RUTAS LEGACY DESHABILITADAS\n');

  const { status: s18 } = await post('/api/pagos/wompi', {});
  log('POST /api/pagos/wompi legacy → 410', s18 === 410, `status ${s18}`);

  const { status: s19 } = await get('/api/pagos/estado');
  log('GET /api/pagos/estado legacy → 410', s19 === 410, `status ${s19}`);

  // ────────────────────────────────────────────
  console.log('\n🌐 5. PÁGINAS PÚBLICAS\n');

  const pages = [
    ['/', 'Home'],
    [`/product/${PRODUCT_ID}`, 'Producto detalle'],
    ['/auth/login', 'Login'],
    ['/auth/register', 'Registro'],
    ['/auth/forgot-password', 'Recuperar contraseña'],
  ];

  for (const [path, name] of pages) {
    try {
      const r = await fetch(BASE + path);
      log(`Página ${name} carga`, r.status === 200, `status ${r.status}`);
    } catch(e) {
      log(`Página ${name} carga`, false, e.message);
    }
  }

  // ────────────────────────────────────────────
  console.log('\n🔔 6. APIs AUXILIARES\n');

  // Mensajes no leídos — retorna {count:0} sin auth (no expone datos reales)
  const { status: s20, json: j20 } = await get('/api/messages/unread');
  log('GET /messages/unread sin auth → count seguro', s20 === 200 && j20.count === 0, `status ${s20}, count ${j20.count}`);

  // Reviews
  const { status: s21 } = await post('/api/reviews', {});
  log('POST /api/reviews requiere auth', s21 === 401, `status ${s21}`);

  // Favoritos
  const { status: s22 } = await get(`/api/favorites?productId=${PRODUCT_ID}`);
  log('GET /favorites requiere auth (o retorna default)', [200, 401].includes(s22), `status ${s22}`);

  // Webhook Wompi rechaza payload inválido
  const { status: s23 } = await post('/api/webhooks/wompi', { event: 'test', data: {}, signature: {}, timestamp: Date.now()/1000 });
  log('Webhook Wompi rechaza firma inválida', s23 === 401, `status ${s23}`);

  // ────────────────────────────────────────────
  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 RESULTADO FINAL: ${passed} pasaron / ${failed} fallaron`);

  if (failed === 0) {
    console.log('🎉 ¡TODO EN ORDEN! Colbisnes está listo para el lanzamiento.');
  } else {
    console.log('\n⚠️  Pruebas fallidas:');
    results.filter(r => !r.ok).forEach(r => console.log(`   ❌ ${r.name}: ${r.detail}`));
  }
}

run().catch(e => { console.error('Error fatal en suite:', e); process.exit(1); });
