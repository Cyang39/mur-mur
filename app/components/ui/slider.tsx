"use client"

import * as React from "react"

type SliderProps = {
  min?: number
  max?: number
  step?: number
  value?: number[]
  defaultValue?: number[]
  onValueChange?: (value: number[]) => void
  className?: string
}

export function Slider({ min = 0, max = 100, step = 1, value, defaultValue, onValueChange, className }: SliderProps) {
  const isControlled = Array.isArray(value)
  const [internal, setInternal] = React.useState<number[]>(defaultValue ?? [min])
  const current = isControlled ? (value as number[]) : internal
  const v = current[0] ?? min
  const pct = Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))

  const onChange = (n: number) => {
    const next = [n]
    if (!isControlled) setInternal(next)
    onValueChange?.(next)
  }

  return (
    <div className={["relative h-6 w-56 select-none", className || ""].join(" ")}
      aria-label="slider"
    >
      {/* Track */}
      <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gray-300 dark:bg-gray-700" />
      {/* Range */}
      <div
        className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-blue-600"
        style={{ width: `${pct}%` }}
      />
      {/* Thumb */}
      <div
        className="absolute top-1/2 h-4 w-4 -translate-y-1/2 -translate-x-1/2 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-200 shadow"
        style={{ left: `${pct}%` }}
      />
      {/* Invisible native range for accessibility and events */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 opacity-0 cursor-pointer"
      />
    </div>
  )
}
