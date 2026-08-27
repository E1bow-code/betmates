// Electric/night set to match the Photo Finish palette in style.css, rather
// than the default-Tailwind rainbow every AI-generated avatar picker uses.
const PALETTE = ['#234b7a', '#45d67f', '#4f8ed9', '#c77dd8', '#e8b34c', '#6bcf7f', '#ff8a3d', '#7d5fff']

function colorFor(name) {
  let hash = 0
  for (const char of name || '?') hash = (hash * 31 + char.charCodeAt(0)) % PALETTE.length
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

function initialsFor(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
}

// tier: an optional XP-level flair ring (src/utils/xp.js's
// flairTierForLevel) - 'bronze'|'silver'|'gold'|'diamond'. Purely
// cosmetic and automatic (never chosen/purchased), so every existing
// caller that doesn't pass it renders exactly as before.
export default function Avatar({ name, size = 28, photoUrl, tier = null }) {
  const ringClass = tier ? ` avatar-tier-${tier}` : ''
  if (photoUrl) {
    return (
      <img
        className={`avatar avatar-photo${ringClass}`}
        src={photoUrl}
        alt=""
        title={name}
        loading="lazy"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className={`avatar${ringClass}`}
      style={{ background: colorFor(name), width: size, height: size, fontSize: size * 0.4 }}
      title={name}
    >
      {initialsFor(name)}
    </span>
  )
}
