import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { esCuentaMaster } from "@/lib/adminAuth";
import { registrarAuditoria } from "@/lib/audit";
import { verificarCodigoTOTP } from "@/lib/totp";

/**
 * Edición de CUALQUIER usuario, solo para el perfil MASTER (ver lib/adminAuth.ts). Es el
 * control total sobre cuentas que pidió el creador de Colbisnes — pero con límites
 * deliberados y explícitos; no es un editor sin fondo sobre toda la tabla User:
 *
 *   · NUNCA password, resetToken/resetTokenExpiry, emailVerifyToken/emailVerifyTokenExpiry,
 *     totpSecret/totpEnabled: son primitivas de ACCESO a la cuenta. Poder escribirlas
 *     equivale a poder tomar la cuenta de otro usuario (fijar una contraseña, forjar un
 *     token de "olvidé mi contraseña", o apagar su 2FA) — eso ya no es "editar un perfil",
 *     es suplantación, y por eso queda fuera a propósito.
 *   · NUNCA email: a dónde llegan los correos —incluido el de restablecer contraseña— es,
 *     en la práctica, la misma puerta de suplantación que un password.
 *   · NUNCA nequiNumber/brebId/usdtWallet/usdtRed: es el destino de la plata cuando ESE
 *     usuario vende. Poder cambiarlos aquí sería poder redirigir un pago ajeno hacia
 *     cualquier otra cuenta.
 *   · NUNCA docType/docNumber/verifiedName/kycDocumentId/kycStatus/kycLevel/premiumStatus:
 *     ya existen flujos dedicados (/api/kyc/approve y equivalentes) que además mandan
 *     notificaciones y fechas asociadas (kycApprovedAt, etc.) — escribirlos directo aquí
 *     dejaría esos otros campos desincronizados con lo que de verdad pasó.
 *   · role: por esta vía solo admite "USER"/"ADMIN", nunca "MASTER". Un master nuevo se
 *     crea a mano, una sola vez, corriendo scripts/asignar-rol-master.ts — nunca por una
 *     llamada JSON, ni siquiera del propio master.
 *
 * Todo lo que SÍ es editable aquí mueve algo real (rol admin, bloqueo, deuda, penalización),
 * así que exige 2FA vigente del propio master — mismo candado que ya usan
 * /api/admin/confirmar-comision-nequi y /api/admin/usuarios-bloqueados.
 */

// Sin esto, el navegador puede servir una respuesta vieja para el mismo usuario (ej: el
// master abre el panel de edición, cierra, y al reabrirlo poco después ve datos de antes
// de su propio último guardado) — el mismo problema de caché que ya se resolvió en
// GET /api/products/[id]. Este endpoint solo lo llama el panel master, pero el dato debe
// ser siempre el actual de la base, nunca uno guardado por el navegador.
export const dynamic = "force-dynamic";

const ROLES_PERMITIDOS = ["USER", "ADMIN"] as const;

