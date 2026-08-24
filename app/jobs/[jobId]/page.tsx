import IntegrationOpsConsole from "@/app/integration-ops-console";

export default async function FailurePage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return (
    <IntegrationOpsConsole initialRoute={{ view: "failure", jobId }} />
  );
}
