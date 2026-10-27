// Decisión 2026-10-27: todos los títulos de publicación se guardan en MAYÚSCULAS.
// Centralizado aquí porque se usa en 3 sitios que tienen que coincidir siempre:
// crear (POST /api/products), editar (PATCH /api/products/[id]) y el script de
// migración que normaliza los títulos ya publicados antes de este cambio
// (scripts/mayusculas-titulos-productos.js). Si el criterio cambiara (p.ej. a
// "Title Case"), basta tocarlo acá.
export function normalizarTituloProducto(title: string): string {
  return title.trim().toUpperCase();
}
