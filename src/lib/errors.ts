/**
 * Our own misconfiguration (not the sender's fault). Surfaces as HTTP 500 so
 * the sender retries, rather than 400 which would tell them their request was wrong.
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}
