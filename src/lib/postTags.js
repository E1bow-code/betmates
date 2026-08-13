// Reddit-style flair for a post (BetBuilderSheet.jsx's composer, shown on
// BetCard.jsx). A fixed list rather than free text - keeps the feed
// filterable/browsable by tag later instead of accumulating "Racing Tip"/
// "racing tip"/"racing tips" as separate strings. Optional; a post with no
// tag just shows none, same as caption/photo/video.
export const POST_TAGS = [
  { key: 'racing_tip', icon: 'horse', label: 'Racing tip' },
  { key: 'football_tip', icon: 'football', label: 'Football tip' },
  { key: 'value_bet', icon: 'diamond', label: 'Value bet' },
  { key: 'long_shot', icon: 'target', label: 'Long shot' },
  { key: 'lock', icon: 'lock', label: 'Lock' },
  { key: 'bad_beat', icon: 'brokenHeart', label: 'Bad beat' },
  { key: 'hot_take', icon: 'flame', label: 'Hot take' }
]

export function labelForTag(key) {
  return POST_TAGS.find((t) => t.key === key)?.label ?? null
}

export function iconForTag(key) {
  return POST_TAGS.find((t) => t.key === key)?.icon ?? null
}
