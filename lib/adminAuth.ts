import type { Session } from "next-auth";

// Antes de este archivo, cada ruta bajo app/api/admin/** (y un par más:
// kyc/approve, blu/chat) tenía su propia copia local de "esAdmin", casi
// idéntica pero no igual entre sí (algunas comparaban solo el email contra
// ADMIN_EMAIL, otras el rol, otras ambos). Se centraliza acá para que el
// perfil MASTER (ver memory/project_colbisnes.md, pedido 2026-09-04: "perfil
// master que me de control absoluto de colbisnes... en todo todo") quede
// reconocido en un solo lugar y no haya que tocar 15+ archivos cada vez que
// cambie la regla.
//
// Se acepta cualquier objeto con la forma de Session (o null/undefined) para
// no obligar a los call sites a pasar el tipo exacto de next-auth.
type SessionLike = { user?: { role?: string | null; email?: string | null } } | Session | null | undefined;

function emailEsElDelCreador(email?: string | null): boolean {
  if (!email) return false;
  const admin = process.env.ADMIN_EMAIL;
  if (!admin) return false;
  return email.toLowerCase() === admin.toLowerCase();
}

// Admin de siempre: lo que ya existía antes de este cambio. Rol ADMIN o MASTER
// en la base, o el correo del creador por variable de entorno como respaldo
// (así queda funcionando igual que antes para todo lo que ya usaba esAdmin()).
export function esAdminSession(session: SessionLike): boolean {
  const role = session?.user?.role;
  return role === "ADMIN" || role === "MASTER" || emailEsElDelCreador(session?.user?.email);
}

// Perfil master: control total (editar/desactivar cualquier producto o
// usuario, exención de comisiones y cobros propios de Colbisnes). El respaldo
// por ADMIN_EMAIL también cuenta como master, no solo como admin: es la
// cuenta del creador, y si por lo que sea el rol en base todavía no quedó en
// MASTER (o se revirtió por error), no debe perder control frente a lo que
// ya tenía antes de que existiera este rol.
export function esCuentaMaster(session: SessionLike): boolean {
  const role = session?.user?.role;
  return role === "MASTER" || emailEsElDelCreador(session?.user?.email);
}

// Variante para cuando solo se tiene el email a mano (algunas rutas viejas
// leían session.user.email directo en vez de la sesión completa). Se deja
// como puente para no reescribir esos call sites innecesariamente.
export function esAdminEmail(email?: string | null): boolean {
  return emailEsElDelCreador(email);
}
