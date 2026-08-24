import { getJobEvidence, WorkspaceActionError } from "@/db/workspace";
import { DemoSessionError, requireDemoSession } from "@/db/session";

export const dynamic = "force-dynamic";

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  try {
    const session = await requireDemoSession(request);
    const url = new URL(request.url);
    const jobId = url.searchParams.get("jobId");
    if (!jobId) {
      return Response.json({ error: "jobId is required" }, { status: 400 });
    }
    const rows = await getJobEvidence(jobId, session);
    const csv = [
      ["record_id", "source_object", "label", "field", "raw_value", "cleaned_value", "issue", "provenance", "source_label"],
      ...rows.map((row) => [
        row.id,
        row.sourceObject,
        row.label,
        row.field,
        row.rawValue,
        row.cleanedValue,
        row.issue,
        row.provenance,
        row.sourceLabel,
      ]),
    ]
      .map((row) => row.map((value) => csvCell(value)).join(","))
      .join("\n");

    return new Response(`${csv}\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${jobId}-affected-records.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const status =
      error instanceof DemoSessionError ||
      error instanceof WorkspaceActionError
        ? error.status
        : 500;
    const message =
      error instanceof Error ? error.message : "The export could not be created.";
    return Response.json({ error: message }, { status });
  }
}
