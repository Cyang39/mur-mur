"use client"

import {create} from 'zustand'
import {invoke} from '@tauri-apps/api/core'

export type WhisperOptimization = 'none' | 'vulkan' | 'coreml' | 'cuda'
export type AppLocale = 'zh-CN' | 'en'

export interface Settings {
  whisper_models_path: string | null
  app_locale: AppLocale
  whisper_language: string
  whisper_model: string
  enable_vad: boolean
  whisper_optimization: WhisperOptimization
  disable_gpu: boolean
  thread_count: number
}

const DEFAULTS: Settings = {
  whisper_models_path: null,
  app_locale: 'zh-CN',
  whisper_language: 'auto',
  whisper_model: 'ggml-tiny-q5_1.bin',
  enable_vad: false,
  whisper_optimization: 'none',
  disable_gpu: false,
  thread_count: 4,
}

type SaveMode = 'immediate' | 'debounced' | 'manual'

interface SettingsStore {
  settings: Settings
  isLoading: boolean
  error?: string

  // Load/save
  load: () => Promise<void>
  save: () => Promise<void>

  // Update helpers
  update: (partial: Partial<Settings>, mode?: SaveMode) => void
  setLocale: (locale: AppLocale, mode?: SaveMode) => void
  setWhisperLanguage: (lang: string, mode?: SaveMode) => void
  setVad: (enabled: boolean, mode?: SaveMode) => void
  setDisableGpu: (disabled: boolean, mode?: SaveMode) => void
  setThreadCount: (n: number, mode?: SaveMode) => void
  setOptimization: (opt: WhisperOptimization, mode?: SaveMode) => void
  setModelsPath: (p: string | null, mode?: SaveMode) => void
  setModelName: (name: string, mode?: SaveMode) => void
  chooseModelsDirectory: () => Promise<void>
}

// Debounce timer kept outside of state
let saveTimer: ReturnType<typeof setTimeout> | null = null
const SAVE_DELAY_MS = 300

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULTS,
  isLoading: false,
  error: undefined,

  load: async () => {
    set({isLoading: true, error: undefined})
    try {
      const loaded = await invoke('load_settings') as Partial<Settings>
      // Merge with defaults to ensure forward compatibility
      const next: Settings = {...DEFAULTS, ...(loaded as any)}
      set({settings: next, isLoading: false})
    } catch (e) {
      set({isLoading: false, error: String(e)})
    }
  },

  save: async () => {
    try {
      const s = get().settings
      await invoke('save_settings', {settings: s})
    } catch (e) {
      set({error: String(e)})
    }
  },

  update: (partial, mode = 'debounced') => {
    const next = {...get().settings, ...partial}
    set({settings: next})
    if (mode === 'manual') return
    const doSave = async () => { await get().save() }
    if (mode === 'immediate') {
      doSave()
      return
    }
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(doSave, SAVE_DELAY_MS)
  },

  setLocale: (locale, mode) => {
    get().update({app_locale: locale}, mode)
    try {
      localStorage.setItem('app_locale', locale)
      document.documentElement.lang = locale
    } catch {}
  },
  setWhisperLanguage: (lang, mode) => get().update({whisper_language: lang}, mode),
  setVad: (enabled, mode) => get().update({enable_vad: enabled}, mode),
  setDisableGpu: (disabled, mode) => get().update({disable_gpu: disabled}, mode),
  setThreadCount: (n, mode) => {
    const clamped = Math.max(1, Math.min(8, Math.round(n)))
    get().update({thread_count: clamped}, mode)
  },
  setOptimization: (opt, mode) => get().update({whisper_optimization: opt}, mode),
  setModelsPath: (p, mode) => get().update({whisper_models_path: p}, mode),
  setModelName: (name, mode) => get().update({whisper_model: name}, mode),

  chooseModelsDirectory: async () => {
    try {
      const dir = await invoke('select_directory') as string | null
      if (dir) {
        get().setModelsPath(dir, 'immediate')
      }
    } catch (e) {
      set({error: String(e)})
    }
  },
}))

export default useSettingsStore

