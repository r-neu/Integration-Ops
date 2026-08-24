import type { Metadata } from "next";
import AccessScreen from "./access-screen";

export const metadata: Metadata = {
  title: "Demo access | Integration Ops Console",
};

export default function AccessPage() {
  return <AccessScreen />;
}
