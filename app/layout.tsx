import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ResourceGrid",
  description: "Canonical resource and content intelligence for the Distilled Funding ecosystem."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
