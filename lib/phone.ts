// Normaliza números de teléfono colombianos a formato E.164 (+57XXXXXXXXXX) para poder
// comparar de forma consistente números que el usuario escribió con distinto formato
// (con o sin +57, con espacios o guiones, etc.). Se usa tanto para enviar WhatsApp como
// para verificar la lista negra de usuarios bloqueados por incumplimiento en contraentrega.
export function normalizarTelefonoCO(telefono: string): string {
  let limpio = telefono.replace(/[^\d+]/g, "");
  if (limpio.startsWith("+")) return limpio;
  if (limpio.startsWith("57")) return "+" + limpio;
  if (limpio.length === 10) return "+57" + limpio;
  return "+" + limpio;
}
