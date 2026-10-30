-- Tabla de tarifas de envío nacional (2026-10-29, ver lib/tarifasEnvio.ts): para poder
-- calcular una tarifa de respaldo cuando el vendedor no fija su propio precioEnvio, hace
-- falta saber (a) a qué ciudad va el paquete y (b) cuánto pesa aproximadamente. Antes de
-- estas tres columnas esa combinación quedaba cobrando $0 de envío sin que nadie se
-- enterara — incidente del café Bogotá→Medellín, 2026-10-27.
--
-- Las tres son nullable y sin valor por defecto, mismo patrón que el resto de columnas
-- agregadas sobre la marcha en este proyecto (ver 20260808210000_add_imei2): Postgres solo
-- toca el catálogo, no reescribe la tabla, y nada de lo que ya existe se bloquea.

-- A qué ciudad quiere el comprador que le llegue el paquete. Vive en el perfil y se
-- copia a cada orden al crearla (ver lib/direccionOrden.ts), igual que direccionEnvio.
ALTER TABLE "User" ADD COLUMN "ciudadDestino" TEXT;

-- Bracket de peso aproximado del producto ("MENOS_1KG" | "DE_1_A_5KG" | "DE_5_A_20KG" |
-- "MAS_20KG", ver PESOS_PRODUCTO en lib/entrega.ts). Solo tiene sentido en productos con
-- envío; en EN_PERSONA queda NULL a propósito.
ALTER TABLE "Product" ADD COLUMN "pesoAprox" TEXT;

-- Copia congelada de User.ciudadDestino al momento de crear/refrescar la orden — mismo
-- motivo y mismo patrón que Order.direccionEnvio.
ALTER TABLE "Order" ADD COLUMN "ciudadDestino" TEXT;
