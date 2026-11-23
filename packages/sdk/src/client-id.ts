import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ENV_VAR = "CLIPWRIGHT_CLIENT_ID";

export function resolveClientId(): string {
  const fromEnv = process.env[ENV_VAR];
  if (fromEnv !== undefined && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }

  const dir = join(homedir(), ".clipwright");
  const file = join(dir, "client-id");

  try {
    if (existsSync(file)) {
      const existing = readFileSync(file, "utf8").trim();
      if (existing.length > 0) {
        return existing;
      }
    }

    const id = randomUUID().replace(/-/g, "");
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, id, "utf8");
    return id;
  } catch (cause) {
    throw new Error(
      `Cannot read or create ~/.clipwright/client-id. Set the ${ENV_VAR} ` +
        `environment variable to a stable per-install identifier so idempotent ` +
        `retries deduplicate instead of billing twice.`,
      { cause },
    );
  }
}
