'use client'

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function AboutPage() {
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
        console.error('获取 Vulkan 支持信息失败:', e);
        setVulkanInfo({ supported: false, device_count: 0, api_version: null, error: String(e) });
      });
  }, []);
  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">ℹ️ 关于</h1>
        <p className="text-gray-600 dark:text-gray-300">了解 Murmur 应用程序</p>
      </div>
      
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              📄 许可证
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 dark:text-gray-300">
              本项目基于开源许可证发布，遵循开源社区的最佳实践和协作精神。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              💻 系统信息
            </CardTitle>
            <CardDescription>
              当前系统和应用程序的详细信息
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isLoadingSystemInfo ? (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span>加载系统信息中...</span>
                </div>
              ) : systemInfo ? (
                <>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">📱 操作系统</div>
                        <div className="text-sm font-medium">{systemInfo.os_type} {systemInfo.os_version}</div>
                      </div>
                      
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">💾 处理器</div>
                        <div className="text-sm font-medium">{systemInfo.cpu_brand}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{systemInfo.cpu_cores}</div>
                      </div>
                      
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">🗡️ 内存</div>
                        <div className="text-sm font-medium">{systemInfo.total_memory}</div>
                      </div>
                      
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">🎮 GPU</div>
                        <div className="text-sm font-medium">{systemInfo.gpu_info}</div>
                      </div>

                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">🧩 Vulkan</div>
                        {vulkanInfo ? (
                          <div className="text-sm font-medium">
                            {vulkanInfo.supported ? '支持' : '不支持'}
                            {vulkanInfo.api_version ? (
                              <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                                v{vulkanInfo.api_version}
                              </span>
                            ) : null}
                            <div className="text-xs text-gray-500 dark:text-gray-400">设备数: {vulkanInfo.device_count}</div>
                            {!vulkanInfo.supported ? (
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">未检测到 Vulkan 运行库</div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500 dark:text-gray-400">检测中...</div>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">🎥 FFmpeg</div>
                        <div className="text-sm font-medium break-all">{systemInfo.ffmpeg_version}</div>
                      </div>
                      
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">📦 应用版本</div>
                        <div className="text-sm font-medium">v{systemInfo.app_version}</div>
                      </div>
                      
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">🦀 Tauri 版本</div>
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
                      🔄 刷新系统信息
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-gray-500 dark:text-gray-400">
                  无法加载系统信息
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
