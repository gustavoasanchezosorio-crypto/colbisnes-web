import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Paleta corporativa (equivalente RGB de lib/theme.ts) para el PDF.
const BLUE  = rgb(0.055, 0.337, 0.753); // #0e56c0
const NAVY  = rgb(0.039, 0.180, 0.420); // #0a2e6b
const GOLD  = rgb(0.780, 0.604, 0.180); // #C79A2E
const INK   = rgb(0.051, 0.106, 0.165); // #0d1b2a
const MUTED = rgb(0.392, 0.455, 0.545); // #64748B
const LINE  = rgb(0.839, 0.886, 0.945); // #d6e2f1
const BGSOFT= rgb(0.933, 0.953, 0.984); // #eef3fb
const GREEN = rgb(0.063, 0.502, 0.239); // #10803d
const WHITE = rgb(1, 1, 1);

export interface ComprobanteInput {
  ordenId: string;
  fecha: Date;
  estado: string;
  metodoPago: string;               // "CONTRA_ENTREGA" | "ONLINE" | ...
  productoTitulo: string;
  compradorEmail: string;
  compradorNombre?: string | null;
  vendedorNombre?: string | null;
  vendedorEmail?: string | null;
  comision: number;
  recibeVendedor: number;           // en contra-entrega == precioBase
  envioCobrado: number;
  totalPagado: number;
  numeroGuia?: string | null;
  transportadora?: string | null;
}

// pdf-lib dibuja con codificación WinAnsi (Latin-1). Cualquier caracter fuera de ese
// rango (emojis, ✓, →, etc.) hace que drawText lance. Los títulos de producto pueden
// traer emojis, así que sanitizamos: reemplazamos algunos comunes y quitamos el resto.
function san(s: string): string {
  if (!s) return "";
  return String(s)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/•/g, "-")
    .replace(/[^\x00-\xFF]/g, "")            // fuera de Latin-1
    .replace(/[\x81\x8D\x8F\x90\x9D]/g, "")  // indefinidos en WinAnsi
    .replace(/[ \t]{2,}/g, " ")              // colapsa espacios (p.ej. donde iba un emoji)
    .trim();
}

const fmtCOP = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

