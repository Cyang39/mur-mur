"use client"

import * as React from "react"

type Props = {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

export function Switch({ checked, defaultChecked, onCheckedChange, disabled, className }: Props) {
  const [internal, setInternal] = React.useState(!!defaultChecked)
  const isControlled = typeof checked === 'boolean'
  const value = isControlled ? checked! : internal

  const toggle = () => {
    if (disabled) return
    const next = !value
    if (!isControlled) setInternal(next)
    onCheckedChange?.(next)
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={toggle}
      disabled={disabled}
      className={[
        "inline-flex h-6 w-11 items-center rounded-full transition-colors",
        value ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600",
        disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
        className || "",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
          value ? "translate-x-5" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  )
}

