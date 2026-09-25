import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Microcosm — Commerce OS for Humans & Agents",
  description:
    "Give agents budgets, not bank accounts. Bounded Spaces on OKX X Layer: work orders, verifiable deliverable proof, deterministic boundaries. $0 lost.",
};

export const viewport: Viewport = {
  themeColor: "#020202",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
