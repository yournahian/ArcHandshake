"use client";

import React from "react";
import Link from "next/link";
import { QrCode, Plus } from "lucide-react";

export default function MeetupList() {
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "20px 0" }}>
      <div className="glass-card" style={{ padding: "40px", display: "flex", flexDirection: "column", gap: "28px" }}>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: "1.8rem", fontWeight: 700 }}>Active Physical Meetups</h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "4px" }}>In-person sales backed by instant QR payment release</p>
          </div>
          <Link href="/escrow/create?type=physical" className="btn-primary" style={{ textDecoration: "none" }}>
            <Plus size={16} /> New Meetup
          </Link>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Active Meetup item */}
          <Link href="/meetup/1" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid var(--border-color)",
              borderRadius: "12px",
              padding: "20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
              transition: "all 0.2s"
            }}>
              <div>
                <h4 style={{ fontWeight: 600 }}>Craigslist Graphic Card (RTX 4070)</h4>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "4px" }}>Buyer: You | Seller: 0x7099...79C8</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontWeight: 700, fontFamily: "Space Grotesk" }}>150 USDC</span>
                <span className="badge badge-warning">Awaiting QR scan</span>
              </div>
            </div>
          </Link>
        </div>

      </div>
    </div>
  );
}
