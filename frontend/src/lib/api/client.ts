import type { z } from "zod";
import { apiBaseUrl } from "@/lib/config/env";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isRetryable(): boolean {
    return this.status === 429 || this.status >= 500 || this.status === 0;
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions<TSchema extends z.ZodTypeAny> {
  method?: Method;
  body?: unknown;
  schema: TSchema;
  signal?: AbortSignal;
  /** Idempotency key for POSTs that must not double-apply (answers, requests, decisions). */
  idempotencyKey?: string;
  retries?: number;
  headers?: Record<string, string>;
}

const RETRY_BASE_MS = 400;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

async function parseErrorBody(
  response: Response,
): Promise<{ code: string; message: string; details?: unknown }> {
  try {
    const data = (await response.json()) as { code?: string; message?: string; details?: unknown };
    return {
      code: data.code ?? `http_${response.status}`,
      message: data.message ?? response.statusText,
      details: data.details,
    };
  } catch {
    return { code: `http_${response.status}`, message: response.statusText };
  }
}

/**
 * Single fetch wrapper for every API call. Validates the response with zod so a contract
 * drift is caught at the boundary rather than deep in a component.
 */
export async function request<TSchema extends z.ZodTypeAny>(
  path: string,
  options: RequestOptions<TSchema>,
): Promise<z.infer<TSchema>> {
  const {
    method = "GET",
    body,
    schema,
    signal,
    idempotencyKey,
    retries = method === "GET" ? 2 : 0,
    headers = {},
  } = options;
  const url = path.startsWith("http") ? path : `${apiBaseUrl}${path}`;

  let attempt = 0;
  for (;;) {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        credentials: "same-origin",
        signal,
        cache: "no-store",
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      if (attempt < retries) {
        attempt += 1;
        await sleep(RETRY_BASE_MS * 2 ** attempt, signal);
        continue;
      }
      throw new ApiError(0, "network_error", "Could not reach the server.", error);
    }

    if (!response.ok) {
      const parsed = await parseErrorBody(response);
      const apiError = new ApiError(response.status, parsed.code, parsed.message, parsed.details);
      if (apiError.isRetryable && attempt < retries) {
        attempt += 1;
        await sleep(RETRY_BASE_MS * 2 ** attempt, signal);
        continue;
      }
      throw apiError;
    }

    if (response.status === 204) {
      return schema.parse(undefined);
    }

    const json: unknown = await response.json();
    const result = schema.safeParse(json);
    if (!result.success) {
      throw new ApiError(
        response.status,
        "contract_violation",
        "The server response did not match the expected contract.",
        result.error.flatten(),
      );
    }
    return result.data;
  }
}

/** Multipart upload helper (media chunks). Not JSON-bodied, so kept separate from `request`. */
export async function upload<TSchema extends z.ZodTypeAny>(
  path: string,
  form: FormData,
  schema: TSchema,
  signal?: AbortSignal,
): Promise<z.infer<TSchema>> {
  const url = path.startsWith("http") ? path : `${apiBaseUrl}${path}`;
  const response = await fetch(url, {
    method: "POST",
    body: form,
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) {
    const parsed = await parseErrorBody(response);
    throw new ApiError(response.status, parsed.code, parsed.message, parsed.details);
  }
  return schema.parse(await response.json());
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
