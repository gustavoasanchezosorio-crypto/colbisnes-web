import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { JWT } from "next-auth/jwt";
import { Session } from "next-auth";
import { rateLimit } from "@/lib/rateLimit";

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
        }
      }
      // Mantenemos imagen/nombre/rol sincronizados con la base de datos en cada
      // request, para que la nueva foto de perfil aparezca de inmediato en el
      // header y la página principal sin necesidad de volver a iniciar sesión.
      if (token.email) {
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
