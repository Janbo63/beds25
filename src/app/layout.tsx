import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Beds25 - Premium Hotel Management",
  description: "Modern hotel management system with Booking.com and Airbnb integration.",
  robots: {
    index: false,
    follow: false,
  },
};

import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Providers } from '@/components/providers';
import { ThemeToggle } from '@/components/ThemeToggle';
import LanguageSwitch from '@/components/LanguageSwitch';

import { APP_VERSION } from "@/lib/version";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var ver = "${APP_VERSION}";
                if (localStorage.getItem("beds25_version") !== ver) {
                  localStorage.setItem("beds25_version", ver);
                  if (window.caches) { window.caches.keys().then(function(keys) { keys.forEach(function(k) { window.caches.delete(k); }); }); }
                  sessionStorage.clear();
                }
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground transition-colors duration-300`}
      >
        <NextIntlClientProvider messages={messages}>
          <Providers>
            {children}
            <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 p-2 rounded-full bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border border-neutral-300 dark:border-white/10 shadow-2xl transition-colors duration-300">
              <span className="text-[10px] font-mono font-bold text-hotel-gold px-2.5 py-0.5 rounded-full bg-hotel-gold/10 border border-hotel-gold/30">
                {APP_VERSION}
              </span>
              <LanguageSwitch />
              <div className="w-px h-4 bg-neutral-300 dark:bg-white/10"></div>
              <ThemeToggle />
            </div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
