// 동화 구연용 목소리 변조 설정과 Web Audio 재생 로직

export type VoiceId =
  | "helium"
  | "witch"
  | "demon"
  | "grandpa"
  | "grandma"
  | "robot"
  | "none"

export type VoicePreset = {
  id: VoiceId
  emoji: string
  label: string
  /** 버튼 배경 색 (tailwind 클래스) */
  className: string
  /** 선택됐을 때 강조 링 색 (tailwind 클래스) */
  ringClassName: string
  /** 재생 속도 = 음높이 변화 (1 = 원음) */
  playbackRate: number
  /** 로봇 효과처럼 링 모듈레이션을 적용할지 여부 */
  robot?: boolean
}

export const VOICE_PRESETS: VoicePreset[] = [
  {
    id: "helium",
    emoji: "🎈",
    label: "헬륨가스",
    className: "bg-sky-200 text-sky-900",
    ringClassName: "ring-sky-400",
    playbackRate: 1.7,
  },
  {
    id: "witch",
    emoji: "🧙‍♀️",
    label: "마녀",
    className: "bg-fuchsia-200 text-fuchsia-900",
    ringClassName: "ring-fuchsia-400",
    playbackRate: 1.4,
  },
  {
    id: "demon",
    emoji: "😈",
    label: "악마",
    className: "bg-rose-300 text-rose-950",
    ringClassName: "ring-rose-500",
    playbackRate: 0.62,
  },
  {
    id: "grandpa",
    emoji: "👴",
    label: "할아버지",
    className: "bg-amber-200 text-amber-900",
    ringClassName: "ring-amber-400",
    playbackRate: 0.8,
  },
  {
    id: "grandma",
    emoji: "👵",
    label: "할머니",
    className: "bg-orange-200 text-orange-900",
    ringClassName: "ring-orange-400",
    playbackRate: 1.18,
  },
  {
    id: "robot",
    emoji: "🤖",
    label: "로봇",
    className: "bg-teal-200 text-teal-900",
    ringClassName: "ring-teal-400",
    playbackRate: 0.92,
    robot: true,
  },
  {
    id: "none",
    emoji: "🎙️",
    label: "변조 없음",
    className: "bg-lime-200 text-lime-900",
    ringClassName: "ring-lime-500",
    playbackRate: 1,
  },
]

export function getPreset(id: VoiceId): VoicePreset {
  return VOICE_PRESETS.find((p) => p.id === id) ?? VOICE_PRESETS[VOICE_PRESETS.length - 1]
}

/**
 * 녹음된 오디오 Blob을 선택한 목소리 효과로 재생한다.
 * playbackRate 로 음높이를 바꾸고, robot 프리셋은 링 모듈레이션을 더한다.
 * 재생을 멈추는 stop 함수를 반환한다.
 */
export async function playWithVoice(
  blob: Blob,
  preset: VoicePreset,
  onEnded: () => void,
): Promise<() => void> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new AudioCtx()

  // iOS/모바일에서 오디오 세션이 잠겨 있을 수 있으니 스피커 출력을 깨운다.
  if (ctx.state === "suspended") {
    await ctx.resume()
  }

  const arrayBuffer = await blob.arrayBuffer()
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer)

  const source = ctx.createBufferSource()
  source.buffer = audioBuffer
  source.playbackRate.value = preset.playbackRate

  let lastNode: AudioNode = source

  if (preset.robot) {
    // 링 모듈레이션: 신호에 저주파 사인파를 곱해 금속성 로봇 음색을 만든다.
    const modGain = ctx.createGain()
    modGain.gain.value = 0 // 오실레이터가 이 값을 흔든다

    const osc = ctx.createOscillator()
    osc.type = "sine"
    osc.frequency.value = 55

    const oscDepth = ctx.createGain()
    oscDepth.gain.value = 1
    osc.connect(oscDepth)
    oscDepth.connect(modGain.gain)

    lastNode.connect(modGain)
    osc.start()
    lastNode = modGain
  }

  const masterGain = ctx.createGain()
  masterGain.gain.value = preset.robot ? 1.4 : 1
  lastNode.connect(masterGain)
  masterGain.connect(ctx.destination)

  let stopped = false
  source.onended = () => {
    if (stopped) return
    stopped = true
    void ctx.close()
    onEnded()
  }

  source.start()

  return () => {
    if (stopped) return
    stopped = true
    try {
      source.stop()
    } catch {
      // 이미 멈춘 경우 무시
    }
    void ctx.close()
    onEnded()
  }
}
