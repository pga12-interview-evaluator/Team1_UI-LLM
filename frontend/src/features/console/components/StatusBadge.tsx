import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type {
  PressureLevel,
  Recommendation,
  RequisitionStatus,
  SessionStatus,
} from "@/lib/api/schemas/console";

const sessionTone: Record<SessionStatus, BadgeTone> = {
  invited: "neutral",
  consented: "neutral",
  active: "brand",
  paused: "warn",
  candidate_questions: "brand",
  closed: "ok",
  escalated: "bad",
  reported: "ok",
};

const requisitionTone: Record<RequisitionStatus, BadgeTone> = {
  draft: "neutral",
  blueprint_pending: "warn",
  blueprint_review: "warn",
  frozen: "ok",
  archived: "neutral",
};

const recommendationTone: Record<Recommendation, BadgeTone> = {
  strong_positive_signal: "ok",
  positive_signal_with_follow_up: "ok",
  mixed_signal: "warn",
  insufficient_evidence: "neutral",
  concern_signal: "bad",
};

const pressureTone: Record<PressureLevel, BadgeTone> = {
  calm: "neutral",
  standard: "brand",
  intense: "warn",
};

export function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  return <Badge tone={sessionTone[status]}>{humanize(status)}</Badge>;
}
export function RequisitionStatusBadge({ status }: { status: RequisitionStatus }) {
  return <Badge tone={requisitionTone[status]}>{humanize(status)}</Badge>;
}
export function RecommendationBadge({ value }: { value: Recommendation }) {
  return <Badge tone={recommendationTone[value]}>{humanize(value)}</Badge>;
}
export function PressureBadge({ level }: { level: PressureLevel }) {
  return <Badge tone={pressureTone[level]}>{level}</Badge>;
}
