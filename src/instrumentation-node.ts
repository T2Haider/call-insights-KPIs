import { getConfig } from "@/lib/config";

/**
 * Validates configuration at startup so a misconfigured server (for example a
 * default WEBHOOK_SECRET in production) refuses to start with a clear message,
 * instead of failing on the first request.
 */
export function validateConfigOnStartup(): void {
  try {
    getConfig();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") throw error;
    // In production, exit so a supervisor / container shows the failure and restarts,
    // rather than leaving a server up that answers every request with a 500.
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
