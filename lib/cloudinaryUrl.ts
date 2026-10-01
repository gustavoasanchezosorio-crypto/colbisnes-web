// Inserta la transformación f_auto,q_auto en una URL de Cloudinary para que el
// navegador reciba el formato más liviano que soporte (WebP/AVIF en vez del
// JPEG que sube el backend, ver "format: jpg" en app/api/upload-images/route.ts
// y app/api/upload/route.ts) y una compresión ajustada automáticamente por
// Cloudinary según el contenido de cada foto, sin pérdida visible. Cloudinary
// genera y cachea esa variante la primera vez que alguien la pide; el archivo
// original subido no se toca ni se duplica.
//
// Hace falta esta función porque next.config.ts tiene `images.unoptimized: true`
// (para evitar pelear con una CVE de sharp, ver el comentario ahí) — eso apaga
// por completo el optimizador de next/image en todo el sitio, así que la única
// forma de pedir un formato/calidad mejor es por parámetros en la propia URL de
// Cloudinary, no por Next.
//
// Es un no-op seguro para cualquier URL que no sea de Cloudinary: logos propios
// servidos desde /public, avatares de Google/GitHub por login OAuth (ver
// remotePatterns en next.config.ts) o una vista previa local (blob:/data:) antes
// de subir una foto. Por eso se puede envolver cualquier `src` de <img> con esta
// función sin tener que verificar antes de dónde viene.
export function cldOptimizar(url: string | undefined | null): string | undefined {
  if (!url) return url ?? undefined;
  if (!url.startsWith("https://res.cloudinary.com/")) return url;

  const MARCADOR = "/upload/";
  const i = url.indexOf(MARCADOR);
  if (i === -1) return url; // URL de cloudinary con forma inesperada: se deja intacta

  const resto = url.slice(i + MARCADOR.length);
  if (resto.startsWith("f_auto")) return url; // ya tiene transformación — no duplicar

  return url.slice(0, i + MARCADOR.length) + "f_auto,q_auto/" + resto;
}
