import "./globals.css";
import React from "react";
import { Web3Provider } from "@/components/Web3Provider";
import { CircleWalletProvider } from "@/components/CircleWalletContext";
import { CircleWalletSetup } from "@/components/CircleWalletSetup";
import Link from "next/link";
import { HeaderWallet } from "@/components/HeaderWallet";
import HoverFooter from "@/components/ui/hover-footer";

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
          <CircleWalletProvider>
            {/* Auto-shows PIN setup modal for Telegram users who don't yet have a wallet */}
            <CircleWalletSetup />

            <header className="main-header">
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

            <HoverFooter />
          </CircleWalletProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
