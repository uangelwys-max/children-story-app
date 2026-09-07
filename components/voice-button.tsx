"use client"

import { cn } from "@/lib/utils"
import type { VoicePreset } from "@/lib/voice-effects"

type VoiceButtonProps = {
  preset: VoicePreset
  selected: boolean
  onSelect: () => void
}

export function VoiceButton({ preset, selected, onSelect }: VoiceButtonProps) {
  const effectLabels = [
    preset.vibrato ? "피치 떨림" : null,
    preset.tremolo ? "음량 떨림" : null,
  ].filter(Boolean)
  const effectDescription = effectLabels.length > 0 ? `, ${effectLabels.join("과 ")} 효과` : ""

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${preset.label} 목소리${effectDescription}`}
      title={effectLabels.length > 0 ? `${preset.label}: ${effectLabels.join(" + ")}` : preset.label}
      className={cn(
        "flex shrink-0 flex-col items-center justify-center gap-1 rounded-3xl px-4 py-3 transition-all duration-150",
        "w-[5.5rem] sm:w-24",
        "shadow-[0_4px_0_rgba(0,0,0,0.12)] active:translate-y-1 active:shadow-[0_1px_0_rgba(0,0,0,0.12)]",
        preset.className,
        selected
          ? cn("scale-105 ring-4 ring-offset-2 ring-offset-background", preset.ringClassName)
          : "opacity-90 hover:opacity-100 hover:scale-105",
      )}
    >
      <span className="text-3xl leading-none sm:text-4xl" aria-hidden="true">
        {preset.emoji}
      </span>
      <span className="text-center text-sm font-bold leading-tight sm:text-base">
        {preset.label}
      </span>
    </button>
  )
}
