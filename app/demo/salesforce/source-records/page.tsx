import type { Metadata } from "next";
import SalesforceSourceRecords from "./source-records";

export const metadata: Metadata = {
  title: "Salesforce source records | Demo",
};

export default function SalesforceSourceRecordsPage() {
  return <SalesforceSourceRecords />;
}
