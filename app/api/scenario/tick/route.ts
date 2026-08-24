import {
  advanceDueScenarioWork,
  WorkspaceActionError,
} from "@/db/workspace";
import { DemoSessionError, requireDemoSession } from "@/db/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await requireDemoSession(request);
    const customerId = new URL(request.url).searchParams.get("customerId");
    return Response.json(await advanceDueScenarioWork(session, customerId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status =
      error instanceof WorkspaceActionError || error instanceof DemoSessionError
        ? error.status
        : 500;
    const message =
      error instanceof Error ? error.message : "The scenario worker could not run.";
    return Response.json({ error: message }, { status });
  }
}
