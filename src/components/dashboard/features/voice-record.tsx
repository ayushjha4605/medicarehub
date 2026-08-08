"use client"

/**
 * MoM Point #12 — Voice Health Memo
 * Voice recording → AI transcription + categorization.
 *
 * Self-contained client component. Uses MediaRecorder API to capture audio,
 * converts the blob to base64, POSTs to /api/ai/transcribe, and renders the
 * transcript + AI analysis + action card.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Mic,
  MicOff,
  Square,
  X,
  Copy,
  Check,
  Loader2,
  Languages,
  AlertTriangle,
  Ambulance,
  ClipboardList,
  FileText,
  Sparkles,
  ArrowRight,
  Save,
  Volume2,
  History,
  ShieldAlert,
  RefreshCw,
  CheckCircle2,
  Radio,
  Settings,
  Upload,
} from "lucide-react"
import { toast } from "sonner"

import { useAuthStore } from "@/lib/auth-store"
import { apiFetch, ApiError } from "@/lib/api"
import {
  isCapacitorNative,
  isAndroidNative,
  acquireMicrophoneStream,
  openAndroidAppSettings,
  getMicBlockedMessage,
} from "@/lib/capacitor-mic"
import {
  HeroBanner,
  SectionHeader,
  EmptyState,
} from "@/components/dashboard/shared/primitives"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

// ============== Types ==============
type MemoCategory =
  | "SYMPTOM"
  | "MEDICATION"
  | "APPOINTMENT_NOTE"
  | "EMERGENCY"
  | "GENERAL"

interface TranscribeResponse {
  ok: boolean
  memoId: string
  transcript: string
  category: MemoCategory
  summary: string
  suggestedActions: string[]
  isEmergency: boolean
}

interface VoiceRecordProps {
  /** Optional: called when user clicks "Convert to Medical Record" with the transcript text. */
  onConvertToRecord?: (transcript: string) => void
  /** Optional: callback to programmatically trigger SOS (e.g. parent SOS panel). */
  onEmergency?: () => void
}

// ============== Constants ==============
const LANGUAGES: { value: string; label: string; native: string }[] = [
  { value: "en", label: "English", native: "English" },
  { value: "hi", label: "Hindi", native: "हिन्दी" },
  { value: "mr", label: "Marathi", native: "मराठी" },
  { value: "ta", label: "Tamil", native: "தமிழ்" },
  { value: "te", label: "Telugu", native: "తెలుగు" },
  { value: "bn", label: "Bengali", native: "বাংলা" },
]

const CATEGORY_META: Record<
  MemoCategory,
  { label: string; badge: string; dot: string; pulse?: boolean }
> = {
  SYMPTOM: {
    label: "Symptom",
    badge:
      "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30",
    dot: "bg-sky-500",
  },
  MEDICATION: {
    label: "Medication",
    badge:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30",
    dot: "bg-emerald-500",
  },
  APPOINTMENT_NOTE: {
    label: "Appointment Note",
    badge:
      "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/30",
    dot: "bg-teal-500",
  },
  EMERGENCY: {
    label: "Emergency",
    badge:
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30",
    dot: "bg-rose-500 animate-pulse",
    pulse: true,
  },
  GENERAL: {
    label: "General",
    badge:
      "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/30",
    dot: "bg-slate-500",
  },
}

const MAX_REC_SECONDS = 120 // hard cap

// ============== Helpers ==============
function formatTimer(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // result is "data:audio/webm;base64,...."
      const base64 = result.split(",")[1] || ""
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ============== Sub-components ==============

function Waveform({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !analyser) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)

      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)

      const barCount = 28
      const barWidth = width / barCount
      const gap = 3

      for (let i = 0; i < barCount; i++) {
        const idx = Math.floor((i / barCount) * (bufferLength * 0.5))
        const v = dataArray[idx] / 255
        const barH = Math.max(4, v * height * 0.85)
        const x = i * barWidth + gap / 2
        const y = (height - barH) / 2

        const grad = ctx.createLinearGradient(0, y, 0, y + barH)
        grad.addColorStop(0, "#10b981") // emerald-500
        grad.addColorStop(1, "#14b8a6") // teal-500
        ctx.fillStyle = grad
        ctx.beginPath()
        const r = Math.min(3, barWidth / 2 - gap / 2)
        // round-rect
        const w = barWidth - gap
        ctx.moveTo(x + r, y)
        ctx.lineTo(x + w - r, y)
        ctx.quadraticCurveTo(x + w, y, x + w, y + r)
        ctx.lineTo(x + w, y + barH - r)
        ctx.quadraticCurveTo(x + w, y + barH, x + w - r, y + barH)
        ctx.lineTo(x + r, y + barH)
        ctx.quadraticCurveTo(x, y + barH, x, y + barH - r)
        ctx.lineTo(x, y + r)
        ctx.quadraticCurveTo(x, y, x + r, y)
        ctx.closePath()
        ctx.fill()
      }
    }
    draw()

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [analyser])

  return (
    <canvas
      ref={canvasRef}
      width={560}
      height={72}
      className="h-[72px] w-full max-w-[560px]"
      aria-hidden
    />
  )
}

function TranscriptCard({ transcript }: { transcript: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(transcript)
      setCopied(true)
      toast.success("Transcript copied to clipboard")
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Failed to copy")
    }
  }

  return (
    <Card className="overflow-hidden border-sky-100 dark:border-sky-500/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-500/10">
              <FileText className="h-4 w-4" />
            </div>
            <CardTitle className="text-base">Transcript</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-8 gap-1.5 text-xs"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" /> Copy
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-sky-100 bg-sky-50/40 p-3 text-sm leading-relaxed text-foreground/90 dark:border-sky-500/20 dark:bg-sky-500/5">
          <p className="whitespace-pre-wrap">{transcript}</p>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {transcript.split(/\s+/).filter(Boolean).length} words • AI-generated, may contain errors.
        </p>
      </CardContent>
    </Card>
  )
}

