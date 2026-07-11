import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AppProvider } from '@/context/AppContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { ToastProvider } from '@/components/Toast';
import BluWidget from '@/components/BluWidget';
import ProfileCompletionAlert from '@/components/ProfileCompletionAlert';

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
