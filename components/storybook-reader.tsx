"use client"

import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"
import { Mic, Play, Square } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getPreset,
  playWithVoice,
  VOICE_PRESETS,
  type VoiceId,
} from "@/lib/voice-effects"
import { VoiceButton } from "@/components/voice-button"

const DIALOGUE = "음하하하! 이 나라에서 가장 예쁜 사람은 누구냐!"

export function StorybookReader() {
  const [selectedVoice, setSelectedVoice] = useState<VoiceId>("none")
  const [isRecording, setIsRecording] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [hasRecording, setHasRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordedBlobRef = useRef<Blob | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const stopPlaybackRef = useRef<(() => void) | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // 언마운트 시 자원 정리
  useEffect(() => {
    return () => {
      clearTimer()
      stopPlaybackRef.current?.()
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [clearTimer])

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      // echoCancellation 등을 켜면 폰이 "통화 모드"가 되어 소리가
      // 스피커 대신 수화부(이어피스)로만 나간다. 모두 꺼서 스피커로 재생되게 한다.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      streamRef.current = stream
      chunksRef.current = []

      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        recordedBlobRef.current = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        })
        setHasRecording(true)
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      setSeconds(0)
      clearTimer()
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch {
      setError("마이크를 사용할 수 없어요. 마이크 권한을 허락해 주세요!")
    }
  }, [clearTimer])

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    setIsRecording(false)
    clearTimer()
  }, [clearTimer])

  const handleRecordClick = useCallback(() => {
    if (isPlaying) return
    if (isRecording) {
      stopRecording()
    } else {
      void startRecording()
    }
  }, [isPlaying, isRecording, startRecording, stopRecording])

  const handlePlayClick = useCallback(async () => {
    if (isRecording) return
    if (isPlaying) {
      stopPlaybackRef.current?.()
      return
    }
    const blob = recordedBlobRef.current
    if (!blob) {
      setError("먼저 녹음 버튼을 눌러 동화를 읽어 주세요!")
      return
    }
    const audioEl = audioElRef.current
    if (!audioEl) return
    setError(null)
    setIsPlaying(true)
    try {
      const stop = await playWithVoice(blob, getPreset(selectedVoice), audioEl, () => {
        setIsPlaying(false)
        stopPlaybackRef.current = null
      })
      stopPlaybackRef.current = stop
    } catch {
      setError("재생 중 문제가 생겼어요. 다시 시도해 주세요!")
      setIsPlaying(false)
    }
  }, [isPlaying, isRecording, selectedVoice])

  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0")
  const secs = String(seconds % 60).padStart(2, "0")

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-4 sm:px-6">
      {/* iOS 에서 스피커로 출력하기 위한 재생 전용 오디오 엘리먼트 */}
      <audio ref={audioElRef} className="hidden" aria-hidden="true" />

      {/* 상단 타이틀 */}
      <header className="flex items-center justify-center gap-2 py-2">
        <span className="text-2xl sm:text-3xl" aria-hidden="true">
          📖
        </span>
        <h1 className="font-heading text-xl font-bold text-foreground sm:text-2xl">
          백설공주 동화 구연
        </h1>
        <span className="text-2xl sm:text-3xl" aria-hidden="true">
          ✨
        </span>
      </header>

      {/* 가운데: 일러스트 + 대사 */}
      <section className="flex flex-1 flex-col items-center justify-center gap-4 py-2">
        <div className="relative w-full overflow-hidden rounded-[2rem] border-4 border-accent bg-card shadow-[0_8px_0_rgba(0,0,0,0.08)]">
          <div className="relative mx-auto aspect-square w-full max-w-md">
            <Image
              src="/images/snow-white-witch.png"
              alt="손거울을 든 백설공주 마녀 일러스트"
              fill
              priority
              sizes="(max-width: 768px) 100vw, 28rem"
              className="object-contain p-2"
            />
          </div>
        </div>

        {/* 말풍선 대사 */}
        <div className="relative w-full max-w-xl">
          <div className="rounded-[2rem] border-4 border-primary bg-primary px-5 py-5 text-center shadow-[0_6px_0_rgba(0,0,0,0.12)] sm:px-8 sm:py-6">
            <p className="text-balance font-heading text-2xl font-bold leading-snug text-primary-foreground sm:text-4xl">
              {DIALOGUE}
            </p>
          </div>
          {/* 말풍선 꼬리 */}
          <div
            className="absolute -top-3 left-1/2 h-6 w-6 -translate-x-1/2 rotate-45 border-l-4 border-t-4 border-primary bg-primary"
            aria-hidden="true"
          />
        </div>
      </section>

      {/* 안내 / 상태 메시지 */}
      <div className="flex min-h-7 items-center justify-center" role="status" aria-live="polite">
        {error ? (
          <p className="text-center text-sm font-bold text-destructive">{error}</p>
        ) : isRecording ? (
          <p className="flex items-center gap-2 text-center text-sm font-bold text-destructive">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-destructive" />
            녹음 중... {minutes}:{secs}
          </p>
        ) : isPlaying ? (
          <p className="text-center text-sm font-bold text-foreground">
            🔊 {getPreset(selectedVoice).label} 목소리로 재생 중...
          </p>
        ) : hasRecording ? (
          <p className="text-center text-sm font-bold text-muted-foreground">
            목소리를 골라서 재생 버튼을 눌러 보세요!
          </p>
        ) : (
          <p className="text-center text-sm font-bold text-muted-foreground">
            빨간 녹음 버튼을 누르고 마녀 대사를 읽어 보세요!
          </p>
        )}
      </div>

      {/* 하단: 목소리 변조 버튼들 */}
      <section aria-label="목소리 변조 선택" className="py-2">
        <div className="flex gap-2 overflow-x-auto pb-2 sm:justify-center sm:gap-3">
          {VOICE_PRESETS.map((preset) => (
            <VoiceButton
              key={preset.id}
              preset={preset}
              selected={selectedVoice === preset.id}
              onSelect={() => setSelectedVoice(preset.id)}
            />
          ))}
        </div>
      </section>

      {/* 맨 아래: 큰 녹음 / 재생 버튼 */}
      <section
        aria-label="녹음 및 재생"
        className="grid grid-cols-2 gap-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1 sm:gap-4"
      >
        <button
          type="button"
          onClick={handleRecordClick}
          disabled={isPlaying}
          aria-pressed={isRecording}
          className={cn(
            "flex items-center justify-center gap-2 rounded-[1.75rem] py-6 text-2xl font-bold transition-all duration-150 sm:text-3xl",
            "shadow-[0_8px_0_rgba(0,0,0,0.18)] active:translate-y-2 active:shadow-[0_2px_0_rgba(0,0,0,0.18)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "bg-destructive text-white",
            isRecording && "animate-pulse",
          )}
        >
          {isRecording ? (
            <Square className="size-7 sm:size-8" fill="currentColor" strokeWidth={0} />
          ) : (
            <Mic className="size-8 sm:size-9" strokeWidth={2.5} />
          )}
          {isRecording ? "멈춤" : "녹음"}
        </button>

        <button
          type="button"
          onClick={() => void handlePlayClick()}
          disabled={isRecording || !hasRecording}
          aria-pressed={isPlaying}
          className={cn(
            "flex items-center justify-center gap-2 rounded-[1.75rem] py-6 text-2xl font-bold transition-all duration-150 sm:text-3xl",
            "shadow-[0_8px_0_rgba(0,0,0,0.18)] active:translate-y-2 active:shadow-[0_2px_0_rgba(0,0,0,0.18)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "bg-green-500 text-white",
          )}
        >
          {isPlaying ? (
            <Square className="size-7 sm:size-8" fill="currentColor" strokeWidth={0} />
          ) : (
            <Play className="size-8 sm:size-9" fill="currentColor" strokeWidth={0} />
          )}
          {isPlaying ? "멈춤" : "재생"}
        </button>
      </section>
    </main>
  )
}
