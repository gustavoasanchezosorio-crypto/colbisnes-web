const fs = require("fs");
const { login, api } = require("./qa-lib");

const CATEGORIES = ["Vehiculos", "Inmuebles", "Tecnologia", "Hogar", "Moda", "Mascotas", "Ninos", "Deportes", "Empleo", "Servicios", "Otros"];
const CITIES = ["Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena"];
const CONDITIONS = ["NUEVO", "USADO", "REACONDICIONADO"];

const TITLES = [
  "iPhone 13 Pro 256GB", "Bicicleta montañera Trek", "Sofá seccional 3 puestos", "Nevera LG No Frost",
  "Portátil Lenovo ThinkPad", "Chaqueta de cuero talla M", "Cama para perro grande", "Coche para bebé Chicco",
  "Balón de fútbol profesional", "Servicio de diseño gráfico freelance", "Carro Renault Sandero 2019",
  "Apartamento en arriendo 2 alcobas", "Televisor Samsung 55 pulgadas", "Mesa de comedor 6 puestos",
  "Zapatillas Nike Air talla 42", "Jaula para gato mediana", "Silla alta para bebé", "Raqueta de tenis Wilson",
  "Clases de inglés online", "Moto Yamaha FZ 2020", "Lote en Cundinamarca", "Cámara Canon EOS Rebel",
  "Set de ollas Imusa", "Bolso de cuero genuino", "Correa para perro grande", "Tenis para niño talla 30",
  "Guantes de boxeo Everlast", "Reparación de computadores a domicilio", "Camioneta Chevrolet Spark GT",
  "Casa campestre en Girardot", "Auriculares Sony inalámbricos", "Escritorio de oficina en madera",
  "Vestido de fiesta talla S", "Comedero automático para mascotas", "Triciclo para niños", "Pesas y mancuernas set",
  "Clases de matemáticas particulares", "Camión NPR Chevrolet 2015", "Bodega en zona industrial",
  "Tablet Samsung Galaxy Tab", "Juego de comedor vintage", "Jean Levi's talla 32", "Transportadora para mascotas",
  "Andador para bebé", "Bicicleta estática", "Servicio de plomería urgente", "Moto Suzuki GN125",
  "Finca cafetera en Quindío", "Router WiFi 6 TP-Link", "Cómoda de madera maciza",
];

async function main() {
  const accounts = JSON.parse(fs.readFileSync("/tmp/qa-test/accounts.json", "utf8"));
  const sellers = accounts.filter(a => a.role === "seller");

  const sellerSessions = [];
  for (const s of sellers) {
    const { cookie, session } = await login(s.email, s.password);
    if (!session?.user?.id) { console.error("No se pudo loguear", s.email); continue; }
    sellerSessions.push({ ...s, cookie });
  }
  console.log(`Sesiones activas: ${sellerSessions.length}/${sellers.length}`);

  const created = [];
  const errors = [];

  for (let i = 0; i < 50; i++) {
    const seller = sellerSessions[i % sellerSessions.length];
    const title = `[QA-TEST] ${TITLES[i % TITLES.length]} #${i + 1}`;
    const category = CATEGORIES[i % CATEGORIES.length];
    const city = CITIES[i % CITIES.length];
    const condition = CONDITIONS[i % CONDITIONS.length];
    const priceCOP = 20000 + (i * 37000) % 4800000; // rango variado 20k - ~4.8M COP

    const { status, body } = await api("/api/products", {
      method: "POST",
      cookie: seller.cookie,
      body: {
        title,
        description: `Producto de prueba automatizada (QA) #${i + 1}. Categoría ${category}. Este anuncio es parte de pruebas internas y será eliminado.`,
        priceCOP,
        city,
        condition,
        category,
      },
    });

    if (status === 201) {
      created.push({ id: body.id, title, sellerId: seller.id, sellerEmail: seller.email, priceCOP, category, city, condition });
      process.stdout.write(".");
    } else {
      errors.push({ i, status, body, seller: seller.email });
      process.stdout.write("X");
    }
  }
  console.log("");

  fs.writeFileSync("/tmp/qa-test/products.json", JSON.stringify(created, null, 2));
  console.log(`\nCreados: ${created.length}/50. Errores: ${errors.length}`);
  if (errors.length) {
    console.log("Detalle de errores:");
    errors.forEach(e => console.log(JSON.stringify(e)));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
