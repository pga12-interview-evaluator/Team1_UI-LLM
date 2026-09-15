import { NextResponse } from "next/server";
import { candidateRoute, consoleRoute, error } from "@/mock/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * In-app mock of the interview BFF. Enabled only when NEXT_PUBLIC_API_MODE=mock.
 * Two channels, two path prefixes: /candidate/... (token-scoped) and /console/... (cookie-auth).
 */
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  if (process.env.NEXT_PUBLIC_API_MODE !== "mock")
    return error(404, "not_found", "Mock API is disabled.");
  const { path } = await context.params;
  const [channel] = path;
  try {
    if (channel === "candidate") return await candidateRoute(request, path);
    if (channel === "console") return await consoleRoute(request, path);
    return error(404, "not_found", "Unknown route.");
  } catch (caught) {
    return error(500, "mock_failure", "Mock engine error.", String(caught));
  }
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
