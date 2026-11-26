import ArisanNotificationsScreen from "@/components/screens/ArisanNotificationsScreen";
import PrototypeNotificationsScreen from "@/components/screens/PrototypeNotificationsScreen";
import { isLocalPreview } from "@/lib/local-preview";

export const metadata = { title: "Notifications · Salapi" };
export default function NotificationsPage() { return isLocalPreview ? <PrototypeNotificationsScreen /> : <ArisanNotificationsScreen />; }
