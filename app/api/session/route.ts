import {
  createDemoSession,
  deleteDemoSession,
  DemoSessionError,
  requireDemoSession,
} from "@/db/session";
import type { DemoMode, Role } from "@/lib/types";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const status = error instanceof DemoSessionError ? error.status : 500;
  const message =
    error instanceof Error ? error.message : "Demo access could not be updated.";
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    return Response.json(
      { session: await requireDemoSession(request) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      role?: Role;
      customerId?: string | null;
      mode?: DemoMode;
      freshRun?: boolean;
    };
    if (!body.role) {
      throw new DemoSessionError("Choose a demo persona.", 400);
    }
    const result = await createDemoSession(
      request,
      body.role,
      body.customerId ?? null,
      body.mode ?? "role",
      body.freshRun ?? false,
    );
    return Response.json(
      { session: result.session },
      {
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": result.cookie,
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    return Response.json(
      { ok: true },
      {
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": await deleteDemoSession(request),
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
