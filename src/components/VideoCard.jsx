import { useEffect, useState } from 'react'
import Avatar from './Avatar.jsx'
import ShareVideoSheet from './ShareVideoSheet.jsx'
import * as dataStore from '../lib/dataStore.js'
import { computeStats } from '../utils/trackerStats.js'
import { tipsterBadge } from '../utils/tipsterBadge.js'
import { PinIcon, ShareIcon, TargetIcon, BadgeCheckIcon } from './icons/Icons.jsx'

const TIPSTER_BADGE_ICON = { sharp: TargetIcon, reliable: BadgeCheckIcon }

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export default function VideoCard({ post }) {
  const [src, setSrc] = useState(null)
  const [missing, setMissing] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [authorStats, setAuthorStats] = useState(null)

  useEffect(() => {
    let url
    dataStore.getVideoPlaybackUrl(post.videoKey).then((resolvedUrl) => {
      if (!resolvedUrl) {
        setMissing(true)
        return
      }
      url = resolvedUrl
      setSrc(resolvedUrl)
    })
    return () => {
      // Local mode returns a blob: object URL that needs revoking; Supabase
      // Storage's signed URL is a plain https URL - nothing to revoke there.
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    }
  }, [post.videoKey])

  // Same fetch -> filter-to-public -> computeStats -> tipsterBadge pattern
  // already used for the Discover paid-group badge and PublicProfilePage -
  // one call site here covers every place VideoCard renders (Tips segment,
  // the merged Home/Feed view, and shared-in-group videos).
  useEffect(() => {
    let cancelled = false
    dataStore.listBetPostsByUser(post.authorId).then((posts) => {
      if (cancelled) return
      setAuthorStats(computeStats(posts.filter((p) => p.visibility === 'public' && !p.stakeHidden)))
    })
    return () => {
      cancelled = true
    }
  }, [post.authorId])

  const badge = tipsterBadge(authorStats)
  const BadgeIcon = badge && TIPSTER_BADGE_ICON[badge.icon]

  return (
    <div className="video-card">
      <div className="bet-card-header">
        <div className="bet-card-who">
          <Avatar name={post.authorName} />
          <div>
            <span className="bet-card-author">
              {post.authorName}
              {badge && (
                <span
                  className="chip chip--pill chip--sm chip--outline-accent tipster-badge icon-row"
                  title={`${badge.label} - ${authorStats.decidedCount}+ decided public picks`}
                >
                  {BadgeIcon && <BadgeIcon width={13} height={13} />} {badge.label}
                </span>
              )}
            </span>
            <span className="bet-card-group-tag">
              {post.sharedByName ? `shared by ${post.sharedByName} · ` : ''}
              {timeAgo(post.sharedAt ?? post.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {missing ? (
        <div className="video-missing">This clip was recorded on a different device and isn't available here.</div>
      ) : src ? (
        <video src={src} className="video-preview" controls />
      ) : (
        <div className="video-missing">Loading clip…</div>
      )}

      <div className="video-caption">{post.caption}</div>
      {post.tag && (
        <div className="chip chip--sharp chip--sm chip--outline-accent video-tag icon-row">
          <PinIcon width={14} height={14} /> {post.tag}
        </div>
      )}

      <div className="bet-card-footer">
        <button className="btn btn-secondary btn-small icon-row" onClick={() => setSharing(true)}>
          <ShareIcon width={15} height={15} /> Share
        </button>
      </div>

      {sharing && <ShareVideoSheet video={post} onClose={() => setSharing(false)} />}
    </div>
  )
}
