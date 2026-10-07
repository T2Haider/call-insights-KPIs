/**
 * Runs once when the web server starts, before it accepts requests. The Node-only
 * work lives in `instrumentation-node.ts` so Next does not try to bundle it for the Edge runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateConfigOnStartup } = await import("./instrumentation-node");
    validateConfigOnStartup();
  }
}
