"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { consoleApi } from "@/lib/api/console";
import type { HumanDecisionInput, RequisitionInput } from "@/lib/api/schemas/console";

export const keys = {
  me: ["console", "me"] as const,
  requisitions: ["console", "requisitions"] as const,
  requisition: (id: string) => ["console", "requisitions", id] as const,
  sessions: (filter?: { requisition_id?: string; status?: string }) =>
    ["console", "sessions", filter ?? {}] as const,
  session: (id: string) => ["console", "sessions", id] as const,
  audit: (sessionId?: string) => ["console", "audit", sessionId ?? "all"] as const,
};

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => consoleApi.me(), staleTime: 60_000 });
}

export function useRequisitions() {
  return useQuery({ queryKey: keys.requisitions, queryFn: () => consoleApi.listRequisitions() });
}

export function useRequisition(id: string) {
  return useQuery({ queryKey: keys.requisition(id), queryFn: () => consoleApi.getRequisition(id) });
}

export function useCreateRequisition() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RequisitionInput) => consoleApi.createRequisition(input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.requisitions }),
  });
}

export function useUpdateRequisition(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RequisitionInput) => consoleApi.updateRequisition(id, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.requisitions });
      void client.invalidateQueries({ queryKey: keys.requisition(id) });
    },
  });
}

export function useRequisitionAction(id: string, action: "blueprint" | "freeze") {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      action === "blueprint" ? consoleApi.generateBlueprint(id) : consoleApi.freezeBlueprint(id),
    onSuccess: (data) => {
      client.setQueryData(keys.requisition(id), data);
      void client.invalidateQueries({ queryKey: keys.requisitions });
    },
  });
}

export function useInvite(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: { candidate_label: string }) => consoleApi.inviteCandidate(id, payload),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.sessions() });
      void client.invalidateQueries({ queryKey: keys.requisition(id) });
    },
  });
}

export function useSessions(filter?: { requisition_id?: string; status?: string }) {
  return useQuery({
    queryKey: keys.sessions(filter),
    queryFn: () => consoleApi.listSessions(filter),
    refetchInterval: 5000,
  });
}

export function useSession(id: string, live = false) {
  return useQuery({
    queryKey: keys.session(id),
    queryFn: () => consoleApi.getSession(id),
    refetchInterval: live ? 3000 : false,
  });
}

export function useGenerateReport(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => consoleApi.generateReport(id),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.session(id) }),
  });
}

export function useRecordDecision(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: HumanDecisionInput) => consoleApi.recordDecision(id, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.session(id) });
      void client.invalidateQueries({ queryKey: keys.sessions() });
    },
  });
}

export function useAudit(sessionId?: string) {
  return useQuery({
    queryKey: keys.audit(sessionId),
    queryFn: () => consoleApi.listAudit(sessionId ? { session_id: sessionId } : undefined),
  });
}
