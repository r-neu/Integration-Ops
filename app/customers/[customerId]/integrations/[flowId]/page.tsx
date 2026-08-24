import IntegrationOpsConsole from "@/app/integration-ops-console";
import { notFound } from "next/navigation";
import { demoFlowIds, demoTenant } from "@/lib/demo-public";

export default async function IntegrationPage({
  params,
}: {
  params: Promise<{ customerId: string; flowId: string }>;
}) {
  const { customerId, flowId } = await params;
  if (customerId !== demoTenant.id || !demoFlowIds.has(flowId)) notFound();
  return (
    <IntegrationOpsConsole
      initialRoute={{ view: "integration", customerId, flowId }}
    />
  );
}
