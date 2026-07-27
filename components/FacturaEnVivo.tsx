"use client";
import { THEME } from "@/lib/theme";

// Factura Colbisnes "en vivo": el mismo desglose del comprobante PDF, pero renderizado
// en la página del producto y actualizándose en tiempo real (el padre recarga la orden
// vía WebSocket). La ve el comprador Y el vendedor, cada uno con su vista de dinero.
// Consistente con lib/comprobante.ts: en contra-entrega el efectivo al mensajero =
// recibeVendedor (precioBase) + envioCobrado, y la comisión de reserva se paga aparte
// por Nequi.

interface FacturaOrden {
  id: string;
  estado: string;
  metodoPago?: string;
  recibeVendedor?: number | string | null;
  comision?: number | string | null;
  envioCobrado?: number | string | null;
  totalPagado?: number | string | null;
  comisionReservaCOP?: number | string | null;
  comisionReservaPagada?: boolean;
  numeroGuia?: string | null;
  transportadora?: string | null;
  createdAt?: string;
}

const VERDE = "#22c55e";
const VERDE_OSC = "#15803d";
const MORADO = "#6d28d9";

const PASOS = ["Reservado", "Comisión pagada", "En camino", "Entregado"];

const ESTADO_INFO: Record<string, { label: string; bg: string; col: string }> = {
  ESPERANDO_COMISION: { label: "Esperando comisión", bg: "rgba(199,154,46,0.14)", col: "#9a7317" },
  ESPERANDO_ENVIO:    { label: "Pendiente de envío",  bg: "rgba(14,86,192,0.12)", col: THEME.primary },
  PAGADO:             { label: "Pagado",              bg: "rgba(14,86,192,0.12)", col: THEME.primary },
  EN_CAMINO:          { label: "En camino",           bg: "rgba(139,79,219,0.14)", col: MORADO },
  ENTREGADO:          { label: "Entregado",           bg: "rgba(34,197,94,0.14)",  col: VERDE_OSC },
  COMPLETADO:         { label: "Completado",          bg: "rgba(34,197,94,0.14)",  col: VERDE_OSC },
};

