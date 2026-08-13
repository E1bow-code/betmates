import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useBetSlip } from '../context/BetSlipContext.jsx'
import { useOddsFormat } from '../context/OddsFormatContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { notifyGroup, notifyFollowers } from '../lib/notify.js'
import { formatOdds } from '../utils/oddsFormat.js'
import { periodStart, sumStakesSince, wouldExceedLimit } from '../utils/spendLimit.js'
import { getEachWayTerms, computeEachWayReturn } from '../utils/eachWay.js'
import { detectLossChasing } from '../utils/lossChasing.js'
import { stakingPlanWarning } from '../utils/stakingPlan.js'
import { detectBigStake } from '../utils/bigStake.js'
import { detectSameGameCorrelation } from '../utils/sameGameCorrelation.js'
import { useEscapeKey } from '../lib/useEscapeKey.js'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import { computeStats } from '../utils/trackerStats.js'
import { tipsterBadge } from '../utils/tipsterBadge.js'
import { PICKER_SPORTS, SPORT_LABEL, loadItemsForSport, labelFor, normalizeItem, groupByCompetition } from '../lib/quickPick.js'
import {
  LinkIcon,
  CameraIcon,
  VideoIcon,
  SparkIcon,
  WarningIcon,
  EyesIcon,
  RulerIcon,
  TrendUpIcon,
  HorseIcon,
  FootballIcon,
  DiamondIcon,
  TargetIcon,
  LockIcon,
  BrokenHeartIcon,
  FlameIcon
} from './icons/Icons.jsx'
import { POST_TAGS } from '../lib/postTags.js'
import PostPreview from './PostPreview.jsx'

const POST_TAG_ICON = {
  horse: HorseIcon,
  football: FootballIcon,
  diamond: DiamondIcon,
  target: TargetIcon,
  lock: LockIcon,
  brokenHeart: BrokenHeartIcon,
  flame: FlameIcon
}

// The bet slip: reads its legs from BetSlipContext rather than a single
// `selection` prop, so tapping outcomes across different fixtures builds
// one accumulator instead of always overwriting a single pick. A one-leg
// slip is just the simple "share this bet" flow from before; more legs
// makes it a real bet builder, with combined odds = the product of each
// leg's price (standard accumulator math).
//
// Also the entry point for a pick-less post (Home's composer bar calls
// useBetSlip().openSheet() directly, with zero legs) - hasPick below
// switches between the inline Sport/Event/Market/Selection picker (see
// src/lib/quickPick.js) and the normal leg-list view once something's
// been picked, either through that picker or by tapping a price on the
// Odds tab same as before.

