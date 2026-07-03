import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { rateLimit, getIP } from "@/lib/rateLimit";

const anthropic = new Anthropic();

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const MAX_BASE64_LENGTH = 7_000_000; // ~5MB de imagen decodificada

const AnalisisSchema = z.object({
  esProducto: z.boolean(),
  tipoArticulo: z.string(),
  marca: z.string().nullable(),
  modelo: z.string().nullable(),
  color: z.string().nullable(),
  tituloSugerido: z.string(),
  confianza: z.enum(["alta", "media", "baja"]),
});

const SYSTEM_PROMPT =
  'Eres "Siames", el asistente de Colbisnes, un marketplace colombiano de compra/venta. Un vendedor esta subiendo la foto de un producto para publicarlo y tu tarea es identificarlo con la mayor precision posible: tipo de articulo, marca, modelo especifico (ej. distinguir "iPhone 11" de "iPhone 17", o "PlayStation 4" de "PlayStation 5" por sus detalles visuales) y color principal. Si no estas segura del modelo exacto, da tu mejor estimacion razonada en vez de dejarlo vacio, pero baja el nivel de "confianza". Si la foto no muestra claramente un producto vendible (borrosa, una persona, un paisaje, una pantalla en blanco, etc.), responde con esProducto=false. El "tituloSugerido" debe ser un titulo corto y natural en español, como lo escribiria un vendedor colombiano (ej. "iPhone 11 blanco 64GB", "Tenis Nike Air Force 1 negros"), sin precio ni estado de uso.';

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
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
      return json({ error: "Siames ya analizó varias fotos seguidas. Espera un momento e intenta de nuevo." }, 429);
    }

    const body = await request.json().catch(() => ({}));
    const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    const mediaType = typeof body.mediaType === "string" ? body.mediaType : "";

    if (!imageBase64) return json({ error: "Falta la imagen" }, 400);
    if (!(MEDIA_TYPES as readonly string[]).includes(mediaType)) {
      return json({ error: "Formato de imagen no soportado" }, 400);
    }
    if (imageBase64.length > MAX_BASE64_LENGTH) return json({ error: "La imagen es muy pesada" }, 400);

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY no está configurada");
      return json({ error: "Siames no puede analizar fotos en este momento" }, 503);
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
            {
              type: "image",
              source: { type: "base64", media_type: mediaType as (typeof MEDIA_TYPES)[number], data: imageBase64 },
            },
            { type: "text", text: "Analiza esta foto de un producto que un vendedor quiere publicar." },
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
        tipoArticulo: analisis.tipoArticulo,
        marca: analisis.marca,
        modelo: analisis.modelo,
        color: analisis.color,
        confianza: analisis.confianza,
      },
    });
  } catch (error) {
    console.error("Error en /api/blu/analizar-foto:", error);
    return json({ error: "Siames no pudo analizar la foto. Intenta de nuevo en un momento." }, 500);
  }
}
