import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function waitForReceipt(publicClient: any, hash: `0x${string}`) {
  for (let i = 0; i < 30; i++) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      if (receipt) return receipt;
    } catch (e) {
      // Receipt not found yet — wait and retry
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Transaction receipt not found for hash: ${hash}`);
}

