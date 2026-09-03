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
import CelebracionLanzamiento from '@/components/CelebracionLanzamiento';

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
    // Las medidas TIENEN que ser las reales del archivo. Estaban puestas en 512x512,
    // pero logo-google.png mide 800x418: WhatsApp y Facebook leen estos números para
    // decidir el recuadro ANTES de bajarse la imagen, así que reservaban un cuadrado y
    // le recortaban los lados a la palabra "colbisnes". Comprobado con `sips` sobre el
    // archivo, no supuesto. Si algún día se cambia el dibujo, hay que volver a medirlo.
    images: [{ url: "/logo-google.png", width: 800, height: 418, alt: "Colbisnes" }],
  },
  twitter: {
    // "summary" pinta una miniatura CUADRADA y recorta al centro, que en un logo apaisado
    // se come el principio y el final de la palabra. Con "summary_large_image" se respeta
    // el apaisado. Esta tarjeta no la usa solo X: varias apps de mensajería la prefieren
    // sobre las etiquetas og: cuando existe.
    card: "summary_large_image",
    title: "Colbisnes",
    description: "El marketplace colombiano de segunda mano con pagos protegidos.",
    images: ["/logo-google.png"],
  },
  // Comprobado contra el HTML generado, no supuesto: en cuanto se declara el
  // objeto `icons`, Next deja de emitir por convención el link de app/icon.svg
  // (el de app/favicon.ico sí lo sigue emitiendo). Por eso icon.svg se vuelve a
  // declarar aquí a mano: si no, este cambio le quitaría a la web un icono que
  // hoy sí tiene. favicon.ico NO se declara, para no duplicar su link.
  // El `?v=` NO es decorativo. Los navegadores guardan el favicon durante
  // semanas y lo sirven desde su caché aunque el archivo del servidor haya
  // cambiado: sin este parámetro, el icono nuevo (bandera + c azul, 5 de
  // agosto) tardaría días en aparecer y parecería que el despliegue falló.
  // Al cambiar la URL se le fuerza a pedirlo otra vez. Mismo truco que usa
  // /coming-soon con "/logo-white.svg?v=2". Si algún día se vuelve a cambiar
  // el dibujo, hay que subir el número aquí también.
  icons: {
    icon: [{ url: "/icon.svg?v=3", type: "image/svg+xml", sizes: "any" }],
    // A sangre completa y SIN canal alfa a propósito: iOS aplica su propia
    // máscara "squircle" y rellena de negro cualquier transparencia. Si se le
    // entrega el logo ya redondeado se ve un doble redondeo con borde feo.
    // Está en /icons/ (y no como app/apple-icon.png) porque ahí mismo irán los
    // iconos del manifest de la PWA en la fase 3.
    apple: [
      { url: "/icons/apple-touch-icon.png?v=3", sizes: "180x180", type: "image/png" },
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
        {/* Cloudflare Web Analytics: gratis, sin cookies, sin banner de consentimiento.
            colbisnes.com no está proxiado por Cloudflare (confirmado: sin header cf-ray),
            así que no hay inyección automática — este snippet manual es el único camino. */}
        <script
          defer
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon='{"token": "76b8e7f07ad94e219b19ac6a892ccaf4"}'
        />
      </head>
      <body className={inter.className}>
        {/* Aviso de MODO PRUEBA. Va fuera de los providers a propósito: no depende
            de sesión ni de contexto, y así se pinta aunque algo más falle. Solo se
            ve si el navegador entró con el link secreto de prelanzamiento. */}
        <BannerModoPrueba />
        {/* Globos y pirotecnia del día de la apertura. Va aquí fuera por lo mismo
            que el banner: no depende de sesión ni de contexto. Se apaga solo
            cuando termina el 12 de agosto. */}
        <CelebracionLanzamiento />
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
