// Renders a bet post as a branded PNG (canvas, no image library) for the
// "share as image" button - the screenshot-style bet-slip graphic real
// bookmaker apps let you post, rather than only a plain-text copy.

const COLORS = {
  bg: '#15120f',
  surface: '#201a15',
  border: '#423527',
  text: '#f2ece2',
  textDim: '#a8998a',
  accent: '#e0a339'
}

const WIDTH = 640

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

export async function renderBetSlipImage(post) {
  const legs = post.selections
  const padding = 40
  const contentWidth = WIDTH - padding * 2

  // First pass on a throwaway canvas just to measure how tall each leg's
  // wrapped event text will be, so the real canvas can be sized correctly
  // before anything is drawn (canvas height can't grow after the fact).
  const measure = document.createElement('canvas').getContext('2d')
  measure.font = '600 20px -apple-system, sans-serif'
  const legLines = legs.map((leg) => wrapText(measure, leg.event, contentWidth))

  let height = 150 // header
  for (const lines of legLines) height += 34 * lines.length + 56
  if (legs.length > 1) height += 44 // combined odds line
  if (post.stake && !post.stakeHidden) height += 40
  height += 70 // footer

  const canvas = document.createElement('canvas')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = WIDTH * dpr
  canvas.height = height * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, WIDTH, height)

  let y = padding

  ctx.fillStyle = COLORS.accent
  ctx.font = '700 24px Georgia, serif'
  ctx.fillText('BetMates', padding, y)
  ctx.fillStyle = COLORS.textDim
  ctx.font = '600 13px -apple-system, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(legs.length > 1 ? `${legs.length}-LEG BET BUILDER` : 'BET SLIP', WIDTH - padding, y - 2)
  ctx.textAlign = 'left'
  y += 30
  ctx.strokeStyle = COLORS.border
  ctx.beginPath()
  ctx.moveTo(padding, y)
  ctx.lineTo(WIDTH - padding, y)
  ctx.stroke()
  y += 40

  legs.forEach((leg, i) => {
    ctx.fillStyle = COLORS.text
    ctx.font = '600 20px -apple-system, sans-serif'
    for (const line of legLines[i]) {
      ctx.fillText(line, padding, y)
      y += 27
    }
    y += 4
    ctx.fillStyle = COLORS.textDim
    ctx.font = '15px -apple-system, sans-serif'
    ctx.fillText(leg.market, padding, y)
    ctx.textAlign = 'right'
    ctx.fillStyle = COLORS.accent
    ctx.font = '700 20px ui-monospace, Consolas, monospace'
    ctx.fillText(leg.odds.toFixed(2), WIDTH - padding, y)
    ctx.textAlign = 'left'
    y += 8
    ctx.fillStyle = COLORS.text
    ctx.font = '600 16px -apple-system, sans-serif'
    ctx.fillText(leg.selection, padding, y + 18)
    ctx.fillStyle = COLORS.textDim
    ctx.font = '13px -apple-system, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(leg.bookmaker, WIDTH - padding, y + 18)
    ctx.textAlign = 'left'
    y += 40
    if (i < legs.length - 1) {
      ctx.strokeStyle = COLORS.border
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(padding, y)
      ctx.lineTo(WIDTH - padding, y)
      ctx.stroke()
      ctx.setLineDash([])
      y += 20
    }
  })

  if (legs.length > 1) {
    const combined = legs.reduce((acc, l) => acc * l.odds, 1)
    ctx.fillStyle = COLORS.textDim
    ctx.font = '15px -apple-system, sans-serif'
    ctx.fillText('Combined odds', padding, y)
    ctx.fillStyle = COLORS.accent
    ctx.font = '700 20px ui-monospace, Consolas, monospace'
    ctx.textAlign = 'right'
    ctx.fillText(combined.toFixed(2), WIDTH - padding, y)
    ctx.textAlign = 'left'
    y += 34
  }

  if (post.stake && !post.stakeHidden) {
    ctx.fillStyle = COLORS.textDim
    ctx.font = '15px -apple-system, sans-serif'
    ctx.fillText(`£${post.stake} staked`, padding, y)
    if (post.potentialReturn) {
      ctx.fillStyle = COLORS.accent
      ctx.font = '700 16px -apple-system, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(`returns £${Number(post.potentialReturn).toFixed(2)}`, WIDTH - padding, y)
      ctx.textAlign = 'left'
    }
    y += 30
  }

  ctx.fillStyle = COLORS.textDim
  ctx.font = '12px -apple-system, sans-serif'
  ctx.fillText('BetMates does not place bets or hold funds. 18+. Gamble responsibly.', padding, height - padding + 20)

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

export async function shareBetSlipImage(post) {
  const blob = await renderBetSlipImage(post)
  const file = new File([blob], 'betmates-bet.png', { type: 'image/png' })

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'My BetMates pick' })
    return 'shared'
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'betmates-bet.png'
  a.click()
  URL.revokeObjectURL(url)
  return 'downloaded'
}

// Same canvas-and-share approach as the bet slip above, for a leaderboard
// rank card instead - a fixed-height layout since there's no variable-length
// content to measure first (unlike the leg list above).
export async function renderLeaderboardImage({ name, rank, profit, winRate, roi, windowLabel }) {
  const height = 360
  const padding = 40
  const good = profit >= 0

  const canvas = document.createElement('canvas')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = WIDTH * dpr
  canvas.height = height * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, WIDTH, height)

  let y = padding
  ctx.fillStyle = COLORS.accent
  ctx.font = '700 24px Georgia, serif'
  ctx.fillText('BetMates', padding, y)
  ctx.fillStyle = COLORS.textDim
  ctx.font = '600 13px -apple-system, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(`${windowLabel.toUpperCase()} LEADERBOARD`, WIDTH - padding, y - 2)
  ctx.textAlign = 'left'
  y += 30
  ctx.strokeStyle = COLORS.border
  ctx.beginPath()
  ctx.moveTo(padding, y)
  ctx.lineTo(WIDTH - padding, y)
  ctx.stroke()
  y += 70

  ctx.fillStyle = COLORS.accent
  ctx.font = '800 56px Georgia, serif'
  ctx.fillText(`#${rank}`, padding, y)

  ctx.fillStyle = COLORS.text
  ctx.font = '600 26px -apple-system, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(name, WIDTH - padding, y - 8)
  y += 20

  y += 60
  ctx.fillStyle = good ? '#5fbf74' : '#e0665a'
  ctx.font = '800 48px ui-monospace, Consolas, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`${good ? '+' : ''}£${profit.toFixed(2)}`, padding, y)
  ctx.textAlign = 'left'
  y += 50

  ctx.fillStyle = COLORS.textDim
  ctx.font = '15px -apple-system, sans-serif'
  const winRateText = winRate === null ? '-' : `${winRate}% win rate`
  const roiText = roi === null ? '-' : `${roi >= 0 ? '+' : ''}${roi}% ROI`
  ctx.fillText(`${winRateText} · ${roiText}`, padding, y)

  ctx.fillStyle = COLORS.textDim
  ctx.font = '12px -apple-system, sans-serif'
  ctx.fillText('BetMates does not place bets or hold funds. 18+. Gamble responsibly.', padding, height - padding + 20)

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

export async function shareLeaderboardImage(rankInfo) {
  const blob = await renderLeaderboardImage(rankInfo)
  const file = new File([blob], 'betmates-leaderboard.png', { type: 'image/png' })

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'My BetMates leaderboard rank' })
    return 'shared'
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'betmates-leaderboard.png'
  a.click()
  URL.revokeObjectURL(url)
  return 'downloaded'
}