export default function BetBuilderSheet() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { legs, toggleLeg, removeLeg, clearSlip, sheetOpen, closeSheet } = useBetSlip()
  const { format } = useOddsFormat()
  const { showToast } = useToast()
  const [groups, setGroups] = useState([])
  const [groupId, setGroupId] = useState('')
  const [stake, setStake] = useState('')
  const [stakeHidden, setStakeHidden] = useState(false)
  const [caption, setCaption] = useState('')
  const [tag, setTag] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [videoFile, setVideoFile] = useState(null)
  const [videoPreview, setVideoPreview] = useState(null)
  const [eachWay, setEachWay] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [entries, setEntries] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const [pickerSport, setPickerSport] = useState('football')
  const [pickerItems, setPickerItems] = useState(null)
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerEventId, setPickerEventId] = useState('')
  const [pickerMarketKey, setPickerMarketKey] = useState('')

  const hasPick = legs.length > 0

  useEffect(() => {
    dataStore.listMyGroups(user.id).then((gs) => {
      setGroups(gs)
      if (gs.length) setGroupId(gs[0].id)
    })
  }, [user.id])

  // Loads the Event dropdown's options whenever the sheet is showing the
  // picker (zero legs) and either just opened or the Sport dropdown
  // changed. Reset on every load so a stale Event/Market selection from a
  // previous sport never lingers - see quickPick.js for why this is a
  // single list-fetch per sport with no further network calls needed to
  // populate Market/Selection.
  useEffect(() => {
    if (hasPick || !sheetOpen) return
    let cancelled = false
    setPickerLoading(true)
    setPickerItems(null)
    setPickerEventId('')
    setPickerMarketKey('')
    loadItemsForSport(pickerSport)
      .then((items) => {
        if (!cancelled) setPickerItems(items)
      })
      .catch(() => {
        if (!cancelled) setPickerItems([])
      })
      .finally(() => {
        if (!cancelled) setPickerLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [pickerSport, hasPick, sheetOpen])

  // Fetched unconditionally now - both the spend-limit heads-up below and
  // the loss-chasing nudge need the same recent history, and neither is a
  // hard stop (the app never places bets, so it has no way to actually
  // prevent one either way). Keyed on sheetOpen (not just user.id) because
  // this sheet lives once at the App root for the whole session - without
  // that, a bet logged and settled earlier in the same session would never
  // show up here, since the effect would only ever have run once at login.
  useEffect(() => {
    if (!sheetOpen) return
    Promise.all([dataStore.listBetPostsByUser(user.id), dataStore.listManualEntries(user.id)]).then(([posted, manual]) => {
      setEntries([...posted, ...manual])
    })
  }, [user.id, sheetOpen])

  const periodSpend = useMemo(() => {
    if (!entries || !user.stakeLimitAmount) return null
    return sumStakesSince(entries, periodStart(user.stakeLimitPeriod))
  }, [entries, user.stakeLimitAmount, user.stakeLimitPeriod])

  const { closing, requestClose } = useDelayedClose(closeSheet)

  useEscapeKey(() => {
    if (!submitting) requestClose()
  }, sheetOpen)

  if (!sheetOpen) return null

  const combinedOdds = legs.reduce((acc, leg) => acc * leg.odds, 1)
  const stakeNum = stake ? Number(stake) : null
  const sanityCheckOn = user.notificationPrefs?.preBetSanityCheck ?? false
  const lossChasing = sanityCheckOn ? detectLossChasing(entries, stakeNum) : null
  const stakingWarning = sanityCheckOn ? stakingPlanWarning(user, stakeNum) : null
  const bigStake = sanityCheckOn ? detectBigStake(entries, stakeNum) : null
  const correlation = detectSameGameCorrelation(legs)
  // Each-way only makes sense for a single racing pick - real books don't
  // offer it on multi-leg accumulators, and combining it with other sports'
  // legs has no defined payout rule.
  const eachWayTerms = legs.length === 1 && legs[0].sport === 'racing' ? getEachWayTerms(legs[0].runnerCount) : null
  const applyEachWay = eachWay && eachWayTerms
  const potentialReturn = stakeNum
    ? applyEachWay
      ? Math.round(computeEachWayReturn(stakeNum, combinedOdds, eachWayTerms, 'win') * 100) / 100
      : Math.round(stakeNum * combinedOdds * 100) / 100
    : null
  // A pick-less post (hasPick false) writes the sentinel sport='post'/
  // market_type='Post' - see schema.sql's comment on why that beats making
  // the columns nullable.
  const marketType = !hasPick ? 'Post' : legs.length > 1 ? `${legs.length}-leg Bet Builder` : applyEachWay ? 'Each-way' : legs[0].market
  const sport = !hasPick ? 'post' : legs.every((leg) => leg.sport === legs[0].sport) ? legs[0].sport : 'multi'
  const submittedLegs = applyEachWay
    ? [{ ...legs[0], market: 'Each-way', eachWay: true, eachWayFraction: eachWayTerms.fraction, eachWayPlaces: eachWayTerms.places }]
    : legs
  const canSubmit = hasPick || caption.trim() || photoFile || videoFile

  // Racing carries no `competition` field (course/raceName instead), same
  // carve-out OddsListPage.jsx's own grouping makes.
  const pickerGroups = pickerItems && pickerSport !== 'racing' ? groupByCompetition(pickerItems) : null

  const pickerItem = pickerItems?.find((i) => i.id === pickerEventId) ?? null
  const pickerNormalized = pickerItem ? normalizeItem(pickerSport, pickerItem) : null
  const pickerMarket = pickerNormalized?.markets.find((m) => m.key === pickerMarketKey) ?? null

  function pickOutcome(outcome) {
    toggleLeg(outcome.leg)
  }

  function onClose() {
    if (!submitting) requestClose()
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // lets picking the same file again re-fire onChange
    if (!file) return
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  function removePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFile(null)
    setPhotoPreview(null)
  }

  function handleVideoChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (videoPreview) URL.revokeObjectURL(videoPreview)
    setVideoFile(file)
    setVideoPreview(URL.createObjectURL(file))
  }

  function removeVideo() {
    if (videoPreview) URL.revokeObjectURL(videoPreview)
    setVideoFile(null)
    setVideoPreview(null)
  }

  // Hard spend limit (opt-in via Account): block posting/saving a bet once the
  // period is over the cap, rather than only warning. Shared by all three save
  // paths below. The soft warning still shows for everyone; this binds it.
  function hardLimitBlocked() {
    if (user.notificationPrefs?.stakeLimitHard && wouldExceedLimit({ periodSpend, stake: stakeNum, amount: user.stakeLimitAmount })) {
      setError(
        `This would take you over your £${Number(user.stakeLimitAmount).toFixed(2)} ${user.stakeLimitPeriod === 'monthly' ? 'monthly' : 'weekly'} limit. You've set that as a hard limit, so it's blocked until the ${user.stakeLimitPeriod === 'monthly' ? 'month' : 'week'} resets.`
      )
      return true
    }
    return false
  }

  // Shared by handlePost/handlePostPublic - a pick-less post has nothing
  // to summarise from legs[0], so the notification falls back to the
  // caption (or a generic line if there's no caption either, e.g. a
  // photo/video-only post).
  function activitySummary() {
    if (hasPick) return `${legs[0].event} - ${legs[0].market}: ${legs[0].selection}${legs.length > 1 ? ` +${legs.length - 1} more` : ''}`
    return caption.trim() || 'Check it out'
  }

  async function handlePost() {
    if (hardLimitBlocked()) return
    setSubmitting(true)
    setError(null)
    try {
      const photoUrl = photoFile ? await dataStore.uploadPostPhoto(user.id, photoFile) : null
      const videoUrl = videoFile ? await dataStore.uploadPostVideo(user.id, videoFile) : null
      const post = await dataStore.createBetPost({
        groupId,
        userId: user.id,
        sport,
        marketType,
        selections: submittedLegs,
        stake: stakeNum,
        stakeHidden,
        potentialReturn,
        visibility: 'group',
        caption: caption.trim() || null,
        photoUrl,
        videoUrl,
        tag
      })
      const groupName = groups.find((g) => g.id === groupId)?.name ?? 'your group'
      notifyGroup(
        groupId,
        {
          title: `${user.displayName} posted a bet in ${groupName}`,
          body: activitySummary(),
          url: `/#/groups/${groupId}`
        },
        user.id
      )
      clearSlip()
      removePhoto()
      removeVideo()
      showToast(`Posted to ${groupName}`)
      navigate(`/groups/${groupId}`)
      return post
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePostPublic() {
    if (hardLimitBlocked()) return
    setSubmitting(true)
    setError(null)
    try {
      const photoUrl = photoFile ? await dataStore.uploadPostPhoto(user.id, photoFile) : null
      const videoUrl = videoFile ? await dataStore.uploadPostVideo(user.id, videoFile) : null
      await dataStore.createBetPost({
        groupId: null,
        userId: user.id,
        sport,
        marketType,
        selections: submittedLegs,
        stake: stakeNum,
        stakeHidden,
        potentialReturn,
        visibility: 'public',
        caption: caption.trim() || null,
        photoUrl,
        videoUrl,
        tag
      })
      notifyPublicFollowers()
      clearSlip()
      removePhoto()
      removeVideo()
      showToast('Posted to everyone')
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Best-effort, fire-and-forget - never awaited, so a slow badge lookup
  // can't delay the toast/navigate above. Recomputes the poster's own
  // tipster badge from their public-feed track record (same thresholds as
  // tipsterBadge.js/the Tipster Leaderboard) so a Sharp Bettor/Reliable
  // Tipster's pick reads as one in the push notification itself, not just
  // another "X posted" - same single notification as before, no new opt-in.
  function notifyPublicFollowers() {
    const title = `${user.displayName} posted a new pick`
    const body = activitySummary()
    const url = '/#/groups'
    dataStore
      .listBetPostsByUser(user.id)
      .then((posts) => {
        const stats = computeStats(posts.filter((p) => p.visibility === 'public' && !p.stakeHidden))
        const badge = tipsterBadge(stats)
        notifyFollowers(user.id, { title: badge ? `${badge.icon} ${badge.label} ${user.displayName} posted a new pick` : title, body, url })
      })
      .catch(() => notifyFollowers(user.id, { title, body, url }))
  }

  async function handleSaveToTracker() {
    if (hardLimitBlocked()) return
    setSubmitting(true)
    setError(null)
    try {
      await dataStore.addManualEntry({
        userId: user.id,
        sport,
        marketType,
        selections: submittedLegs,
        stake: stakeNum,
        potentialReturn
      })
      clearSlip()
      showToast('Saved to Tracker')
      navigate('/tracker')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={`sheet-backdrop${closing ? ' closing' : ''}`} onClick={onClose}>
      <div className={`sheet${closing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* Sticky header so the close button is always reachable - the sheet
            scrolls, and a tall one left no backdrop to tap and no visible way
            out but scrolling to a buried Cancel button. */}
        <div className="sheet-header">
          <div className="sheet-handle" />
          <div className="sheet-header-row">
            <h2 className="sheet-title">
              {legs.length > 1 ? `Your bet builder (${legs.length} legs)` : legs.length === 1 ? 'Your pick' : 'New post'}
            </h2>
            <button type="button" className="sheet-close" onClick={onClose} disabled={submitting} aria-label="Close">
              &times;
            </button>
          </div>
        </div>

        {hasPick ? (
          <div className="bet-slip-legs">
            {legs.map((leg) => (
              <div key={`${leg.event}|${leg.market}|${leg.selection}`} className="selection-summary bet-slip-leg">
                <button className="bet-slip-leg-remove" onClick={() => removeLeg(leg)} aria-label="Remove leg">
                  &times;
                </button>
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
          </div>
        ) : (
          <div className="quick-pick">
            <p className="quick-pick-title">Attach a pick (optional)</p>
            <label className="field">
              <span>Sport</span>
              <select value={pickerSport} onChange={(e) => setPickerSport(e.target.value)}>
                {PICKER_SPORTS.map((key) => (
                  <option key={key} value={key}>
                    {SPORT_LABEL[key]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Event</span>
              <select
                value={pickerEventId}
                onChange={(e) => {
                  setPickerEventId(e.target.value)
                  setPickerMarketKey('')
                }}
                disabled={pickerLoading || !pickerItems?.length}
              >
                <option value="">
                  {pickerLoading ? 'Loading…' : pickerItems && !pickerItems.length ? 'No upcoming events' : 'Choose an event'}
                </option>
                {pickerGroups
                  ? pickerGroups.map((group) => (
                      <optgroup key={group.competition} label={group.competition}>
                        {group.items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {labelFor(pickerSport, item)}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  : pickerItems?.map((item) => (
                      <option key={item.id} value={item.id}>
                        {labelFor(pickerSport, item)}
                      </option>
                    ))}
              </select>
            </label>
            {pickerNormalized && (
              <label className="field">
                <span>Market</span>
                <select value={pickerMarketKey} onChange={(e) => setPickerMarketKey(e.target.value)}>
                  <option value="">Choose a market</option>
                  {pickerNormalized.markets.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {pickerMarket && (
              <label className="field">
                <span>Selection</span>
                <select
                  value=""
                  onChange={(e) => {
                    const outcome = pickerMarket.outcomes.find((o) => o.name === e.target.value)
                    if (outcome) pickOutcome(outcome)
                  }}
                >
                  <option value="">Choose a selection</option>
                  {pickerMarket.outcomes.map((o) => (
                    <option key={o.name} value={o.name} disabled={!o.best}>
                      {o.name} {o.best ? `· ${formatOdds(o.best.decimal, format)}` : '(no price)'}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        {legs.length > 1 && (
          <div className="potential-return">
            Combined odds: <strong>{formatOdds(combinedOdds, format)}</strong>
          </div>
        )}

        {correlation && (
          <div className="limit-warning">
            <LinkIcon className="icon-lead" /> {correlation.legCount} of these legs are on the same{' '}
            {correlation.events.length > 1 ? 'matches' : 'match'} - they're not really independent, so that combined price overstates
            how spread out the risk is.
          </div>
        )}

        <label className="field">
          <span>Say something (optional)</span>
          <textarea
            rows={2}
            maxLength={200}
            placeholder="Why this one, what you're watching for, anything…"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </label>

        <div className="post-tag-section">
          <span className="post-tag-label">Tag it (optional)</span>
          <div className="post-tag-row">
            {POST_TAGS.map((t) => {
              const Icon = POST_TAG_ICON[t.icon]
              return (
                <button
                  key={t.key}
                  type="button"
                  className={tag === t.key ? 'post-tag-chip active icon-row' : 'post-tag-chip icon-row'}
                  onClick={() => setTag(tag === t.key ? null : t.key)}
                >
                  {Icon && <Icon width={14} height={14} />} {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {photoPreview && (
          <div className="composer-photo-preview">
            <img src={photoPreview} alt="" />
            <button type="button" className="composer-photo-remove" onClick={removePhoto} aria-label="Remove photo">
              ×
            </button>
          </div>
        )}
        {videoPreview && (
          <div className="composer-photo-preview">
            <video src={videoPreview} controls className="composer-video-preview" />
            <button type="button" className="composer-photo-remove" onClick={removeVideo} aria-label="Remove video">
              ×
            </button>
          </div>
        )}
        {!photoFile && !videoFile && (
          <div className="composer-media-buttons">
            <label className="btn btn-secondary composer-photo-button icon-row">
              <CameraIcon /> Add a photo
              <input type="file" accept="image/*" onChange={handlePhotoChange} className="scan-cta-input" />
            </label>
            <label className="btn btn-secondary composer-photo-button icon-row">
              <VideoIcon /> Add a video
              <input type="file" accept="video/*" onChange={handleVideoChange} className="scan-cta-input" />
            </label>
          </div>
        )}

        {hasPick && (
          <>
            <label className="field">
              <span>Stake (optional)</span>
              <input type="number" min="0" step="0.5" placeholder="£" value={stake} onChange={(e) => setStake(e.target.value)} />
            </label>
            {!stakeNum && groups.length > 0 && <p className="hint">No stake? It posts as a free pick for the Pick'em leaderboard.</p>}

            {eachWayTerms && (
              <>
                <label className="field-check">
                  <input type="checkbox" checked={eachWay} onChange={(e) => setEachWay(e.target.checked)} />
                  <span>Each-way (win + place)</span>
                </label>
                {eachWay && (
                  <p className="hint">
                    Terms: {eachWayTerms.fraction === 0.25 ? '1/4' : '1/5'} odds, {eachWayTerms.places} places. Half your stake rides on
                    each part.
                  </p>
                )}
              </>
            )}

            {stakeNum > 0 && (
              <label className="field-check">
                <input type="checkbox" checked={stakeHidden} onChange={(e) => setStakeHidden(e.target.checked)} />
                <span>Hide stake amount from the group</span>
              </label>
            )}
          </>
        )}

        {sanityCheckOn && (bigStake || lossChasing || stakingWarning || (user.stakeLimitAmount && periodSpend !== null && stakeNum > 0 && periodSpend + stakeNum > user.stakeLimitAmount)) && (
          <div className="sanity-check">
            <p className="sanity-check-title icon-row">
              <SparkIcon width={15} height={15} /> Heads-up
            </p>
            {user.stakeLimitAmount && periodSpend !== null && stakeNum > 0 && periodSpend + stakeNum > user.stakeLimitAmount && (
              <div className="limit-warning">
                <WarningIcon className="icon-lead" /> This would take you to £{(periodSpend + stakeNum).toFixed(2)} of your £
                {Number(user.stakeLimitAmount).toFixed(2)} {user.stakeLimitPeriod === 'monthly' ? 'monthly' : 'weekly'} limit.
              </div>
            )}

            {lossChasing && (
              <div className="limit-warning">
                <EyesIcon className="icon-lead" /> Your last logged bet lost at £{lossChasing.lastStake.toFixed(2)} - this one's{' '}
                {lossChasing.increasePct}% bigger. No judgement, just flagging it.
              </div>
            )}

            {stakingWarning && (
              <div className="limit-warning">
                <RulerIcon className="icon-lead" /> Your staking plan suggests £{stakingWarning.suggestion.toFixed(2)} a bet - this
                one's {stakingWarning.overPct}% over that.
              </div>
            )}

            {bigStake && (
              <div className="limit-warning">
                <TrendUpIcon className="icon-lead" /> That's {bigStake.multiple}x your average stake (£{bigStake.avgStake.toFixed(2)}) -
                no judgement, just flagging it.
              </div>
            )}
          </div>
        )}

        {potentialReturn && (
          <div className="potential-return">
            Potential return: <strong>£{potentialReturn.toFixed(2)}</strong>
          </div>
        )}

        {groups.length > 0 && (
          <label className="field">
            <span>Post to group</span>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Collapsed by default - the pick/caption/tag/media are already
            visible above as you fill them in, so showing the full "as it'll
            post" card unprompted just duplicated all of that a second time
            before you'd even reached the post button. Still built from the
            same values as createBetPost (submittedLegs/marketType/
            potentialReturn) when opened, so the preview and the posted card
            can never drift apart. */}
        {canSubmit && (
          <button type="button" className="btn btn-ghost btn-small preview-toggle" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? 'Hide preview ▴' : 'Preview post ▾'}
          </button>
        )}
        {showPreview && (
          <PostPreview
            authorName={user.displayName}
            authorAvatarUrl={user.avatarUrl}
            caption={caption}
            tag={tag}
            legs={submittedLegs}
            marketType={marketType}
            stake={stakeNum}
            stakeHidden={stakeHidden}
            combinedOdds={combinedOdds}
            potentialReturn={potentialReturn}
            photoPreview={photoPreview}
            videoPreview={videoPreview}
            format={format}
          />
        )}

        {error && <div className="auth-error">{error}</div>}

        {/* One clear primary action, not four equal buttons. With a group you
            share to it; without one, posting to everyone is the primary. Saving
            privately is the quiet tertiary, and closing is the × up top - no
            need for a fourth full-width Cancel button down here. */}
        <div className="sheet-actions">
          {groups.length > 0 ? (
            <>
              <button className="btn btn-primary" onClick={handlePost} disabled={submitting || !canSubmit}>
                {submitting ? 'Posting…' : 'Share with the group'}
              </button>
              <button className="btn btn-secondary" onClick={handlePostPublic} disabled={submitting || !canSubmit}>
                {submitting ? 'Posting…' : 'Post to everyone'}
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={handlePostPublic} disabled={submitting || !canSubmit}>
              {submitting ? 'Posting…' : 'Post to everyone'}
            </button>
          )}
          {hasPick && (
            <button className="btn btn-ghost" onClick={handleSaveToTracker} disabled={submitting}>
              Keep it to myself
            </button>
          )}
        </div>

        {!groups.length && <p className="hint">Tip: join or create a group to share with just your mates instead of everyone.</p>}
      </div>
    </div>
  )
}
