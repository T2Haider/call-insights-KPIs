import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Converts a phone number in any common format to E.164 (e.g. +14155550123).
 * Returns null when the input is not a valid number.
 */
export function toE164(raw: string, defaultRegion: string): string | null {
  const parsed = parsePhoneNumberFromString(raw.trim(), defaultRegion as CountryCode);
  return parsed?.isValid() ? parsed.number : null;
}

/** Human-friendly display: national format for US/CA, international otherwise. */
export function formatPhoneForDisplay(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  return parsed.country === "US" || parsed.country === "CA"
    ? parsed.formatNational()
    : parsed.formatInternational();
}
