const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SELLER_ID = 'cmqnb793l0000kz04swoassqc'; // Gustavo CEO
const SELLER2_ID = 'cmqnbe60u0001kz04wvkhwl74'; // Gustavo Pruebas (segundo vendedor)

const productos = [
  {
    title: 'iPhone 13 Pro 256GB Sierra Blue',
    description: 'iPhone 13 Pro en excelente estado, sin rayones, cargador original incluido, Face ID funcionando perfectamente. Nunca tuvo golpes ni caídas. Caja original y audífonos.',
    priceCOP: 2800000, city: 'Bogotá', condition: 'USADO', category: 'Tecnología',
    tipoEntrega: 'ENVIO', precioEnvio: 15000, sellerId: SELLER_ID,
    images: ['https://images.unsplash.com/photo-1632661674596-df8be070a5c5?w=800']
  },
  {
    title: 'Bicicleta de montaña Trek Marlin 7',
    description: 'Bicicleta Trek Marlin 7 talla M, componentes Shimano, frenos de disco hidráulicos, horquilla suspensión RockShox. Poco uso, en perfecto estado. Ideal para MTB y ciclovía.',
    priceCOP: 1850000, city: 'Medellín', condition: 'USADO', category: 'Deportes',
    tipoEntrega: 'EN_PERSONA', precioEnvio: 0, sellerId: SELLER2_ID,
    images: ['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800']
  },
  {
    title: 'MacBook Air M2 13" 8GB 256GB',
    description: 'MacBook Air M2 2022, color Midnight, batería al 97%, incluye cargador MagSafe original. Sin rayones, pantalla Liquid Retina impecable. Ideal para trabajo y estudios.',
    priceCOP: 4200000, city: 'Bogotá', condition: 'USADO', category: 'Tecnología',
    tipoEntrega: 'ENVIO', precioEnvio: 20000, sellerId: SELLER_ID,
    images: ['https://images.unsplash.com/photo-1611186871525-7ae5de1a4d4c?w=800']
  },
  {
    title: 'PlayStation 5 + 2 controles + 3 juegos',
    description: 'PS5 edición disco en perfecto estado. Incluye 2 controles DualSense, FIFA 24, Spider-Man 2 y God of War Ragnarök. Todo original, caja incluida. Solo 8 meses de uso.',
    priceCOP: 3100000, city: 'Cali', condition: 'USADO', category: 'Videojuegos',
    tipoEntrega: 'AMBOS', precioEnvio: 25000, sellerId: SELLER2_ID,
    images: ['https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=800']
  },
  {
    title: 'Cámara Sony Alpha ZV-E10 + Lente 16-50mm',
    description: 'Cámara mirrorless Sony ZV-E10 perfecta para contenido digital y fotografía. Lente kit 16-50mm incluido, batería extra, 2 memorias SD de 64GB. Bolso de transporte incluido.',
    priceCOP: 1650000, city: 'Bogotá', condition: 'USADO', category: 'Fotografía',
    tipoEntrega: 'ENVIO', precioEnvio: 18000, sellerId: SELLER_ID,
    images: ['https://images.unsplash.com/photo-1516724562728-afc824a36e84?w=800']
  },
  {
    title: 'Nike Air Jordan 1 Retro High OG Talla 42',
    description: 'Jordan 1 Retro High Chicago 100% originales, talla 42 (US 9). Usadas 2 veces, caja original con etiquetas. Sin defectos. Factura de compra disponible.',
    priceCOP: 680000, city: 'Medellín', condition: 'USADO', category: 'Ropa y Accesorios',
    tipoEntrega: 'AMBOS', precioEnvio: 12000, sellerId: SELLER2_ID,
    images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800']
  },
  {
    title: 'Sofá 3 puestos en cuero genuino café',
    description: 'Sofá 3 puestos en cuero genuino color café oscuro, estructura en madera sólida. 2 años de uso, sin manchas ni rasgaduras. Medidas: 220cm x 85cm. Se entrega en Bogotá.',
    priceCOP: 950000, city: 'Bogotá', condition: 'USADO', category: 'Hogar',
    tipoEntrega: 'EN_PERSONA', precioEnvio: 0, sellerId: SELLER_ID,
    images: ['https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800']
  },
  {
    title: 'Guitarra Fender Stratocaster Mexican + Amplificador',
    description: 'Guitarra eléctrica Fender Stratocaster Player Series Mexico, color Sonic Red. Incluye amplificador Fender Frontman 10G, cable, correa y funda. En excelente estado.',
    priceCOP: 2300000, city: 'Bogotá', condition: 'USADO', category: 'Música',
    tipoEntrega: 'AMBOS', precioEnvio: 22000, sellerId: SELLER2_ID,
    images: ['https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=800']
  },
  {
    title: 'Reloj Casio G-Shock GA-2100 Negro',
    description: 'Casio G-Shock GA-2100 CasiOak original, color negro, comprado en tienda oficial. Solo 3 meses de uso, en perfecto estado con caja y manuales originales.',
    priceCOP: 380000, city: 'Barranquilla', condition: 'USADO', category: 'Accesorios',
    tipoEntrega: 'ENVIO', precioEnvio: 10000, sellerId: SELLER_ID,
    images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800']
  },
  {
    title: 'Samsung 65" QLED 4K Smart TV 2023',
    description: 'Samsung 65 pulgadas QLED 4K modelo QN65Q70C, año 2023. Control original, soporte de mesa y de pared incluidos. Imagen impecable, todos los streaming integrados.',
    priceCOP: 3400000, city: 'Cali', condition: 'USADO', category: 'Tecnología',
    tipoEntrega: 'EN_PERSONA', precioEnvio: 0, sellerId: SELLER2_ID,
    images: ['https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=800']
  }
];

async function crear() {
  console.log('Creando 10 productos demo...\n');
  const creados = [];
  for (const p of productos) {
    const { images, sellerId, ...data } = p;
    const prod = await prisma.product.create({
      data: {
        ...data,
        sellerId,
        status: 'AVAILABLE',
        images: { create: images.map(url => ({ url })) }
      }
    });
    console.log('✅', prod.title, '|', prod.id, '| $' + prod.priceCOP.toLocaleString('es-CO'));
    creados.push(prod.id);
  }
  console.log('\nTotal creados:', creados.length);
  console.log('IDs:', creados.join(', '));
  await prisma.$disconnect();
}

crear().catch(e => { console.error(e); process.exit(1); });
