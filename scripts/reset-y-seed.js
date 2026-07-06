/**
 * COLBISNES — Reset total + Seed de producción
 * Borra toda la BD y crea datos reales para validar todos los flujos
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

// ── USUARIOS ─────────────────────────────────────────────────────────────────

const USUARIOS = [
  {
    email: 'carlos.mendez@colbisnes.com',
    password: 'Colbisnes2025!',
    name: 'Carlos Mendez',
    city: 'Bogotá',
    phone: '+573001234567',
  },
  {
    email: 'sara.lopez@colbisnes.com',
    password: 'Colbisnes2025!',
    name: 'Sara López',
    city: 'Medellín',
    phone: '+573109876543',
  },
];

// ── PRODUCTOS ─────────────────────────────────────────────────────────────────
// sellerId se asigna dinámicamente después de crear usuarios

const PRODUCTOS = [
  {
    title: 'iPhone 15 Pro Max 256GB Titanio Natural',
    description: `iPhone 15 Pro Max en titanio natural, sin un solo rayón. Comprado en iShop Colombia con garantía vigente hasta marzo 2026. Incluye caja original sellada, cargador USB-C de 20W, cable trenzado y audífonos EarPods USB-C. Face ID funcionando perfectamente. Batería al 98%.

Perfecto para quien quiere lo mejor de Apple sin pagar precio de tienda. Precio de lista en Colombia: $6.299.000. Lo doy en $4.800.000 por cambio de proyecto.`,
    priceCOP: 4800000,
    city: 'Bogotá',
    condition: 'USADO',
    category: 'Tecnología',
    tipoEntrega: 'ENVIO',
    precioEnvio: 15000,
    images: [
      'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=900&q=85',
      'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=900&q=85',
    ],
    sellerIdx: 0,
  },
  {
    title: 'MacBook Pro M3 14" 18GB RAM 512GB SSD Gris Espacial',
    description: `MacBook Pro M3 14 pulgadas, chip M3 base, 18GB RAM unificada y 512GB SSD. Solo 4 meses de uso para trabajo remoto. Pantalla Liquid Retina XDR sin un píxel muerto, batería al 96%. Incluye cargador MagSafe 140W original y funda de cuero genuino.

Ideal para diseño, desarrollo, edición de video o cualquier trabajo creativo. Rendimiento brutal y sin ventiladores audibles. Precio iShop: $8.900.000. Precio Colbisnes: $6.500.000.`,
    priceCOP: 6500000,
    city: 'Bogotá',
    condition: 'USADO',
    category: 'Tecnología',
    tipoEntrega: 'AMBOS',
    precioEnvio: 25000,
    images: [
      'https://images.unsplash.com/photo-1611186871525-7ae5de1a4d4c?w=900&q=85',
      'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=900&q=85',
    ],
    sellerIdx: 0,
  },
  {
    title: 'PlayStation 5 Slim Edición Digital + 3 Juegos + 2 Controles DualSense',
    description: `PS5 Slim edición digital en caja, con solo 6 meses de uso recreativo los fines de semana. Incluye:
• 2 controles DualSense (blanco + negro medianoche)
• Spider-Man 2 (digital)
• God of War Ragnarök (digital)
• Hogwarts Legacy (digital)
• Audífonos Pulse 3D inalámbricos

Sin rayones, limpio. Factura de compra disponible en Éxito. Precio original: $3.800.000. Precio Colbisnes: $2.600.000.`,
    priceCOP: 2600000,
    city: 'Medellín',
    condition: 'USADO',
    category: 'Videojuegos',
    tipoEntrega: 'AMBOS',
    precioEnvio: 20000,
    images: [
      'https://images.unsplash.com/photo-1607853202273-797f1c22a38e?w=900&q=85',
      'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=900&q=85',
    ],
    sellerIdx: 1,
  },
  {
    title: 'Bicicleta Trek Marlin 7 2024 Talla M — MTB 29"',
    description: `Trek Marlin 7 2024, talla M para ciclistas entre 1.70 y 1.85. Solo 3 meses de uso en ciclovía y rutas suaves. Componentes Shimano Deore 10 velocidades, frenos de disco hidráulicos Shimano MT200, horquilla SR Suntour XCR con 100mm de recorrido.

Aro 29" doble pared Bontrager Line, sillín Bontrager Arvada. Luces delanteras y traseras incluidas. Candado Kryptonite incluido. Precio Trek Colombia: $3.200.000. Precio Colbisnes: $2.100.000.`,
    priceCOP: 2100000,
    city: 'Bogotá',
    condition: 'USADO',
    category: 'Deportes',
    tipoEntrega: 'EN_PERSONA',
    precioEnvio: 0,
    images: [
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=900&q=85',
      'https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=900&q=85',
    ],
    sellerIdx: 0,
  },
  {
    title: 'Samsung Galaxy S24 Ultra 256GB Titanio Negro + Cargador 45W',
    description: `Samsung Galaxy S24 Ultra en titanio negro, 12GB RAM y 256GB almacenamiento. S Pen incluido. 3 meses de uso, sin caídas ni rayones. Pantalla Dynamic AMOLED 2X perfecta. Batería al 97%.

Incluye cargador Samsung de 45W original, cable USB-C, funda transparente original y vidrio protector instalado. Todo en caja original con serial. Garantía Samsung hasta diciembre 2025. Precio tienda: $4.499.000. Colbisnes: $3.100.000.`,
    priceCOP: 3100000,
    city: 'Cali',
    condition: 'USADO',
    category: 'Tecnología',
    tipoEntrega: 'ENVIO',
    precioEnvio: 15000,
    images: [
      'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=900&q=85',
      'https://images.unsplash.com/photo-1583573636169-b3a40cf2bbbf?w=900&q=85',
    ],
    sellerIdx: 1,
  },
  {
    title: 'Cámara Sony Alpha A7 III + Lente 28-70mm + 2 Baterías + Bolso',
    description: `Sony Alpha A7 III full frame mirrorless, 24.2MP. Solo 8 meses de uso profesional en sesiones de retrato y bodas. Cuenta del obturador: 12.400 disparos (muy baja para un A7III). Sensor limpio, sin puntos muertos.

Kit completo:
• Cuerpo Sony A7 III
• Lente kit Sony 28-70mm f/3.5-5.6 (perfecto estado)
• 2 baterías originales NP-FZ100
• Cargador dual
• Bolso Lowepro Fastpack 150 AW II
• Filtro UV 67mm

Precio Sony Colombia: $7.200.000 el body. Colbisnes: $4.200.000 todo.`,
    priceCOP: 4200000,
    city: 'Bogotá',
    condition: 'USADO',
    category: 'Fotografía',
    tipoEntrega: 'AMBOS',
    precioEnvio: 22000,
    images: [
      'https://images.unsplash.com/photo-1516724562728-afc824a36e84?w=900&q=85',
      'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=900&q=85',
    ],
    sellerIdx: 1,
  },
  {
    title: 'Sofá Esquinero en L Cuero Legítimo 100% — 5 Puestos — Color Camel',
    description: `Sofá esquinero en L de cuero legítimo 100% color camel, estructura interna madera de roble. 2 años de uso en sala principal, sin manchas, sin rasgaduras, sin hundimientos en los cojines. Medidas: 280cm x 170cm.

Incluye pufs conjunto, 4 cojines decorativos y limpiador de cuero Leather Master. Se puede desmontar para subir escaleras. Precio tienda Muebles Modena: $5.800.000. Colbisnes: $2.800.000. Solo para Bogotá — incluye transporte e instalación gratis.`,
    priceCOP: 2800000,
    city: 'Bogotá',
    condition: 'USADO',
    category: 'Hogar',
    tipoEntrega: 'EN_PERSONA',
    precioEnvio: 0,
    images: [
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=900&q=85',
      'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=900&q=85',
    ],
    sellerIdx: 0,
  },
  {
    title: 'Guitarra Eléctrica Fender Stratocaster Player Series 2023 + Marshall DSL20',
    description: `Fender Stratocaster Player Series Mexico 2023 en Sonic Blue, pastillas Player Series Alnico V. Solo 5 meses de uso en estudio. Afinadores vintage style, trémolo sincronizado. Sin golpes, trastes casi sin desgaste.

Combo con amplificador Marshall DSL20CR de 20W con reverb. Incluye:
• Funda Fender Deluxe Gig Bag
• Cable Mogami 3m
• Correa Fender 2" cuero
• Juego de cuerdas Ernie Ball 10-46 extra
• Sintonizador Boss TU-3

Precio todo nuevo: $4.900.000. Colbisnes: $2.900.000.`,
    priceCOP: 2900000,
    city: 'Medellín',
    condition: 'USADO',
    category: 'Música',
    tipoEntrega: 'AMBOS',
    precioEnvio: 30000,
    images: [
      'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=900&q=85',
      'https://images.unsplash.com/photo-1525201548942-d8732f6617a0?w=900&q=85',
    ],
    sellerIdx: 1,
  },
  {
    title: 'Air Jordan 1 High OG "Chicago" 2022 Talla 43 — 100% Originales',
    description: `Air Jordan 1 Retro High OG "Chicago" del drop 2022. Talla 43 (US 10). Solo usadas en 2 ocasiones para fotos. Sin defectos, caja original con etiquetas. Certificado de autenticidad StockX adjunto. Valoradas actualmente en $850.000 en resale.

Estado: 9.8/10. Factura de compra Adidas Studio disponible. Verificación de autenticidad gratuita en cualquier tienda de sneakers. Colbisnes: $780.000 — precio firme, son una joya y lo saben.`,
    priceCOP: 780000,
    city: 'Bogotá',
    condition: 'USADO',
    category: 'Ropa y Accesorios',
    tipoEntrega: 'AMBOS',
    precioEnvio: 12000,
    images: [
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&q=85',
      'https://images.unsplash.com/photo-1556906781-9a412961a28c?w=900&q=85',
    ],
    sellerIdx: 0,
  },
  {
    title: 'Samsung 65" Neo QLED 4K QN65QN85C Smart TV 2023 + Soporte de Pared',
    description: `Samsung Neo QLED 65" modelo QN65QN85C 2023, panel Mini LED con quantum dots, 120Hz, HDR10+, Dolby Atmos. Solo 7 meses de uso en sala principal. Sin pixeles muertos, brillo y colores perfectos.

Incluye:
• Control remoto solar original
• Soporte de pared universal 200x200mm instalado (o se entrega con soporte de mesa)
• HDMI 2.1 (2 puertos) para consolas en 4K/120fps
• SmartThings integrado

Precio Samsung Colombia: $4.899.000. Colbisnes: $3.200.000. Solo Cali — se puede transportar con cuidado.`,
    priceCOP: 3200000,
    city: 'Cali',
    condition: 'USADO',
    category: 'Tecnología',
    tipoEntrega: 'EN_PERSONA',
    precioEnvio: 0,
    images: [
      'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=900&q=85',
      'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=900&q=85',
    ],
    sellerIdx: 1,
  },
];

// ── HELPERS ──────────────────────────────────────────────────────────────────

function genRef(ordenId) {
  return 'colbisnes' + ordenId + Date.now();
}

function codigoSecreto() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🗑️  PASO 1: Borrando toda la base de datos...\n');

  // Borrar en orden correcto (dependencias primero)
  await prisma.auditLog.deleteMany();
  await prisma.review.deleteMany();
  await prisma.message.deleteMany();
  await prisma.order.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.product.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  console.log('✅ Base de datos limpia\n');

  // ── CREAR USUARIOS ────────────────────────────────────────────────────────
  console.log('👤 PASO 2: Creando usuarios...\n');

  const usuarios = [];
  for (const u of USUARIOS) {
    const hash = await bcrypt.hash(u.password, 12);
    const user = await prisma.user.create({
      data: {
        email: u.email,
        password: hash,
        name: u.name,
        city: u.city,
        phone: u.phone,
        emailVerified: new Date(),
        kycStatus: 'approved',
        kycLevel: 2,
        kycApprovedAt: new Date(),
        kycDocumentId: JSON.stringify({ demo: true, approvedManually: true }),
      },
    });
    console.log(`✅ Usuario: ${user.name} (${user.email}) — ID: ${user.id}`);
    usuarios.push(user);
  }

  const [carlos, sara] = usuarios;

  // ── CREAR PRODUCTOS ───────────────────────────────────────────────────────
  console.log('\n📦 PASO 3: Creando 10 productos...\n');

  const productos = [];
  for (const p of PRODUCTOS) {
    const { images, sellerIdx, ...data } = p;
    const seller = sellerIdx === 0 ? carlos : sara;
    const prod = await prisma.product.create({
      data: {
        ...data,
        sellerId: seller.id,
        status: 'AVAILABLE',
        images: { create: images.map(url => ({ url })) },
      },
    });
    console.log(`✅ ${prod.title.slice(0, 55)}... | $${prod.priceCOP.toLocaleString('es-CO')} | ${seller.name}`);
    productos.push(prod);
  }

  // ── SIMULAR FLUJOS DE COMPRA ──────────────────────────────────────────────
  console.log('\n💰 PASO 4: Simulando flujos de compra y venta...\n');

  // ── FLUJO 1: Sara compra iPhone (carlos vende) — COMPLETADO ────────────────
  {
    const prod = productos[0]; // iPhone 15 Pro Max
    const precio = prod.priceCOP;
    const comision = Math.round(precio * 0.10);
    const total = precio + comision;

    // Oferta de Sara → Carlos acepta
    const oferta = await prisma.offer.create({
      data: {
        productId: prod.id,
        userId: sara.id,
        amountCOP: precio,
        status: 'ACCEPTED',
        message: 'Hola Carlos, ¿está disponible? Lo tomo al precio publicado.',
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Orden pagada
    const orden = await prisma.order.create({
      data: {
        id: undefined, // cuid auto
        productId: prod.id,
        buyerEmail: sara.email,
        metodoPago: 'ONLINE',
        estado: 'COMPLETADO',
        totalPagado: total,
        comision,
        recibeVendedor: precio,
        txHashPago: genRef('flujo1'),
        pagoLiberado: true,
        pagoLiberadoAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        enviadoAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        numeroGuia: 'SRV-20241501-CO',
        transportadora: 'Servientrega',
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Producto vendido
    await prisma.product.update({
      where: { id: prod.id },
      data: {
        status: 'SOLD',
        acceptedOfferId: oferta.id,
        soldAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        paidAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Reseña de Sara a Carlos
    await prisma.review.create({
      data: {
        productId: prod.id,
        fromUserId: sara.id,
        toUserId: carlos.id,
        rating: 5,
        comment: 'Carlos es un vendedor 10/10. iPhone llegó en perfectas condiciones, bien empacado. Proceso rapidísimo y honesto.',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });

    // Mensajes del chat
    const msgs = [
      { from: sara, to: carlos, content: 'Hola Carlos, ¿está disponible el iPhone? Me interesa.', ago: 8 },
      { from: carlos, to: sara, content: 'Sí Sara, está disponible. ¿Tienes alguna duda?', ago: 7.9 },
      { from: sara, to: carlos, content: 'Perfecto. ¿Puedo pagar por Colbisnes para que sea seguro?', ago: 7.8 },
      { from: carlos, to: sara, content: 'Claro, así es mejor para los dos. Acepto la oferta y procedes con el pago.', ago: 7.7 },
      { from: sara, to: carlos, content: '¡Listo! Ya hice el pago. Gracias Carlos, muy amable.', ago: 6.9 },
    ];
    for (const m of msgs) {
      await prisma.message.create({
        data: {
          fromUserId: m.from.id,
          toUserId: m.to.id,
          productId: prod.id,
          content: m.content,
          read: true,
          createdAt: new Date(Date.now() - m.ago * 24 * 60 * 60 * 1000),
        },
      });
    }
    console.log(`✅ FLUJO 1 COMPLETADO — Sara compró iPhone a Carlos — Wompi — Reseña 5★`);
  }

  // ── FLUJO 2: Carlos compra PS5 (sara vende) — COMPLETADO ──────────────────
  {
    const prod = productos[2]; // PS5
    const precio = prod.priceCOP;
    const comision = Math.round(precio * 0.03); // contra entrega
    const total = precio + comision;

    const oferta = await prisma.offer.create({
      data: {
        productId: prod.id,
        userId: carlos.id,
        amountCOP: precio,
        status: 'ACCEPTED',
        message: 'Sara, me interesa el PS5. Lo compro contra entrega.',
        createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      },
    });

    const orden = await prisma.order.create({
      data: {
        productId: prod.id,
        buyerEmail: carlos.email,
        metodoPago: 'CONTRA_ENTREGA',
        estado: 'COMPLETADO',
        totalPagado: total,
        comision,
        recibeVendedor: precio,
        codigoSecreto: codigoSecreto(),
        pagoLiberado: true,
        pagoLiberadoAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        enviadoAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        numeroGuia: 'INT-20241823-CO',
        transportadora: 'Interrapidísimo',
        createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.product.update({
      where: { id: prod.id },
      data: {
        status: 'SOLD',
        acceptedOfferId: oferta.id,
        soldAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        paidAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      },
    });

    // Reseña de Carlos a Sara
    await prisma.review.create({
      data: {
        productId: prod.id,
        fromUserId: carlos.id,
        toUserId: sara.id,
        rating: 5,
        comment: 'Sara excelente vendedora. PS5 llegó perfecto, tal como lo describió. Super recomendada.',
        createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
      },
    });
    console.log(`✅ FLUJO 2 COMPLETADO — Carlos compró PS5 a Sara — Contra Entrega — Reseña 5★`);
  }

  // ── FLUJO 3: Oferta activa negociando (MacBook) ────────────────────────────
  {
    const prod = productos[1]; // MacBook Pro M3
    // Sara hizo oferta, Carlos no ha respondido
    await prisma.offer.create({
      data: {
        productId: prod.id,
        userId: sara.id,
        amountCOP: 5900000,
        status: 'PENDING',
        message: 'Carlos, ¿aceptas $5.900.000? La tomo hoy mismo.',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    });
    await prisma.message.create({
      data: {
        fromUserId: sara.id,
        toUserId: carlos.id,
        productId: prod.id,
        content: 'Hola Carlos! Vi tu MacBook Pro M3, me interesa mucho. ¿Tienes fotos del estado de la pantalla?',
        read: false,
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
    });
    await prisma.message.create({
      data: {
        fromUserId: sara.id,
        toUserId: carlos.id,
        productId: prod.id,
        content: 'También te mandé una oferta de $5.9M. Si la aceptas la proceso hoy mismo por Colbisnes 🙌',
        read: false,
        createdAt: new Date(Date.now() - 2.9 * 60 * 60 * 1000),
      },
    });
    console.log(`⏳ FLUJO 3 EN NEGOCIACIÓN — Sara ofreció $5.9M por MacBook de Carlos (pendiente)`);
  }

  // ── FLUJO 4: Producto disponible con múltiples ofertas (Sony A7 III) ────────
  {
    const prod = productos[5]; // Sony A7 III
    await prisma.offer.create({
      data: {
        productId: prod.id,
        userId: carlos.id,
        amountCOP: 3800000,
        status: 'PENDING',
        message: '¿Puedes incluir el segundo lente? Ofrezco $3.8M',
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      },
    });
    console.log(`⏳ FLUJO 4 EN NEGOCIACIÓN — Carlos ofreció $3.8M por Sony A7 III de Sara`);
  }

  // ── RESUMEN FINAL ─────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(65));
  console.log('🎉 COLBISNES SEED COMPLETADO\n');
  console.log('USUARIOS:');
  for (const u of usuarios) {
    console.log(`  • ${u.name} — ${u.email} — pass: Colbisnes2025!`);
  }

  const totalProductos = await prisma.product.count();
  const totalOrdenes = await prisma.order.count();
  const totalOfertas = await prisma.offer.count();
  const totalReseñas = await prisma.review.count();
  const totalMensajes = await prisma.message.count();

  console.log(`\nESTADO BD:`);
  console.log(`  • ${totalProductos} productos`);
  console.log(`  • ${totalOrdenes} órdenes`);
  console.log(`  • ${totalOfertas} ofertas`);
  console.log(`  • ${totalReseñas} reseñas`);
  console.log(`  • ${totalMensajes} mensajes`);
  console.log('\n✅ TODO LISTO. Colbisnes está como un reloj suizo.');
}

main()
  .catch(e => { console.error('❌ ERROR:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
