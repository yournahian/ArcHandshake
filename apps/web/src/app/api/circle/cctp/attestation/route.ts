import { NextRequest, NextResponse } from "next/server";

const IRIS_API = "https://iris-api-sandbox.circle.com";

// Supported source domains for CCTP V2 testnets
const SOURCE_DOMAINS = [6, 0, 3, 1]; // Base Sepolia, Eth Sepolia, Arb Sepolia, Avax Fuji

/**
 * GET /api/circle/cctp/attestation
 *
 * Supports two query types:
 * 1. V2 (recommended): ?txHash=0x...&sourceDomain=6
 *    Proxies Circle CCTP V2 Messages API.
 *    Will search all supported testnet source domains if the transaction is not found on the specified domain.
 *    Returns { status: "pending" | "complete", attestation: "0x...", messageBytes: "0x..." }
 * 
 * 2. V1 (legacy fallback): ?messageHash=0x...
 *    Proxies Circle CCTP V1 Attestations API.
 */
export async function GET(req: NextRequest) {
  const sourceDomain = req.nextUrl.searchParams.get("sourceDomain");
  const txHash = req.nextUrl.searchParams.get("txHash");
  const messageHash = req.nextUrl.searchParams.get("messageHash");

  if (!sourceDomain && !txHash && !messageHash) {
    return NextResponse.json(
      { error: "Either (sourceDomain and txHash) or messageHash is required" },
      { status: 400 }
    );
  }

  try {
    // CCTP V2 Query Flow
    if (txHash) {
      // Prioritize the requested sourceDomain if specified, otherwise fall back to checking all domains
      const domainsToCheck = sourceDomain 
        ? [Number(sourceDomain), ...SOURCE_DOMAINS.filter(d => d !== Number(sourceDomain))]
        : SOURCE_DOMAINS;

      for (const domain of domainsToCheck) {
        const url = `${IRIS_API}/v2/messages/${domain}?transactionHash=${txHash}`;
        try {
          const res = await fetch(url, {
            headers: { Accept: "application/json" },
            cache: "no-store",
          });

          if (res.ok) {
            const data = await res.json();
            if (data.messages && data.messages.length > 0) {
              const msg = data.messages[0];
              return NextResponse.json({
                status: msg.status, // "complete" | "pending_confirmations"
                attestation: msg.attestation || null,
                messageBytes: msg.message || null,
                sourceDomain: domain,
              });
            }
          }
        } catch (domainErr) {
          console.warn(`[CCTP Proxy] Error checking domain ${domain}:`, domainErr);
        }
      }
      
      // If not found in any domain, return pending on the fallback domain
      const fallbackDomain = sourceDomain ? Number(sourceDomain) : 6;
      return NextResponse.json({ 
        status: "pending_confirmations", 
        attestation: null, 
        messageBytes: null,
        sourceDomain: fallbackDomain,
      });
    }

    // CCTP V1 Legacy Fallback Flow
    const url = `${IRIS_API}/attestations/${messageHash}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });

  } catch (err: any) {
    console.error("[CCTP Attestation Proxy] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch attestation" },
      { status: 500 }
    );
  }
}
