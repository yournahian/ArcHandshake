"use client";

import React from "react";
import Link from "next/link";
import { ShieldAlert, QrCode, Landmark, Handshake, ShieldCheck, Cpu } from "lucide-react";

export default function Home() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "60px", padding: "20px 0" }}>
      {/* Hero Section */}
      <section style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "24px", padding: "40px 0" }}>
        <h1 style={{ fontSize: "3.5rem", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
          Trustless P2P Commerce & Group Treasury on <span className="gradient-text">Arc L1</span>
        </h1>
        <p style={{ fontSize: "1.25rem", color: "var(--text-secondary)", maxWidth: "700px", margin: "0 auto", lineHeight: 1.5 }}>
          The ultimate bot-integrated escrow client and collaborative accountant. Lock digital OTC trades with AI verification, settle physical sales instantly with QR codes, and run group savings pools with smart spending rules.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: "16px", marginTop: "12px" }}>
          <Link href="/escrow/create" className="btn-primary" style={{ fontSize: "1.1rem" }}>
            <Handshake size={20} /> Create an Escrow
          </Link>
          <Link href="/treasury" className="btn-secondary" style={{ fontSize: "1.1rem" }}>
            <Landmark size={20} /> Group Pools
          </Link>
        </div>
      </section>

      {/* Feature Grid */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px" }}>
        {/* Card 1: Digital OTC */}
        <div className="glass-card" style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{
            background: "rgba(99, 102, 241, 0.1)",
            color: "var(--primary)",
            width: "50px",
            height: "50px",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <ShieldCheck size={28} />
          </div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Digital OTC Escrow</h2>
          <p style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Automate service milestones and OTC token swaps. Deliverables are uploaded securely, checked by our autonomous AI validation agent, and held in watermarked preview until payment is settled.
          </p>
          <Link href="/escrow" style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none", marginTop: "auto", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            Enter OTC Portal &rarr;
          </Link>
        </div>

        {/* Card 2: Physical Meetup */}
        <div className="glass-card" style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{
            background: "rgba(168, 85, 247, 0.1)",
            color: "var(--secondary)",
            width: "50px",
            height: "50px",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <QrCode size={28} />
          </div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Physical Escrow (Meetups)</h2>
          <p style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Meet in person to trade goods safely. The buyer locks USDC, and once verified, displays a secure release QR code. The seller scans it to instantly trigger the payout using Arc's sub-second finality.
          </p>
          <Link href="/meetup" style={{ color: "var(--secondary)", fontWeight: 600, textDecoration: "none", marginTop: "auto", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            Enter Meetup Portal &rarr;
          </Link>
        </div>

        {/* Card 3: Group Pool */}
        <div className="glass-card" style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{
            background: "rgba(236, 72, 153, 0.1)",
            color: "var(--accent)",
            width: "50px",
            height: "50px",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <Landmark size={28} />
          </div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Group Pool & Accountant</h2>
          <p style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Pool funds with friends or DAO members. Set spending allowances for direct micro-payments, propose larger escrows, and cast votes inside your Telegram chat to execute shared treasury expenditures.
          </p>
          <Link href="/treasury" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none", marginTop: "auto", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            Enter Treasury Portal &rarr;
          </Link>
        </div>
      </section>

      {/* Network Stats Section */}
      <section className="glass-card" style={{ padding: "40px", display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: "32px", textAlign: "center" }}>
        <div>
          <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "var(--primary)" }}>~0.48s</div>
          <div style={{ color: "var(--text-secondary)", marginTop: "4px" }}>Average Block Time</div>
        </div>
        <div style={{ width: "1px", background: "var(--border-color)", height: "60px" }}></div>
        <div>
          <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "var(--secondary)" }}>$0.01</div>
          <div style={{ color: "var(--text-secondary)", marginTop: "4px" }}>Target Base Fee (Paid in USDC)</div>
        </div>
        <div style={{ width: "1px", background: "var(--border-color)", height: "60px" }}></div>
        <div>
          <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "var(--accent)" }}>100%</div>
          <div style={{ color: "var(--text-secondary)", marginTop: "4px" }}>Sub-second Deterministic Finality</div>
        </div>
      </section>
    </div>
  );
}
