/** Non-persistent UI feedback only. Never changes a balance or verification. */
export function announceSuccessMotion(title: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("salapi:success-motion", {detail: title}));
}
