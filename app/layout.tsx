import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Grand Buffet — Extraction Cooking",
  description: "Drop in. Harvest volatile ingredients. Cook to survive. Extract before you starve.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
