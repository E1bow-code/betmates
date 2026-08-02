// Generates the app's PWA icons: a football (soccer ball) glyph - amber
// ball, dark pentagon + seam-line pattern - in the app's own palette,
// rather than a plain solid circle. No image-processing dependency: the
// pattern is the same one public/favicon.svg draws with real SVG shapes,
// reimplemented here as per-pixel geometry tests (point-in-polygon for the
// pentagon, point-to-segment distance for the seams) since PNGs need
// actual pixels, not vector paths.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const BG = [21, 18, 15] // #15120f
const BALL = [224, 163, 57] // #e0a339
const SEAM = BG

// Geometry below is defined on a 100x100 canvas (matches favicon.svg) and
// scaled to whatever `size` makePng is asked for.
const CX = 50
const CY = 50
const BALL_R = 34
const PENTAGON_R = 15
const SEAM_END_R = 24
const SEAM_WIDTH = 5.5

function pentagonVertices() {
  return Array.from({ length: 5 }, (_, i) => {
    const theta = ((-90 + 72 * i) * Math.PI) / 180
    return [CX + PENTAGON_R * Math.cos(theta), CY + PENTAGON_R * Math.sin(theta)]
  })
}

function seamEnds() {
  return Array.from({ length: 5 }, (_, i) => {
    const theta = ((-90 + 72 * i) * Math.PI) / 180
    return [CX + SEAM_END_R * Math.cos(theta), CY + SEAM_END_R * Math.sin(theta)]
  })
}

function distToSegment(px, py, [x1, y1], [x2, y2]) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  let t = lenSq ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0
  t = Math.max(0, Math.min(1, t))
  const nx = x1 + t * dx
  const ny = y1 + t * dy
  return Math.hypot(px - nx, py - ny)
}

// Convex polygon, so a single winding-direction cross-product sign check
// is enough - no even-odd ray casting needed.
function inConvexPolygon(px, py, points) {
  let sign = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    const cross = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)
    if (cross === 0) continue
    const s = cross > 0 ? 1 : -1
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
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
  const pad = maskablePad ? Math.floor(size * 0.15) : 0
  const scale = (size - pad * 2) / 100
  const toPx = (canvasCoord) => pad + canvasCoord * scale

  const pentagon = pentagonVertices().map(([x, y]) => [toPx(x), toPx(y)])
  const seams = seamEnds().map(([x, y]) => [toPx(x), toPx(y)])
  const ballCx = toPx(CX)
  const ballCy = toPx(CY)
  const ballR = BALL_R * scale
  const seamWidth = Math.max(1, SEAM_WIDTH * scale)

  const raw = Buffer.alloc(size * (1 + size * 4))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4)
    raw[rowStart] = 0 // filter type: none
    for (let x = 0; x < size; x++) {
      const inBall = (x - ballCx) ** 2 + (y - ballCy) ** 2 <= ballR ** 2

      let color = BG
      if (inBall) {
        color = BALL
        if (inConvexPolygon(x, y, pentagon)) {
          color = SEAM
        } else {
          for (let i = 0; i < 5; i++) {
            if (distToSegment(x, y, pentagon[i], seams[i]) <= seamWidth / 2) {
              color = SEAM
              break
            }
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
console.log('Generated football-icon PWA icons in public/icons/')
