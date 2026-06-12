#!/bin/bash

# ============================================================
#  COLBISNES - Script de integración Wompi (Pagos reales)
#  Uso: bash wompi.sh
# ============================================================

set -e

AZUL='\033[0;34m'
VERDE='\033[0;32m'
ROJO='\033[0;31m'
AMARILLO='\033[1;33m'
NC='\033[0m'

WOMPI_PUBLIC_KEY="pub_test_jiDHQYH5lLb7hwHFxjYswNG3BcHCDz96"
WOMPI_PRIVATE_KEY="prv_test_gs4jJnh2c0xopNGAE4jvZlCD504gffpa"
WOMPI_API_URL="https://sandbox.wompi.co/v1"

echo ""
echo -e "${AZUL}╔══════════════════════════════════════════════╗${NC}"
echo -e "${AZUL}║   COLBISNES — Integración Wompi Pagos Reales ║${NC}"
echo -e "${AZUL}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── Verificar carpeta correcta ────────────────────────────────────────────────
if [ ! -f "package.json" ]; then
  echo -e "${ROJO}❌ Ejecuta este script desde la raíz de colbisnes-web${NC}"
  exit 1
fi

echo -e "${VERDE}✅ Proyecto detectado${NC}"
echo ""

# ── PASO 1: Agregar variables al .env ─────────────────────────────────────────
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${AMARILLO}  PASO 1: Configurando variables de Wompi en .env${NC}"
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Eliminar si ya existen
grep -v "^WOMPI_" .env > .env.tmp && mv .env.tmp .env

cat >> .env << EOF

# Wompi — Pagos reales (Sandbox)
WOMPI_PUBLIC_KEY="${WOMPI_PUBLIC_KEY}"
WOMPI_PRIVATE_KEY="${WOMPI_PRIVATE_KEY}"
WOMPI_API_URL="${WOMPI_API_URL}"
NEXT_PUBLIC_WOMPI_PUBLIC_KEY="${WOMPI_PUBLIC_KEY}"
EOF

echo -e "${VERDE}✅ Variables de Wompi agregadas al .env${NC}"

# ── PASO 2: Instalar dependencias ─────────────────────────────────────────────
echo ""
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${AMARILLO}  PASO 2: Instalando dependencias${NC}"
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

npm install axios crypto-js 2>&1 | tail -3
echo -e "${VERDE}✅ Dependencias instaladas${NC}"

# ── PASO 3: Crear librería Wompi ──────────────────────────────────────────────
echo ""
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${AMARILLO}  PASO 3: Creando librería de Wompi${NC}"
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

mkdir -p lib

cat > lib/wompi.ts << 'EOF'
// lib/wompi.ts — Librería oficial Wompi para Colbisnes

const WOMPI_API_URL = process.env.WOMPI_API_URL || "https://sandbox.wompi.co/v1";
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY!;
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY!;

