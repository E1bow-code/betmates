// Vertical counterpart to NewsTickerBar - only ever visible once the
// viewport is wide enough to have a genuine side column to put it in
// (1280px, well past the point the bottom nav itself becomes a sidebar),
// same doubled-list-plus-CSS-loop technique as the horizontal bar, just
// scrolling up instead of left.
export default function NewsSidebar({ headlines }) {
  if (!headlines.length) return null

  return (
    <div className="news-sidebar" aria-label="Sports news">
      <div className="news-sidebar-header">Sports News</div>
      <div className="news-sidebar-viewport">
        <div className="news-sidebar-track">
          {[...headlines, ...headlines].map((item, i) => (
            <a key={i} className="news-sidebar-item" href={item.link} target="_blank" rel="noreferrer">
              <span className="news-sidebar-source">{item.source}</span>
              <span>{item.title}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
