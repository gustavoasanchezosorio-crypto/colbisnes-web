import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AppProvider } from '@/context/AppContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { ToastProvider } from '@/components/Toast';
import BluWidget from '@/components/BluWidget';
import ProfileCompletionAlert from '@/components/ProfileCompletionAlert';
import BannerModoPrueba from '@/components/BannerModoPrueba';

const inter = Inter({ subsets: ["latin"] });

const SITE_URL = process.env.NEXT_PUBLIC_URL || "https://colbisnes.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Colbisnes", template: "%s · Colbisnes" },
  description: "El marketplace colombiano de segunda mano con pagos protegidos.",
  applicationName: "Colbisnes",
  openGraph: {
    type: "website",
    siteName: "Colbisnes",
    title: "Colbisnes",
    description: "El marketplace colombiano de segunda mano con pagos protegidos.",
    url: SITE_URL,
    locale: "es_CO",
    images: [{ url: "/logo-google.png", width: 512, height: 512, alt: "Colbisnes" }],
  },
  twitter: {
    card: "summary",
    title: "Colbisnes",
    description: "El marketplace colombiano de segunda mano con pagos protegidos.",
    images: ["/logo-google.png"],
  },
  // Comprobado contra el HTML generado, no supuesto: en cuanto se declara el
  // objeto `icons`, Next deja de emitir por convención el link de app/icon.svg
  // (el de app/favicon.ico sí lo sigue emitiendo). Por eso icon.svg se vuelve a
  // declarar aquí a mano: si no, este cambio le quitaría a la web un icono que
  // hoy sí tiene. favicon.ico NO se declara, para no duplicar su link.
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml", sizes: "any" }],
    // A sangre completa y SIN canal alfa a propósito: iOS aplica su propia
    // máscara "squircle" y rellena de negro cualquier transparencia. Si se le
    // entrega el logo ya redondeado se ve un doble redondeo con borde feo.
    // Está en /icons/ (y no como app/apple-icon.png) porque ahí mismo irán los
    // iconos del manifest de la PWA en la fase 3.
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  // OJO: `capable` se deja DESACTIVADO a propósito. Activarlo abre el sitio en
  // modo standalone en iOS, sin el botón de atrás de Safari, y esta web todavía
  // no tiene navegación propia dentro de la app: el usuario quedaría atrapado a
  // mitad de un pago. Se activará en la fase 3, junto con el service worker y el
  // shell de la PWA. El apple-touch-icon funciona igual sin `capable`.
  appleWebApp: {
    title: "Colbisnes",
    statusBarStyle: "default",
  },
};

// Datos estructurados que Google usa para asociar el logo a la marca en resultados
// de búsqueda y panel de conocimiento.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Colbisnes",
  url: SITE_URL,
  logo: SITE_URL + "/logo-google.png",
  description: "El marketplace colombiano de segunda mano con pagos protegidos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body className={inter.className}>
        {/* Aviso de MODO PRUEBA. Va fuera de los providers a propósito: no depende
            de sesión ni de contexto, y así se pinta aunque algo más falle. Solo se
            ve si el navegador entró con el link secreto de prelanzamiento. */}
        <BannerModoPrueba />
        <Providers>
          <AppProvider>
            <ToastProvider>
              <NotificationProvider>
                {children}
                <BluWidget />
                <ProfileCompletionAlert />
              </NotificationProvider>
            </ToastProvider>
          </AppProvider>
        </Providers>
      </body>
    </html>
  );
}
