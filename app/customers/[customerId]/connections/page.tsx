import IntegrationOpsConsole from "@/app/integration-ops-console";
import { notFound } from "next/navigation";
import { demoTenant } from "@/lib/demo-public";

export default async function ConnectionsPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  if (customerId !== demoTenant.id) notFound();
  return (
    <IntegrationOpsConsole
      initialRoute={{ view: "connection", customerId }}
    />
  );
}
