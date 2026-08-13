import Avatar from './Avatar.jsx'
import { formatOdds } from '../utils/oddsFormat.js'
import { labelForTag, iconForTag } from '../lib/postTags.js'
import { HorseIcon, FootballIcon, DiamondIcon, TargetIcon, LockIcon, BrokenHeartIcon, FlameIcon } from './icons/Icons.jsx'

const POST_TAG_ICON = {
  horse: HorseIcon,
  football: FootballIcon,
  diamond: DiamondIcon,
  target: TargetIcon,
  lock: LockIcon,
  brokenHeart: BrokenHeartIcon,
  flame: FlameIcon
}

// Read-only "here's how this'll look" card for the composer (BetBuilderSheet).
// Deliberately mirrors BetCard's body/ticket markup and class names so the
// preview matches the real feed card exactly - but with none of BetCard's live
// machinery (reactions, comments, realtime subscriptions, action buttons); it's
// a static render of whatever the composer currently holds, updating live as
// the caption/tag/stake change. Kept as its own component rather than reusing
// BetCard so the feed card can't accidentally start depending on
// composer-shaped props, and the preview can't accidentally fire a real
// reaction/comment fetch for a post that doesn't exist yet.
export default function PostPreview({
  authorName,
  authorAvatarUrl,
  caption,
  tag,
  legs,
  marketType,
  stake,
  stakeHidden,
  combinedOdds,
  potentialReturn,
  photoPreview,
  videoPreview,
  format
}) {
  const hasPick = legs.length > 0
  const trimmedCaption = caption?.trim()
  if (!hasPick && !trimmedCaption && !photoPreview && !videoPreview) return null

  return (
    <div className="post-preview">
      <span className="post-preview-label">Preview</span>
      <div className="bet-card post-preview-card status-open">
        <div className="bet-card-header">
          <div className="bet-card-who">
            <Avatar name={authorName} photoUrl={authorAvatarUrl} />
            <div>
              <span className="bet-card-author">{authorName}</span>
              <span className="bet-card-time">now</span>
            </div>
          </div>
        </div>

        <div className="bet-card-body">
          {tag &&
            (() => {
              const TagIcon = POST_TAG_ICON[iconForTag(tag)]
              return (
                <span className="post-tag-chip post-tag-chip-readonly icon-row">
                  {TagIcon && <TagIcon width={13} height={13} />} {labelForTag(tag)}
                </span>
              )
            })()}
          {trimmedCaption && <p className="bet-card-caption">"{trimmedCaption}"</p>}
          {photoPreview && <img src={photoPreview} alt="" className="bet-card-photo" />}
          {videoPreview && <video src={videoPreview} className="bet-card-photo" muted />}

          {hasPick && (
            <div className="bet-card-ticket">
              <div className="bet-card-ticket-header">
                <span className="bet-card-ticket-tag">{marketType}</span>
                <span className="bet-status-pill status-open">Pending</span>
              </div>

              {legs.map((leg, i) => (
                <div key={i} className={legs.length > 1 ? 'bet-card-leg' : undefined}>
                  <div className="selection-event">{leg.event}</div>
                  <div className="selection-row">
                    <span>{leg.market}</span>
                    <span className="selection-pick">{leg.selection}</span>
                  </div>
                  <div className="selection-odds-row">
                    <span className="selection-odds">{formatOdds(leg.odds, format)}</span>
                    <span className="selection-bookmaker">{leg.bookmaker}</span>
                  </div>
                </div>
              ))}

              {stakeHidden ? (
                <div className="bet-card-stake bet-card-stake-hidden">Stake kept private</div>
              ) : (
                <>
                  <div className="bet-card-ticket-divider" />
                  <div className="bet-card-stats">
                    {stake ? (
                      <div className="bet-card-stat">
                        <span className="bet-card-stat-label">Stake</span>
                        <span className="bet-card-stat-value">£{stake}</span>
                      </div>
                    ) : null}
                    <div className="bet-card-stat">
                      <span className="bet-card-stat-label">Odds</span>
                      <span className="bet-card-stat-value">{formatOdds(combinedOdds ?? legs[0].odds, format)}</span>
                    </div>
                    {stake && potentialReturn ? (
                      <div className="bet-card-stat">
                        <span className="bet-card-stat-label">Returns</span>
                        <span className="bet-card-stat-value accent">£{potentialReturn.toFixed(2)}</span>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