function fmtFecha(dt: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

const LABEL_ESTADO: Record<string, string> = {
  ESPERANDO_COMISION: "Esperando comisión de reserva",
  ESPERANDO_ENVIO: "Reservado — pendiente de despacho",
  EN_CAMINO: "En camino",
  ENTREGADO: "Entregado",
  COMPLETADO: "Completado",
  PAGADO: "Pagado",
};

// Genera el comprobante de la transacción en PDF (una hoja A4). Muestra el desglose
// completo para dar claridad a AMBAS partes: lo que el comprador entrega en efectivo
// al mensajero y lo que recibe el vendedor. Consistente con el checkout: en contra
// entrega el monto al mensajero = recibeVendedor (precioBase) + envioCobrado, y la
// comisión de reserva se pagó aparte por Nequi.
export async function generarComprobantePDF(d: ComprobanteInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Comprobante Colbisnes ${d.ordenId}`);
  pdf.setProducer("Colbisnes");
  pdf.setCreator("colbisnes.com");

  const page = pdf.addPage([595.28, 841.89]); // A4
  const width = 595.28;
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const M = 50;            // margen izquierdo
  const R = width - M;     // borde derecho
  let y = 841.89 - 56;     // cursor (pdf-lib mide y desde abajo)

  const esContra = d.metodoPago === "CONTRA_ENTREGA";
  const alMensajero = Math.round(Number(d.recibeVendedor) + Number(d.envioCobrado || 0));

  // Helpers de dibujo (usan el cursor `y` vigente)
  const at = (s: string, x: number, size: number, font = helv, color = INK) =>
    page.drawText(san(s), { x, y, size, font, color });
  const atR = (s: string, xr: number, size: number, font = helv, color = INK) => {
    const w = font.widthOfTextAtSize(san(s), size);
    page.drawText(san(s), { x: xr - w, y, size, font, color });
  };

  // ── Encabezado ──
  at("COLBISNES", M, 26, bold, BLUE);
  atR("Comprobante de transacción", R, 11.5, bold, MUTED);
  y -= 12;
  atR("colbisnes.com", R, 9, helv, MUTED);
  y -= 16;
  page.drawRectangle({ x: M, y, width: R - M, height: 2.5, color: GOLD });
  y -= 28;

  // ── Metadatos ──
  const meta = (label: string, value: string) => {
    at(label, M, 8.5, bold, MUTED);
    y -= 13;
    at(value, M, 11.5, helv, INK);
    y -= 20;
  };
  meta("N° DE ORDEN", d.ordenId);
  meta("FECHA", fmtFecha(d.fecha));
  meta("ESTADO", LABEL_ESTADO[d.estado] || d.estado);
  meta("MÉTODO DE PAGO", esContra ? "Contra entrega (efectivo + reserva Nequi)" : d.metodoPago);

  y -= 4;
  page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: 1, color: LINE });
  y -= 24;

  // ── Producto y partes ──
  at("PRODUCTO", M, 8.5, bold, MUTED);
  y -= 15;
  at(d.productoTitulo, M, 13, bold, INK);
  y -= 26;

  at("COMPRADOR", M, 8.5, bold, MUTED);
  atR("VENDEDOR", R, 8.5, bold, MUTED);
  y -= 14;
  at(d.compradorNombre || d.compradorEmail, M, 11, helv, INK);
  atR(d.vendedorNombre || d.vendedorEmail || "Vendedor", R, 11, helv, INK);
  y -= 26;

  page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: 1, color: LINE });
  y -= 26;

  // ── Desglose de montos ──
  const row = (label: string, value: string, opts: { strong?: boolean; color?: any } = {}) => {
    at(label, M, 11, helv, MUTED);
    atR(value, R, 11, opts.strong ? bold : helv, opts.color || INK);
    y -= 22;
  };

  at("DETALLE DE PAGOS", M, 8.5, bold, MUTED);
  y -= 22;

  row("Precio del producto", fmtCOP(d.recibeVendedor), { strong: true });
  if (Number(d.envioCobrado) > 0) row("Envío", fmtCOP(d.envioCobrado), { strong: true });
  row("Comisión de reserva (pagada por Nequi)", fmtCOP(d.comision), { strong: true });

  y -= 2;
  page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: 1, color: LINE });
  y -= 26;

  // ── Cajas destacadas ──
  const box = (title: string, value: string, bg: any, fg: any) => {
    const h = 52;
    page.drawRectangle({ x: M, y: y - h + 14, width: R - M, height: h, color: bg });
    const yy = y; // guardar
    // título
    page.drawText(san(title), { x: M + 16, y: yy - 6, size: 9.5, font: bold, color: fg });
    // valor
    const vw = bold.widthOfTextAtSize(san(value), 21);
    page.drawText(san(value), { x: R - 16 - vw, y: yy - 12, size: 21, font: bold, color: fg });
    y -= h + 12;
  };

  if (esContra) {
    box("A ENTREGAR AL MENSAJERO (EFECTIVO)", fmtCOP(alMensajero), BGSOFT, NAVY);
  } else {
    box("TOTAL PAGADO POR EL COMPRADOR", fmtCOP(d.totalPagado), BGSOFT, NAVY);
  }
  box("EL VENDEDOR RECIBE", fmtCOP(d.recibeVendedor), rgb(0.933, 0.965, 0.945), GREEN);

  // ── Guía (si aplica) ──
  if (d.numeroGuia || d.transportadora) {
    y -= 2;
    at("ENVÍO", M, 8.5, bold, MUTED);
    y -= 14;
    const guia = [d.transportadora, d.numeroGuia ? `Guía ${d.numeroGuia}` : null].filter(Boolean).join(" · ");
    at(guia, M, 10.5, helv, INK);
    y -= 24;
  }

  // ── Pie ──
  const footY = 92;
  page.drawLine({ start: { x: M, y: footY + 34 }, end: { x: R, y: footY + 34 }, thickness: 1, color: LINE });
  page.drawText(
    san("Este comprobante certifica la transacción realizada a través de Colbisnes, plataforma de"),
    { x: M, y: footY + 18, size: 8.5, font: helv, color: MUTED }
  );
  page.drawText(
    san("compraventa con garantía de reserva. La comisión de reserva se paga por Nequi; el producto"),
    { x: M, y: footY + 7, size: 8.5, font: helv, color: MUTED }
  );
  page.drawText(
    san("se paga en efectivo al mensajero contra entrega. Documento generado automáticamente."),
    { x: M, y: footY - 4, size: 8.5, font: helv, color: MUTED }
  );
  page.drawText(san("colbisnes.com"), { x: M, y: footY - 24, size: 9, font: bold, color: BLUE });
  page.drawText(san(`Orden ${d.ordenId}`), {
    x: R - helv.widthOfTextAtSize(san(`Orden ${d.ordenId}`), 8.5),
    y: footY - 24, size: 8.5, font: helv, color: MUTED,
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
