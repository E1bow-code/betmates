// Lazy-loads tesseract.js only when a photo import is actually attempted -
// it's a multi-MB WASM OCR engine, no business sitting in the main bundle
// (see CLAUDE.md's code-splitting note) for the vast majority of sessions
// that never touch this feature. Runs entirely in the browser: no server,
// no API key, nothing to degrade if unconfigured - matches the rest of the
// app's zero-backend-keys contract, just for a client-side capability
// instead of a missing env var.

// Most bookmaker apps default to a dark theme (light text on a dark
// background) - confirmed live with a real William Hill "My Bets"
// screenshot that came back with no odds/stake at all despite clean,
// readable text (a plain "2/1" and "Stake: £20.00"). Tesseract is trained
// on the opposite - dark text on light paper - and reads light-on-dark
// screenshots very poorly. Sampling the image's average luminance and
// inverting when it's genuinely dark fixes this without touching an
// already-light slip (a paper betting-shop slip, or a light-themed app).
async function preprocessForOcr(imageFile) {
  const bitmap = await createImageBitmap(imageFile)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData

  let total = 0
  for (let i = 0; i < data.length; i += 4) {
    total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  const avgLuminance = total / (data.length / 4)

  if (avgLuminance < 128) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i]
      data[i + 1] = 255 - data[i + 1]
      data[i + 2] = 255 - data[i + 2]
    }
    ctx.putImageData(imageData, 0, 0)
  }
  return canvas
}

export async function recognizeSlipText(imageFile) {
  const { default: Tesseract } = await import('tesseract.js')
  // Falls back to the raw file on any preprocessing failure (an
  // unsupported browser, a corrupt image) - never worth losing the whole
  // scan over a best-effort contrast fix.
  const source = await preprocessForOcr(imageFile).catch(() => imageFile)
  const {
    data: { text }
  } = await Tesseract.recognize(source, 'eng')
  return text
}
