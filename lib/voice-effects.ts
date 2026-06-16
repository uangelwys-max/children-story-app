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
 * 녹음된 오디오 Blob에 목소리 효과를 "미리" 적용해서 WAV Blob 으로 만든다.
 *
 * iOS Safari 는 마이크 녹음 후 AudioContext 로 직접 재생하면 소리를
 * 수화부(이어피스)로만 보낸다. 그래서 여기서는 소리를 내지 않는
 * OfflineAudioContext 로 효과만 입혀 두고, 실제 재생은 <audio> 엘리먼트로
 * 한다. iOS 는 <audio> 재생은 항상 스피커로 보내기 때문이다.
 */
async function renderVoiceToWav(blob: Blob, preset: VoicePreset): Promise<Blob> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext

  // 디코딩용 임시 컨텍스트 (소리는 나지 않는다)
  const decodeCtx = new AudioCtx()
  const arrayBuffer = await blob.arrayBuffer()
  const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer)
  void decodeCtx.close()

  const sampleRate = audioBuffer.sampleRate
  // playbackRate 가 빠르면 재생 길이가 짧아진다.
  const frames = Math.ceil(audioBuffer.length / preset.playbackRate) + sampleRate * 0.05
  const channels = audioBuffer.numberOfChannels

  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext

  const offline = new OfflineCtx(channels, frames, sampleRate)

  const source = offline.createBufferSource()
  source.buffer = audioBuffer
  source.playbackRate.value = preset.playbackRate

  let lastNode: AudioNode = source

  if (preset.robot) {
    // 링 모듈레이션: 신호에 저주파 사인파를 곱해 금속성 로봇 음색을 만든다.
    const modGain = offline.createGain()
    modGain.gain.value = 0

    const osc = offline.createOscillator()
    osc.type = "sine"
    osc.frequency.value = 55

    const oscDepth = offline.createGain()
    oscDepth.gain.value = 1
    osc.connect(oscDepth)
    oscDepth.connect(modGain.gain)

    lastNode.connect(modGain)
    osc.start()
    lastNode = modGain
  }

  const masterGain = offline.createGain()
  masterGain.gain.value = preset.robot ? 1.4 : 1
  lastNode.connect(masterGain)
  masterGain.connect(offline.destination)

  source.start()

  const rendered = await offline.startRendering()
  return audioBufferToWav(rendered)
}

/** AudioBuffer 를 16-bit PCM WAV Blob 으로 인코딩한다. */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const numFrames = buffer.length

  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const dataSize = numFrames * blockAlign
  const bufferSize = 44 + dataSize
  const arrayBuffer = new ArrayBuffer(bufferSize)
  const view = new DataView(arrayBuffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeString(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 8 * bytesPerSample, true)
  writeString(36, "data")
  view.setUint32(40, dataSize, true)

  // 채널 데이터를 인터리브하며 16-bit 로 변환
  const channelData: Float32Array[] = []
  for (let c = 0; c < numChannels; c++) channelData.push(buffer.getChannelData(c))

  let offset = 44
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channelData[c][i]
      sample = Math.max(-1, Math.min(1, sample))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" })
}

/**
 * 녹음된 Blob 을 선택한 목소리 효과로 재생한다.
 * 효과는 OfflineAudioContext 로 미리 입히고, 재생은 전달받은 <audio>
 * 엘리먼트로 한다 (iOS 에서 스피커로 출력하기 위함).
 * 재생을 멈추는 stop 함수를 반환한다.
 */
export async function playWithVoice(
  blob: Blob,
  preset: VoicePreset,
  audioEl: HTMLAudioElement,
  onEnded: () => void,
): Promise<() => void> {
  const wav = await renderVoiceToWav(blob, preset)
  const url = URL.createObjectURL(wav)

  let stopped = false
  const cleanup = () => {
    URL.revokeObjectURL(url)
    audioEl.onended = null
    audioEl.onerror = null
  }

  audioEl.onended = () => {
    if (stopped) return
    stopped = true
    cleanup()
    onEnded()
  }
  audioEl.onerror = () => {
    if (stopped) return
    stopped = true
    cleanup()
    onEnded()
  }

  audioEl.src = url
  audioEl.load()
  await audioEl.play()

  return () => {
    if (stopped) return
    stopped = true
    try {
      audioEl.pause()
      audioEl.currentTime = 0
    } catch {
      // 무시
    }
    cleanup()
    onEnded()
  }
}
