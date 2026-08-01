const PALETTE = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#ef4444']

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

export default function Avatar({ name, size = 28 }) {
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
