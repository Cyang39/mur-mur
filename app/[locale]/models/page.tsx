'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSettingsStore } from '@/hooks/settingsStore'
import { CheckCircle, Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { invoke } from '@tauri-apps/api/core'
import { useTranslations } from 'next-intl'

type ModelCard = {
  value: string
  title: string
  subtitle?: string
  hint?: string
}

export default function ModelsPage() {
  const { settings, isLoading: isLoadingSettings, load: loadSettings, setModelName } = useSettingsStore()
  const [filter, setFilter] = useState<'recommended' | 'downloaded' | 'tiny' | 'small' | 'medium' | 'large'>('recommended')
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set())
  const t = useTranslations('Models')
  const tSettings = useTranslations('Settings')

  useEffect(() => { loadSettings() }, [loadSettings])

  const models: ModelCard[] = [
    // Tiny family
    { value: 'ggml-tiny.bin', title: 'Tiny', subtitle: '75 MiB' },
    { value: 'ggml-tiny-q5_1.bin', title: 'Tiny (5-bit Quantized)', subtitle: '31 MiB' },
    { value: 'ggml-tiny-q8_0.bin', title: 'Tiny (8-bit Quantized)', subtitle: '42 MiB' },
    { value: 'ggml-tiny.en.bin', title: 'Tiny (English-only)', subtitle: '75 MiB' },
    { value: 'ggml-tiny.en-q5_1.bin', title: 'Tiny (English-only, 5-bit Quantized)', subtitle: '31 MiB' },
    { value: 'ggml-tiny.en-q8_0.bin', title: 'Tiny (English-only, 8-bit Quantized)', subtitle: '42 MiB' },

    // Base family
    { value: 'ggml-base.bin', title: 'Base', subtitle: '142 MiB' },
    { value: 'ggml-base-q5_1.bin', title: 'Base (5-bit Quantized)', subtitle: '57 MiB' },
    { value: 'ggml-base-q8_0.bin', title: 'Base (8-bit Quantized)', subtitle: '78 MiB' },
    { value: 'ggml-base.en.bin', title: 'Base (English-only)', subtitle: '142 MiB' },
    { value: 'ggml-base.en-q5_1.bin', title: 'Base (English-only, 5-bit Quantized)', subtitle: '57 MiB' },
    { value: 'ggml-base.en-q8_0.bin', title: 'Base (English-only, 8-bit Quantized)', subtitle: '78 MiB' },

    // Small family
    { value: 'ggml-small.bin', title: 'Small', subtitle: '466 MiB' },
    { value: 'ggml-small-q5_1.bin', title: 'Small (5-bit Quantized)', subtitle: '181 MiB' },
    { value: 'ggml-small-q8_0.bin', title: 'Small (8-bit Quantized)', subtitle: '252 MiB' },
    { value: 'ggml-small.en.bin', title: 'Small (English-only)', subtitle: '466 MiB' },
    { value: 'ggml-small.en-q5_1.bin', title: 'Small (English-only, 5-bit Quantized)', subtitle: '181 MiB' },
    { value: 'ggml-small.en-q8_0.bin', title: 'Small (English-only, 8-bit Quantized)', subtitle: '252 MiB' },
    { value: 'ggml-small.en-tdrz.bin', title: 'Small (English-only, TDRZ)', subtitle: '465 MiB' },

    // Medium family
    { value: 'ggml-medium.bin', title: 'Medium', subtitle: '1.5 GiB' },
    { value: 'ggml-medium-q5_0.bin', title: 'Medium (5-bit Quantized)', subtitle: '514 MiB' },
    { value: 'ggml-medium-q8_0.bin', title: 'Medium (8-bit Quantized)', subtitle: '785 MiB' },
    { value: 'ggml-medium.en.bin', title: 'Medium (English-only)', subtitle: '1.5 GiB' },
    { value: 'ggml-medium.en-q5_0.bin', title: 'Medium (English-only, 5-bit Quantized)', subtitle: '514 MiB' },
    { value: 'ggml-medium.en-q8_0.bin', title: 'Medium (English-only, 8-bit Quantized)', subtitle: '785 MiB' },

    // Large family
    { value: 'ggml-large-v1.bin', title: 'Large v1', subtitle: '2.9 GiB' },
    { value: 'ggml-large-v2.bin', title: 'Large v2', subtitle: '2.9 GiB' },
    { value: 'ggml-large-v2-q5_0.bin', title: 'Large v2 (5-bit Quantized)', subtitle: '1.1 GiB' },
    { value: 'ggml-large-v2-q8_0.bin', title: 'Large v2 (8-bit Quantized)', subtitle: '1.5 GiB' },
    { value: 'ggml-large-v3.bin', title: 'Large v3', subtitle: '2.9 GiB' },
    { value: 'ggml-large-v3-q5_0.bin', title: 'Large v3 (5-bit Quantized)', subtitle: '1.1 GiB' },
    { value: 'ggml-large-v3-turbo.bin', title: 'Large v3 Turbo', subtitle: '1.5 GiB' },
    { value: 'ggml-large-v3-turbo-q5_0.bin', title: 'Large v3 Turbo (5-bit Quantized)', subtitle: '547 MiB' },
    { value: 'ggml-large-v3-turbo-q8_0.bin', title: 'Large v3 Turbo (8-bit Quantized)', subtitle: '834 MiB' },
  ]

  const selected = settings.whisper_model

  useEffect(() => {
    const fetchDownloaded = async () => {
      try {
        const names = (await invoke('list_downloaded_models')) as string[]
        const s = new Set(names)
        // 始终认为内置模型已可用
        s.add('ggml-tiny-q5_1.bin')
        setDownloaded(s)
      } catch (e) {
        // ignore errors; keep empty set
        const s = new Set<string>()
        s.add('ggml-tiny-q5_1.bin')
        setDownloaded(s)
      }
    }
    fetchDownloaded()
  }, [settings.whisper_models_path])

  const visibleModels = useMemo(() => {
    if (filter === 'recommended') {
      const picks = new Set([
        'ggml-large-v3-turbo-q5_0.bin', // 平衡推荐
        'ggml-large-v3.bin',            // 最高质量
        'ggml-tiny-q5_1.bin',           // 轻量快速
        'ggml-base.bin',                // 入门平衡
      ])
      return models.filter(m => picks.has(m.value))
    }
    if (filter === 'downloaded') return models.filter(m => downloaded.has(m.value))
    if (filter === 'tiny') return models.filter(m => m.value.startsWith('ggml-tiny'))
    if (filter === 'small') return models.filter(m => m.value.startsWith('ggml-small'))
    if (filter === 'medium') return models.filter(m => m.value.startsWith('ggml-medium'))
    if (filter === 'large') return models.filter(m => m.value.startsWith('ggml-large'))
    return models
  }, [filter, downloaded])

  if (isLoadingSettings) {
    return (
      <div className="container mx-auto p-8">
        <div className="text-center p-8">
          <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">{tSettings('loadingSettings')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-2">
          <Bot className="w-7 h-7" aria-hidden="true" />
          <span>{t('pageTitle')}</span>
        </h1>
      </div>

      {/* 顶部单选筛选 */}
      <div className="mb-4 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          <Button size="sm" variant={filter==='recommended' ? 'default' : 'outline'} onClick={() => setFilter('recommended')}>{t('recommended')}</Button>
          <Button size="sm" variant={filter==='downloaded' ? 'default' : 'outline'} onClick={() => setFilter('downloaded')}>{t('downloaded')}</Button>
          <Button size="sm" variant={filter==='tiny' ? 'default' : 'outline'} onClick={() => setFilter('tiny')}>{t('tiny')}</Button>
          <Button size="sm" variant={filter==='small' ? 'default' : 'outline'} onClick={() => setFilter('small')}>{t('small')}</Button>
          <Button size="sm" variant={filter==='medium' ? 'default' : 'outline'} onClick={() => setFilter('medium')}>{t('medium')}</Button>
          <Button size="sm" variant={filter==='large' ? 'default' : 'outline'} onClick={() => setFilter('large')}>{t('large')}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {visibleModels.map((m) => {
          const isActive = selected === m.value
          const isDownloaded = downloaded.has(m.value)
          return (
            <button
              key={m.value}
              onClick={() => { if (isDownloaded) setModelName(m.value, 'debounced') }}
              className={`w-full text-left rounded-xl group focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 ${!isDownloaded ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              aria-disabled={!isDownloaded}
              disabled={!isDownloaded}
            >
              <Card className={`w-full relative transition-colors ${
                isActive
                  ? 'border-2 border-green-500 ring-2 ring-green-200 dark:ring-green-900/40'
                  : isDownloaded
                    ? 'hover:border-gray-300 dark:hover:border-gray-700'
                    : 'border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40'
              }`}>
                {isActive && (
                  <div className="absolute right-3 top-3 text-green-600 dark:text-green-400">
                    <CheckCircle className="w-5 h-5" aria-hidden="true" />
                  </div>
                )}
                <CardHeader>
                  <CardTitle className={`flex items-center gap-2 ${!isDownloaded ? 'text-gray-900 dark:text-gray-100' : ''}`}>
                    {m.title}
                    {m.hint && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                        {m.hint}
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-sm ${!isDownloaded ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300'}`}>
                    <p className="mb-1">{t('fileName')} <code className="px-1 rounded bg-gray-100 dark:bg-gray-800">{m.value}</code></p>
                    {m.subtitle && <p className="opacity-80">{m.subtitle}</p>}
                    {/* 仅保留勾选图标指示，无需额外文本 */}
                  </div>
                </CardContent>
              </Card>
            </button>
          )
        })}
      </div>
    </div>
  )
}
