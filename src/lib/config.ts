import { z } from "zod";

/**
 * Single source of truth for configuration. Every setting comes from an
 * environment variable and is validated once, so misconfiguration fails fast
 * with a readable message instead of surfacing later as a confusing bug.
 * Document every variable in `.env.example`.
 */
const DEFAULT_WEBHOOK_SECRET = "dev-only-webhook-secret";
const DEFAULT_INTERNAL_SECRET = "dev-only-internal-secret";

const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

    /** Path of the SQLite file (relative paths resolve from the working directory). */
    DATABASE_URL: z.string().min(1).default("./data/app.db"),

    /** Shared secret the call sender puts in `Authorization: Bearer <secret>`. */
    WEBHOOK_SECRET: z.string().min(16).default(DEFAULT_WEBHOOK_SECRET),
    /** Largest accepted webhook body. Long transcripts are fine; this only stops abuse. */
    WEBHOOK_MAX_BODY_BYTES: z.coerce.number().int().min(1024).default(5_242_880),

    /**
     * Prefix for `call_recording_path` values that are object paths rather than full URLs,
     * e.g. https://minio.example.com/recordings/ (see docs/WEBHOOK_SPEC.md).
     */
    RECORDING_BASE_URL: z.url().optional(),

    /** Region used to parse phone numbers that arrive without a "+" prefix. */
    DEFAULT_PHONE_REGION: z.string().length(2).toUpperCase().default("US"),

    /** A call still lacking recording/transcript after this long is marked "failed". */
    PROCESSING_TIMEOUT_MINUTES: z.coerce.number().int().min(1).default(120),

    /** Delete dashboard records older than this many days. 0 disables cleanup. */
    RETENTION_DAYS: z.coerce.number().int().min(0).default(30),

    /** How often the background worker checks for calls stuck in "processing". */
    WORKER_INTERVAL_SECONDS: z.coerce.number().int().min(1).default(60),

    /**
     * Load the 20 demo calls when the worker starts and the database is empty.
     * Unset means "only in development"; see `shouldSeedDemoData`.
     */
    SEED_DEMO_DATA: z.stringbool().optional(),

    /** Where the worker process reaches the web server, and the shared secret it uses. */
    APP_URL: z.url().default("http://localhost:3000"),
    INTERNAL_EVENTS_SECRET: z.string().min(8).default(DEFAULT_INTERNAL_SECRET),
  })
  .refine((c) => c.NODE_ENV !== "production" || c.WEBHOOK_SECRET !== DEFAULT_WEBHOOK_SECRET, {
    message: "Set a unique WEBHOOK_SECRET in production",
    path: ["WEBHOOK_SECRET"],
  })
  .refine(
    (c) => c.NODE_ENV !== "production" || c.INTERNAL_EVENTS_SECRET !== DEFAULT_INTERNAL_SECRET,
    {
      message: "Set a unique INTERNAL_EVENTS_SECRET in production",
      path: ["INTERNAL_EVENTS_SECRET"],
    },
  );

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}

/** Demo data is on by default in development only, so production never gets fake calls by accident. */
export function shouldSeedDemoData(config: Config): boolean {
  return config.SEED_DEMO_DATA ?? config.NODE_ENV === "development";
}

let cached: Config | undefined;

/** Memoized config for application code. Tests should call `loadConfig` directly. */
export function getConfig(): Config {
  cached ??= loadConfig();
  return cached;
}