export default function FacturaEnVivo({
  orden,
  productoTitulo,
  productoImagen,
  rol,
}: {
  orden: FacturaOrden;
  productoTitulo: string;
  productoImagen?: string | null;
  rol: "comprador" | "vendedor";
}) {
  const num = (v: any) => Math.round(Number(v) || 0);
  const fmt = (v: any) => "$" + num(v).toLocaleString("es-CO");

  const esContra = orden.metodoPago === "CONTRA_ENTREGA";
  const recibeVendedor = num(orden.recibeVendedor);
  const envio = num(orden.envioCobrado);
  const comisionReserva = num(orden.comisionReservaCOP ?? orden.comision);
  const alMensajero = recibeVendedor + envio;

  // Pasos completados (índice exclusivo): 1=Reservado, 2=Comisión, 3=Envío, 4=Entrega.
  const completados =
    orden.estado === "ESPERANDO_COMISION" ? 1 :
    orden.estado === "ESPERANDO_ENVIO" || orden.estado === "PAGADO" ? 2 :
    orden.estado === "EN_CAMINO" ? 3 :
    (orden.estado === "ENTREGADO" || orden.estado === "COMPLETADO") ? 4 : 1;
  const finalizado = completados >= 4;

  const est = ESTADO_INFO[orden.estado] || { label: orden.estado, bg: THEME.surfaceAlt, col: THEME.muted };
  const comisionPagada = !!orden.comisionReservaPagada || completados >= 2;
  const mostrarPdf = orden.estado !== "ESPERANDO_COMISION";

  const esComprador = rol === "comprador";

  return (
    <div style={{
      background: THEME.surface,
      border: `1px solid ${THEME.border}`,
      borderRadius: 16,
      overflow: "hidden",
      boxShadow: "0 8px 24px rgba(10,46,107,0.10)",
    }}>
      {/* ── Encabezado ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 10, padding: "0.7rem 0.9rem",
        background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 55%,${THEME.primaryDark})`,
      }}>
        <div style={{ lineHeight: 1.1 }}>
          <div style={{ fontSize: "0.62rem", letterSpacing: "1.5px", fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>FACTURA</div>
          <div style={{ fontSize: "1rem", fontWeight: 900, color: "white", letterSpacing: "-0.3px" }}>Colbisnes</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            background: "rgba(255,255,255,0.18)", borderRadius: 20,
            padding: "3px 9px", fontSize: "0.68rem", fontWeight: 800, color: "white",
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: finalizado ? VERDE : "#fff",
              boxShadow: finalizado ? "none" : "0 0 0 3px rgba(255,255,255,0.3)",
            }} />
            {finalizado ? "Finalizada" : "En vivo"}
          </div>
          <div style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.72)", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
            N° {orden.id.slice(-8).toUpperCase()}
          </div>
        </div>
      </div>

      <div style={{ padding: "0.85rem 0.9rem 0.95rem" }}>
        {/* ── Producto + estado ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "0.85rem" }}>
          {productoImagen && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={productoImagen} alt="" style={{ width: 42, height: 42, borderRadius: 9, objectFit: "cover", border: `1px solid ${THEME.border}`, flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "0.86rem", fontWeight: 700, color: THEME.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {productoTitulo}
            </div>
            <div style={{ fontSize: "0.72rem", color: THEME.muted, marginTop: 1 }}>
              {esContra ? "Contra entrega · reserva por Nequi" : "Compra protegida"}
            </div>
          </div>
          <span style={{ background: est.bg, color: est.col, padding: "3px 10px", borderRadius: 20, fontSize: "0.68rem", fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0 }}>
            {est.label}
          </span>
        </div>

        {/* ── Línea de tiempo ── */}
        <div style={{ display: "flex", alignItems: "flex-start", marginBottom: "0.95rem" }}>
          {PASOS.map((paso, i) => {
            const done = i < completados;
            const activo = i === completados && !finalizado;
            const conectorLleno = i < completados - 1;
            return (
              <div key={i} style={{ flex: 1, textAlign: "center", position: "relative" }}>
                {i < PASOS.length - 1 && (
                  <div style={{ position: "absolute", top: 9, left: "50%", width: "100%", height: 2, background: conectorLleno ? VERDE : THEME.border }} />
                )}
                <div style={{
                  position: "relative", zIndex: 1,
                  width: 20, height: 20, borderRadius: "50%", margin: "0 auto",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.62rem", fontWeight: 800,
                  background: done ? VERDE : activo ? THEME.primary : THEME.surface,
                  color: done || activo ? "white" : THEME.muted,
                  border: done ? `2px solid ${VERDE}` : activo ? `2px solid ${THEME.primary}` : `2px solid ${THEME.border}`,
                  boxShadow: activo ? `0 0 0 3px rgba(14,86,192,0.18)` : "none",
                }}>
                  {done ? "✓" : i + 1}
                </div>
                <div style={{ fontSize: "0.6rem", lineHeight: 1.15, marginTop: 4, color: done || activo ? THEME.text : THEME.muted, fontWeight: done || activo ? 700 : 500 }}>
                  {paso}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Desglose de dinero (según rol) ── */}
        <div style={{ background: THEME.surfaceAlt, borderRadius: 12, padding: "0.7rem 0.85rem" }}>
          {esComprador ? (
            <>
              <Row label="Precio del producto" value={fmt(recibeVendedor)} />
              {envio > 0 && <Row label="Envío" value={fmt(envio)} />}
              <Row
                label="Comisión de reserva (Nequi)"
                value={fmt(comisionReserva)}
                badge={comisionPagada ? { txt: "Pagada", bg: "rgba(34,197,94,0.15)", col: VERDE_OSC } : { txt: "Pendiente", bg: "rgba(199,154,46,0.16)", col: "#9a7317" }}
              />
            </>
          ) : (
            <>
              <Row label="Precio de venta" value={fmt(recibeVendedor)} />
              {envio > 0 && <Row label="Envío cobrado al comprador" value={fmt(envio)} muted />}
            </>
          )}
        </div>

        {/* ── Caja destacada (headline por rol) ── */}
        {esComprador ? (
          <HeadlineBox
            titulo={esContra ? "A ENTREGAR AL MENSAJERO (EFECTIVO)" : "TOTAL PAGADO"}
            valor={fmt(esContra ? alMensajero : orden.totalPagado)}
            sub={esContra ? "En efectivo, directo al mensajero al recibir el producto." : undefined}
            bg="rgba(14,86,192,0.08)"
            borde="rgba(14,86,192,0.22)"
            col={THEME.primaryDark}
          />
        ) : (
          <HeadlineBox
            titulo="VAS A RECIBIR"
            valor={fmt(recibeVendedor)}
            sub="La comisión de reserva la paga el comprador aparte por Nequi — no se descuenta de lo tuyo."
            bg="rgba(34,197,94,0.09)"
            borde="rgba(34,197,94,0.28)"
            col={VERDE_OSC}
          />
        )}

        {/* ── Guía de envío (si existe) ── */}
        {(orden.numeroGuia || orden.transportadora) && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: "0.7rem", fontSize: "0.76rem", color: THEME.textSoft }}>
            <span>🚚</span>
            <span>
              {[orden.transportadora, orden.numeroGuia ? `Guía ${orden.numeroGuia}` : null].filter(Boolean).join(" · ")}
            </span>
          </div>
        )}

        {/* ── Cierre + comprobante PDF ── */}
        {finalizado && (
          <div style={{ marginTop: "0.85rem", background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.30)", borderRadius: 10, padding: "0.6rem 0.75rem" }}>
            <p style={{ margin: 0, fontSize: "0.8rem", fontWeight: 700, color: VERDE_OSC }}>✅ Transacción finalizada</p>
            <p style={{ margin: "0.2rem 0 0", fontSize: "0.74rem", color: THEME.textSoft, lineHeight: 1.45 }}>
              Te enviamos el comprobante por correo. También puedes descargarlo aquí.
            </p>
          </div>
        )}

        {mostrarPdf && (
          <a
            href={`/api/orders/comprobante?orderId=${orden.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              marginTop: "0.7rem", padding: "0.6rem", borderRadius: 10,
              textDecoration: "none", fontSize: "0.85rem", fontWeight: 800,
              ...(finalizado
                ? { background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 55%,${THEME.primaryDark})`, color: "white", boxShadow: "0 4px 14px rgba(14,86,192,0.30)" }
                : { background: THEME.surface, color: THEME.primary, border: `1.5px solid ${THEME.border}` }),
            }}
          >
            <span>⬇️</span> Descargar comprobante (PDF)
          </a>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, badge, muted }: {
  label: string;
  value: string;
  badge?: { txt: string; bg: string; col: string };
  muted?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "3px 0" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.8rem", color: muted ? THEME.muted : THEME.textSoft }}>
        {label}
        {badge && (
          <span style={{ background: badge.bg, color: badge.col, padding: "1px 7px", borderRadius: 12, fontSize: "0.64rem", fontWeight: 800 }}>
            {badge.txt}
          </span>
        )}
      </span>
      <span style={{ fontSize: "0.86rem", fontWeight: 700, color: muted ? THEME.muted : THEME.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {value}
      </span>
    </div>
  );
}

function HeadlineBox({ titulo, valor, sub, bg, borde, col }: {
  titulo: string;
  valor: string;
  sub?: string;
  bg: string;
  borde: string;
  col: string;
}) {
  return (
    <div style={{ marginTop: "0.7rem", background: bg, border: `1px solid ${borde}`, borderRadius: 12, padding: "0.7rem 0.85rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: "0.66rem", fontWeight: 800, letterSpacing: "0.4px", color: col }}>{titulo}</span>
        <span style={{ fontSize: "1.25rem", fontWeight: 900, color: col, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{valor}</span>
      </div>
      {sub && (
        <p style={{ margin: "0.35rem 0 0", fontSize: "0.72rem", color: THEME.textSoft, lineHeight: 1.45 }}>{sub}</p>
      )}
    </div>
  );
}
