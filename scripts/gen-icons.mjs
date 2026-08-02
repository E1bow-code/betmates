// Generates simple solid-color placeholder PWA icons (no design tool dependency).
// Swap public/icons/*.png for real branded artwork before shipping.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const BG = [21, 18, 15] // #15120f
const FG = [224, 163, 57] // #e0a339

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
  const raw = Buffer.alloc(size * (1 + size * 4))
  const pad = maskablePad ? Math.floor(size * 0.15) : 0
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4)
    raw[rowStart] = 0 // filter type: none
    for (let x = 0; x < size; x++) {
      const inCircle = ((x - size / 2) ** 2 + (y - size / 2) ** 2) <= ((size / 2 - pad - 4) ** 2)
      const insideSafe = x >= pad && x < size - pad && y >= pad && y < size - pad
      const useFg = maskablePad ? insideSafe && inCircle : inCircle
      const color = useFg ? FG : BG
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
console.log('Generated placeholder icons in public/icons/')
