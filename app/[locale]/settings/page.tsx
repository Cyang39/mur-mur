'use client'

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {useLocale, useTranslations} from 'next-intl'
import {usePathname, useRouter} from 'next/navigation'
import { Languages, Settings as SettingsIcon, SunMoon, Bot, Globe, Folder, FolderOpen, RefreshCw, Gauge } from 'lucide-react'

export default function SettingsPage() {
  const locale = useLocale();
  const tHeader = useTranslations('Header');
  const t = useTranslations('Settings');
  const pathname = usePathname();
  const router = useRouter();
  const [settings, setSettings] = useState({
    whisper_models_path: null as string | null,
    app_locale: locale as string,
    whisper_language: 'auto' as string,
    whisper_model: 'ggml-large-v3.bin' as string,
    enable_vad: false as boolean,
    whisper_optimization: 'none' as any,
  });
  
  const switchLocale = (nextLocale: 'zh-CN' | 'en') => {
    if (nextLocale === locale) return;
    // Persist selection to settings.json
    const updated = { ...(settings as any), app_locale: nextLocale } as any;
    setSettings(updated);
    invoke('save_settings', { settings: updated }).catch((error) => {
      console.error('保存语言设置失败:', error);
    });
    // Replace the first path segment with new locale
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) {
      router.replace(`/${nextLocale}`);
      return;
    }
    segments[0] = nextLocale;
    router.replace('/' + segments.join('/'));
  };
  const [themeMode, setThemeMode] = useState<'system' | 'light' | 'dark'>('system');
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [appDataInfo, setAppDataInfo] = useState<{
    path: string;
    size_bytes: number;
    size_formatted: string;
  } | null>(null);
  const [isLoadingAppData, setIsLoadingAppData] = useState(false);

  // 获取应用数据目录信息
  const loadAppDataInfo = async () => {
    setIsLoadingAppData(true);
    try {
      const result = await invoke('get_app_data_info');
      setAppDataInfo(result as any);
    } catch (error) {
      console.error('获取应用数据信息失败:', error);
    } finally {
      setIsLoadingAppData(false);
    }
  };

  // 打开应用数据目录
  const openAppDataDirectory = async () => {
    try {
      await invoke('open_app_data_directory');
    } catch (error) {
      console.error('打开目录失败:', error);
      alert(`打开目录失败: ${error}`);
    }
  };

  // 加载设置
  const loadSettings = async () => {
    try {
      const result = await invoke('load_settings');
      setSettings(result as any);
    } catch (error) {
      console.error('加载设置失败:', error);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  // 已移除手动保存函数，改为自动保存

  // 选择目录
  const selectDirectory = async (type: 'whisper_models') => {
    try {
      const result = await invoke('select_directory');
      if (result) {
        setSettings(prev => ({
          ...prev,
          [`${type}_path`]: result as string
        }));
      }
    } catch (error) {
      console.error('选择目录失败:', error);
      alert(`选择目录失败: ${error}`);
    }
  };

  // 组件加载时自动加载设置
  useEffect(() => {
    loadSettings();
    loadAppDataInfo();
    // 初始化主题状态
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('theme');
        const mode = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
        setThemeMode(mode as 'system' | 'light' | 'dark');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const dark = mode === 'dark' || (mode === 'system' && prefersDark);
        const root = document.documentElement;
        root.classList[dark ? 'add' : 'remove']('dark');
      } catch {}
    }
  }, []);

  // 设置变更时自动保存（带轻微防抖）
  useEffect(() => {
    if (isLoadingSettings) return;
    const timer = setTimeout(() => {
      invoke('save_settings', { settings }).catch((error) => {
        console.error('自动保存设置失败:', error);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [settings, isLoadingSettings]);

  // 定义可用的语言选项（根据当前语言本地化）
  const languageOptions = [
    { value: 'auto', label: t('langAuto') },
    { value: 'zh', label: t('langZh') },
    { value: 'en', label: t('langEn') },
    { value: 'ja', label: t('langJa') },
    { value: 'ko', label: t('langKo') },
    { value: 'fr', label: t('langFr') },
    { value: 'de', label: t('langDe') },
    { value: 'es', label: t('langEs') },
    { value: 'ru', label: t('langRu') },
    { value: 'ar', label: t('langAr') },
  ];

  if (isLoadingSettings) {
    return (
      <div className="container mx-auto p-8">
        <div className="text-center p-8">
          <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">{t('loadingSettings')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-2">
          <SettingsIcon className="w-6 h-6" aria-hidden="true" />
          {t('pageTitle')}
        </h1>
        <p className="text-gray-600 dark:text-gray-300">{t('pageSubtitle')}</p>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <span className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
          <Languages className="w-4 h-4" aria-hidden="true" />
          {tHeader('language')}
        </span>
        <Select value={locale as 'zh-CN' | 'en'} onValueChange={(v) => switchLocale(v as 'zh-CN' | 'en')}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={tHeader('language')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="zh-CN">中文</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SunMoon className="w-4 h-4" aria-hidden="true" />
              {t('appearanceTitle')}
            </CardTitle>
            <CardDescription>{t('appearanceDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="font-medium text-gray-800 dark:text-gray-100">{t('themeMode')}</div>
              <Select 
                value={themeMode}
                onValueChange={(value) => {
                  const mode = value as 'system' | 'light' | 'dark';
                  setThemeMode(mode);
                  try {
                    localStorage.setItem('theme', mode);
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    const dark = mode === 'dark' || (mode === 'system' && prefersDark);
                    const root = document.documentElement;
                    root.classList[dark ? 'add' : 'remove']('dark');
                  } catch {}
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={t('themePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">{t('themeSystem')}</SelectItem>
                  <SelectItem value="light">{t('themeLight')}</SelectItem>
                  <SelectItem value="dark">{t('themeDark')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('themeHint')}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="w-4 h-4" aria-hidden="true" />
              {t('modelsTitle')}
            </CardTitle>
            <CardDescription>
              {t('modelsDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 items-center">
              <Input 
                type="text" 
                className="flex-1"
                value={settings.whisper_models_path || ''}
                placeholder={t('modelsPathPlaceholder')}
                readOnly
              />
              <Button 
                variant="outline"
                onClick={() => selectDirectory('whisper_models')}
              >
                {t('chooseDirectory')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-4 h-4" aria-hidden="true" />
              {t('languageTitle')}
            </CardTitle>
            <CardDescription>
              {t('languageDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select 
              value={settings.whisper_language}
              onValueChange={(value) => {
                setSettings(prev => ({ ...prev, whisper_language: value }));
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('chooseLanguage')} />
              </SelectTrigger>
              <SelectContent>
                {languageOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              {t('languageHelp')}
            </p>
          </CardContent>
        </Card>

        {/* 已移除手动保存/重置按钮，设置会自动保存 */}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Folder className="w-4 h-4" aria-hidden="true" />
              {t('appDataTitle')}
            </CardTitle>
            <CardDescription>
              {t('appDataDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isLoadingAppData ? (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span>{t('loading')}</span>
                </div>
              ) : appDataInfo ? (
                <>
                  <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">{t('appDataPath')}</span>
                        <code className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded font-mono break-all">
                          {appDataInfo.path}
                        </code>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">{t('appDataSize')}</span>
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                          {appDataInfo.size_formatted}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <Button 
                      variant="outline"
                      onClick={openAppDataDirectory}
                      className="flex items-center gap-2"
                    >
                      <FolderOpen className="w-4 h-4" aria-hidden="true" />
                      {t('openDirectory')}
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={loadAppDataInfo}
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" aria-hidden="true" />
                      {t('refresh')}
                    </Button>
                  </div>
                  
                  <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                    <p>{t('appDataTips1')}</p>
                    <p>{t('appDataTips2')}</p>
                    <p>{t('appDataTips3')}</p>
                  </div>
                </>
              ) : (
                <div className="text-gray-500 dark:text-gray-400">
                  {t('appDataLoadFailed')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* VAD 开关已移至首页 */}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="w-4 h-4" aria-hidden="true" />
              {t('optimizeTitle')}
            </CardTitle>
            <CardDescription>{t('optimizeDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <label className="text-sm text-gray-600 dark:text-gray-300">{t('optimizeMode')}</label>
              <Select
                value={settings.whisper_optimization as any}
                onValueChange={(v: any) => setSettings(prev => ({ ...prev, whisper_optimization: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('optimizePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('optimizeNone')}</SelectItem>
                  <SelectItem value="vulkan">{t('optimizeVulkan')}</SelectItem>
                  <SelectItem value="coreml">{t('optimizeCoreML')}</SelectItem>
                  {/* <SelectItem value="cuda">CUDA（未实现）</SelectItem> */}
                </SelectContent>
              </Select>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t('optimizeHint')}
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
