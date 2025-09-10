'use client'

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl'
import { open } from '@tauri-apps/plugin-shell'
import { ExternalLink, Info, FileText, Monitor, Cpu, MemoryStick, Puzzle, Clapperboard, Package, BadgeInfo, RefreshCw } from 'lucide-react'

export default function AboutPage() {
  const t = useTranslations('About')
  const [systemInfo, setSystemInfo] = useState<{
    os_type: string;
    os_version: string;
    cpu_brand: string;
    cpu_cores: string;
    total_memory: string;
    gpu_info: string;
    ffmpeg_version: string;
    app_version: string;
    tauri_version: string;
  } | null>(null);
  const [isLoadingSystemInfo, setIsLoadingSystemInfo] = useState(false);
  const [vulkanInfo, setVulkanInfo] = useState<{
    supported: boolean;
    api_version?: string | null;
    device_count: number;
    error?: string | null;
  } | null>(null);

  // 获取系统信息
  const loadSystemInfo = async () => {
    setIsLoadingSystemInfo(true);
    try {
      const result = await invoke('get_system_info_command');
      setSystemInfo(result as any);
    } catch (error) {
      console.error('获取系统信息失败:', error);
    } finally {
      setIsLoadingSystemInfo(false);
    }
  };

  // 组件加载时自动获取系统信息
  useEffect(() => {
    loadSystemInfo();
    invoke('get_vulkan_support')
      .then((res) => setVulkanInfo(res as any))
      .catch((e) => {
        console.error('Failed to get Vulkan support info:', e);
        setVulkanInfo({ supported: false, device_count: 0, api_version: null, error: String(e) });
      });
  }, []);

  const openExternal = async (url: string) => {
    try {
      await open(url)
    } catch (e) {
      try {
        window.open(url, '_blank')
      } catch {}
      alert(t('openFailed'))
    }
  }
  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-2">
          <Info className="w-7 h-7" />
          <span>{t('pageTitle')}</span>
        </h1>
        <p className="text-gray-600 dark:text-gray-300">{t('pageSubtitle')}</p>
      </div>
      
      <div className="space-y-6">
        {/* 作者/项目信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BadgeInfo className="w-5 h-5" /> {t('authorTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{t('projectLabel')}</span>
                  <span className="font-medium">mur-mur (GitHub)</span>
                </div>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => openExternal('https://github.com/Cyang39/mur-mur')}>
                  <ExternalLink className="w-4 h-4" />
                  {t('openInBrowser')}
                </Button>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{t('authorLabel')}</span>
                  <span className="font-medium">Cyang39 (GitHub)</span>
                </div>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => openExternal('https://github.com/Cyang39')}>
                  <ExternalLink className="w-4 h-4" />
                  {t('openInBrowser')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" /> {t('licenseTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 dark:text-gray-300">{t('licenseDesc')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5" /> {t('systemInfoTitle')}
            </CardTitle>
            <CardDescription>
              {t('systemInfoDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isLoadingSystemInfo ? (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span>{t('loading')}</span>
                </div>
              ) : systemInfo ? (
                <>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1"><Monitor className="w-3.5 h-3.5" /> {t('os')}</div>
                        <div className="text-sm font-medium">{systemInfo.os_type} {systemInfo.os_version}</div>
                      </div>
                      
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1"><Cpu className="w-3.5 h-3.5" /> {t('cpu')}</div>
                        <div className="text-sm font-medium">{systemInfo.cpu_brand}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{systemInfo.cpu_cores}</div>
                      </div>
                      
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1"><MemoryStick className="w-3.5 h-3.5" /> {t('memory')}</div>
                        <div className="text-sm font-medium">{systemInfo.total_memory}</div>
                      </div>
                      
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1"><Monitor className="w-3.5 h-3.5" /> {t('gpu')}</div>
                        <div className="text-sm font-medium">{systemInfo.gpu_info}</div>
                      </div>

                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1"><Puzzle className="w-3.5 h-3.5" /> Vulkan</div>
                        {vulkanInfo ? (
                          <div className="text-sm font-medium">
                            {vulkanInfo.supported ? t('supported') : t('notSupported')}
                            {vulkanInfo.api_version ? (
                              <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                                v{vulkanInfo.api_version}
                              </span>
                            ) : null}
                            <div className="text-xs text-gray-500 dark:text-gray-400">{t('deviceCount')}: {vulkanInfo.device_count}</div>
                            {!vulkanInfo.supported ? (
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('vulkanNotDetected')}</div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500 dark:text-gray-400">{t('loading')}</div>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1"><Clapperboard className="w-3.5 h-3.5" /> FFmpeg</div>
                        <div className="text-sm font-medium break-all">{systemInfo.ffmpeg_version}</div>
                      </div>
                      
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1"><Package className="w-3.5 h-3.5" /> {t('appVersion')}</div>
                        <div className="text-sm font-medium">v{systemInfo.app_version}</div>
                      </div>
                      
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1"><BadgeInfo className="w-3.5 h-3.5" /> {t('tauriVersion')}</div>
                        <div className="text-sm font-medium">v{systemInfo.tauri_version}</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-2">
                    <Button 
                      variant="outline"
                      onClick={loadSystemInfo}
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" /> {t('refreshSystemInfo')}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-gray-500 dark:text-gray-400">
                  {t('loadFailed')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
