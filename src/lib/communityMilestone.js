// Bea's community pulse: decide whether a group has just crossed a member-count
// milestone worth celebrating, and word it. Pure and I/O-free so `npm test`
// covers it and netlify/functions/community-pulse.js can import it. The
// function does the DB read/write (and dedupe via groups.last_member_milestone);
// this only decides *which* milestone a count has reached.
//
// BetMates is trust-based and community-first, so Bea's voice is warm and
// social - a milestone is a "nice one, the group's growing" moment, never a
// betting nudge.

// The milestones we shout about. Kept sparse so a group doesn't trip a
// notification on every single join - only these round numbers.
export const MEMBER_MILESTONES = [5, 10, 25, 50, 100, 250, 500, 1000]

/**
 * The highest milestone a member count has reached (<= count), or 0 if it
 * hasn't reached the first one.
 * @param {number} count
 * @returns {number}
 */
export function milestoneReached(count) {
  let reached = 0
  for (const m of MEMBER_MILESTONES) {
    if (count >= m) reached = m
    else break
  }
  return reached
}

/**
 * Given a group's current member count and the last milestone we already
 * announced for it, return the newly-crossed milestone to announce, or null if
 * there's nothing new. Dedupe lives in the caller (persist the returned value
 * to groups.last_member_milestone) so each milestone fires exactly once.
 * @param {number} count  current member_count
 * @param {number} [lastAnnounced]  groups.last_member_milestone (0 if never)
 * @returns {number | null}
 */
export function newlyCrossedMilestone(count, lastAnnounced = 0) {
  const reached = milestoneReached(count)
  return reached > (lastAnnounced || 0) ? reached : null
}

/**
 * Bea's one-line Discord announcement for a crossed milestone.
 * @param {string} groupName
 * @param {number} milestone
 * @returns {string}
 */
export function milestoneMessage(groupName, milestone) {
  const name = String(groupName || 'A group').slice(0, 80)
  return `🎉 **Bea · Community** — **${name}** just passed **${milestone} members**! The group's growing — nice one. 🙌`
}
