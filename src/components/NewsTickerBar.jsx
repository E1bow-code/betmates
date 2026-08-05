// Horizontal scrolling ticker - the default treatment on every screen
// size, hidden once there's room for the vertical NewsSidebar instead
// (see the 1280px breakpoint in style.css). The headline list is rendered
// twice back-to-back so the CSS animation's translateX(-50%) loops back
// to the start of the duplicate seamlessly, with no visible jump.
export default function NewsTickerBar({ headlines }) {
  if (!headlines.length) return null

  return (
    <div className="news-ticker-bar" aria-label="Sports news ticker">
      <span className="news-ticker-label">Sport news</span>
      <div className="news-ticker-track">
        {[...headlines, ...headlines].map((item, i) => (
          <a key={i} className="news-ticker-item" href={item.link} target="_blank" rel="noreferrer">
            <span className="news-ticker-source">{item.source}</span>
            {item.title}
          </a>
        ))}
      </div>
    </div>
  )
}
