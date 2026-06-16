"use client";

import React, { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export function HeaderWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [showConnectors, setShowConnectors] = useState(false);

  if (isConnected && address) {
    const formatted = `${address.slice(0, 6)}...${address.slice(-4)}`;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{
          fontFamily: "Space Grotesk",
          fontSize: "0.9rem",
          background: "rgba(99, 102, 241, 0.1)",
          color: "#6366f1",
          padding: "6px 12px",
          borderRadius: "8px",
          border: "1px solid rgba(99, 102, 241, 0.2)"
        }}>{formatted}</span>
        <button onClick={() => disconnect()} className="btn-secondary" style={{ padding: "8px 16px", fontSize: "0.9rem" }}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setShowConnectors(!showConnectors)}
        className="btn-primary"
        style={{ padding: "10px 20px", fontSize: "0.9rem" }}
        disabled={isPending}
      >
        {isPending ? "Connecting..." : "Connect Wallet"}
      </button>

      {showConnectors && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          background: "var(--bg-card)",
          border: "1px solid var(--border-color)",
          borderRadius: "12px",
          padding: "8px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          minWidth: "180px",
          zIndex: 100,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
        }}>
          {connectors.map((connector) => (
            <button
              key={connector.id}
              onClick={() => {
                connect({ connector });
                setShowConnectors(false);
              }}
              className="btn-secondary"
              style={{ width: "100%", justifyContent: "flex-start", padding: "10px 14px", fontSize: "0.9rem" }}
            >
              {connector.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
