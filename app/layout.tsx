import type { Metadata, Viewport } from "next";
import { Manrope, Nunito } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/i18n/I18nProvider";
import { PlantStoreProvider } from "@/data/PlantStore";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

const nunito = Nunito({
  subsets: ["latin", "cyrillic"],
  variable: "--font-nunito",
  display: "swap"
});

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap"
});

export const metadata: Metadata = {
  title: "My Plants",
  description: "A warm AI companion for houseplant care.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "My Plants",
    statusBarStyle: "default"
  }
};

export const viewport: Viewport = {
  themeColor: "#f7f4ef",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${nunito.variable} ${manrope.variable} font-body antialiased`}>
        <I18nProvider>
          <PlantStoreProvider>
            <ServiceWorkerRegistration />
            {children}
          </PlantStoreProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
