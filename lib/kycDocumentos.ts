// Qué documentos hay archivados de una verificación de identidad, y si alcanzan para
// que un admin pueda aprobarla a mano.
//
// Por qué existe este archivo (2026-09-02): el panel de admin tenía el botón
// "✅ Aprobar" activo incluso cuando la ficha decía "Sin documentos adjuntos", y el
// endpoint detrás no miraba nada — con ser admin y tener el 2FA bastaba. De 16 cuentas
// verificadas, 7 se aprobaron así: nadie miró nunca un documento de esas personas.
//
// No fue descuido. La verificación con Didit se marcaba "en proceso" apenas se generaba
// el enlace, así que quien la abandonaba quedaba trabado para siempre, escribía al admin
// y el admin lo desbloqueaba a mano. Esa trampa se arregló aparte (ver app/kyc/page.tsx);
// esto cierra la puerta que quedaba abierta.
//
// El campo `kycDocumentId` guarda DOS cosas distintas según por dónde entró la persona,
// y de ahí sale toda la lógica de aquí:
//
//   · Didit ......... el id de sesión pelado ("abc-123"). Las fotos las tiene Didit, no
//                     nosotros. No hay nada que un humano pueda mirar en el panel.
//   · Subida manual . un JSON {selfieUrl, cedulaUrl} con las fotos en Cloudinary. Eso sí
//                     se puede revisar a ojo.

export interface DocumentosKyc {
  selfieUrl?: string;
  cedulaUrl?: string;
}

/**
 * Saca las fotos archivadas de `kycDocumentId`. Devuelve vacío cuando no hay nada que
 * mirar, que es el caso de todo el que pasó por Didit (ahí el valor es un id de sesión,
 * no un JSON, y el parse falla a propósito).
 */
export function documentosAdjuntos(kycDocumentId: string | null | undefined): DocumentosKyc {
  if (!kycDocumentId) return {};
  try {
    const d = JSON.parse(kycDocumentId);
    if (!d || typeof d !== "object") return {};
    return {
      selfieUrl: typeof d.selfieUrl === "string" ? d.selfieUrl : undefined,
      cedulaUrl: typeof d.cedulaUrl === "string" ? d.cedulaUrl : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Si un admin puede aprobar esta verificación a mano.
 *
 * Se exige la foto de la CÉDULA, no la selfie: la pregunta que responde una aprobación
 * manual es "¿esta persona es quien dice ser?", y eso solo lo contesta el documento. Una
 * selfie sola no prueba nada — cualquiera se toma una.
 */
export function puedeAprobarseAMano(docs: DocumentosKyc): boolean {
  return typeof docs.cedulaUrl === "string" && docs.cedulaUrl.trim().length > 0;
}

export const MOTIVO_SIN_DOCUMENTOS =
  "Esta cuenta no tiene cédula archivada, así que no hay nada que revisar. Aprobarla sería decir que verificaste a alguien sin haberle visto el documento. Pídele que reintente la verificación desde colbisnes.com/kyc.";