// Crear una transacción en Wompi
export async function crearTransaccionWompi({
  amountInCents,
  currency = "COP",
  customerEmail,
  reference,
  paymentMethod,
}: {
  amountInCents: number;
  currency?: string;
  customerEmail: string;
  reference: string;
  paymentMethod: {
    type: "NEQUI" | "PSE" | "CARD";
    phoneNumber?: string;
    token?: string;
    installments?: number;
  };
}) {
  const response = await fetch(`${WOMPI_API_URL}/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
    },
    body: JSON.stringify({
      amount_in_cents: amountInCents,
      currency,
      customer_email: customerEmail,
      reference,
      payment_method: paymentMethod,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.reason || "Error al crear transacción en Wompi");
  }

  return data.data;
}

// Consultar estado de una transacción
export async function consultarTransaccion(transactionId: string) {
  const response = await fetch(`${WOMPI_API_URL}/transactions/${transactionId}`, {
    headers: {
      Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error("Error al consultar transacción");
  }

  return data.data;
}

// Generar referencia única para cada pago
export function generarReferencia(productId: string, userId: string): string {
  const timestamp = Date.now();
  return `colbisnes-${productId}-${userId}-${timestamp}`;
}

// Convertir COP a centavos (Wompi usa centavos)
export function copACentavos(precioCOP: number): number {
  return Math.round(precioCOP * 100);
}

export { WOMPI_PUBLIC_KEY };
EOF

echo -e "${VERDE}✅ lib/wompi.ts creado${NC}"

# ── PASO 4: Crear API endpoint de pagos ──────────────────────────────────────
echo ""
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${AMARILLO}  PASO 4: Creando API de pagos${NC}"
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

mkdir -p app/api/pagos/wompi
mkdir -p app/api/pagos/estado

# Endpoint para iniciar pago con Nequi
cat > app/api/pagos/wompi/route.ts << 'EOF'
// app/api/pagos/wompi/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import {
  crearTransaccionWompi,
  generarReferencia,
  copACentavos,
} from "@/lib/wompi";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { productId, offerId, phoneNumber, metodoPago } = await req.json();

    if (!productId || !offerId) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    // Buscar el producto y la oferta
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { user: true },
    });

    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    if (product.status !== "PAYMENT_PENDING") {
      return NextResponse.json(
        { error: "El producto no está en estado de pago pendiente" },
        { status: 400 }
      );
    }

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
    });

    if (!offer || offer.status !== "ACCEPTED") {
      return NextResponse.json({ error: "Oferta no válida" }, { status: 400 });
    }

    // Monto a pagar (precio del producto o monto de la oferta)
    const monto = offer.amount || product.price;
    const referencia = generarReferencia(productId, session.user.id);

    // Construir método de pago según tipo
    let paymentMethod: any;

    if (metodoPago === "NEQUI") {
      if (!phoneNumber) {
        return NextResponse.json(
          { error: "Se requiere número de teléfono para Nequi" },
          { status: 400 }
        );
      }
      paymentMethod = {
        type: "NEQUI",
        phone_number: phoneNumber.replace(/\D/g, ""),
      };
    } else {
      return NextResponse.json(
        { error: "Método de pago no soportado aún. Usa NEQUI." },
        { status: 400 }
      );
    }

    // Crear la transacción en Wompi
    const transaccion = await crearTransaccionWompi({
      amountInCents: copACentavos(Number(monto)),
      currency: "COP",
      customerEmail: session.user.email!,
      reference: referencia,
      paymentMethod,
    });

    // Guardar referencia en el producto para seguimiento
    await prisma.product.update({
      where: { id: productId },
      data: {
        wompiTransactionId: transaccion.id,
        wompiReference: referencia,
      } as any,
    });

    return NextResponse.json({
      success: true,
      transactionId: transaccion.id,
      referencia,
      status: transaccion.status,
      mensaje:
        metodoPago === "NEQUI"
          ? "Revisa tu app de Nequi para aprobar el pago"
          : "Pago iniciado",
    });
  } catch (error: any) {
    console.error("Error Wompi:", error);
    return NextResponse.json(
      { error: error.message || "Error procesando el pago" },
      { status: 500 }
    );
  }
}
EOF

# Endpoint para consultar estado del pago
cat > app/api/pagos/estado/route.ts << 'EOF'
// app/api/pagos/estado/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { consultarTransaccion } from "@/lib/wompi";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const transactionId = searchParams.get("transactionId");
    const productId = searchParams.get("productId");

    if (!transactionId || !productId) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
    }

    // Consultar estado en Wompi
    const transaccion = await consultarTransaccion(transactionId);
    const estado = transaccion.status;

    // Si el pago fue aprobado, actualizar el producto a IN_ESCROW
    if (estado === "APPROVED") {
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (product && product.status === "PAYMENT_PENDING") {
        await prisma.product.update({
          where: { id: productId },
          data: { status: "IN_ESCROW" },
        });

        // Registrar en auditoría
        await prisma.auditLog.create({
          data: {
            userId: session.user.id,
            action: "WOMPI_PAYMENT_APPROVED",
            details: `Pago Wompi aprobado. Transaction: ${transactionId}`,
          } as any,
        });
      }
    }

    // Si el pago fue rechazado, volver el producto a AVAILABLE
    if (estado === "DECLINED" || estado === "ERROR" || estado === "VOIDED") {
      await prisma.product.update({
        where: { id: productId },
        data: { status: "AVAILABLE" },
      });
    }

    return NextResponse.json({
      status: estado,
      aprobado: estado === "APPROVED",
      rechazado: ["DECLINED", "ERROR", "VOIDED"].includes(estado),
      pendiente: ["PENDING", "PROCESSING"].includes(estado),
    });
  } catch (error: any) {
    console.error("Error consultando estado:", error);
    return NextResponse.json(
      { error: error.message || "Error consultando pago" },
      { status: 500 }
    );
  }
}
EOF

echo -e "${VERDE}✅ APIs de pago creadas${NC}"

# ── PASO 5: Crear componente de pago Wompi ────────────────────────────────────
echo ""
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${AMARILLO}  PASO 5: Creando componente modal de pago${NC}"
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

mkdir -p components

cat > components/WompiPagoModal.tsx << 'EOF'
// components/WompiPagoModal.tsx
"use client";
import { useState, useEffect } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  offerId: string;
  monto: number;
  nombreProducto: string;
  onPagoExitoso: () => void;
}

export default function WompiPagoModal({
  isOpen,
  onClose,
  productId,
  offerId,
  monto,
  nombreProducto,
  onPagoExitoso,
}: Props) {
  const [paso, setPaso] = useState<"metodo" | "nequi" | "procesando" | "exito" | "error">("metodo");
  const [telefono, setTelefono] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [mensajeError, setMensajeError] = useState("");
  const [polling, setPolling] = useState(false);

  // Resetear al abrir
  useEffect(() => {
    if (isOpen) {
      setPaso("metodo");
      setTelefono("");
      setTransactionId("");
      setMensajeError("");
    }
  }, [isOpen]);

  // Polling para verificar estado del pago
  useEffect(() => {
    if (!polling || !transactionId) return;

    const intervalo = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/pagos/estado?transactionId=${transactionId}&productId=${productId}`
        );
        const data = await res.json();

        if (data.aprobado) {
          setPolling(false);
          setPaso("exito");
          clearInterval(intervalo);
          setTimeout(() => onPagoExitoso(), 2000);
        } else if (data.rechazado) {
          setPolling(false);
          setPaso("error");
          setMensajeError("Pago rechazado. Verifica tu saldo en Nequi e intenta de nuevo.");
          clearInterval(intervalo);
        }
      } catch (e) {
        console.error("Error verificando pago:", e);
      }
    }, 3000); // Verificar cada 3 segundos

    // Timeout de 5 minutos
    const timeout = setTimeout(() => {
      setPolling(false);
      clearInterval(intervalo);
      setPaso("error");
      setMensajeError("Tiempo de espera agotado. Si pagaste, contacta soporte.");
    }, 300000);

    return () => {
      clearInterval(intervalo);
      clearTimeout(timeout);
    };
  }, [polling, transactionId, productId]);

  const iniciarPagoNequi = async () => {
    if (!telefono || telefono.length < 10) {
      setMensajeError("Ingresa un número de celular válido (10 dígitos)");
      return;
    }

    setPaso("procesando");
    setMensajeError("");

    try {
      const res = await fetch("/api/pagos/wompi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          offerId,
          phoneNumber: telefono,
          metodoPago: "NEQUI",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al procesar el pago");
      }

      setTransactionId(data.transactionId);
      setPolling(true);
    } catch (error: any) {
      setPaso("nequi");
      setMensajeError(error.message || "Error al iniciar el pago");
    }
  };

  if (!isOpen) return null;

  const estilos = {
    overlay: {
      position: "fixed" as const,
      inset: 0,
      backgroundColor: "rgba(0,0,0,0.7)",
      zIndex: 1000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem",
    },
    modal: {
      backgroundColor: "#1a1a2e",
      border: "1px solid #00589F",
      borderRadius: "12px",
      padding: "2rem",
      maxWidth: "420px",
      width: "100%",
      color: "white",
    },
    titulo: {
      fontSize: "1.3rem",
      fontWeight: "bold",
      color: "#D4AF37",
      marginBottom: "0.5rem",
    },
    monto: {
      fontSize: "1.8rem",
      fontWeight: "bold",
      color: "#00589F",
      textAlign: "center" as const,
      margin: "1rem 0",
    },
    boton: {
      width: "100%",
      padding: "0.8rem",
      borderRadius: "8px",
      border: "none",
      cursor: "pointer",
      fontSize: "1rem",
      fontWeight: "bold",
      marginTop: "0.5rem",
    },
    input: {
      width: "100%",
      padding: "0.8rem",
      borderRadius: "8px",
      border: "1px solid #00589F",
      backgroundColor: "#0f0f23",
      color: "white",
      fontSize: "1rem",
      marginTop: "0.5rem",
      boxSizing: "border-box" as const,
    },
    error: {
      backgroundColor: "#ff4444",
      color: "white",
      padding: "0.5rem",
      borderRadius: "6px",
      marginTop: "0.5rem",
      fontSize: "0.9rem",
    },
  };

  return (
    <div style={estilos.overlay}>
      <div style={estilos.modal}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={estilos.titulo}>💳 Pagar con Wompi</h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "white", fontSize: "1.5rem", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        <p style={{ color: "#aaa", fontSize: "0.9rem" }}>{nombreProducto}</p>
        <div style={estilos.monto}>
          ${Number(monto).toLocaleString("es-CO")} COP
        </div>

        {/* PASO: Elegir método */}
        {paso === "metodo" && (
          <div>
            <p style={{ color: "#ccc", marginBottom: "1rem", textAlign: "center" }}>
              Elige cómo quieres pagar:
            </p>
            <button
              style={{ ...estilos.boton, backgroundColor: "#8B4FDB", color: "white" }}
              onClick={() => setPaso("nequi")}
            >
              📱 Pagar con Nequi
            </button>
            <button
              style={{ ...estilos.boton, backgroundColor: "#333", color: "#aaa", cursor: "not-allowed" }}
              disabled
            >
              🏦 PSE — Próximamente
            </button>
            <button
              style={{ ...estilos.boton, backgroundColor: "#333", color: "#aaa", cursor: "not-allowed" }}
              disabled
            >
              💳 Tarjeta — Próximamente
            </button>
          </div>
        )}

        {/* PASO: Nequi */}
        {paso === "nequi" && (
          <div>
            <p style={{ color: "#ccc", marginBottom: "0.5rem" }}>
              Ingresa tu número de celular registrado en Nequi:
            </p>
            <input
              style={estilos.input}
              type="tel"
              placeholder="3001234567"
              maxLength={10}
              value={telefono}
              onChange={(e) => setTelefono(e.target.value.replace(/\D/g, ""))}
            />
            {mensajeError && <div style={estilos.error}>{mensajeError}</div>}
            <button
              style={{ ...estilos.boton, backgroundColor: "#8B4FDB", color: "white" }}
              onClick={iniciarPagoNequi}
            >
              Enviar solicitud de pago
            </button>
            <button
              style={{ ...estilos.boton, backgroundColor: "transparent", color: "#aaa", border: "1px solid #555" }}
              onClick={() => setPaso("metodo")}
            >
              ← Volver
            </button>
          </div>
        )}

        {/* PASO: Procesando */}
        {paso === "procesando" && (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📱</div>
            <p style={{ color: "#D4AF37", fontWeight: "bold", fontSize: "1.1rem" }}>
              Revisa tu app de Nequi
            </p>
            <p style={{ color: "#aaa", fontSize: "0.9rem", margin: "0.5rem 0" }}>
              Enviamos una solicitud de pago a tu celular. Apruébala en la app de Nequi.
            </p>
            <div style={{ color: "#00589F", marginTop: "1rem" }}>
              ⏳ Verificando pago automáticamente...
            </div>
          </div>
        )}

        {/* PASO: Éxito */}
        {paso === "exito" && (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>✅</div>
            <p style={{ color: "#00ff88", fontWeight: "bold", fontSize: "1.2rem" }}>
              ¡Pago exitoso!
            </p>
            <p style={{ color: "#aaa", fontSize: "0.9rem" }}>
              Tu pago fue procesado. El vendedor recibirá el dinero cuando confirme la entrega.
            </p>
          </div>
        )}

        {/* PASO: Error */}
        {paso === "error" && (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>❌</div>
            <p style={{ color: "#ff4444", fontWeight: "bold" }}>Pago no completado</p>
            <p style={{ color: "#aaa", fontSize: "0.9rem", margin: "0.5rem 0" }}>
              {mensajeError}
            </p>
            <button
              style={{ ...estilos.boton, backgroundColor: "#00589F", color: "white" }}
              onClick={() => { setPaso("nequi"); setMensajeError(""); }}
            >
              Intentar de nuevo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
EOF

echo -e "${VERDE}✅ Componente WompiPagoModal.tsx creado${NC}"

# ── PASO 6: Agregar campos Wompi al schema de Prisma ──────────────────────────
echo ""
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${AMARILLO}  PASO 6: Actualizando schema de Prisma${NC}"
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Verificar si ya tiene los campos wompi
if grep -q "wompiTransactionId" prisma/schema.prisma; then
  echo -e "${VERDE}✅ Campos Wompi ya existen en el schema${NC}"
else
  # Agregar campos al modelo Product antes del último }
  python3 - << 'PYEOF'
with open('prisma/schema.prisma', 'r') as f:
    content = f.read()

# Buscar el modelo Product y agregar campos antes de su cierre
wompi_fields = '''  wompiTransactionId String?
  wompiReference     String?'''

# Insertar antes del cierre del modelo Product
import re
pattern = r'(model Product \{[^}]*)(})'
def add_fields(m):
    body = m.group(1)
    if 'wompiTransactionId' not in body:
        return body + wompi_fields + '\n' + m.group(2)
    return m.group(0)

result = re.sub(pattern, add_fields, content, flags=re.DOTALL)

with open('prisma/schema.prisma', 'w') as f:
    f.write(result)
print("Campos Wompi agregados al schema")
PYEOF

  echo -e "${VERDE}✅ Schema actualizado${NC}"

  # Migrar
  echo "  Ejecutando migración de base de datos..."
  npx prisma migrate dev --name agregar-wompi --skip-seed 2>&1 | tail -5
  echo -e "${VERDE}✅ Migración ejecutada${NC}"
fi

# ── PASO 7: Regenerar cliente Prisma ──────────────────────────────────────────
echo ""
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${AMARILLO}  PASO 7: Regenerando cliente Prisma${NC}"
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

npx prisma generate 2>&1 | tail -3
echo -e "${VERDE}✅ Cliente Prisma regenerado${NC}"

# ── ÉXITO ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${VERDE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${VERDE}║   ✅ WOMPI INTEGRADO EXITOSAMENTE                ║${NC}"
echo -e "${VERDE}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Archivos creados:"
echo "    • lib/wompi.ts              (librería de Wompi)"
echo "    • app/api/pagos/wompi/route.ts  (API para iniciar pago)"
echo "    • app/api/pagos/estado/route.ts (API para verificar pago)"
echo "    • components/WompiPagoModal.tsx (modal de pago visual)"
echo ""
echo "  Próximo paso:"
echo "    En tu página de producto, reemplaza el modal de pago"
echo "    actual por <WompiPagoModal /> para activar pagos reales"
echo ""
echo "  Para probar:"
echo "    1. npm run dev"
echo "    2. Acepta una oferta como vendedor"
echo "    3. El comprador verá el nuevo modal de Wompi"
echo "    4. Usa número Nequi de prueba: 3991111111"
echo ""
echo -e "${AZUL}  Modo: SANDBOX (pruebas) — sin cobros reales 🧪${NC}"
echo ""
