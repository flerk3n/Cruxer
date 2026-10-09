/**
 * Marketing copy for the public pricing page. The API (`apps/api/src/billing/plans.ts`)
 * is the enforcement source of truth; signed-in screens read live limits from /billing/me.
 */
export const PRICING = {
  free: { name: "Free", price: 0, kits: 5, mockMinutes: 0, regenerationsPerKit: 3 },
  pro: { name: "Pro", price: 9, kits: 25, mockMinutes: 30, maxSessionMinutes: 10, regenerationsPerKit: 10 }
} as const;
