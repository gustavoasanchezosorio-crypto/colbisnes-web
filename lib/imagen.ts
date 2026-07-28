// Utilidades de imagen para el cliente (compresión + normalización de HEIC).
// Extraídas de app/page.tsx para poder reusarlas también al EDITAR una publicación
// (app/product/[id]/editar) sin duplicar la lógica ni tocar el flujo de publicar.
//
// OJO: usan APIs del navegador (document, Image, FileReader) — solo deben invocarse
// desde componentes cliente, dentro de manejadores de eventos. No las llames en el
// servidor.

// HEIC/HEIF (fotos de iPhone) no lo decodifica <canvas> en la mayoría de navegadores,
// así que primero se convierte con una librería dedicada (heic2any) a JPEG real.
export async function normalizarHeic(file: File): Promise<File> {
  const esHeic = /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (!esHeic) return file;
  try {
    // Con timeout: algunos HEIC (ej. contenedores multi-imagen de Live Photos) hacen que
    // heic2any se cuelgue en vez de fallar rápido. Si tarda demasiado, seguimos con el
    // archivo original — el backend igual lo transcodifica con Cloudinary al subirlo.
    const conversion = (async () => {
      const heic2any = (await import("heic2any")).default;
      const resultado = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
      const blob = Array.isArray(resultado) ? resultado[0] : resultado;
      return new File([blob], file.name.replace(/\.hei[cf]$/i, ".jpg"), { type: "image/jpeg" });
    })();
    const timeout = new Promise<File>((resolve) => setTimeout(() => resolve(file), 8000));
    return await Promise.race([conversion, timeout]);
  } catch {
    // Si la conversión falla (formato corrupto, etc.) seguimos con el archivo original;
    // el backend igual lo transcodifica al subirlo (Cloudinary maneja HEIC/HEIF).
    return file;
  }
}

// Redimensiona (si excede maxAncho) y recomprime la imagen a JPEG. Sirve para no pasar
// el límite de 5MB del endpoint de subida y para acelerar la carga. Ante cualquier fallo
// devuelve el archivo tal cual (nunca bloquea la subida).
export function comprimirImagen(file: File, maxAncho = 1600, calidad = 0.78): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        let { width, height } = img;
        if (width > maxAncho) {
          height = Math.round((height * maxAncho) / width);
          width = maxAncho;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return; }
          const comprimido = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
          resolve(comprimido);
        }, "image/jpeg", calidad);
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
}
