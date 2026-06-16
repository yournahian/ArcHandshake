// Utility functions for tracking escrow job IDs in localStorage.
// Kept in a separate lib file — NOT in a page file — to avoid Next.js
// build errors from non-page named exports.

const LS_KEY = "arc_known_job_ids";
const LS_TYPE_KEY = "arc_job_types"; // { [jobId]: 'physical' | 'digital' }

export function getStoredJobIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function trackJobId(id: number) {
  if (typeof window === "undefined") return;
  const existing = getStoredJobIds();
  if (!existing.includes(id)) {
    localStorage.setItem(LS_KEY, JSON.stringify([...existing, id].sort((a, b) => b - a)));
  }
}

export function setJobType(id: number, type: "physical" | "digital") {
  if (typeof window === "undefined") return;
  try {
    const existing = JSON.parse(localStorage.getItem(LS_TYPE_KEY) || "{}");
    existing[id] = type;
    localStorage.setItem(LS_TYPE_KEY, JSON.stringify(existing));
  } catch {}
}

export function getJobType(id: number): "physical" | "digital" | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = JSON.parse(localStorage.getItem(LS_TYPE_KEY) || "{}");
    return stored[id] ?? null;
  } catch {
    return null;
  }
}
