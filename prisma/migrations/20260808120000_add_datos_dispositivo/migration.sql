-- Datos declarados por el vendedor para dispositivos con IMEI (categoría "Tecnologia").
-- Colbisnes NO verifica ninguno de los tres; ver lib/dispositivos.ts.
--
-- Las tres columnas son NULL sin valor por defecto a propósito: así Postgres solo
-- toca el catálogo y no reescribe la tabla, la migración es instantánea y no
-- bloquea las publicaciones que ya existen.
ALTER TABLE "Product" ADD COLUMN "imei" TEXT;
ALTER TABLE "Product" ADD COLUMN "saludBateria" INTEGER;
ALTER TABLE "Product" ADD COLUMN "piezasReemplazadas" TEXT;

-- Lo consulta la revisión de IMEI repetido, que corre en cada publicación y en
-- cada edición de la categoría Tecnologia. Sin índice eso es un recorrido
-- completo de la tabla de productos.
--
-- Va en esta misma migración porque la columna acaba de nacer y está vacía: el
-- índice se crea al instante. Crearlo más adelante, con el catálogo lleno,
-- bloquearía las escrituras de Product mientras se construye.
CREATE INDEX "Product_imei_idx" ON "Product"("imei");
