import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Manifest",
  description: "Describe her. She appears. AI image generation from your words.",
  icons: { icon: "/manifest.jpg?v=2", shortcut: "/manifest.jpg?v=2" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#050505] text-zinc-200 font-sans min-h-screen">{children}</body>
    </html>
  );
}
