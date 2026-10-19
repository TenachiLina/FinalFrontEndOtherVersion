import { Cairo, Outfit } from 'next/font/google';
import './globals.css';
import "flatpickr/dist/flatpickr.css";
import { SidebarProvider } from '@/context/SidebarContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import FeedbackHost from '@/components/ui/feedback/FeedbackHost';
import { I18nProvider } from '@/context/I18nContext';
import { EARLY_DIR_SCRIPT } from '@/lib/i18n';

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

// Arabic text (Outfit has no Arabic letters); used when the page is in Arabic
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        {/* Sets lang/dir from the saved language before the page paints */}
        <script dangerouslySetInnerHTML={{ __html: EARLY_DIR_SCRIPT }} />
      </head>
      <body className={`${outfit.className} ${outfit.variable} ${cairo.variable} dark:bg-gray-900`}>
        <ThemeProvider>
          <AuthProvider>
            <I18nProvider>
              <SidebarProvider>{children}</SidebarProvider>
              <FeedbackHost />
            </I18nProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
