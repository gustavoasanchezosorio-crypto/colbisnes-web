-- Soporte de "varias unidades por publicación" (2026-10-31): hasta ahora un Product
-- siempre representaba exactamente una unidad vendible — Product.status actúa como un
-- lock de una sola transacción por fila, y toda la máquina de escrow (checkout, webhook
-- de Wompi, confirm-delivery) asume eso. Artículos consumibles/reponibles (café, insumos)
-- no caben ahí: el vendedor quiere seguir vendiendo la misma publicación después de la
-- primera venta, sin que quede "agotada" de una.
--
-- En vez de reescribir esa máquina de estados para soportar varios compradores
-- concurrentes sobre la misma fila (riesgoso: confirm-delivery hoy asume una sola orden
-- activa por producto, ver app/api/payments/confirm-delivery/route.ts), la solución es
-- más simple: cada Product sigue representando una sola "ronda" de venta, pero ahora esa
-- ronda puede cubrir varias unidades (stockQuantity). Al completarse la venta, si queda
-- stock, se clona una fila Product nueva con el resto (ver lib/productLote.ts) — la
-- publicación original queda SOLD, pero el comprador ve una publicación idéntica
-- disponible de nuevo, sin que el vendedor tenga que volver a publicar a mano.
--
-- Mismo patrón nullable/con-default que el resto de columnas agregadas sobre la marcha
-- en este proyecto: Postgres solo toca el catálogo, no reescribe la tabla.

-- Unidades disponibles en esta publicación. Default 1 para no cambiar el comportamiento
-- de ningún producto ya existente.
ALTER TABLE "Product" ADD COLUMN "stockQuantity" INTEGER NOT NULL DEFAULT 1;

-- Cuántas unidades de Product.stockQuantity cubre esta orden. Default 1 por la misma
-- razón; solo el checkout online (lib/checkoutOnline.ts) la deja mayor a 1 por ahora.
ALTER TABLE "Order" ADD COLUMN "cantidad" INTEGER NOT NULL DEFAULT 1;
