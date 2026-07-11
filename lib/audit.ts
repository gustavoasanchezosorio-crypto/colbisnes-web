import { prisma } from "@/lib/prisma";
import { getIP } from "@/lib/rateLimit";

interface RegistrarAuditoriaArgs {
  userId: string;             // admin/actor que ejecuta la acción
  action: string;             // p.ej. "APROBAR_KYC", "RECHAZAR_PREMIUM"
  entity: string;             // p.ej. "User", "Product", "Order"
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  request?: Request;          // opcional: para capturar IP y user-agent
}

/**
 * Registra una acción sensible en AuditLog de forma centralizada.
 * NUNCA lanza: un fallo de auditoría no debe tumbar la acción principal.
 * Cuando sea posible, prefiera incluir esto dentro de la misma $transaction
 * de la acción; use este helper para las rutas que no lo hacen.
 */
export async function registrarAuditoria({
  userId,
  action,
  entity,
  entityId = null,
  metadata = null,
  request,
}: RegistrarAuditoriaArgs): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        metadata: metadata as any,
        ip: request ? getIP(request) : null,
        userAgent: request?.headers.get("user-agent") ?? null,
      },
    });
  } catch (err) {
    console.error(`⚠️ No se pudo registrar AuditLog (${action}):`, err);
  }
}
