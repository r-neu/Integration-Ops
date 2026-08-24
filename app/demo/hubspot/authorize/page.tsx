import type { Metadata } from "next";
import HubSpotAuthorization from "./authorization";

export const metadata: Metadata = {
  title: "Authorize HubSpot | Demo",
};

export default function HubSpotAuthorizationPage() {
  return <HubSpotAuthorization />;
}
