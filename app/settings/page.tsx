'use client'

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    whisper_models_path: null as string | null,
    whisper_language: 'auto' as string,
    whisper_model: 'ggml-large-v3.bin' as string,
  });
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

  // 定义可用的语言选项
  const languageOptions = [
    { value: 'auto', label: '自动检测 (Auto)' },
    { value: 'zh', label: '中文 (Chinese)' },
    { value: 'en', label: '英文 (English)' },
    { value: 'ja', label: '日文 (Japanese)' },
    { value: 'ko', label: '韩文 (Korean)' },
    { value: 'fr', label: '法文 (French)' },
    { value: 'de', label: '德文 (German)' },
    { value: 'es', label: '西班牙文 (Spanish)' },
    { value: 'ru', label: '俄文 (Russian)' },
    { value: 'ar', label: '阿拉伯文 (Arabic)' },
  ];

  if (isLoadingSettings) {
    return (
      <div className="container mx-auto p-8">
        <div className="text-center p-8">
          <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">加载设置中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">⚙️ 设置</h1>
        <p className="text-gray-600 dark:text-gray-300">配置您的应用程序设置</p>
      </div>
      
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              🤖 Whisper Models 路径
            </CardTitle>
            <CardDescription>
              设置 whisper 模型文件所在目录
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 items-center">
              <Input 
                type="text" 
                className="flex-1"
                value={settings.whisper_models_path || ''}
                placeholder="未设置 Whisper Models 路径"
                readOnly
              />
              <Button 
                variant="outline"
                onClick={() => selectDirectory('whisper_models')}
              >
                选择目录
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              🌍 语音识别语言
            </CardTitle>
            <CardDescription>
              选择 Whisper 语音识别的目标语言
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
                <SelectValue placeholder="选择语言" />
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
              选择"自动检测"时，Whisper 会自动识别语言；选择具体语言可以提高识别准确度
            </p>
          </CardContent>
        </Card>

        {/* 已移除手动保存/重置按钮，设置会自动保存 */}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              📁 程序数据目录
            </CardTitle>
            <CardDescription>
              查看和管理应用数据存储位置
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isLoadingAppData ? (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span>加载中...</span>
                </div>
              ) : appDataInfo ? (
                <>
                  <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">存储路径:</span>
                        <code className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded font-mono break-all">
                          {appDataInfo.path}
                        </code>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">占用空间:</span>
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
                      📂 打开目录
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={loadAppDataInfo}
                      className="flex items-center gap-2"
                    >
                      🔄 刷新
                    </Button>
                  </div>
                  
                  <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                    <p>• 配置文件: settings.json</p>
                    <p>• 临时文件: temp/（包含 WAV 和 SRT 文件）</p>
                    <p>• 可以手动清理 temp 目录以释放空间</p>
                  </div>
                </>
              ) : (
                <div className="text-gray-500 dark:text-gray-400">
                  无法加载目录信息
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              📝 说明
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-1">•</span>
                <div>
                  <strong className="text-gray-800 dark:text-gray-100">Whisper CLI:</strong> 用于语音识别的命令行工具
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-1">•</span>
                <div>
                  <strong className="text-gray-800 dark:text-gray-100">Models:</strong> 存放 Whisper 预训练模型的目录
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-1">•</span>
                <div>
                  设置保存后将在下次启动时自动加载
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
