import "./globals.css";
import React from "react";
import { Web3Provider } from "@/components/Web3Provider";
import Link from "next/link";
import { HeaderWallet } from "@/components/HeaderWallet";

export const metadata = {
  title: "ArcHandshake - Autonomous Escrow & Group Accountant",
  description: "Secure digital/physical escrows and group finance pools on Arc L1 Blockchain",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Web3Provider>
          <header className="glass-card main-header">
            <Link href="/" className="header-logo">
              ArcHandshake
            </Link>

            <nav className="main-nav">
              <Link href="/escrow" className="nav-link">OTC Escrow</Link>
              <Link href="/meetup" className="nav-link">Physical Escrow</Link>
              <Link href="/treasury" className="nav-link">Group Pool</Link>
            </nav>

            <HeaderWallet />
          </header>

          <main className="dashboard-container">
            {children}
          </main>
        </Web3Provider>
      </body>
    </html>
  );
}
