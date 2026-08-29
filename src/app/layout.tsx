import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";
export const instant = false;

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ORGanIZE | LSPU-OSAS",
    template: "%s | ORGanIZE",
  },
  description:
    "Official system of the Laguna State Polytechnic University Office of Student Affairs and Services. All rights reserved.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
