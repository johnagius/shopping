// Item tiers for building orders. Fixed set (unlike aisles, which are
// user-editable). Stored on catalog_items.tier.
export const TIERS = ["Essential", "Nice to have", "One off"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABELS: Record<string, string> = {
  Essential: "Essentials",
  "Nice to have": "Nice to have",
  "One off": "One-offs",
};

export function tierOrder(tier: string | null | undefined): number {
  const i = TIERS.indexOf((tier ?? "One off") as Tier);
  return i === -1 ? TIERS.length : i;
}
