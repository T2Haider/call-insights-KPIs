/**
 * Length of a PCM WAV file in seconds, read from its RIFF header (the "fmt "
 * chunk's byte rate and the "data" chunk's size). Returns null for anything
 * that is not a readable WAV file.
 */
export function wavDurationSeconds(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) =>
    String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 4, bytes.byteLength)));

  if (bytes.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;

  let byteRate: number | null = null;
  for (let offset = 12; offset + 8 <= bytes.byteLength;) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt " && offset + 20 <= bytes.byteLength) {
      byteRate = view.getUint32(offset + 16, true);
    } else if (id === "data") {
      return byteRate ? size / byteRate : null;
    }
    offset += 8 + size + (size % 2); // chunks are word-aligned
  }
  return null;
}
