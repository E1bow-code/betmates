// Summarises the raw bet_reactions rows for a post into one entry per known
// emoji - the count, whether the current user is among them, and the reactor
// user ids (for the "who reacted" line). Pure, so BetCard's bar and names
// line share exactly one source of truth and it can be unit-tested. Emoji not
// in `emojis` (e.g. a reaction left under an older emoji set) are ignored,
// same "count only the keys we know" rule tallyVotes (crowdWisdom.js) follows.
export function summariseReactions(rows, emojis, currentUserId) {
  const list = Array.isArray(rows) ? rows : []
  return emojis.map((emoji) => {
    const forEmoji = list.filter((r) => r.emoji === emoji)
    return {
      emoji,
      count: forEmoji.length,
      mine: forEmoji.some((r) => r.userId === currentUserId),
      userIds: forEmoji.map((r) => r.userId)
    }
  })
}
