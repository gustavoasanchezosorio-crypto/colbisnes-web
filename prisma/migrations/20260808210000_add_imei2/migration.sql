-- Segundo IMEI: casi todos los celulares que se venden hoy son de dos SIM y traen
-- un IMEI por ranura. Queda NULL en tablets, módems y equipos de una sola SIM.
--
-- Columna nullable y sin valor por defecto, igual que las tres de la migración
-- anterior: Postgres solo toca el catálogo, no reescribe la tabla, y las
-- publicaciones que ya existen no se bloquean ni un instante.
ALTER TABLE "Product" ADD COLUMN "imei2" TEXT;

-- La revisión de equipo repetido es CRUZADA (el IMEI 1 de una publicación se busca
-- también entre los IMEI 2 de las demás), así que necesita índice en las dos
-- columnas. Sin él, cada publicación de Tecnologia recorre la tabla entera.
CREATE INDEX "Product_imei2_idx" ON "Product"("imei2");