function AnalysisCard({
  category,
  summary,
  suggestedActions,
}: {
  category: MemoCategory
  summary: string
  suggestedActions: string[]
}) {
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const meta = CATEGORY_META[category] || CATEGORY_META.GENERAL

  const toggle = (i: number) =>
    setChecked((p) => ({ ...p, [i]: !p[i] }))

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
              <Sparkles className="h-4 w-4" />
            </div>
            <CardTitle className="text-base">AI Analysis</CardTitle>
          </div>
          <Badge variant="outline" className={cn("gap-1.5", meta.badge)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
            {meta.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary && (
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Summary
            </p>
            <p className="text-sm leading-relaxed text-foreground/90">{summary}</p>
          </div>
        )}

        {suggestedActions.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Suggested actions
            </p>
            <ul className="space-y-1.5">
              {suggestedActions.map((a, i) => {
                const isChecked = !!checked[i]
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      className={cn(
                        "group flex w-full items-start gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/40",
                        isChecked && "bg-emerald-50/60 dark:bg-emerald-500/5"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                          isChecked
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-muted-foreground/40 group-hover:border-emerald-400"
                        )}
                      >
                        {isChecked && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span
                        className={cn(
                          "leading-relaxed",
                          isChecked && "text-muted-foreground line-through"
                        )}
                      >
                        {a}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {!summary && suggestedActions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            AI did not return any analysis for this memo.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function EmergencyBanner({ onCallSos }: { onCallSos?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-xl border-2 border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10"
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/30">
          <span className="absolute h-12 w-12 animate-ping rounded-full bg-rose-500/40" />
          <Ambulance className="relative h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-semibold text-rose-800 dark:text-rose-200">
            <ShieldAlert className="h-4 w-4" />
            This sounds like an emergency
          </p>
          <p className="mt-0.5 text-sm text-rose-700 dark:text-rose-300">
            Please call <strong>112</strong> immediately or visit the nearest
            emergency room. Do not wait for further AI analysis.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <a href="tel:112" className="inline-flex">
            <Button
              variant="default"
              className="w-full gap-2 bg-rose-600 text-white hover:bg-rose-700 sm:w-auto"
            >
              <Ambulance className="h-4 w-4" /> Call 112
            </Button>
          </a>
          {onCallSos && (
            <Button
              variant="outline"
              onClick={onCallSos}
              className="w-full gap-2 border-rose-300 text-rose-700 hover:bg-rose-100 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10 sm:w-auto"
            >
              <ShieldAlert className="h-4 w-4" /> Trigger SOS
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ============== Main component ==============

export function VoiceRecord({ onConvertToRecord, onEmergency }: VoiceRecordProps) {
  const { user } = useAuthStore()
  const patientId = user?.id || ""

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [seconds, setSeconds] = useState(0)
  // Mirror `seconds` into a ref so async callbacks (like handleStopAndTranscribe
  // after MediaRecorder's onstop) can read the latest value without stale closure.
  const secondsRef = useRef(0)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [openingSettings, setOpeningSettings] = useState(false)
  // Detailed diagnostic info shown in a collapsible panel when mic fails.
  // This helps pinpoint WHY getUserMedia is failing in the APK remotely.
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [diagnosticInfo, setDiagnosticInfo] = useState<string>("")

  // Settings
  const [language, setLanguage] = useState("en")

  // Media refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)

  // Web Speech API refs (primary transcription — works on Vercel)
  const recognitionRef = useRef<unknown>(null)
  const liveTranscriptRef = useRef<string>("")
  const [liveTranscript, setLiveTranscript] = useState("")

  // Recording-state + audio-level tracking — used inside Web Speech API
  // callbacks (which can fire AFTER React state updates settle, so we need
  // refs to read the live value).
  const isRecordingRef = useRef(false)
  const peakAudioLevelRef = useRef(0) // 0..255 RMS peak since recording started
  const audioLevelTimerRef = useRef<NodeJS.Timeout | null>(null)
  const speechErrorRef = useRef<string | null>(null)

  // Check if Web Speech API is available
  const hasWebSpeech =
    typeof window !== "undefined" &&
    ((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown })
        .webkitSpeechRecognition)

  // Result state
  const [result, setResult] = useState<TranscribeResponse | null>(null)
  const [savedMemoId, setSavedMemoId] = useState<string | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer()
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close()
        } catch {
          /* noop */
        }
      }
    }
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  /**
   * Collect diagnostic info when getUserMedia fails. This is invaluable for
   * debugging the Capacitor APK mic issue remotely — the user can read us
   * the exact error name + environment details and we'll know exactly which
   * of the 6 possible failure modes we're dealing with.
   */
  const collectMicDiagnostics = useCallback((error: unknown): string => {
    const e = error as DOMException
    const lines: string[] = []

    lines.push("=== Microphone Diagnostic ===")
    lines.push("")
    lines.push("ERROR:")
    lines.push(`  name:    ${e?.name || "unknown"}`)
    lines.push(`  message: ${e?.message || "none"}`)
    lines.push(`  code:    ${e?.code ?? "none"}`)
    lines.push("")

    lines.push("ENVIRONMENT:")
    lines.push(`  userAgent: ${navigator.userAgent}`)
    lines.push(`  origin:    ${typeof window !== "undefined" ? window.location.origin : "none"}`)
    lines.push(`  protocol:  ${typeof window !== "undefined" ? window.location.protocol : "none"}`)
    lines.push(`  isSecure:  ${typeof window !== "undefined" && window.isSecureContext}`)
    lines.push("")

    lines.push("CAPACITOR:")
    lines.push(`  isNative:     ${isCapacitorNative()}`)
    lines.push(`  isAndroid:    ${isAndroidNative()}`)
    const cap = (typeof window !== "undefined" ? (window as unknown as { Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> } }).Capacitor : undefined)
    lines.push(`  platform:     ${cap?.getPlatform?.() ?? "not-detected"}`)
    lines.push(`  plugins:      ${cap?.Plugins ? Object.keys(cap.Plugins).join(", ") || "(none)" : "(none)"}`)
    lines.push("")

    lines.push("MEDIA DEVICES:")
    lines.push(`  mediaDevices exists:  ${!!navigator.mediaDevices}`)
    lines.push(`  getUserMedia exists:  ${!!navigator.mediaDevices?.getUserMedia}`)
    lines.push(`  enumerateDevices:     ${typeof navigator.mediaDevices?.enumerateDevices === "function"}`)

    // Try to list available devices — this itself can reveal permission state
    if (navigator.mediaDevices?.enumerateDevices) {
      try {
        // Note: this is synchronous-looking but actually async; we fire and
        // forget and let the user re-tap if they need updated info.
        navigator.mediaDevices.enumerateDevices().then((devices) => {
          const audioInputs = devices.filter((d) => d.kind === "audioinput")
          console.log("[mic-diagnostic] audioinput devices:", audioInputs.length, audioInputs)
        }).catch(() => {})
      } catch {
        // ignore
      }
    }
    lines.push("  (check browser console for device list)")
    lines.push("")

    lines.push("MEDIA RECORDER:")
    lines.push(`  supported:   ${typeof MediaRecorder !== "undefined"}`)
    if (typeof MediaRecorder !== "undefined") {
      try {
        lines.push(`  webm/opus:   ${MediaRecorder.isTypeSupported("audio/webm;codecs=opus")}`)
        lines.push(`  webm:        ${MediaRecorder.isTypeSupported("audio/webm")}`)
        lines.push(`  mp4:         ${MediaRecorder.isTypeSupported("audio/mp4")}`)
      } catch {
        lines.push("  (isTypeSupported threw)")
      }
    }
    lines.push("")

    lines.push("=== End Diagnostic ===")

    return lines.join("\n")
  }, [])

  const handleStartRecording = useCallback(async () => {
    setErrorMessage(null)
    setResult(null)
    setSavedMemoId(null)
    setPermissionDenied(false)

    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionDenied(true)
      setErrorMessage(
        isCapacitorNative()
          ? "This device does not support microphone capture. Please update the MediCare Hub app to the latest version and try again."
          : "Your browser does not support microphone access. Please use Chrome, Edge, or Safari."
      )
      return
    }

    try {
      // acquireMicrophoneStream primes the native Capacitor permission bridge
      // (if running inside the APK) BEFORE calling getUserMedia — this is the
      // fix for the "Microphone access was blocked" error on Android even
      // when the OS permission was already granted.
      const stream = await acquireMicrophoneStream()
      streamRef.current = stream

      // Set up Web Audio analyser for waveform
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext
        const ctx = new AudioCtx()
        audioCtxRef.current = ctx
        const source = ctx.createMediaStreamSource(stream)
        const analyserNode = ctx.createAnalyser()
        // 2048 gives a stable RMS reading (32 samples is too noisy and
        // trips the "no audio detected" warning on perfectly good mics).
        analyserNode.fftSize = 2048
        analyserNode.smoothingTimeConstant = 0.6
        source.connect(analyserNode)
        analyserRef.current = analyserNode
        setAnalyser(analyserNode)
      } catch {
        // Audio analyser optional — fall back to pulse-only
        setAnalyser(null)
      }

      // Set up MediaRecorder.
      // Some browsers/WebViews don't implement MediaRecorder.isTypeSupported
      // (throws "isTypeSupported is not a function"), and some accept a
      // mimeType in isTypeSupported but then reject it in the constructor.
      // We try each candidate in order, falling back to letting the browser
      // pick its own default (passing NO mimeType option) — which always
      // works.
      const candidateMimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ]
      let recorder: MediaRecorder
      let chosenMime = ""
      const isSupported = (m: string) => {
        try {
          return (
            typeof MediaRecorder !== "undefined" &&
            typeof MediaRecorder.isTypeSupported === "function" &&
            MediaRecorder.isTypeSupported(m)
          )
        } catch {
          return false
        }
      }
      try {
        chosenMime = candidateMimeTypes.find(isSupported) || ""
        recorder = chosenMime
          ? new MediaRecorder(stream, { mimeType: chosenMime })
          : new MediaRecorder(stream) // browser picks default
      } catch {
        // Final fallback: no mimeType option at all.
        recorder = new MediaRecorder(stream)
      }
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        // Will be handled by stop handler
      }
      recorder.start(250)
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      setSeconds(0)
      secondsRef.current = 0

      // Start Web Speech API for live transcription (primary on Vercel)
      liveTranscriptRef.current = ""
      setLiveTranscript("")
      speechErrorRef.current = null
      isRecordingRef.current = true
      if (hasWebSpeech) {
        try {
          const SpeechRecognitionCtor =
            (window as unknown as { SpeechRecognition?: new () => unknown })
              .SpeechRecognition ||
            (window as unknown as { webkitSpeechRecognition?: new () => unknown })
              .webkitSpeechRecognition
          if (SpeechRecognitionCtor) {
            const recognition = new SpeechRecognitionCtor()
            const rec = recognition as {
              continuous: boolean
              interimResults: boolean
              lang: string
              onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> & { length: number } }) => void) | null
              onerror: ((e: { error?: string; message?: string }) => void) | null
              onend: (() => void) | null
              start: () => void
              stop: () => void
            }
            rec.continuous = true
            rec.interimResults = true
            rec.lang = language === "hi" ? "hi-IN" : language === "ta" ? "ta-IN" : "en-IN"
            // ─── Web Speech API error + restart management ───
            // The browser's speech recognition service auto-stops after
            // periods of silence (~5s) or after ~60s of continuous speech.
 // We restart it so the user can pause for breath and continue.
            //
            // PROBLEM with the old approach: restarting called start()
            // every 250ms, which plays the browser's speech-recognition
            // "ding" sound → after 5-6s the user heard continuous dings
            // and the page lagged.
            //
            // NEW approach:
            //  - 2000ms delay between restarts (was 250ms) — 8x fewer dings
            //  - Cap at 5 restarts total — after ~30s of no speech, stop
            //  - Track whether we got results. If a session ended almost
            //    immediately with zero results, the service is malfunctioning
            //    → don't restart at all (prevents tight loops).
            //  - Fatal errors (not-allowed, audio-capture) permanently stop
            //    restarts via `speechDead`.
            let speechDead = false
            let restartCount = 0
            let lastStartTime = Date.now()
            let gotResultsSinceLastStart = false
            const MAX_RESTARTS = 5
            let lastErrorToast = 0
            const showErrorToast = (title: string, desc: string) => {
              const now = Date.now()
              if (now - lastErrorToast < 10000) return
              lastErrorToast = now
              toast.error(title, { description: desc })
            }
            rec.onresult = (e) => {
              gotResultsSinceLastStart = true
              let full = ""
              for (let i = 0; i < e.results.length; i++) {
                full += e.results[i][0].transcript
              }
              liveTranscriptRef.current = full
              setLiveTranscript(full)
            }
            rec.onerror = (e) => {
              const err = e?.error || "unknown"
              if (err === "aborted") return // benign — user stopped
              if (err === "no-speech") {
                // User hasn't spoken yet — benign. Don't toast, don't kill.
                // onend will fire and we'll restart gently (2s delay).
                return
              }
              speechErrorRef.current = err
              if (err === "network") {
                showErrorToast(
                  "Speech recognition lost network connection",
                  "Web Speech API needs internet. Recording continues but live transcript may be incomplete."
                )
              } else if (err === "not-allowed" || err === "service-not-allowed") {
                speechDead = true
                showErrorToast(
                  "Live transcription unavailable",
                  "Browser blocked Web Speech API. Recording continues — your audio will still be saved."
                )
              } else if (err === "audio-capture") {
                speechDead = true
                showErrorToast(
                  "No microphone detected",
                  "Connect a mic and try again."
                )
              } else {
                // Unknown error — if it keeps happening, the restart cap
                // will eventually stop the cycle.
                showErrorToast(
                  "Speech recognition issue",
                  `Error: ${err}. Recording continues — you can stop when done.`
                )
              }
            }
            rec.onend = () => {
              if (!isRecordingRef.current) return
              if (speechDead) return
              if (restartCount >= MAX_RESTARTS) return
              // If the session ended almost immediately (under 2s) with
              // zero results, the speech service is malfunctioning. Don't
              // restart — it would create a tight loop of dings.
              const sessionDuration = Date.now() - lastStartTime
              if (!gotResultsSinceLastStart && sessionDuration < 2000 && restartCount > 0) {
                speechDead = true
                return
              }
              restartCount++
              // 2000ms delay — dramatically reduces the "ding" sound
              // frequency compared to 250ms.
              setTimeout(() => {
                if (!isRecordingRef.current) return
                if (speechDead) return
                try {
                  lastStartTime = Date.now()
                  gotResultsSinceLastStart = false
                  rec.start()
                } catch {
                  // start() throws if already started — ignore
                }
              }, 2000)
            }
            lastStartTime = Date.now()
            rec.start()
            recognitionRef.current = recognition
          }
        } catch {
          // Web Speech API failed — fall back to MediaRecorder + server ASR
        }
      }

      // NOTE: The RMS-based audio-level monitor that used to live here
      // has been REMOVED. It was fundamentally unreliable — with
      // fftSize=64 or even 2048, the RMS reading on a perfectly working
      // mic could read as "silent" due to browser echo cancellation,
      // noise suppression, quiet speaking volume, or the analyser not
      // being connected to the right source. This caused false
      // "No microphone audio detected" warnings on working mics.
      //
      // The ONLY reliable "did we get audio" check is the recorded
      // Blob size after the user stops — a real 2s+ recording always
      // produces >500 bytes of webm/opus data. That check lives in
      // handleStopAndTranscribe and is sufficient.
      peakAudioLevelRef.current = 0

      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          const next = s + 1
          secondsRef.current = next
          if (next >= MAX_REC_SECONDS) {
            // auto-stop at cap
            void handleStopAndTranscribe()
          }
          return next
        })
      }, 1000)

      toast.success("Recording started — speak clearly into your mic")
    } catch (err) {
      const e = err as DOMException
      // Collect detailed diagnostic info so we can pinpoint the exact cause
      // remotely (especially important for the Capacitor APK where we can't
      // open DevTools easily). This is shown in a collapsible panel below
      // the error message.
      const diag = collectMicDiagnostics(e)
      setDiagnosticInfo(diag)
      setShowDiagnostics(true)

      if (e?.name === "NotAllowedError" || e?.name === "SecurityError") {
        setPermissionDenied(true)
        // Context-aware message: APK users see Android-settings guidance,
        // browser users see the lock-icon guidance.
        setErrorMessage(getMicBlockedMessage(e))
      } else if (e?.name === "NotFoundError") {
        setErrorMessage(
          "No microphone detected. Please connect a microphone and try again."
        )
      } else {
        setErrorMessage(
          e?.message || "Could not access microphone. Please try again."
        )
      }
      toast.error("Microphone access failed")
    }
  }, [])

  // Open the Android app's own settings page so the user can flip the
  // Microphone permission to "Allow". Only shown inside the APK.
  const handleOpenAppSettings = useCallback(async () => {
    setOpeningSettings(true)
    const ok = await openAndroidAppSettings()
    setOpeningSettings(false)
    if (!ok) {
      toast.info(
        "Couldn't open settings automatically. Please go to: Android Settings → Apps → MediCare Hub → Permissions → Microphone → Allow."
      )
    }
  }, [])

  // ─── File-upload escape hatch (secondary, not recommended) ───
  // Opens a plain file picker so the user can upload an existing audio
  // file. This is NOT a recorder — the `capture` attribute was removed
  // because it does not reliably open a recorder app inside Capacitor's
  // WebView. The primary path is always the in-app getUserMedia recorder.
  const triggerFileUpload = useCallback(() => {
    setErrorMessage(null)
    setPermissionDenied(false)
    fileInputRef.current?.click()
  }, [])

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      // Reset the input so the same file can be selected again later
      if (fileInputRef.current) fileInputRef.current.value = ""
      if (!file) return

      // Basic validation
      if (!file.type.startsWith("audio/") && file.type !== "video/3gpp" && file.type !== "audio/3gpp") {
        toast.error("Please select an audio file.")
        return
      }
      if (file.size < 200) {
        toast.error("Audio file too short — please record at least 1 second.")
        return
      }
      if (file.size > 25 * 1024 * 1024) {
        toast.error("Audio file too large (max 25 MB). Please record a shorter clip.")
        return
      }

      setResult(null)
      setSavedMemoId(null)
      setIsTranscribing(true)
      try {
        // Convert File → base64
        const arrayBuffer = await file.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)
        // Manual base64 encoding (avoids FileReader overhead + works everywhere)
        let binary = ""
        const chunkSize = 0x8000
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(
            null,
            Array.from(bytes.subarray(i, i + chunkSize))
          )
        }
        const audioBase64 = btoa(binary)

        // Determine a MIME type Gemini can handle.
        // Android voice recorders often produce audio/3gpp, audio/amr, or
        // audio/mp4 — Gemini supports all of these via inline_data.
        let mimeType = file.type || "audio/webm"
        if (mimeType === "video/3gpp") mimeType = "audio/3gpp"

        const res = await apiFetch<TranscribeResponse>("/api/ai/transcribe", {
          method: "POST",
          body: JSON.stringify({
            audioBase64,
            mimeType,
            patientId,
            language,
          }),
        })

        if (!res?.ok) throw new Error("Transcription failed")
        setResult(res)
        setSavedMemoId(res.memoId)
        toast.success("Memo transcribed & saved")

        if (res.isEmergency && onEmergency) {
          onEmergency()
        }
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? (err.body as { error?: string })?.error || err.message
            : (err as Error).message
        setErrorMessage(msg || "Failed to transcribe uploaded audio.")
        toast.error("Transcription failed", { description: msg })
      } finally {
        setIsTranscribing(false)
      }
    },
    [patientId, language, onEmergency]
  )

  const cleanupRecording = useCallback(() => {
    stopTimer()
    setIsRecording(false)
    // Signal Web Speech API onend handler to NOT restart
    isRecordingRef.current = false
    setAnalyser(null)
    // Stop audio-level monitor
    if (audioLevelTimerRef.current) {
      clearInterval(audioLevelTimerRef.current)
      audioLevelTimerRef.current = null
    }
    // Stop Web Speech API recognition
    if (recognitionRef.current) {
      try {
        (recognitionRef.current as { stop: () => void }).stop()
      } catch {
        /* noop */
      }
      recognitionRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioCtxRef.current) {
      try {
        void audioCtxRef.current.close()
      } catch {
        /* noop */
      }
      audioCtxRef.current = null
    }
    if (analyserRef.current) {
      analyserRef.current = null
    }
  }, [stopTimer])

  const handleStopAndTranscribe = useCallback(async () => {
    const recorder = mediaRecorderRef.current
    // Capture the Web Speech transcript BEFORE cleanup (which stops
    // recognition). We do this FIRST because cleanup may be triggered by
    // the auto-stop timer, and we need the transcript regardless.
    const clientTranscript = liveTranscriptRef.current.trim()
    const recSeconds = secondsRef.current
    // Snapshot chunks NOW, before cleanup, so we have the audio data even
    // if the recorder was already stopped by the time the user clicks stop.
    const chunksSnapshot = chunksRef.current.slice()
    const recordedMimeType = recorder?.mimeType || "audio/webm"

    // Stop the recorder if it's still active, and wait for the final
    // ondataavailable + onstop so the last audio chunk is flushed.
    // NOTE: We do NOT bail out if recorder.state === "inactive" — the
    // recording may have already stopped (e.g. auto-stop at MAX_REC_SECONDS,
    // or the browser stopped it for security reasons) but the already-
    // captured chunks in chunksRef are still valid and must be transcribed.
    if (recorder && recorder.state !== "inactive") {
      try {
        await new Promise<void>((resolve) => {
          recorder.onstop = () => resolve()
          recorder.stop()
        })
      } catch {
        // recorder.stop() can throw if already stopping — ignore, we have the chunks
      }
    }

    cleanupRecording()

    // Merge any chunks that arrived during recorder.stop() (the final flush).
    const allChunks = chunksSnapshot.length >= chunksRef.current.length
      ? chunksSnapshot
      : chunksRef.current.slice()

    const blob = new Blob(allChunks, {
      type: recordedMimeType,
    })

    // Diagnostic: if the recorded blob is essentially empty (tiny size),
    // the mic really didn't capture anything. blob.size is the ONLY reliable
    // signal — the RMS-based peakLevel is a heuristic that can read 0 if
    // the AudioContext was suspended, the analyser wasn't connected, or the
    // browser's echo cancellation aggressively suppressed the signal. A real
    // 2s+ recording always produces >2KB of webm/opus data, so <500 bytes
    // is unambiguous proof of a silent/dead mic.
    if (blob.size < 500 && recSeconds >= 2) {
      toast.error("Microphone captured no audio", {
        description:
          "Your mic appears to be muted, disconnected, or the wrong device. Check your system's microphone settings and try again.",
        duration: 9000,
      })
      return
    }

    // If we have a Web Speech API transcript, use it directly (works on Vercel)
    if (clientTranscript.length > 3) {
      // Warn if transcript is suspiciously short relative to recording duration
      // (e.g. 10s of recording but only 5 chars transcribed — likely speech
      // recognition missed most of it).
      if (clientTranscript.length < 10 && recSeconds >= 5) {
        toast.warning("Speech recognition captured very little text", {
          description: `Recorded ${recSeconds}s but only got "${clientTranscript}". Try speaking louder and closer to the mic, or check your browser's language settings.`,
          duration: 9000,
        })
      }
      setIsTranscribing(true)
      try {
        const res = await apiFetch<TranscribeResponse>("/api/ai/transcribe", {
          method: "POST",
          body: JSON.stringify({
            clientTranscript,
            patientId,
            language,
          }),
        })

        if (!res?.ok) throw new Error("Transcription failed")
        setResult(res)
        setSavedMemoId(res.memoId)
        toast.success("Memo transcribed & saved")

        if (res.isEmergency && onEmergency) {
          onEmergency()
        }
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? (err.body as { error?: string })?.error || err.message
            : (err as Error).message
        setErrorMessage(msg || "Failed to analyze voice memo.")
        toast.error("Transcription failed", { description: msg })
      } finally {
        setIsTranscribing(false)
        setLiveTranscript("")
      }
      return
    }

    // No Web Speech transcript — fall back to server-side ASR (sandbox only)
    if (blob.size < 200) {
      toast.error(
        hasWebSpeech
          ? "No speech detected. Please speak clearly and try again."
          : "Recording too short — please try again"
      )
      return
    }

    setIsTranscribing(true)
    try {
      const audioBase64 = await blobToBase64(blob)

      const res = await apiFetch<TranscribeResponse>("/api/ai/transcribe", {
        method: "POST",
        body: JSON.stringify({
          audioBase64,
          mimeType: blob.type,
          patientId,
          language,
        }),
      })

      if (!res?.ok) throw new Error("Transcription failed")
      setResult(res)
      setSavedMemoId(res.memoId)
      toast.success("Memo transcribed & saved")

      if (res.isEmergency && onEmergency) {
        onEmergency()
      }
    } catch (err) {
      // The server may return `useWebSpeech: true` when server-side ASR
      // isn't available (Vercel deployment). In that case, give the user
      // an actionable message instead of the raw "Server-side transcription
      // not available" text.
      if (err instanceof ApiError) {
        const body = err.body as { error?: string; useWebSpeech?: boolean; detail?: string }
        if (body?.useWebSpeech) {
          const helpfulMsg =
            "Your browser's speech recognition didn't capture any text. Please:\n" +
            "• Use Chrome or Edge (best Web Speech API support)\n" +
            "• Allow microphone access when prompted\n" +
            "• Speak clearly into the mic and try again"
          setErrorMessage(helpfulMsg)
          toast.error("Transcription failed", {
            description: "No speech was captured. Use Chrome/Edge, allow mic access, and try again.",
          })
        } else {
          const msg = body?.error || err.message
          setErrorMessage(msg || "Failed to analyze voice memo.")
          toast.error("Transcription failed", { description: msg })
        }
      } else {
        const msg = (err as Error).message
        setErrorMessage(msg || "Failed to analyze voice memo.")
        toast.error("Transcription failed", { description: msg })
      }
    } finally {
      setIsTranscribing(false)
      setLiveTranscript("")
    }
  }, [cleanupRecording, hasWebSpeech, language, onEmergency, patientId])

  const handleCancel = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.onstop = null
        recorder.stop()
      } catch {
        /* noop */
      }
    }
    cleanupRecording()
    chunksRef.current = []
    toast.info("Recording discarded")
  }, [cleanupRecording])

  const handleConvertToRecord = useCallback(() => {
    if (!result?.transcript) return
    if (onConvertToRecord) {
      onConvertToRecord(result.transcript)
    } else {
      toast.info(
        "Convert to record: connect this to your record creation flow"
      )
    }
  }, [onConvertToRecord, result?.transcript])

  const handleReset = useCallback(() => {
    setResult(null)
    setSavedMemoId(null)
    setErrorMessage(null)
    setSeconds(0)
    secondsRef.current = 0
    setLiveTranscript("")
    liveTranscriptRef.current = ""
  }, [])

  return (
    <div className="space-y-6">
      <HeroBanner
        title="Voice Health Memo"
        subtitle="Record a quick voice note about your symptoms or medication. AI will transcribe and categorize it for you."
        icon={Mic}
      />

      {/* Emergency banner (if AI flagged) */}
      {result?.isEmergency && <EmergencyBanner onCallSos={onEmergency} />}

      {/* Permission error */}
      {permissionDenied && errorMessage && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Microphone access required
              </p>
              <p className="mt-0.5 whitespace-pre-line text-sm text-amber-800 dark:text-amber-300/90">
                {errorMessage}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {/* Primary action: retry the in-app microphone. This is what
                    the user actually wants — the real getUserMedia recorder. */}
                <Button
                  size="sm"
                  className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={handleStartRecording}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Try microphone again
                </Button>
                {/* Only show "Open App Settings" inside the Android APK —
                    in a regular browser this button is meaningless. */}
                {isAndroidNative() && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-500/40 dark:text-amber-300"
                    onClick={handleOpenAppSettings}
                    disabled={openingSettings}
                  >
                    {openingSettings ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Settings className="h-3.5 w-3.5" />
                    )}
                    {openingSettings ? "Opening…" : "Open App Settings"}
                  </Button>
                )}
              </div>
              {/* Secondary, clearly-labeled escape hatch: upload an existing
                  audio file. Deliberately NOT presented as "recommended" —
                  the in-app mic above is the intended path. This only ever
                  opens a file picker, never a recorder. */}
              <button
                type="button"
                onClick={triggerFileUpload}
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-emerald-600 hover:underline dark:hover:text-emerald-400"
              >
                <Upload className="h-3 w-3" />
                Or upload an existing audio file from your device
              </button>

              {/* Diagnostic panel — collapsible. Shows the exact DOMException
                  name, the WebView/Capacitor environment, and device info.
                  This is crucial for remote debugging of the APK mic issue:
                  the user can tap "Copy" and paste the details to us so we
                  know EXACTLY which failure mode is happening. */}
              {diagnosticInfo && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setShowDiagnostics((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
                  >
                    {showDiagnostics ? "▾" : "▸"}
                    {showDiagnostics ? "Hide" : "Show"} technical diagnostic details
                  </button>
                  {showDiagnostics && (
                    <div className="mt-2 rounded-lg border border-amber-300/60 bg-amber-100/60 p-3 dark:border-amber-500/20 dark:bg-amber-500/5">
                      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-amber-900 dark:text-amber-200/80">
                        {diagnosticInfo}
                      </pre>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(diagnosticInfo).then(
                            () => toast.success("Diagnostic copied — paste it to support"),
                            () => toast.error("Couldn't copy — please screenshot instead")
                          )
                        }}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-200 px-2 py-1 text-[10px] font-semibold text-amber-900 hover:bg-amber-300 dark:bg-amber-500/20 dark:text-amber-200 dark:hover:bg-amber-500/30"
                      >
                        <Copy className="h-3 w-3" /> Copy diagnostic info
                      </button>
                      <p className="mt-2 text-[10px] text-amber-700 dark:text-amber-300/70">
                        If the in-app mic still doesn't work after the native fix
                        in <code className="font-mono">android-fix/MainActivity.java</code>,
                        tap "Copy" and share these details — they tell us exactly
                        which layer is blocking the microphone.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recording / Transcribing card */}
      <Card className="relative overflow-hidden">
        {/* Decorative gradient header */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500" />
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mic className="h-4 w-4 text-emerald-600" />
                {isRecording ? "Recording…" : isTranscribing ? "Processing…" : "Record a memo"}
              </CardTitle>
              <CardDescription className="mt-1">
                {isRecording
                  ? "Tap stop when you're done — your audio will be transcribed automatically."
                  : isTranscribing
                    ? "Hang tight while AI transcribes & analyzes your memo."
                    : "Choose a language, then tap the mic to start."}
              </CardDescription>
            </div>

            {/* Language selector */}
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-muted-foreground" />
              <Select value={language} onValueChange={setLanguage} disabled={isRecording || isTranscribing}>
                <SelectTrigger className="h-9 w-[150px]" aria-label="Select language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      <span className="flex items-center gap-2">
                        <span>{l.native}</span>
                        <span className="text-xs text-muted-foreground">({l.label})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Recording / Transcribing / Idle */}
          {!isRecording && !isTranscribing ? (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <motion.button
                type="button"
                onClick={handleStartRecording}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="group relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xl shadow-emerald-500/30 transition-shadow hover:shadow-2xl hover:shadow-emerald-500/40 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/40"
                aria-label="Start recording"
              >
                {/* Pulsing ring on idle */}
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30 group-hover:bg-emerald-400/40" />
                <Mic className="relative h-10 w-10" />
              </motion.button>
              <div className="text-center">
                <p className="text-sm font-medium">Tap the mic to start recording</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Up to {formatTimer(MAX_REC_SECONDS)} minutes • Language:{" "}
                  {LANGUAGES.find((l) => l.value === language)?.label}
                </p>
              </div>
              {/* Tiny secondary escape hatch — upload an existing audio file.
                  Deliberately NOT advertised as a recorder; the big mic button
                  above is the real, in-app getUserMedia recorder. */}
              <button
                type="button"
                onClick={triggerFileUpload}
                className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-emerald-600 hover:underline dark:hover:text-emerald-400"
              >
                <Upload className="h-3 w-3" />
                Or upload an existing audio file
              </button>
            </div>
          ) : isRecording ? (
            <div className="flex flex-col items-center justify-center gap-5 py-6">
              {/* Waveform + timer */}
              <div className="flex w-full max-w-2xl flex-col items-center gap-3">
                <div className="flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                  <Radio className="h-3.5 w-3.5 animate-pulse" />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Live
                  </span>
                </div>
                <div className="font-mono text-3xl font-bold tabular-nums tracking-tight">
                  {formatTimer(seconds)}
                </div>
                <div className="w-full rounded-xl border bg-muted/30 p-2">
                  {analyser ? (
                    <Waveform analyser={analyser} />
                  ) : (
                    <div className="flex h-[72px] items-end justify-center gap-1">
                      {Array.from({ length: 28 }).map((_, i) => (
                        <motion.span
                          key={i}
                          className="w-1.5 rounded-full bg-gradient-to-t from-emerald-500 to-teal-400"
                          animate={{
                            height: [
                              6,
                              Math.max(6, Math.sin(i * 0.7 + seconds * 4) * 24 + 28),
                              6,
                            ],
                          }}
                          transition={{
                            duration: 0.6,
                            repeat: Infinity,
                            delay: i * 0.04,
                            ease: "easeInOut",
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Live transcript from Web Speech API */}
                {liveTranscript && (
                  <div className="w-full max-w-2xl rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-900/50 dark:bg-emerald-500/10">
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                      <Languages className="h-3 w-3" />
                      Live transcript
                    </div>
                    <p className="text-sm text-foreground/90">{liveTranscript}</p>
                  </div>
                )}
              </div>

              {/* Big pulsing mic visual */}
              <motion.div
                className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-lg shadow-rose-500/30"
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              >
                <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/40" />
                <Volume2 className="relative h-8 w-8" />
              </motion.div>

              {/* Buttons */}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={handleStopAndTranscribe}
                  size="lg"
                  className="gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md hover:from-emerald-700 hover:to-teal-700"
                >
                  <Square className="h-4 w-4" /> Stop &amp; Transcribe
                </Button>
                <Button
                  onClick={handleCancel}
                  size="lg"
                  variant="outline"
                  className="gap-2 border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:hover:bg-rose-500/10"
                >
                  <X className="h-4 w-4" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            // isTranscribing === true
            <div className="flex flex-col items-center justify-center gap-4 py-10">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10"
              >
                <Sparkles className="h-7 w-7 text-emerald-600" />
              </motion.div>
              <div className="text-center">
                <p className="text-sm font-semibold">Transcribing with AI…</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This usually takes a few seconds. Please keep this tab open.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Sending audio to ASR pipeline…</span>
              </div>
            </div>
          )}

          {/* Generic error message */}
          {errorMessage && !permissionDenied && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              {/* Diagnostic toggle for non-permission errors too (e.g.
                  NotFoundError, NotReadableError, OverconstrainedError) */}
              {diagnosticInfo && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowDiagnostics((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 underline-offset-2 hover:underline dark:text-rose-400"
                  >
                    {showDiagnostics ? "▾" : "▸"}
                    {showDiagnostics ? "Hide" : "Show"} technical diagnostic details
                  </button>
                  {showDiagnostics && (
                    <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-all rounded-md bg-rose-100/60 p-2 font-mono text-[10px] leading-relaxed text-rose-800 dark:bg-rose-500/10 dark:text-rose-200/80">
                      {diagnosticInfo}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Result cards */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 gap-4 lg:grid-cols-3"
          >
            <TranscriptCard transcript={result.transcript} />

            <AnalysisCard
              category={result.category}
              summary={result.summary}
              suggestedActions={result.suggestedActions}
            />

            {/* Save & Action Card */}
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-500/10">
                    <ClipboardList className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-base">Save &amp; Actions</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/5">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                        Memo auto-saved
                      </p>
                      <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300/80">
                        Saved to your voice memo history. ID:{" "}
                        <code className="rounded bg-emerald-100 px-1 py-0.5 font-mono text-[10px] dark:bg-emerald-500/20">
                          {savedMemoId?.slice(-8) || "—"}
                        </code>
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleConvertToRecord}
                  className="w-full gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700"
                >
                  Convert to Medical Record <ArrowRight className="h-4 w-4" />
                </Button>

                <Separator />

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      if (result.transcript) {
                        void navigator.clipboard.writeText(result.transcript)
                        toast.success("Copied transcript")
                      }
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy text
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleReset}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> New memo
                  </Button>
                </div>

                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  <Save className="mr-1 inline h-3 w-3" />
                  Memos are stored privately in your account. Audio is processed
                  and discarded — only the transcript is saved.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice memo history (placeholder — endpoint pending) */}
      <div>
        <SectionHeader
          title="Voice memo history"
          description="Your previous voice memos will appear here."
          icon={History}
        />
        <EmptyState
          icon={History}
          title="No memos yet"
          description="Your saved voice memos will be listed here. The voice-memos history endpoint is coming soon — for now, recent memos you record above are saved automatically and their IDs are shown in the Save & Actions card."
        />
      </div>

      {/* Hidden file input — secondary "upload an audio file" escape hatch.
          This is ONLY a file picker (no `capture` attribute — the `capture`
          attribute does not reliably open a recorder app inside Capacitor's
          WebView and just confuses users). The primary path is always the
          real in-app getUserMedia recorder above. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFileSelected}
      />
    </div>
  )
}

export default VoiceRecord
