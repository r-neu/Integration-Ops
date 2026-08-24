import {
  performWorkspaceAction,
  WorkspaceActionError,
} from "@/db/workspace";
import { DemoSessionError, requireDemoSession } from "@/db/session";
import type { ActionRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await requireDemoSession(request);
    const body = (await request.json()) as ActionRequest;
    if (!body.action || !body.targetId) {
      throw new WorkspaceActionError("Action and target are required.");
    }
    return Response.json(await performWorkspaceAction(body, session), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status =
      error instanceof WorkspaceActionError ||
      error instanceof DemoSessionError
        ? error.status
        : 500;
    const message =
      error instanceof Error ? error.message : "The action could not be completed.";
    return Response.json({ error: message }, { status });
  }
}
