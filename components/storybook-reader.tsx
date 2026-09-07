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
  type VoiceMarker,
} from "@/lib/voice-effects"
import { VoiceButton } from "@/components/voice-button"

const DIALOGUE =
  '왕비는 날마다 마술 거울에게 물었어요. "거울아, 거울아. 세상에서 누가 제일 이쁘지?"'

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
  // 녹음 중 목소리 변경 시점을 담는 마커들과, 녹음 시작 시각
  const markersRef = useRef<VoiceMarker[]>([])
  const recordStartRef = useRef<number>(0)
  // 재생에 사용할, 녹음이 끝난 시점에 확정된 마커들
  const recordedMarkersRef = useRef<VoiceMarker[]>([])
  // 콜백에서 최신 녹음 상태를 참조하기 위한 ref
  const isRecordingRef = useRef(false)

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
      // 첫 구간은 현재 선택된 목소리로 0ms 부터 시작
      markersRef.current = [{ voiceId: selectedVoice, startMs: 0 }]
      recordStartRef.current = performance.now()

      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        recordedBlobRef.current = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        })
        // 녹음이 끝난 시점에 마커를 확정한다
        recordedMarkersRef.current = markersRef.current
        setHasRecording(true)
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      isRecordingRef.current = true
      setIsRecording(true)
      setSeconds(0)
      clearTimer()
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch {
      setError("마이크를 사용할 수 없어요. 마이크 권한을 허락해 주세요!")
    }
  }, [clearTimer, selectedVoice])

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    isRecordingRef.current = false
    setIsRecording(false)
    clearTimer()
  }, [clearTimer])

  // 목소리 버튼 선택: 녹음 중이면 변경 시점을 마커로 기록한다
  const handleVoiceSelect = useCallback((id: VoiceId) => {
    setSelectedVoice(id)
    if (!isRecordingRef.current) return
    const t = performance.now() - recordStartRef.current
    const markers = markersRef.current
    const last = markers[markers.length - 1]
    if (last && t - last.startMs < 120) {
      // 같은 순간에 여러 번 바꾸면 마지막 선택만 유지
      last.voiceId = id
    } else {
      markers.push({ voiceId: id, startMs: t })
    }
  }, [])

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
      const stop = await playWithVoice(blob, recordedMarkersRef.current, audioEl, () => {
        setIsPlaying(false)
        stopPlaybackRef.current = null
      })
      stopPlaybackRef.current = stop
    } catch {
      setError("재생 중 문제가 생겼어요. 다시 시도해 주세요!")
      setIsPlaying(false)
    }
  }, [isPlaying, isRecording])

  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0")
  const secs = String(seconds % 60).padStart(2, "0")
  const selectedPreset = getPreset(selectedVoice)
  const selectedEffects = [
    selectedPreset.vibrato ? "피치 떨림" : null,
    selectedPreset.tremolo ? "음량 떨림" : null,
    selectedPreset.robot ? "링 모듈레이션" : null,
  ].filter(Boolean)
  const selectedEffectLabel =
    selectedEffects.length > 0
      ? selectedEffects.join(" + ")
      : selectedVoice === "none"
        ? "효과 없음"
        : "기본 음색 변조"

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
            녹음 중... {minutes}:{secs} · 지금 목소리: {selectedPreset.label} ({selectedEffectLabel})
          </p>
        ) : isPlaying ? (
          <p className="text-center text-sm font-bold text-foreground">
            녹음한 목소리로 재생 중... 현재 선택: {selectedPreset.label} ({selectedEffectLabel})
          </p>
        ) : hasRecording ? (
          <p className="text-center text-sm font-bold text-muted-foreground">
            초록 재생 버튼을 눌러 들어 보세요! 현재 선택: {selectedPreset.label} ({selectedEffectLabel})
          </p>
        ) : (
          <p className="text-center text-sm font-bold text-muted-foreground">
            현재 선택: {selectedPreset.label} ({selectedEffectLabel}) · 녹음 중에 목소리 버튼을 바꾸면 그 부분만 바뀌어요!
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
              onSelect={() => handleVoiceSelect(preset.id)}
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
