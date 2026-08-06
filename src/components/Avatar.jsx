// Earthy/warm set to match the chalkboard palette in style.css, rather
// than the default-Tailwind rainbow every AI-generated avatar picker uses.
const PALETTE = ['#e0a339', '#d9694f', '#c9a635', '#8a9a5b', '#4f8a8b', '#b56576', '#6b8f71', '#c17817']

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

export default function Avatar({ name, size = 28, photoUrl }) {
  if (photoUrl) {
    return (
      <img
        className="avatar avatar-photo"
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
      className="avatar"
      style={{ background: colorFor(name), width: size, height: size, fontSize: size * 0.4 }}
      title={name}
    >
      {initialsFor(name)}
    </span>
  )
}
