import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono, Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Tandemu — AI Teammate Dashboard",
    template: "%s | Tandemu",
  },
  description:
    "Tandemu is an AI teammate that learns your coding style, adapts to your personality, and gives engineering leads the visibility they need.",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Tandemu",
    title: "Tandemu — AI Teammate Dashboard",
    description:
      "An AI that remembers you. A team that sees everything. Developers love it. Leads trust it.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tandemu — AI Teammate Dashboard",
    description:
      "An AI that remembers you. A team that sees everything.",
  },
  icons: {
    icon: "/logo.svg",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn(jakarta.variable, jetbrains.variable, "font-sans", geist.variable, "dark")} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen font-sans antialiased">
        <ThemeProvider>
          <AuthProvider>
            <TooltipProvider>
              <DashboardLayout>{children}</DashboardLayout>
              <Toaster richColors position="top-right" />
            </TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
