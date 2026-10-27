// IndexNow: protocolo que soportan Bing, Yandex, Seznam y Naver (Google no lo usa,
// sigue con su propio rastreo) para avisarles AL INSTANTE cuando una URL es nueva o
// cambió, en vez de esperar a que su rastreador la encuentre por su cuenta — para un
// marketplace con publicaciones constantes esto puede ser la diferencia entre que un
// producto nuevo aparezca en Bing en minutos u horas.
//
// La key (01855b2a...) se generó una sola vez con crypto.randomBytes y se publicó en
// public/01855b2a3fc0fad57f9b116266eace97.txt (el archivo DEBE existir en esa ruta
// exacta con la key como único contenido: así IndexNow verifica que quien pide la
// indexación de verdad controla el dominio). Si algún día se regenera la key, hay que
// renombrar/recrear ese archivo también, o todos los pings empezarán a fallar en
// silencio.
const INDEXNOW_KEY = "01855b2a3fc0fad57f9b116266eace97";
const SITE_URL = process.env.NEXT_PUBLIC_URL || process.env.NEXTAUTH_URL || "https://colbisnes.com";

// Fire-and-forget a propósito: nunca debe bloquear ni tumbar la publicación de un
// producto porque IndexNow esté lento o caído. Quien llama a esto NO debe hacer
// `await` si quiere que la respuesta al usuario salga de inmediato (ver uso en
// app/api/products/route.ts) — el catch de acá existe solo para que una promesa
// rechazada no quede como "unhandled rejection" en los logs del server.
export function pingIndexNow(url: string): void {
  // No molestar a Bing/Yandex con URLs de localhost o de un preview de Railway:
  // solo tiene sentido avisar sobre el dominio real de producción.
  if (!SITE_URL.includes("colbisnes.com")) return;

  fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: new URL(SITE_URL).host,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
      urlList: [url],
    }),
  }).catch((error) => {
    console.error("[indexNow] No se pudo avisar la URL (no bloquea nada):", error);
  });
}
