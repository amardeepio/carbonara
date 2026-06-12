import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LocaleProvider } from "@/components/LocaleProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Carbonara — India Carbon Footprint Coach",
  description:
    "Track your daily carbon footprint with India-specific data and get smart, personalized, context-aware actions to reduce it.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
