import type { DemoCall } from "./calls";

/** Recordings live in `public/recordings/`, so the web server serves them as static files. */
export const DEMO_RECORDINGS_PATH = "recordings";

export function demoRecordingFile(call: DemoCall): string {
  return `${call.slug}.wav`;
}

/** Same shape as real ids ("+" and "_" included), so URL encoding is exercised too. */
export function demoConversationId(call: DemoCall): string {
  const suffix = call.slug.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return `call-_${call.phoneNumber}_${suffix}`;
}

export interface DemoPayloadOptions {
  now: Date;
  /** Base URL of this dashboard (APP_URL); the recording link points at its static files. */
  appUrl: string;
  /** Length of the recording, when known; also gives the call an end time. */
  durationSeconds: number | null;
}

/** One demo call as the sender would POST it to the webhook. */
export function buildDemoPayload(
  call: DemoCall,
  options: DemoPayloadOptions,
): Record<string, unknown> {
  const startedAtSeconds = Math.floor(options.now.getTime() / 1000) - call.minutesAgo * 60;
  const base = options.appUrl.endsWith("/") ? options.appUrl : `${options.appUrl}/`;
  const duration = options.durationSeconds == null ? null : Math.round(options.durationSeconds);

  return {
    conversation_id: demoConversationId(call),
    phone_number: call.phoneNumber,
    timestamp: startedAtSeconds,
    transcript: call.transcript,
    call_recording_path: new URL(`${DEMO_RECORDINGS_PATH}/${demoRecordingFile(call)}`, base).href,
    ...(duration == null
      ? {}
      : { duration_seconds: duration, ended_at: startedAtSeconds + duration }),
  };
}
