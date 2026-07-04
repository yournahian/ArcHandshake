"use client";

import React, { useState } from "react";
import { Star, X, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWallet } from "@/hooks/useWallet";

interface ReviewModalProps {
  escrowId: number;
  revieweeAddress: string;
  revieweeName?: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

export function ReviewModal({
  escrowId,
  revieweeAddress,
  revieweeName,
  onClose,
  onSubmitted,
}: ReviewModalProps) {
  const { address } = useWallet();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const hasSupabase = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const handleSubmit = async () => {
    if (!address) return;
    if (rating < 1) { setError("Please select a star rating."); return; }
    setSubmitting(true);
    setError("");
    try {
      if (hasSupabase) {
        const { error: dbErr } = await supabase.from("reviews").upsert({
          escrow_id: escrowId,
          reviewer_address: address.toLowerCase(),
          reviewee_address: revieweeAddress.toLowerCase(),
          rating,
          comment: comment.trim() || null,
        });
        if (dbErr) throw dbErr;

        // Notify the reviewee
        await supabase.from("notifications").insert({
          recipient_address: revieweeAddress.toLowerCase(),
          type: "REVIEW_RECEIVED",
          escrow_id: escrowId,
          message: `You received a ${rating}-star review for Escrow #${escrowId}.`,
          read: false,
        });
      }
      setDone(true);
      setTimeout(() => { onSubmitted?.(); onClose(); }, 1500);
    } catch (e: any) {
      setError(e?.message || "Failed to submit review.");
    } finally {
      setSubmitting(false);
    }
  };

  const labels = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: "400px",
          background: "hsl(0 0% 8%)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "18px",
          padding: "24px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
          animation: "slideUp 0.18s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: "1.05rem", color: "#f1f5f9" }}>
              Leave a Review
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: "0.78rem", color: "#6b7280" }}>
              For {revieweeName || `${revieweeAddress.slice(0, 6)}...${revieweeAddress.slice(-4)}`} · Escrow #{escrowId}
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}>
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>🎉</div>
            <p style={{ color: "#10b981", fontWeight: 700, fontSize: "0.95rem" }}>Review submitted!</p>
          </div>
        ) : (
          <>
            {/* Stars */}
            <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "8px" }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHover(star)}
                  onMouseLeave={() => setHover(0)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    padding: "4px",
                    transform: (hover || rating) >= star ? "scale(1.15)" : "scale(1)",
                    transition: "transform 0.15s",
                  }}
                >
                  <Star
                    size={32}
                    style={{
                      color: (hover || rating) >= star ? "#f59e0b" : "rgba(255,255,255,0.15)",
                      fill: (hover || rating) >= star ? "#f59e0b" : "transparent",
                      transition: "all 0.15s",
                    }}
                  />
                </button>
              ))}
            </div>
            <p style={{ textAlign: "center", fontSize: "0.8rem", color: "#f59e0b", marginBottom: "16px", minHeight: "20px" }}>
              {labels[hover || rating]}
            </p>

            {/* Comment */}
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Optional: share your experience..."
              rows={3}
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "10px",
                color: "#f1f5f9",
                fontSize: "0.84rem",
                padding: "10px 14px",
                resize: "none",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "var(--font-sans)",
              }}
            />

            {error && <p style={{ color: "#ef4444", fontSize: "0.75rem", margin: "8px 0 0" }}>⚠ {error}</p>}

            <button
              onClick={handleSubmit}
              disabled={submitting || rating < 1}
              style={{
                width: "100%",
                marginTop: "16px",
                padding: "11px",
                borderRadius: "10px",
                border: "none",
                background: rating < 1 ? "rgba(255,255,255,0.06)" : "hsl(var(--primary))",
                color: rating < 1 ? "#6b7280" : "hsl(var(--primary-foreground))",
                fontWeight: 700,
                fontSize: "0.88rem",
                cursor: rating < 1 ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              }}
            >
              <Send size={14} />
              {submitting ? "Submitting..." : "Submit Review"}
            </button>
          </>
        )}
      </div>
      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(12px) scale(0.97) } to { opacity:1; transform:translateY(0) scale(1) } }
      `}</style>
    </div>
  );
}
