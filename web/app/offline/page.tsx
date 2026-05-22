import OfflineScreen from "@/components/screens/OfflineScreen";

export const metadata = { title: "Offline · Salapi" };

// Server wrapper keeps the route metadata; the client screen owns the
// localized, token-styled UI.
export default function OfflinePage() {
  return <OfflineScreen />;
}
