'use client'

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSettingsStore } from '@/hooks/settingsStore'

export default function ModelsPage() {
  const EMBEDDED_MODEL = 'ggml-tiny-q5_1.bin';
  const {
    settings,
    isLoading: isLoadingSettings,
    load: loadSettings,
    save: saveSettings,
    chooseModelsDirectory,
    setModelName,
    setWhisperLanguage,
  } = useSettingsStore()
  const [modelStatus, setModelStatus] = useState<'checking' | 'exists' | 'missing' | 'unknown'>('unknown');
  const [coreMLStatus, setCoreMLStatus] = useState<'checking' | 'supported' | 'not-supported' | 'unknown'>('unknown');

  // 检查 Core ML 优化支持
  const checkCoreMLSupport = async () => {
    if (!settings.whisper_model) {
      setCoreMLStatus('unknown');
      return;
    }
    // 内置模型不支持 Core ML
    if (settings.whisper_model === EMBEDDED_MODEL) {
      setCoreMLStatus('not-supported');
      return;
    }
    
    setCoreMLStatus('checking');
    try {
      const hasCoreMLSupport = await invoke('check_coreml_support', {
        modelName: settings.whisper_model
      });
      setCoreMLStatus(hasCoreMLSupport ? 'supported' : 'not-supported');
    } catch (error) {
      console.error('检查 Core ML 支持失败:', error);
      setCoreMLStatus('unknown');
    }
  };

  // 检查模型状态
  const checkModelStatus = async () => {
    if (!settings.whisper_model) {
      setModelStatus('unknown');
      return;
    }
    // 选择内置模型时，认为已存在
    if (settings.whisper_model === EMBEDDED_MODEL) {
      setModelStatus('exists');
      return;
    }
    if (!settings.whisper_models_path) {
      setModelStatus('unknown');
      return;
    }
    
    setModelStatus('checking');
    try {
      const modelExists = await invoke('check_model_exists', {
        modelName: settings.whisper_model
      });
      setModelStatus(modelExists ? 'exists' : 'missing');
    } catch (error) {
      console.error('检查模型状态失败:', error);
      setModelStatus('unknown');
    }
  };

  // 加载/保存由 store 提供

  // 选择目录
  const selectDirectory = async () => {
    await chooseModelsDirectory()
  };

  // 组件加载时自动加载设置
  useEffect(() => {
    loadSettings();
  }, []);
  
  // 当模型或路径发生变化时检查模型状态
  useEffect(() => {
    checkModelStatus();
    checkCoreMLSupport();
  }, [settings.whisper_model, settings.whisper_models_path]);

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
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">🤖 AI 模型管理</h1>
        <p className="text-gray-600 dark:text-gray-300">配置和管理您的 Whisper AI 模型</p>
      </div>

      {/* Models 路径配置 */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            📁 模型文件路径
          </CardTitle>
          <CardDescription>
            配置 Whisper 模型文件所在的目录路径
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-center mb-4">
            <div className="flex-1">
              <input 
                type="text" 
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                value={settings.whisper_models_path || ''}
                placeholder="未设置 Whisper Models 路径"
                readOnly
              />
            </div>
            <Button 
              variant="outline"
              onClick={selectDirectory}
            >
              选择目录
            </Button>
          </div>
          {!settings.whisper_models_path && settings.whisper_model !== EMBEDDED_MODEL && (
            <p className="text-sm text-orange-600 dark:text-orange-400">
              ⚠️ 请先配置模型文件目录才能使用 AI 功能
            </p>
          )}
        </CardContent>
      </Card>

      {/* 模型选择 */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🎯 选择 Whisper 模型
          </CardTitle>
          <CardDescription>
            选择适合您需求的 Whisper 模型。不同模型在速度和质量之间有不同的平衡。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Select 
              value={settings.whisper_model}
              onValueChange={(value) => setModelName(value, 'debounced')}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EMBEDDED_MODEL}>Tiny Q5_1（内置，打包资源）</SelectItem>
                <SelectItem value="ggml-tiny.bin">Tiny (75MB) - 最快速度</SelectItem>
                <SelectItem value="ggml-tiny.en.bin">Tiny.en (75MB) - 英文专用</SelectItem>
                <SelectItem value="ggml-base.bin">Base (142MB) - 平衡</SelectItem>
                <SelectItem value="ggml-base.en.bin">Base.en (142MB) - 英文专用</SelectItem>
                <SelectItem value="ggml-small.bin">Small (466MB) - 较高质量</SelectItem>
                <SelectItem value="ggml-small.en.bin">Small.en (466MB) - 英文专用</SelectItem>
                <SelectItem value="ggml-medium.bin">Medium (1.5GB) - 高质量</SelectItem>
                <SelectItem value="ggml-medium.en.bin">Medium.en (1.5GB) - 英文专用</SelectItem>
                <SelectItem value="ggml-large-v1.bin">Large-v1 (2.9GB) - 最高质量</SelectItem>
                <SelectItem value="ggml-large-v2.bin">Large-v2 (2.9GB) - 改进版</SelectItem>
                <SelectItem value="ggml-large-v3.bin">Large-v3 (2.9GB) - 推荐</SelectItem>
                <SelectItem value="ggml-large-v3-turbo.bin">Large-v3-turbo (1.5GB) - 快速高质量</SelectItem>
                <SelectItem value="ggml-large-v2-q5_0.bin">Large-v2-q5_0 (1.1GB) - 压缩版</SelectItem>
                <SelectItem value="ggml-large-v3-q5_0.bin">Large-v3-q5_0 (1.1GB) - 压缩版</SelectItem>
                <SelectItem value="ggml-large-v3-turbo-q5_0.bin">Large-v3-turbo-q5_0 (547MB) - 最佳平衡</SelectItem>
              </SelectContent>
            </Select>

            {/* 模型状态指示器 */}
            <div className="flex items-center gap-2 text-sm">
              {modelStatus === 'checking' && (
                <>
                  <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-blue-600 dark:text-blue-400">检查中...</span>
                </>
              )}
              {modelStatus === 'exists' && (
                <>
                  <span className="text-green-600 dark:text-green-400">✓</span>
                  <span className="text-green-600 dark:text-green-400">模型文件存在</span>
                </>
              )}
              {modelStatus === 'missing' && (
                <>
                  <span className="text-red-600 dark:text-red-400">❌</span>
                  <span className="text-red-600 dark:text-red-400">模型文件不存在</span>
                </>
              )}
              {modelStatus === 'unknown' && settings.whisper_models_path && (
                <>
                  <span className="text-gray-500 dark:text-gray-400">❓</span>
                  <span className="text-gray-500 dark:text-gray-400">未检查</span>
                </>
              )}
              {!settings.whisper_models_path && (
                <>
                  <span className="text-orange-600 dark:text-orange-400">⚠️</span>
                  <span className="text-orange-600 dark:text-orange-400">请先配置 Models 路径</span>
                </>
              )}
            </div>

            {/* Core ML 优化状态指示器 */}
            {modelStatus === 'exists' && (
              <div className="flex items-center gap-2 text-sm">
                {coreMLStatus === 'checking' && (
                  <>
                    <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-purple-600 dark:text-purple-400">检查 Core ML 支持...</span>
                  </>
                )}
                {coreMLStatus === 'supported' && (
                  <>
                    <span className="text-purple-600 dark:text-purple-400">⚡</span>
                    <span className="text-purple-600 dark:text-purple-400 font-medium">支持 Core ML 优化 - 更快的识别速度</span>
                  </>
                )}
                {coreMLStatus === 'not-supported' && (
                  <>
                    <span className="text-gray-500 dark:text-gray-400">🔄</span>
                    <span className="text-gray-500 dark:text-gray-400">使用标准模式 - 无 Core ML 优化</span>
                  </>
                )}
                {coreMLStatus === 'unknown' && (
                  <>
                    <span className="text-gray-500 dark:text-gray-400">❓</span>
                    <span className="text-gray-500 dark:text-gray-400">未检查 Core ML 支持</span>
                  </>
                )}
              </div>
            )}

            {modelStatus === 'missing' && (
              <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
                <h4 className="font-semibold text-red-800 dark:text-red-200 mb-2">模型文件缺失</h4>
                <p className="text-red-700 dark:text-red-300 text-sm mb-3">
                  模型文件 <code className="bg-red-100 dark:bg-red-800 px-1 rounded">{settings.whisper_model}</code> 不存在
                </p>
                <div className="text-sm text-red-700 dark:text-red-300">
                  <p className="mb-2">📥 您可以从以下地址下载模型：</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>
                      <a 
                        href="https://huggingface.co/ggerganov/whisper.cpp/tree/main" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Hugging Face - whisper.cpp 模型库
                      </a>
                    </li>
                    <li>或使用 whisper.cpp 的 download-ggml-model.sh 脚本</li>
                  </ul>
                  <p className="mt-3">💡 下载后请将模型文件放在配置的 Models 目录中</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 语言配置 */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🌍 语音识别语言
          </CardTitle>
          <CardDescription>
            选择 Whisper 语音识别的目标语言。自动检测适用于多语言内容，指定语言可提高准确度。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select 
            value={settings.whisper_language}
            onValueChange={(value) => setWhisperLanguage(value, 'debounced')}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择语言" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">自动检测 (Auto)</SelectItem>
              <SelectItem value="zh">中文 (Chinese)</SelectItem>
              <SelectItem value="en">英文 (English)</SelectItem>
              <SelectItem value="ja">日文 (Japanese)</SelectItem>
              <SelectItem value="ko">韩文 (Korean)</SelectItem>
              <SelectItem value="fr">法文 (French)</SelectItem>
              <SelectItem value="de">德文 (German)</SelectItem>
              <SelectItem value="es">西班牙文 (Spanish)</SelectItem>
              <SelectItem value="ru">俄文 (Russian)</SelectItem>
              <SelectItem value="ar">阿拉伯文 (Arabic)</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* 保存按钮 */}
      <div className="flex gap-4">
        <Button 
          onClick={saveSettings}
          className="flex items-center gap-2"
        >
          💾 保存设置
        </Button>
        <Button 
          variant="secondary"
          onClick={loadSettings}
          className="flex items-center gap-2"
        >
          🔄 重新加载
        </Button>
      </div>

      {/* 模型信息说明 */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            📚 模型说明
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-3 text-gray-800 dark:text-gray-200">🚀 速度优先</h4>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <li><strong>Tiny:</strong> 最快，适合实时转录</li>
                <li><strong>Base:</strong> 平衡选择</li>
                <li><strong>Turbo:</strong> 快速高质量</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3 text-gray-800 dark:text-gray-200">🎯 质量优先</h4>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <li><strong>Large-v3:</strong> 最高质量，推荐</li>
                <li><strong>Medium:</strong> 高质量</li>
                <li><strong>q5_0:</strong> 压缩版，节省空间</li>
              </ul>
            </div>
          </div>
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              💡 <strong>推荐：</strong> 首次使用建议选择 <code>ggml-large-v3-turbo-q5_0.bin</code>，它在速度和质量之间提供了最佳平衡。
            </p>
          </div>
          
          <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
            <h4 className="font-semibold text-purple-800 dark:text-purple-200 mb-2 flex items-center gap-2">
              ⚡ Core ML 优化
            </h4>
            <p className="text-sm text-purple-700 dark:text-purple-300 mb-2">
              当模型支持 Core ML 优化时，系统将自动使用硬件加速版本的 whisper-cli，显著提高识别速度。
            </p>
            <ul className="text-sm text-purple-700 dark:text-purple-300 space-y-1 ml-4 list-disc">
              <li>需要相应的 <code className="bg-purple-100 dark:bg-purple-800 px-1 rounded">.mlmodelc</code> 文件夹</li>
              <li>仅在 Apple Silicon (M1/M2/M3) Mac 上可用</li>
              <li>显著减少识别时间和系统资源占用</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
