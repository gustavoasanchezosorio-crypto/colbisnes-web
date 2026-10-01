// Serializa datos para un <script type="application/ld+json"> de forma segura para
// incrustar con dangerouslySetInnerHTML. JSON.stringify no escapa "<", así que un
// valor con contenido de usuario (ej. el título o la descripción que escribió un
// vendedor al publicar) que contenga literalmente "</script>" rompería el tag: el
// parser de HTML del navegador actúa ANTES de que nada intente leer esto como JSON, y
// terminaría el script ahí mismo — lo que siga se interpretaría como HTML/JS nuevo
// (inyección clásica, ejecuta para cada visitante que vea la página, sin que nadie
// haga clic en nada).
//
// < es el mismo carácter que "<" para cualquier parser JSON/JS (incluido el de
// Google al leer el JSON-LD) — solo deja de ser reconocible como apertura de
// "</script" al escanear el HTML crudo, que es el único problema real.
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
