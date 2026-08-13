// Reddit-style flair for a post (BetBuilderSheet.jsx's composer, shown on
// BetCard.jsx). A fixed list rather than free text - keeps the feed
// filterable/browsable by tag later instead of accumulating "Racing Tip"/
// "racing tip"/"racing tips" as separate strings. Optional; a post with no
// tag just shows none, same as caption/photo/video.
export const POST_TAGS = [
  { key: 'racing_tip', label: '🏇 Racing tip' },
  { key: 'football_tip', label: '⚽ Football tip' },
  { key: 'value_bet', label: '💎 Value bet' },
  { key: 'long_shot', label: '🎯 Long shot' },
  { key: 'lock', label: '🔒 Lock' },
  { key: 'bad_beat', label: '💔 Bad beat' },
  { key: 'hot_take', label: '🔥 Hot take' }
]

export function labelForTag(key) {
  return POST_TAGS.find((t) => t.key === key)?.label ?? null
}
