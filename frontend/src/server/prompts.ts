import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getServerEnv } from "@/lib/config/env";

/**
 * Loads the four Gemini system instructions from prompts_v2/*.md (the fenced ```text block)
 * and substitutes the single data placeholder each one declares.
 */
const FILES = {
  "01": {
    file: "01_interview_blueprint.md",
    placeholders: ["interview_input_json", "policy_snapshot_json", "requisition_blueprint_json"],
  },
  "02": { file: "02_live_interviewer.md", placeholders: ["session_state_json"] },
  "03": { file: "03_answer_evaluator.md", placeholders: ["assessment_input_json"] },
  "04": { file: "04_final_assessment.md", placeholders: ["final_assessment_input_json"] },
} as const;

type Stage = keyof typeof FILES;

const cache = new Map<Stage, string>();

export function promptsDir(): string {
  const configured = getServerEnv().PROMPTS_DIR;
  const candidates = [
    configured,
    path.resolve(process.cwd(), "..", "prompts_v2"),
    path.resolve(process.cwd(), "prompts_v2"),
    path.resolve(process.cwd(), "..", "..", "prompts_v2"),
  ].filter((p): p is string => !!p);
  const found = candidates.find((p) =>
    existsSync(/*turbopackIgnore: true*/ path.join(p, FILES["02"].file)),
  );
  if (!found) {
    throw new Error(
      `prompts_v2 directory not found. Set PROMPTS_DIR. Tried: ${candidates.join(", ")}`,
    );
  }
  return found;
}

function systemInstruction(stage: Stage): string {
  const cached = cache.get(stage);
  if (cached) return cached;
  const source = readFileSync(
    /*turbopackIgnore: true*/ path.join(promptsDir(), FILES[stage].file),
    "utf8",
  );
  const match = /```text\r?\n([\s\S]*?)\r?\n```/.exec(source);
  if (!match) throw new Error(`No fenced text block found in ${FILES[stage].file}`);
  cache.set(stage, match[1]);
  return match[1];
}

/** Render a stage prompt with its JSON payload(s) substituted. Values are serialized objects. */
export function renderPrompt(stage: Stage, payloads: Record<string, unknown>): string {
  let text = systemInstruction(stage);
  for (const name of FILES[stage].placeholders) {
    const value = payloads[name];
    const serialized = value === undefined ? "null" : JSON.stringify(value, null, 1);
    text = text.split(`{{${name}}}`).join(serialized);
  }
  return text;
}

export function promptVersions(): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const [stage, meta] of Object.entries(FILES)) {
    const source = readFileSync(
      /*turbopackIgnore: true*/ path.join(promptsDir(), meta.file),
      "utf8",
    );
    versions[stage] = /prompt_version:\s*([0-9.]+)/.exec(source)?.[1] ?? "unknown";
  }
  const contracts = readFileSync(
    /*turbopackIgnore: true*/ path.join(promptsDir(), "00_shared_contracts.md"),
    "utf8",
  );
  versions.contracts = /contracts_version:\s*([0-9.]+)/.exec(contracts)?.[1] ?? "unknown";
  return versions;
}
