/**
 * `npm run demo:recordings`: regenerates `public/recordings/demo-XX.wav` from the
 * transcripts in `calls.ts`, so each recording says exactly what its transcript
 * shows. Uses the Windows built-in speech synthesizer (System.Speech), so it only
 * runs on Windows; the generated files are committed, so nobody else needs to.
 * Amelia uses a female voice and the caller a male one, at 8 kHz mono (phone quality).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLogger } from "@/lib/logger";
import { DEMO_CALLS, type DemoCall } from "./calls";
import { DEMO_RECORDINGS_PATH, demoRecordingFile } from "./payloads";

const log = createLogger("demo-recordings");

const VOICES = { agent: "Microsoft Zira Desktop", user: "Microsoft David Desktop" } as const;
const PAUSE_BETWEEN_TURNS = "700ms";
const OUT_DIR = path.join(process.cwd(), "public", DEMO_RECORDINGS_PATH);

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toSsml(call: DemoCall): string {
  const turns = call.transcript
    .map((m) => `<voice name="${VOICES[m.role]}">${escapeXml(m.message)}</voice>`)
    .join(`<break time="${PAUSE_BETWEEN_TURNS}"/>`);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">${turns}</speak>`;
}

// Reads a JSON list of { ssml, out } jobs and writes one WAV per job.
const SYNTHESIZE_PS = `
param([string]$JobsFile)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(8000,
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
foreach ($job in (Get-Content -Raw -Encoding UTF8 $JobsFile | ConvertFrom-Json)) {
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.SetOutputToWaveFile($job.out, $format)
  $synth.SpeakSsml((Get-Content -Raw -Encoding UTF8 $job.ssml))
  $synth.Dispose()
}
`;

function main(): void {
  if (process.platform !== "win32") {
    throw new Error(
      "Generating recordings needs Windows text-to-speech; the committed files work everywhere.",
    );
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const work = mkdtempSync(path.join(tmpdir(), "demo-recordings-"));
  try {
    const jobs = DEMO_CALLS.map((call) => {
      const ssml = path.join(work, `${call.slug}.ssml`);
      writeFileSync(ssml, toSsml(call), "utf8");
      return { ssml, out: path.join(OUT_DIR, demoRecordingFile(call)) };
    });
    const jobsFile = path.join(work, "jobs.json");
    const script = path.join(work, "synthesize.ps1");
    writeFileSync(jobsFile, JSON.stringify(jobs), "utf8");
    writeFileSync(script, SYNTHESIZE_PS, "utf8");

    const result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-JobsFile", jobsFile],
      { stdio: "inherit" },
    );
    if (result.status !== 0) throw new Error(`Speech synthesis failed (exit ${result.status})`);
    log.info(`Wrote ${jobs.length} recordings`, { dir: OUT_DIR });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  log.error("Could not generate demo recordings", { error });
  process.exit(1);
}
