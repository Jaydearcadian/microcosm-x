import type { Metadata, Viewport } from "next";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Microcosm — Commerce OS for Humans & Agents",
  description:
    "Give agents budgets, not bank accounts. Bounded Spaces on OKX X Layer: work orders, verifiable deliverable proof, deterministic boundaries. $0 lost.",
};

export const viewport: Viewport = {
  // --bg-page from globals.css. A mismatched theme-color is what makes the
  // mobile browser chrome and the overscroll bounce render a lighter band
  // under a dark app (DESIGN-REVIEW.md §2).
  themeColor: "#0a0a0b",
  colorScheme: "dark",
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
