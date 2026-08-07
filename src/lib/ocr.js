// Lazy-loads tesseract.js only when a photo import is actually attempted -
// it's a multi-MB WASM OCR engine, no business sitting in the main bundle
// (see CLAUDE.md's code-splitting note) for the vast majority of sessions
// that never touch this feature. Runs entirely in the browser: no server,
// no API key, nothing to degrade if unconfigured - matches the rest of the
// app's zero-backend-keys contract, just for a client-side capability
// instead of a missing env var.
export async function recognizeSlipText(imageFile) {
  const { default: Tesseract } = await import('tesseract.js')
  const {
    data: { text }
  } = await Tesseract.recognize(imageFile, 'eng')
  return text
}
