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
  /** 피치가 주기적으로 흔들리는 진동 효과 설정 */
  vibrato?: { rate: number; depth: number }
  /** 음량이 미세하게 출렁이는 트레몰로 효과 설정 */
  tremolo?: { rate: number; depth: number }
  /** 고역을 줄여 살짝 탁한 음색을 만드는 필터 주파수 */
  toneCutoff?: number
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
    playbackRate: 1.15,
    vibrato: { rate: 5.2, depth: 0.022 },
    tremolo: { rate: 4.1, depth: 0.08 },
    toneCutoff: 3200,
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
 * 녹음 도중 목소리를 바꾼 시점을 기록한 마커.
 * startMs = 녹음 시작 기준 경과 시간(ms).
 */
export type VoiceMarker = { voiceId: VoiceId; startMs: number }

function getOfflineCtx(channels: number, frames: number, sampleRate: number) {
  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext
  return new OfflineCtx(channels, frames, sampleRate)
}

/** AudioBuffer 의 특정 시간 구간만 잘라 새 AudioBuffer 로 만든다. */
function sliceBuffer(buffer: AudioBuffer, startSec: number, endSec: number): AudioBuffer {
  const { sampleRate, numberOfChannels } = buffer
  const startFrame = Math.max(0, Math.floor(startSec * sampleRate))
  const endFrame = Math.min(buffer.length, Math.floor(endSec * sampleRate))
  const frameCount = Math.max(1, endFrame - startFrame)

  const out = new AudioBuffer({ length: frameCount, numberOfChannels, sampleRate })
  for (let c = 0; c < numberOfChannels; c++) {
    out.copyToChannel(buffer.getChannelData(c).subarray(startFrame, endFrame), c, 0)
  }
  return out
}

/** 하나의 AudioBuffer 에 목소리 효과를 입혀 렌더링된 AudioBuffer 를 돌려준다. */
async function renderBufferWithPreset(
  buffer: AudioBuffer,
  preset: VoicePreset,
): Promise<AudioBuffer> {
  const sampleRate = buffer.sampleRate
  const frames = Math.ceil(buffer.length / preset.playbackRate) + Math.ceil(sampleRate * 0.02)
  const offline = getOfflineCtx(buffer.numberOfChannels, frames, sampleRate)

  const source = offline.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = preset.playbackRate

  let lastNode: AudioNode = source
  const modulators: OscillatorNode[] = []

  if (preset.vibrato) {
    // 재생 속도를 아주 조금 흔들어 나이 든 목소리 특유의 떨림을 만든다.
    const vibrato = offline.createOscillator()
    vibrato.type = "sine"
    vibrato.frequency.value = preset.vibrato.rate
    const vibratoDepth = offline.createGain()
    vibratoDepth.gain.value = preset.vibrato.depth
    vibrato.connect(vibratoDepth)
    vibratoDepth.connect(source.playbackRate)
    modulators.push(vibrato)
  }

  if (preset.tremolo) {
    // 진폭을 미세하게 흔들되, 말소리가 꺼지지 않도록 중심값을 유지한다.
    const tremolo = offline.createOscillator()
    tremolo.type = "sine"
    tremolo.frequency.value = preset.tremolo.rate
    const tremoloDepth = offline.createGain()
    tremoloDepth.gain.value = preset.tremolo.depth
    const tremoloGain = offline.createGain()
    tremoloGain.gain.value = 1 - preset.tremolo.depth
    tremolo.connect(tremoloDepth)
    tremoloDepth.connect(tremoloGain.gain)
    lastNode.connect(tremoloGain)
    lastNode = tremoloGain
    modulators.push(tremolo)
  }

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
    modulators.push(osc)
    lastNode = modGain
  }

  const toneFilter = preset.toneCutoff ? offline.createBiquadFilter() : null
  if (toneFilter && preset.toneCutoff) {
    toneFilter.type = "lowpass"
    toneFilter.frequency.value = preset.toneCutoff
    toneFilter.Q.value = 0.7
    lastNode.connect(toneFilter)
    lastNode = toneFilter
  }

  const masterGain = offline.createGain()
  masterGain.gain.value = preset.robot ? 1.4 : 1
  lastNode.connect(masterGain)
  masterGain.connect(offline.destination)

  source.start()
  modulators.forEach((osc) => osc.start())
  return offline.startRendering()
}

