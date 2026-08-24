import type { Metadata } from "next";
import IntegrationOpsConsole from "@/app/integration-ops-console";

export const metadata: Metadata = {
  title: "Integration Center | Easy Spaces",
};

export default function CustomerPortalPage() {
  return <IntegrationOpsConsole initialRoute={{ view: "portal" }} />;
}
