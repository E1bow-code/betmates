// Proxy to a couple of free, public sports RSS feeds (no API key needed -
// same "free tier first" approach as photo.js/Pexels) for the news ticker
// (see src/components/NewsTicker.jsx). RSS rather than a paid news API:
// no signup required, and headlines are exactly what a ticker needs.
// Cached briefly since every client polls this on its own timer.
import { cacheGet, cacheSet } from '../../src/lib/apiCache.js'

const FEEDS = [
  { url: 'https://feeds.bbci.co.uk/sport/rss.xml', source: 'BBC Sport' },
  { url: 'https://www.skysports.com/rss/12040', source: 'Sky Sports' }
]

const NEWS_TTL = 10 * 60 * 1000

// RSS text (titles and, less obviously, link URLs' query strings) is
// XML-escaped same as HTML - without this, an href like "...?a=1&amp;b=2"
// gets set as a DOM property literally containing "&amp;" instead of "&",
// since property assignment (what React's href={} does) never HTML-decodes
// the way parsing markup would.
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
}

// Hand-rolled rather than pulling in an XML parser dependency for three
// fields - RSS <item> blocks are simple and consistent enough across both
// feeds for a couple of regexes to do the job, CDATA-wrapped or not.
function extractItems(xml, source) {
  const items = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match
  while ((match = itemRegex.exec(xml)) && items.length < 15) {
    const block = match[1]
    const title = (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) ?? [])[1]
    const link = (block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/) ?? [])[1]
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) ?? [])[1]
    if (!title || !link) continue
    const parsedDate = pubDate ? new Date(pubDate) : null
    items.push({
      title: decodeEntities(title.trim()),
      link: decodeEntities(link.trim()),
      source,
      pubDate: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null
    })
  }
  return items
}

export default async (_req) => {
  const cached = cacheGet('sports-news')
  if (cached) {
    return new Response(JSON.stringify(cached), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-data-source': 'cached' }
    })
  }

  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const res = await fetch(feed.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BetMatesNewsTicker/1.0)' } })
      if (!res.ok) throw new Error(`${feed.source}: ${res.status}`)
      const xml = await res.text()
      return extractItems(xml, feed.source)
    })
  )

  const items = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value)
  items.sort((a, b) => new Date(b.pubDate ?? 0) - new Date(a.pubDate ?? 0))
  const top = items.slice(0, 20)

  cacheSet('sports-news', top, NEWS_TTL)
  return new Response(JSON.stringify(top), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-data-source': 'live' }
  })
}