const SELECT_PERFIL = {
  id: true, email: true, name: true, phone: true, phoneWhatsapp: true,
  city: true, direccionEnvio: true, role: true, createdAt: true,
  kycStatus: true, kycLevel: true, premiumStatus: true,
  blockedUntil: true, blockedReason: true, deudaPendienteCOP: true, penalizacionScorePts: true,
} as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!esCuentaMaster(session)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const { id } = await params;
    const usuario = await prisma.user.findUnique({ where: { id }, select: SELECT_PERFIL });
    if (!usuario) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    return NextResponse.json({ usuario }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (err: any) {
    console.error("GET /api/admin/usuarios/[id] error:", err.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!esCuentaMaster(session) || !session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();

    if (!body.code) return NextResponse.json({ error: "Falta el código 2FA" }, { status: 400 });

    // Step-up 2FA: ver el porqué en el comentario de arriba del archivo.
    const master = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!master?.totpEnabled || !master.totpSecret) {
      return NextResponse.json({ error: "El 2FA no está activado. Configúralo en /admin/2fa" }, { status: 400 });
    }
    if (!(await verificarCodigoTOTP(master.totpSecret, body.code))) {
      return NextResponse.json({ error: "Código de verificación inválido" }, { status: 401 });
    }

    const usuario = await prisma.user.findUnique({ where: { id } });
    if (!usuario) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    if (body.accion !== undefined && body.accion !== "desactivar" && body.accion !== "reactivar") {
      return NextResponse.json({ error: "accion inválida (usa 'desactivar' o 'reactivar')" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};

    const camposTexto = ["name", "phone", "phoneWhatsapp", "city", "direccionEnvio", "blockedReason"] as const;
    for (const campo of camposTexto) {
      if (campo in body) {
        if (body[campo] !== null && typeof body[campo] !== "string") {
          return NextResponse.json({ error: `${campo} inválido` }, { status: 400 });
        }
        data[campo] = body[campo];
      }
    }

    if ("role" in body) {
      if (!(ROLES_PERMITIDOS as readonly string[]).includes(body.role)) {
        return NextResponse.json(
          {
            error: `role inválido. Por esta vía solo se permite: ${ROLES_PERMITIDOS.join(", ")}. MASTER se asigna aparte, a mano, con scripts/asignar-rol-master.ts.`,
          },
          { status: 400 }
        );
      }
      data.role = body.role;
    }

    if ("blockedUntil" in body) {
      if (body.blockedUntil !== null && isNaN(Date.parse(body.blockedUntil))) {
        return NextResponse.json({ error: "blockedUntil inválido (fecha ISO o null)" }, { status: 400 });
      }
      data.blockedUntil = body.blockedUntil === null ? null : new Date(body.blockedUntil);
    }

    for (const campo of ["deudaPendienteCOP", "penalizacionScorePts"] as const) {
      if (campo in body) {
        if (typeof body[campo] !== "number" || !Number.isFinite(body[campo]) || body[campo] < 0) {
          return NextResponse.json({ error: `${campo} debe ser un número ≥ 0` }, { status: 400 });
        }
        data[campo] = Math.round(body[campo]);
      }
    }

    // "desactivar"/"reactivar" son azúcar sintáctica sobre blockedUntil/blockedReason: el
    // MISMO mecanismo que ya usa lib/accountBlock.ts para bloqueos por tiempo, con una
    // fecha muy lejana en vez de un borrado real — nunca se llama "eliminar" porque la
    // cuenta y todo su historial (ventas, reseñas, mensajes) siguen intactos, y es
    // reversible: basta "reactivar" o volver a poner blockedUntil en null.
    if (body.accion === "desactivar") {
      data.blockedUntil = new Date("2099-01-01");
      data.blockedReason =
        typeof body.motivo === "string" && body.motivo.trim()
          ? body.motivo.trim()
          : "Cuenta desactivada por el administrador";
    } else if (body.accion === "reactivar") {
      data.blockedUntil = null;
      data.blockedReason = null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No se envió ningún campo para editar" }, { status: 400 });
    }

    const actualizado = await prisma.user.update({ where: { id }, data, select: SELECT_PERFIL });

    await registrarAuditoria({
      userId: session.user.id,
      action: "EDITAR_USUARIO_MASTER",
      entity: "User",
      entityId: id,
      metadata: {
        campos: Object.keys(data),
        accion: body.accion ?? null,
        antes: {
          role: usuario.role,
          blockedUntil: usuario.blockedUntil,
          blockedReason: usuario.blockedReason,
          deudaPendienteCOP: usuario.deudaPendienteCOP,
          penalizacionScorePts: usuario.penalizacionScorePts,
        },
        despues: data,
      },
      request: req,
    });

    return NextResponse.json({ ok: true, usuario: actualizado });
  } catch (err: any) {
    console.error("PATCH /api/admin/usuarios/[id] error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
