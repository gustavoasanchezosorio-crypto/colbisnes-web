import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { rateLimit, getIP } from "@/lib/rateLimit";
import { CATEGORIES } from "@/lib/theme";

const anthropic = new Anthropic();

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const HEIC_TYPES = ["image/heic", "image/heif"];
const MAX_BASE64_LENGTH = 7_000_000; // ~5MB de imagen decodificada por foto
const MAX_IMAGENES = 5;

const CATEGORIA_IDS = CATEGORIES.map(c => c.id) as [string, ...string[]];

const AnalisisSchema = z.object({
  esProducto: z.boolean(),
  tipoArticulo: z.string(),
  marca: z.string().nullable(),
  modelo: z.string().nullable(),
  color: z.string().nullable(),
  tituloSugerido: z.string(),
  descripcionSugerida: z.string(),
  categoriaSugerida: z.enum(CATEGORIA_IDS),
  condicionSugerida: z.enum(["NUEVO", "USADO"]),
  confianza: z.enum(["alta", "media", "baja"]),
});

const SYSTEM_PROMPT =
  `Eres "Chucho Bot", el asistente de Colbisnes, un marketplace colombiano de compra/venta. Un vendedor esta subiendo fotos de un producto para publicarlo (puede haber varias fotos del mismo articulo desde distintos angulos) y tu tarea es generar una sugerencia completa de publicacion, como lo hacen apps como Wallapop: identifica el articulo con la mayor precision posible (tipo, marca, modelo especifico -ej. distinguir "iPhone 11" de "iPhone 17", o "PlayStation 4" de "PlayStation 5" por sus detalles visuales-, color principal), su estado aparente (NUEVO o USADO segun lo que se vea en la foto), y redacta un titulo corto y natural en español como lo escribiria un vendedor colombiano (ej. "iPhone 11 blanco 64GB", "Tenis Nike Air Force 1 negros"), sin precio. Ademas redacta una descripcion breve (2-4 frases) destacando caracteristicas visibles relevantes para un comprador, en español natural, sin inventar datos que no se puedan ver en la foto (no inventes especificaciones tecnicas que no sean evidentes). Elige la categoria mas adecuada de la lista permitida. Si no estas seguro del modelo exacto, da tu mejor estimacion razonada en vez de dejarlo vacio, pero baja el nivel de "confianza". Si ninguna foto muestra claramente un producto vendible (borrosa, una persona, un paisaje, una pantalla en blanco, etc.), responde con esProducto=false.`;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

async function aJpegBase64(imageBase64: string, mediaType: string): Promise<{ base64: string; mediaType: string }> {
  if (!HEIC_TYPES.includes(mediaType)) return { base64: imageBase64, mediaType };
  // Conversión server-side de respaldo: si el navegador no pudo convertir el HEIC/HEIF
  // (p.ej. Live Photos multi-imagen, o un navegador sin soporte para el worker de heic2any),
  // igual logramos analizarlo aquí en el servidor.
  const heicConvert = (await import("heic-convert")).default as any;
  const inputBuffer = Buffer.from(imageBase64, "base64");
  const outputBuffer = await heicConvert({ buffer: inputBuffer, format: "JPEG", quality: 0.85 });
  return { base64: Buffer.from(outputBuffer).toString("base64"), mediaType: "image/jpeg" };
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return json({ error: "Debes iniciar sesión para usar esta función" }, 401);
    }

    const identifier = session.user.id || getIP(request);
    const rl = rateLimit(`blu-foto:${identifier}`, { limit: 15, windowSeconds: 600 });
    if (!rl.allowed) {
      return json({ error: "Chucho Bot ya analizó varias fotos seguidas. Espera un momento e intenta de nuevo." }, 429);
    }

    const body = await request.json().catch(() => ({}));

    // Acepta tanto el formato nuevo (varias fotos) como el antiguo (una sola foto), por compatibilidad.
    type ImagenEntrada = { imageBase64: string; mediaType: string };
    let imagenes: ImagenEntrada[] = [];
    if (Array.isArray(body.imagenes)) {
      imagenes = body.imagenes
        .filter((i: any) => typeof i?.imageBase64 === "string" && typeof i?.mediaType === "string")
        .slice(0, MAX_IMAGENES);
    } else if (typeof body.imageBase64 === "string") {
      imagenes = [{ imageBase64: body.imageBase64, mediaType: typeof body.mediaType === "string" ? body.mediaType : "" }];
    }

    if (!imagenes.length) return json({ error: "Falta la imagen" }, 400);

    for (const img of imagenes) {
      const tipoValido = (MEDIA_TYPES as readonly string[]).includes(img.mediaType) || HEIC_TYPES.includes(img.mediaType);
      if (!tipoValido) {
        return json({ error: "Chucho Bot no reconoce este formato de foto (prueba con JPG o PNG)." }, 400);
      }
      if (img.imageBase64.length > MAX_BASE64_LENGTH) return json({ error: "La imagen es muy pesada" }, 400);
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY no está configurada");
      return json({ error: "Chucho Bot no puede analizar fotos en este momento" }, 503);
    }

    let convertidas: { base64: string; mediaType: string }[];
    try {
      convertidas = await Promise.all(imagenes.map(img => aJpegBase64(img.imageBase64, img.mediaType)));
    } catch (e) {
      console.error("Error convirtiendo HEIC en el servidor:", e);
      return json({ error: "Chucho Bot no pudo procesar esta foto (formato HEIC no válido). Prueba con JPG o PNG." }, 400);
    }

    const message = await anthropic.beta.messages.parse({
      model: "claude-opus-4-7",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "high", format: zodOutputFormat(AnalisisSchema) },
      messages: [
        {
          role: "user",
          content: [
            ...convertidas.map(img => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: img.mediaType as (typeof MEDIA_TYPES)[number], data: img.base64 },
            })),
            { type: "text", text: "Analiza estas fotos de un producto que un vendedor quiere publicar y genera una sugerencia completa (titulo, descripcion, categoria y condicion)." },
          ],
        },
      ],
    });

    const analisis = message.parsed_output;
    if (!analisis || !analisis.esProducto || analisis.confianza === "baja") {
      return json({ sugerencia: null });
    }

    return json({
      sugerencia: {
        tituloSugerido: analisis.tituloSugerido,
        descripcionSugerida: analisis.descripcionSugerida,
        categoriaSugerida: analisis.categoriaSugerida,
        condicionSugerida: analisis.condicionSugerida,
        tipoArticulo: analisis.tipoArticulo,
        marca: analisis.marca,
        modelo: analisis.modelo,
        color: analisis.color,
        confianza: analisis.confianza,
      },
    });
  } catch (error) {
    console.error("Error en /api/blu/analizar-foto:", error);
    return json({ error: "Chucho Bot no pudo analizar la foto. Intenta de nuevo en un momento." }, 500);
  }
}
