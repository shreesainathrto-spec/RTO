// src/lib/cacheInvalidator.ts
import { queryClient } from "@/router";

export function invalidateCache() {
  try {
    queryClient.invalidateQueries();
    console.log("⚡ [CACHE] Query Cache Invalidated successfully.");
  } catch (err) {
    console.warn("⚠️ [CACHE] Failed to invalidate React Query cache:", err);
  }
}
