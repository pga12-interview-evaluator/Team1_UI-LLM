import { NextResponse } from "next/server";
import { candidateRoute, consoleRoute, error } from "@/server/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Real BFF: Gemini (prompts_v2) + Whisper. Same path shapes as the mock under /api/mock so the
 * client only changes NEXT_PUBLIC_API_MODE / NEXT_PUBLIC_API_BASE_URL.
 */
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  const [channel] = path;
  try {
    if (channel === "candidate") return await candidateRoute(request, path);
    if (channel === "console") return await consoleRoute(request, path);
    return error(404, "not_found", "Unknown route.");
  } catch (caught) {
    return error(500, "server_error", caught instanceof Error ? caught.message : String(caught));
  }
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
