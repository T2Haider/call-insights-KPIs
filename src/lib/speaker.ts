/**
 * Display names for transcript speakers. Roles are stored exactly as the sender
 * provides them ("agent", "user"); only the DISPLAY is mapped. Unknown roles are
 * shown as received so nothing is hidden or mislabeled.
 */
export type SpeakerKind = "agent" | "caller" | "other";

export const AGENT_LABEL = "Amelia (AI Agent)";
export const CALLER_LABEL = "Caller";

export function speakerKind(role: string): SpeakerKind {
  switch (role.trim().toLowerCase()) {
    case "agent":
      return "agent";
    case "user":
      return "caller";
    default:
      return "other";
  }
}

export function speakerLabel(role: string): string {
  switch (speakerKind(role)) {
    case "agent":
      return AGENT_LABEL;
    case "caller":
      return CALLER_LABEL;
    default:
      return role;
  }
}
