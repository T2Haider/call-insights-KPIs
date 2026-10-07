import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { findCallByConversationId, upsertCall } from "@/db/callRepository";
import { createDb, type Db } from "@/db/client";
import { builderFor } from "./helpers";

const dir = mkdtempSync(path.join(os.tmpdir(), "call-insights-test-"));
const opened: Db[] = [];

function open(file: string): Db {
  const db = createDb(file);
  opened.push(db);
  return db;
}

afterAll(() => {
  // Windows cannot delete a SQLite file that is still open.
  for (const db of opened) db.$client.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

describe("createDb", () => {
  it("opens a fresh file, migrates it, and can be opened again by another connection", () => {
    const file = path.join(dir, "app.db");
    const first = open(file);
    upsertCall(first, "conv-1", builderFor({ conversationId: "conv-1" }));

    // A second connection (like the worker next to the web server) sees the same data,
    // and re-running migrations on an already-migrated file is a harmless no-op.
    const second = open(file);
    expect(findCallByConversationId(second, "conv-1")?.conversationId).toBe("conv-1");
  });

  it("creates missing parent directories", () => {
    expect(() => open(path.join(dir, "nested", "deeper", "app.db"))).not.toThrow();
  });
});
