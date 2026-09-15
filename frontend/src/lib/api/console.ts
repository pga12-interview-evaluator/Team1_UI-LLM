import { z } from "zod";
import { request, newIdempotencyKey } from "./client";
import {
  auditEventSchema,
  consoleUserSchema,
  finalReportSchema,
  humanDecisionSchema,
  inviteResponseSchema,
  listResponse,
  requisitionSchema,
  sessionDetailSchema,
  sessionSummarySchema,
  type HumanDecisionInput,
  type RequisitionInput,
} from "./schemas/console";

const okSchema = z.object({ ok: z.literal(true) });

/** Authenticated console channel. Separate path prefix from the candidate channel by design. */
export const consoleApi = {
  devLogin() {
    return request("/console/dev-login", { method: "POST", schema: consoleUserSchema });
  },
  me() {
    return request("/console/me", { schema: consoleUserSchema.nullable() });
  },
  login(payload: { email: string; password: string }) {
    return request("/console/login", { method: "POST", body: payload, schema: consoleUserSchema });
  },
  logout() {
    return request("/console/logout", { method: "POST", schema: okSchema });
  },

  listRequisitions() {
    return request("/console/requisitions", { schema: listResponse(requisitionSchema) });
  },
  getRequisition(id: string) {
    return request(`/console/requisitions/${encodeURIComponent(id)}`, {
      schema: requisitionSchema,
    });
  },
  createRequisition(input: RequisitionInput) {
    return request("/console/requisitions", {
      method: "POST",
      body: input,
      schema: requisitionSchema,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  updateRequisition(id: string, input: RequisitionInput) {
    return request(`/console/requisitions/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: input,
      schema: requisitionSchema,
    });
  },
  /** Runs Prompt 01 in requisition mode. Long-running; the BFF returns when validated. */
  generateBlueprint(id: string) {
    return request(`/console/requisitions/${encodeURIComponent(id)}/blueprint`, {
      method: "POST",
      schema: requisitionSchema,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  freezeBlueprint(id: string) {
    return request(`/console/requisitions/${encodeURIComponent(id)}/freeze`, {
      method: "POST",
      schema: requisitionSchema,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  inviteCandidate(id: string, payload: { candidate_label: string; interview_language?: string }) {
    return request(`/console/requisitions/${encodeURIComponent(id)}/invites`, {
      method: "POST",
      body: payload,
      schema: inviteResponseSchema,
      idempotencyKey: newIdempotencyKey(),
    });
  },

  listSessions(params?: { requisition_id?: string; status?: string }) {
    const query = new URLSearchParams();
    if (params?.requisition_id) query.set("requisition_id", params.requisition_id);
    if (params?.status) query.set("status", params.status);
    const suffix = query.toString() ? `?${query}` : "";
    return request(`/console/sessions${suffix}`, { schema: listResponse(sessionSummarySchema) });
  },
  getSession(id: string) {
    return request(`/console/sessions/${encodeURIComponent(id)}`, { schema: sessionDetailSchema });
  },
  /** Runs Prompt 04. Allowed only when the session is closed; the BFF enforces it. */
  generateReport(id: string) {
    return request(`/console/sessions/${encodeURIComponent(id)}/report`, {
      method: "POST",
      schema: finalReportSchema,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  recordDecision(id: string, input: HumanDecisionInput) {
    return request(`/console/sessions/${encodeURIComponent(id)}/decision`, {
      method: "POST",
      body: input,
      schema: humanDecisionSchema,
      idempotencyKey: newIdempotencyKey(),
    });
  },

  listAudit(params?: { session_id?: string }) {
    const suffix = params?.session_id ? `?session_id=${encodeURIComponent(params.session_id)}` : "";
    return request(`/console/audit${suffix}`, { schema: listResponse(auditEventSchema) });
  },
};
