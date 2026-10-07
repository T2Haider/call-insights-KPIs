/**
 * Test fixtures in the sender's real payload shape. ALL DATA HERE IS FAKE:
 * never paste real customer data, transcripts or recording links into tests.
 */
export const FAKE_PHONE = "+13125550123";
export const FAKE_CONVERSATION_ID = "call-_+13125550123_AbCdEf123456";
export const FAKE_RECORDING_URL =
  "https://minio.example.com/bucket/recordings/2026/10/06/13125550123_20261006_180045.wav" +
  "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=FAKEKEY%2F20261006%2Fus-east-1%2Fs3%2Faws4_request" +
  "&X-Amz-Expires=3600&X-Amz-Signature=0123456789abcdef";

/** Unix seconds for 2026-10-06T17:56:51Z. */
export const FAKE_TIMESTAMP = 1791309411;

/** Includes a line break and a message cut off mid-sentence, which must survive untouched. */
export const FAKE_TRANSCRIPT = [
  {
    role: "agent",
    message:
      "Thank you for calling, I'm Amelia, your AI assistant, on a recorded line. Are you calling about your account today?",
  },
  { role: "user", message: "Yes, I'd like to update my billing address." },
  { role: "agent", message: "I can help with that.\n\nCould you share your account number?" },
  { role: "user", message: "Sure, it's 4 8 2 1 3. And I also wanted to ask whether" },
];

export function fakePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    phone_number: FAKE_PHONE,
    transcript: FAKE_TRANSCRIPT,
    timestamp: FAKE_TIMESTAMP,
    conversation_id: FAKE_CONVERSATION_ID,
    call_recording_path: FAKE_RECORDING_URL,
    ...overrides,
  };
}
