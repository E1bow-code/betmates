import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import * as dataStore from '../lib/dataStore.js'
import { saveVideoBlob } from '../lib/videoStore.js'
import { useEscapeKey } from '../lib/useEscapeKey.js'

const MAX_SECONDS = 60

// The "post a tip" flow from the Social tab's Tips segment: record a quick
// talking-to-camera take (or upload an existing clip), add a caption and
// an optional freeform pick ("Thunder Chaser to win at Ascot 14:30"), then
// post it to the friends feed. Recording uses MediaRecorder against the
// webcam; nothing here is a real bet - it's an opinion/tip, so there's no
// odds/stake structure to fill in.

export default function VideoRecorder({ onClose, onPosted }) {
  const { user } = useAuth()
  const [mode, setMode] = useState('choose') // choose | recording | preview
  const [seconds, setSeconds] = useState(0)
  const [blob, setBlob] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [caption, setCaption] = useState('')
  const [tag, setTag] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  useEscapeKey(handleClose)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    return () => {
      stopStream()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  async function startRecording() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }
      chunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const recordedBlob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' })
        finishRecording(recordedBlob)
      }
      recorderRef.current = recorder
      recorder.start()
      setMode('recording')
      setSeconds(0)
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) {
            stopRecording()
            return MAX_SECONDS
          }
          return s + 1
        })
      }, 1000)
    } catch (err) {
      setError("Couldn't access your camera/mic - check your browser permissions, or upload a clip instead.")
    }
  }

  function stopRecording() {
    clearInterval(timerRef.current)
    recorderRef.current?.stop()
    stopStream()
  }

  function finishRecording(recordedBlob) {
    setBlob(recordedBlob)
    setPreviewUrl(URL.createObjectURL(recordedBlob))
    setMode('preview')
  }

  function handleFileChosen(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBlob(file)
    setPreviewUrl(URL.createObjectURL(file))
    setMode('preview')
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setBlob(null)
    setPreviewUrl(null)
    setCaption('')
    setTag('')
    setError(null)
    setMode('choose')
  }

  async function handlePost() {
    if (!caption.trim()) {
      setError('Say something about the pick before you post it.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const videoKey = `video_${user.id}_${Date.now()}`
      await saveVideoBlob(videoKey, blob)
      const post = await dataStore.createVideoPost({
        authorId: user.id,
        videoKey,
        durationSec: mode === 'recording' ? seconds : null,
        caption: caption.trim(),
        tag: tag.trim() || null
      })
      onPosted?.(post)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleClose() {
    stopStream()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={handleClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2 className="sheet-title">Post a tip</h2>

        {mode === 'choose' && (
          <div className="video-choose">
            <p className="hint">Talk to the camera about a pick, or upload a clip you've already got.</p>
            <button className="btn btn-primary" onClick={startRecording}>
              Record a take
            </button>
            <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
              Upload a video
            </button>
            <input ref={fileInputRef} type="file" accept="video/*" hidden onChange={handleFileChosen} />
          </div>
        )}

        {mode === 'recording' && (
          <div className="video-recording">
            <video ref={videoRef} className="video-preview" muted playsInline />
            <div className="video-timer">
              <span className="recording-dot" /> {seconds}s / {MAX_SECONDS}s
            </div>
            <button className="btn btn-primary" onClick={stopRecording}>
              Stop recording
            </button>
          </div>
        )}

        {mode === 'preview' && (
          <div className="video-preview-form">
            <video src={previewUrl} className="video-preview" controls />

            <label className="field">
              <span>What's the take?</span>
              <textarea
                placeholder="This horse will win and here's why…"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={280}
                rows={3}
              />
            </label>

            <label className="field">
              <span>The pick (optional)</span>
              <input placeholder="e.g. Thunder Chaser to win at Ascot 14:30" value={tag} onChange={(e) => setTag(e.target.value)} maxLength={80} />
            </label>

            {error && <div className="auth-error">{error}</div>}

            <div className="sheet-actions">
              <button className="btn btn-primary" onClick={handlePost} disabled={submitting}>
                {submitting ? 'Posting…' : 'Post it'}
              </button>
              <button className="btn btn-secondary" onClick={reset} disabled={submitting}>
                Start over
              </button>
            </div>
          </div>
        )}

        {error && mode === 'choose' && <div className="auth-error">{error}</div>}

        {mode !== 'preview' && (
          <button className="btn btn-ghost" onClick={handleClose}>
            Never mind
          </button>
        )}
      </div>
    </div>
  )
}
