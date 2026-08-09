// A progression layer over the existing achievements (src/utils/
// achievements.js) - XP itself is never stored, just like an achievement's
// "earned" flag isn't: it's recomputed live from the same counts every
// other stats surface already reads (bets logged/settled/won, posts
// shared, friends referred), so there's no column to keep in sync and no
// way for it to drift from what actually happened.
export function computeXp({ loggedCount = 0, settledCount = 0, wonCount = 0, postedCount = 0, referralCount = 0 }) {
  return loggedCount * 2 + settledCount * 3 + wonCount * 5 + postedCount * 4 + referralCount * 15
}

// Level N needs 50*(N-1)^2 XP - a quadratic curve, so each level costs more
// than the last without ever needing a lookup table. Level 1 is free (0 XP).
export function xpForLevel(level) {
  return 50 * (level - 1) ** 2
}

export function levelForXp(xp) {
  return Math.floor(Math.sqrt(xp / 50)) + 1
}

export function xpForNextLevel(level) {
  return xpForLevel(level + 1)
}

// Cosmetic-only, automatic (not chosen/purchased) - a ring around Avatar.jsx
// at a handful of level milestones, matching a "rank badge" rather than a
// wardrobe of unlockable themes. null below the first tier.
const FLAIR_TIERS = [
  { level: 35, tier: 'diamond' },
  { level: 20, tier: 'gold' },
  { level: 10, tier: 'silver' },
  { level: 5, tier: 'bronze' }
]

export function flairTierForLevel(level) {
  return FLAIR_TIERS.find((t) => level >= t.level)?.tier ?? null
}
