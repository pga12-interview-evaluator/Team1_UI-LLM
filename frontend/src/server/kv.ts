import "server-only";

/**
 * Minimal Upstash Redis REST client (fetch only, no driver). Used only when UPSTASH_REDIS_REST_URL
 * and UPSTASH_REDIS_REST_TOKEN are set — i.e. in the cloud, where the app has no disk. Locally
 * the stores keep writing JSON files under DATA_DIR and this module is never called.
 *
 * Model: the in-memory maps stay the source of truth for the single running instance; every
 * save is mirrored here (write-behind), and the maps are filled from here once at boot.
 */

type Command = (string | number)[];

interface KvConfig {
  url: string;
  token: string;
}

export function kvConfig(): KvConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export const kvEnabled = (): boolean => kvConfig() !== null;

async function call<T>(commands: Command[]): Promise<T[]> {
  const config = kvConfig();
  if (!config) throw new Error("KV is not configured");
  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok)
    throw new Error(`KV ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const rows = (await response.json()) as { result?: T; error?: string }[];
  return rows.map((row) => {
    if (row.error) throw new Error(`KV command failed: ${row.error}`);
    return row.result as T;
  });
}

export const kv = {
  /** SET key + SADD index in one round trip. */
  async putJson(index: string, key: string, value: unknown): Promise<void> {
    await call([
      ["SET", key, JSON.stringify(value)],
      ["SADD", index, key],
    ]);
  },
  async delJson(index: string, key: string): Promise<void> {
    await call([
      ["DEL", key],
      ["SREM", index, key],
    ]);
  },
  /** Every JSON document registered under `index`. */
  async allJson<T>(index: string): Promise<T[]> {
    const [keys] = await call<string[]>([["SMEMBERS", index]]);
    if (!keys?.length) return [];
    const [values] = await call<(string | null)[]>([["MGET", ...keys]]);
    return (values ?? [])
      .filter((v): v is string => typeof v === "string")
      .map((v) => JSON.parse(v) as T);
  },
  async getJson<T>(key: string): Promise<T | null> {
    const [value] = await call<string | null>([["GET", key]]);
    return typeof value === "string" ? (JSON.parse(value) as T) : null;
  },
  async setJson(key: string, value: unknown): Promise<void> {
    await call([["SET", key, JSON.stringify(value)]]);
  },
};
