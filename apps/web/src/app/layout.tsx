import "./globals.css";
import React from "react";
import { Web3Provider } from "@/components/Web3Provider";
import { CircleWalletProvider } from "@/components/CircleWalletContext";
import { CircleWalletSetup } from "@/components/CircleWalletSetup";
import { TelegramProvider } from "@/components/TelegramProvider";
import { MobileNav } from "@/components/MobileNav";
import HoverFooter from "@/components/ui/hover-footer";

export const metadata = {
  title: "ArcHandshake - Autonomous Escrow & Group Accountant",
  description: "Secure digital/physical escrows and group finance pools on Arc L1 Blockchain",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Telegram Mini App SDK — loaded synchronously so WebApp is available immediately */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://telegram.org/js/telegram-web-app.js" />
      </head>
      <body>
        <TelegramProvider>
          <Web3Provider>
            <CircleWalletProvider>
              {/* Auto-shows PIN setup modal for Telegram users who don't yet have a wallet */}
              <CircleWalletSetup />

              {/* Responsive nav: desktop top bar + mobile bottom tab bar */}
              <MobileNav />

              <main className="dashboard-container">
                {children}
              </main>

              <HoverFooter />
            </CircleWalletProvider>
          </Web3Provider>
        </TelegramProvider>
      </body>
    </html>
  );
}
