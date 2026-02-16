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
};

import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Providers } from '@/components/providers';
import { ThemeToggle } from '@/components/ThemeToggle';
import LanguageSwitch from '@/components/LanguageSwitch';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground transition-colors duration-300`}
      >
        <NextIntlClientProvider messages={messages}>
          <Providers>
            {children}
            <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 p-2 rounded-full bg-neutral-900/80 backdrop-blur-md border border-white/10 shadow-2xl">
              <LanguageSwitch />
              <div className="w-px h-4 bg-white/10"></div>
              <ThemeToggle />
            </div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
