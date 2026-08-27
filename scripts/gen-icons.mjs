// Generates the app's PWA icons: the BetMates mark - a betting slip (white
// card with a perforated tear edge) and a green "settled" check on the brand
// navy tile. It's the SAME mark public/favicon.svg draws with real SVG shapes,
// reimplemented here as per-pixel geometry (rounded-rect + circle + thick-
// segment distance tests) since PNGs need actual pixels, not vector paths - so
// there's no image-processing dependency to run this.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const NAVY = [35, 75, 122] // #234b7a - brand tile
const WHITE = [255, 255, 255] // the slip
const GREEN = [18, 161, 80] // #12a150 - the settled check

// Geometry defined on a 100x100 canvas (matches favicon.svg) and scaled to
// whatever `size` makePng is asked for.
const SLIP = { x0: 28, y0: 23, x1: 72, y1: 77, r: 7 }
const NOTCHES = [37, 50, 63].map((cy) => ({ cx: 28, cy, r: 3.4 }))
const CHECK = [[37, 51], [45, 59], [64, 36]] // polyline
const CHECK_WIDTH = 7.5

// Point inside an axis-aligned rounded rectangle (corner radius r). dx/dy are
// how far the point pushes into a corner region; within r of the corner arc =
// inside.
function inRoundedRect(px, py, { x0, y0, x1, y1, r }) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false
  const dx = Math.max(x0 + r - px, 0, px - (x1 - r))
  const dy = Math.max(y0 + r - py, 0, py - (y1 - r))
  return dx * dx + dy * dy <= r * r
}

function distToSegment(px, py, [x1, y1], [x2, y2]) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  let t = lenSq ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function crc32(buf) {
  let c
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c
    }
    return t
  })())
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function makePng(size, { maskablePad = false } = {}) {
  // Maskable icons keep their content inside a safe zone (the launcher clips
  // the edges); the navy tile still fills the whole frame full-bleed.
  const pad = maskablePad ? Math.floor(size * 0.15) : 0
  const scale = (size - pad * 2) / 100
  const toPx = (c) => pad + c * scale

  const slip = { x0: toPx(SLIP.x0), y0: toPx(SLIP.y0), x1: toPx(SLIP.x1), y1: toPx(SLIP.y1), r: SLIP.r * scale }
  const notches = NOTCHES.map((n) => ({ cx: toPx(n.cx), cy: toPx(n.cy), r: n.r * scale }))
  const check = CHECK.map(([x, y]) => [toPx(x), toPx(y)])
  const checkHalf = Math.max(1, (CHECK_WIDTH * scale) / 2)

  const raw = Buffer.alloc(size * (1 + size * 4))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4)
    raw[rowStart] = 0 // filter type: none
    for (let x = 0; x < size; x++) {
      let color = NAVY // full-bleed brand tile
      if (inRoundedRect(x, y, slip) && !notches.some((n) => (x - n.cx) ** 2 + (y - n.cy) ** 2 <= n.r ** 2)) {
        color = WHITE
        // The check sits on the slip - draw it last, over the white.
        for (let i = 0; i < check.length - 1; i++) {
          if (distToSegment(x, y, check[i], check[i + 1]) <= checkHalf) {
            color = GREEN
            break
          }
        }
      }
      const off = rowStart + 1 + x * 4
      raw[off] = color[0]
      raw[off + 1] = color[1]
      raw[off + 2] = color[2]
      raw[off + 3] = 255
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const idat = deflateSync(raw)
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/icon-192.png', makePng(192))
writeFileSync('public/icons/icon-512.png', makePng(512))
writeFileSync('public/icons/icon-maskable-512.png', makePng(512, { maskablePad: true }))
console.log('Generated BetMates slip-check PWA icons in public/icons/')
