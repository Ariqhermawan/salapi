const LOCAL_EXAMPLES: Record<string, string> = {
  mei: "102",
  "baybayin-zines": "103",
  "santos-roof": "103",
  bantayan: "101",
};

/** Resolve prototype showcase slugs only inside the explicit local preview.
 * Live routes accept only actual numeric D4 campaign IDs. */
export function resolveCampaignRouteId(input: string, localPreview: boolean): string | null {
  if (/^[1-9][0-9]{0,19}$/.test(input)) return input;
  if (!localPreview) return null;
  return LOCAL_EXAMPLES[input.trim().toLowerCase()] ?? null;
}