/** 여러 AudioBuffer 를 순서대로 이어 붙여 하나로 만든다. */
function concatBuffers(buffers: AudioBuffer[]): AudioBuffer {
  const sampleRate = buffers[0].sampleRate
  const channels = Math.max(...buffers.map((b) => b.numberOfChannels))
  const totalLength = buffers.reduce((sum, b) => sum + b.length, 0)

  const out = new AudioBuffer({ length: totalLength, numberOfChannels: channels, sampleRate })
  let offset = 0
  for (const b of buffers) {
    for (let c = 0; c < channels; c++) {
      const data = b.getChannelData(Math.min(c, b.numberOfChannels - 1))
      out.copyToChannel(data, c, offset)
    }
    offset += b.length
  }
  return out
}

/**
 * 녹음 Blob 을 마커에 따라 구간별로 잘라 각각 다른 목소리로 변조한 뒤,
 * 순서대로 이어 붙여 하나의 WAV Blob 으로 만든다.
 *
 * iOS Safari 는 마이크 녹음 후 AudioContext 로 직접 재생하면 소리를
 * 수화부(이어피스)로만 보낸다. 그래서 효과는 소리를 내지 않는
 * OfflineAudioContext 로 미리 입혀 두고, 실제 재생은 <audio> 엘리먼트로
 * 한다. iOS 는 <audio> 재생은 항상 스피커로 보내기 때문이다.
 */
async function renderMarkersToWav(blob: Blob, markers: VoiceMarker[]): Promise<Blob> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext

  // 디코딩용 임시 컨텍스트 (소리는 나지 않는다)
  const decodeCtx = new AudioCtx()
  const arrayBuffer = await blob.arrayBuffer()
  const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer)
  void decodeCtx.close()

  const totalSec = audioBuffer.duration

  // 마커가 없으면 변조 없음 전체 한 구간으로 처리
  const safeMarkers: VoiceMarker[] =
    markers.length > 0 ? markers : [{ voiceId: "none", startMs: 0 }]

  const renderedSegments: AudioBuffer[] = []
  for (let i = 0; i < safeMarkers.length; i++) {
    const startSec = safeMarkers[i].startMs / 1000
    const endSec = i + 1 < safeMarkers.length ? safeMarkers[i + 1].startMs / 1000 : totalSec
    if (endSec - startSec <= 0.01) continue // 너무 짧은 구간은 건너뛴다

    const segment = sliceBuffer(audioBuffer, startSec, endSec)
    const rendered = await renderBufferWithPreset(segment, getPreset(safeMarkers[i].voiceId))
    renderedSegments.push(rendered)
  }

  // 모든 구간이 너무 짧아 비었다면 전체를 변조 없음으로
  if (renderedSegments.length === 0) {
    renderedSegments.push(await renderBufferWithPreset(audioBuffer, getPreset("none")))
  }

  return audioBufferToWav(concatBuffers(renderedSegments))
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
 * 녹음된 Blob 을 마커(구간별 목소리)에 따라 변조해 이어 재생한다.
 * 효과는 OfflineAudioContext 로 미리 입히고, 재생은 전달받은 <audio>
 * 엘리먼트로 한다 (iOS 에서 스피커로 출력하기 위함).
 * 재생을 멈추는 stop 함수를 반환한다.
 */
export async function playWithVoice(
  blob: Blob,
  markers: VoiceMarker[],
  audioEl: HTMLAudioElement,
  onEnded: () => void,
): Promise<() => void> {
  const wav = await renderMarkersToWav(blob, markers)
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
