import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
// bcrypt en Rust con binario precompilado. Frente a bcryptjs (JavaScript puro)
// la diferencia clave no es la velocidad sino DÓNDE corre: bcryptjs bloquea el
// event loop ~200 ms en cada login, y durante ese rato el servidor entero no
// atiende a nadie más. Esta versión trabaja en un hilo aparte, así que el sitio
// sigue respondiendo. El formato del hash es el estándar de bcrypt, idéntico al
// anterior: las contraseñas ya guardadas se verifican sin que nadie las cambie.
import * as bcrypt from "@node-rs/bcrypt";
import { JWT } from "next-auth/jwt";
import { Session } from "next-auth";
import { rateLimit } from "@/lib/rateLimit";

// Cada cuánto, como máximo, se vuelve a leer de la base el nombre/foto/rol de
// quien tiene la sesión abierta. Ver el callback `jwt` para el razonamiento.
const REFRESCO_SESION_MS = 5 * 60 * 1000;

function getIpFromHeaders(headers: Record<string, string> | Headers | undefined): string {
  if (!headers) return "unknown";
  const get = (h: any, key: string) =>
    typeof h.get === "function" ? h.get(key) : h[key];
  const forwarded = get(headers, "x-forwarded-for");
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return "unknown";
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email y contrasena requeridos");
        }

        // Rate limiting anti fuerza bruta / credential stuffing: por IP y por email.
        const ip = getIpFromHeaders(req?.headers as any);
        const emailKey = credentials.email.toLowerCase().trim();
        const ipLimit = rateLimit(`login-ip:${ip}`, { limit: 20, windowSeconds: 60 });
        const emailLimit = rateLimit(`login-email:${emailKey}`, { limit: 5, windowSeconds: 60 });
        if (!ipLimit.allowed || !emailLimit.allowed) {
          throw new Error("Demasiados intentos. Intenta de nuevo en un minuto.");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user || !user.password) throw new Error("Credenciales invalidas");
        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) throw new Error("Credenciales invalidas");
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user, account, trigger }: { token: JWT; user: any; account: any; trigger?: string }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.image = user.image ?? null;
      }
      // Marca de que los datos de este token ya se leyeron de la base en esta misma
      // llamada. Al entrar con Google `user` también viene, así que sin esto el
      // bloque de más abajo repetiría la consulta en el mismo inicio de sesión.
      let yaLeidoDeLaBase = false;

      if (account?.provider === "google") {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email! },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.image = dbUser.image ?? token.picture ?? null;
          // Google ya verificó el correo del usuario: lo marcamos como verificado
          // para que el gate de correo confirmado no bloquee a quien entra con Google.
          if (!dbUser.emailVerified) {
            await prisma.user.update({
              where: { id: dbUser.id },
              data: { emailVerified: new Date() },
            });
          }
          token.refrescadoEn = Date.now();
          yaLeidoDeLaBase = true;
        }
      }
      // Mantenemos imagen/nombre/rol sincronizados con la base de datos, pero NO
      // en cada request. Hasta el 2026-08-25 esto consultaba la base en todas las
      // peticiones de todo usuario con sesión abierta: una ida y vuelta extra en
      // cada clic, y la base sin un segundo de silencio.
      //
      // Se refresca en tres casos:
      //   - al iniciar sesión (`user` presente);
      //   - cuando el cliente lo pide con `update()`. La pantalla de editar perfil
      //     lo llama al guardar (app/perfil/editar/page.tsx), que es lo que hace
      //     que la foto nueva salga al instante sin volver a entrar;
      //   - al vencer el plazo de abajo, como red de seguridad para lo que cambia
      //     por fuera de esa pantalla (sobre todo el rol, que se toca desde el
      //     panel de administración).
      //
      // El plazo acota cuánto puede tardar un cambio de rol en hacerse efectivo:
      // si a alguien se le quita el rol de admin, conserva el anterior como mucho
      // este tiempo. Por eso son minutos y no horas.
      const refrescoPedido = Boolean(user) || trigger === "update";
      const ultimoRefresco = typeof token.refrescadoEn === "number" ? token.refrescadoEn : 0;
      const plazoVencido = Date.now() - ultimoRefresco > REFRESCO_SESION_MS;

      if (token.email && !yaLeidoDeLaBase && (refrescoPedido || plazoVencido)) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          select: { id: true, name: true, image: true, role: true },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.name = dbUser.name ?? token.name;
          token.image = dbUser.image ?? token.picture ?? null;
        }
        // Se anota incluso si no se encontró al usuario: si no, una sesión huérfana
        // volvería a consultar en cada request, que es justo lo que se quiere evitar.
        token.refrescadoEn = Date.now();
      }
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if (session.user) {
        session.user.role = token.role as string | undefined;
        session.user.id = (token.id as string) ?? "";
        (session.user as any).image = (token.image ?? token.picture ?? null) as string | null;
      }
      return session;
    },
  },
  pages: { signIn: "/auth/login" },
  secret: process.env.NEXTAUTH_SECRET,
};
