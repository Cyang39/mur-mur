'use client'

import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { useProcessing } from '@/contexts/ProcessingContext';
import { 
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter
} from '@/components/ui/alert-dialog';
import {useTranslations} from 'next-intl'

export default function HomePage() {
  const t = useTranslations('Home')
  const { state, updateState, resetState, setProcessingFile, startTimer, stopTimer, resetTimer } = useProcessing();
  const {
    selectedFile,
    currentAudioPath,
    isProcessing,
    isWhisperRunning,
    processResult,
    whisperOutput,
    recognitionElapsedTime,
    hasSrtFile,
    totalDuration,
    currentProgress,
    progressPercentage,
  } = state;
  
  const [isDragging, setIsDragging] = useState(false);
  const [settings, setSettings] = useState({
    whisper_models_path: null as string | null,
    whisper_language: 'auto' as string,
    whisper_model: 'ggml-large-v3.bin' as string,
    enable_vad: false as boolean,
    disable_gpu: false as boolean,
    thread_count: 4 as number,
  });
  const whisperOutputRef = useRef<HTMLDivElement>(null);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);

  const handleFileSelect = (files: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      const validTypes = ['video/', 'audio/'];
      if (validTypes.some(type => file.type.startsWith(type))) {
        setProcessingFile({
          name: file.name,
          size: file.size,
          type: file.type,
          path: null,
          blob: file,
        });
        updateState({ 
          processResult: null,
          whisperOutput: [],
          hasSrtFile: false,
          recognitionElapsedTime: 0
        });
      } else {
        alert('请选择视频或音频文件');
      }
    }
  };

  const pickMediaFileWithDialog = async () => {
    try {
      const pickedPath = await invoke('select_media_file');
      if (!pickedPath) return;

      const info = await invoke('get_file_info', { path: pickedPath });
      const { name, size, kind } = info as { name: string; size: number; kind: string };

      setProcessingFile({
        name,
        size,
        type: kind,
        path: pickedPath as string,
        blob: null,
      });

      updateState({ 
        processResult: null,
        whisperOutput: [],
        hasSrtFile: false,
        recognitionElapsedTime: 0
      });
    } catch (e) {
      console.error('选择文件失败:', e);
    }
  };

  const processMediaFile = async () => {
    if (!selectedFile) return;
    
    if (!settings.whisper_models_path) {
      alert('请先在设置页面配置 Whisper Models 路径！');
      return;
    }
    
    try {
      console.log('正在检查模型:', settings.whisper_model);
      const modelExists = await invoke('check_model_exists', {
        modelName: settings.whisper_model
      });
      
      console.log('模型检查结果:', modelExists);
      
      if (!modelExists) {
        alert(`❌ 模型文件不存在: ${settings.whisper_model}\n\n📁 请确保在 Models 目录中有对应的模型文件：\n${settings.whisper_models_path}/${settings.whisper_model}\n\n📥 您可以从以下地址下载模型：\n• https://huggingface.co/ggerganov/whisper.cpp/tree/main\n• 或使用 whisper.cpp 的 download-ggml-model.sh 脚本\n\n💡 下载后请将模型文件放在配置的 Models 目录中`);
        return;
      }
      
      console.log('模型文件存在，继续处理...');
    } catch (error) {
      console.error('检查模型失败:', error);
      const errorMessage = typeof error === 'string' ? error : String(error);
      
      if (errorMessage.includes('请在设置中配置')) {
        alert('❌ 请先在设置页面配置 Whisper Models 路径！');
      } else {
        alert(`❌ 检查模型失败：${errorMessage}\n\n请检查：\n• Models 路径是否正确配置\n• 是否有访问权限`);
      }
      return;
    }
    
    updateState({
      isProcessing: true,
      processResult: null,
      whisperOutput: [],
      hasSrtFile: false,
    });
    
    try {
      let result: any;
      if (selectedFile.path) {
        result = await invoke('process_media_file_from_path', {
          inputPath: selectedFile.path,
        });
      } else if (selectedFile.blob) {
        const fileBuffer = await selectedFile.blob.arrayBuffer();
        const fileData = Array.from(new Uint8Array(fileBuffer));
        result = await invoke('process_media_file', {
          fileData: fileData,
          fileName: selectedFile.name
        });
      } else {
        throw new Error('未找到可用的文件来源');
      }
      
      console.log('FFmpeg 处理结果:', result);
      updateState({ processResult: 'FFmpeg 处理成功！' });
      
      const audioPath = (result as any).output_path;
      const duration = (result as any).duration_seconds;
      if (audioPath) {
        updateState({ 
          currentAudioPath: audioPath,
          totalDuration: duration
        });
        await startWhisperRecognition(audioPath, duration);
      }
    } catch (error) {
      console.error('处理失败:', error);
      updateState({
        processResult: `处理失败：${error}`,
        isProcessing: false,
      });
    }
  };

  const startWhisperRecognition = async (audioPath: string, duration?: number) => {
    try {
      startTimer();
      
      updateState({
        isWhisperRunning: true,
        processResult: '正在进行语音识别...',
        currentProgress: 0,
        progressPercentage: 0,
      });
      
      await invoke('start_whisper_recognition', {
        audioFilePath: audioPath,
        totalDuration: duration || null
      });
    } catch (error) {
      console.error('Whisper 识别失败:', error);
      updateState({
        processResult: `Whisper 识别失败：${error}`,
        isWhisperRunning: false,
        isProcessing: false,
      });
      stopTimer();
    }
  };

  const stopWhisperRecognition = async () => {
    try {
      stopTimer();
      await invoke('stop_whisper_recognition');
    } catch (error) {
      console.error('停止 Whisper 失败:', error);
    }
  };

  const copyWhisperOutput = () => {
    const text = whisperOutput.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      alert('内容已复制到剪贴板！');
    }).catch(err => {
      console.error('复制失败:', err);
    });
  };
  
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  };
  
  const formatElapsedTime = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const ms = Math.floor((milliseconds % 1000) / 10);
    
    if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    } else {
      return `${seconds}.${ms.toString().padStart(2, '0')}秒`;
    }
  };
  
  const saveSrtFile = async () => {
    if (!currentAudioPath) {
      alert('未找到音频文件路径');
      return;
    }
    
    try {
      const targetDirectory = await invoke('select_directory');
      if (!targetDirectory) {
        return;
      }
      
      const savedPath = await invoke('save_srt_file', {
        audioFilePath: currentAudioPath,
        targetDirectory: targetDirectory
      });
      
      alert(`SRT 字幕文件已保存到：\n${savedPath}`);
    } catch (error) {
      console.error('保存 SRT 文件失败:', error);
      alert(`保存 SRT 文件失败：${error}`);
    }
  };
  
  const checkModelStatus = async () => {
    if (!settings.whisper_models_path || !settings.whisper_model) {
      return;
    }
    
    try {
      const modelExists = await invoke('check_model_exists', {
        modelName: settings.whisper_model
      });
      if (!modelExists) {
        console.warn('模型文件不存在:', settings.whisper_model);
      }
    } catch (error) {
      console.error('检查模型状态失败:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const result = await invoke('load_settings');
      setSettings(result as any);
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  };

  const toggleNoGpu = async (v: boolean) => {
    const next = { ...settings, disable_gpu: v } as any;
    setSettings(next);
    try {
      await invoke('save_settings', { settings: next });
    } catch (e) {
      console.error('保存设置失败:', e);
    }
  };

  const toggleVad = async (v: boolean) => {
    const next = { ...settings, enable_vad: v } as any;
    setSettings(next);
    try {
      await invoke('save_settings', { settings: next });
    } catch (e) {
      console.error('保存设置失败:', e);
    }
  };

  const changeThreads = async (vals: number[]) => {
    const n = Math.max(1, Math.min(8, Math.round(vals[0] ?? 4)));
    const next = { ...settings, thread_count: n } as any;
    setSettings(next);
    try {
      await invoke('save_settings', { settings: next });
    } catch (e) {
      console.error('保存设置失败:', e);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (whisperOutputRef.current) {
      whisperOutputRef.current.scrollTop = whisperOutputRef.current.scrollHeight;
    }
  }, [whisperOutput]);
  
  useEffect(() => {
    checkModelStatus();
  }, [settings.whisper_model, settings.whisper_models_path]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderMainContent = () => {
    return (
      <div className="text-center max-w-4xl mx-auto">
        <div className="flex items-center justify-end gap-6 mt-6">
          <span className="text-sm text-gray-600 dark:text-gray-300">{t('noGpu')}</span>
          <Switch checked={!!settings.disable_gpu} onCheckedChange={toggleNoGpu} />
          <span className="text-sm text-gray-600 dark:text-gray-300">{t('vad')}</span>
          <Switch checked={!!settings.enable_vad} onCheckedChange={toggleVad} />
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 dark:text-gray-300">{t('threads')}: {settings.thread_count}</span>
            <Slider min={1} max={8} step={1} value={[settings.thread_count]} onValueChange={changeThreads} />
          </div>
        </div>
        <div 
          className={`border-2 border-dashed rounded-xl p-16 my-10 transition-all duration-300 ease-in-out cursor-pointer min-h-[200px] flex flex-col items-center justify-center ${
            isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-105' : 
            selectedFile ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 
            'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {!selectedFile ? (
            <>
              <div className="text-6xl mb-5 opacity-60">📁</div>
              <p className="text-xl text-gray-600 dark:text-gray-300 mb-3 font-medium">
                {t('dragHere')}
              </p>
              <p className="text-gray-500 dark:text-gray-400 mb-5">{t('or')}</p>
              <Button asChild>
                <span onClick={pickMediaFileWithDialog} className="cursor-pointer select-none">
                  {t('chooseFile')}
                </span>
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-5 text-left w-full max-w-xl">
              <div className="text-5xl flex-shrink-0">
                {selectedFile.type.startsWith('video/') ? '🎬' : '🎵'}
              </div>
              <div className="flex-1">
                <h3 className="m-0 mb-2 text-gray-800 dark:text-gray-100 text-xl break-all">{selectedFile.name}</h3>
                <p className="my-1 text-gray-600 dark:text-gray-300 text-sm">大小: {formatFileSize(selectedFile.size)}</p>
                <p className="my-1 text-gray-600 dark:text-gray-300 text-sm">类型: {selectedFile.type}</p>
                {selectedFile.path ? (
                  <p className="my-1 text-gray-600 dark:text-gray-300 text-sm break-all font-mono">
                    路径: {selectedFile.path}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-3 flex-shrink-0">
                <Button 
                  onClick={processMediaFile}
                  disabled={isProcessing}
                  className="px-5 py-2.5"
                  variant={isProcessing ? "secondary" : "default"}
                >
                  {isProcessing ? (
                    isWhisperRunning ? t('recognizing') : t('processing')
                  ) : t('start')}
                </Button>
                <Button 
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    resetTimer();
                    resetState();
                  }}
                  disabled={isProcessing}
                >
                  {t('clearFile')}
                </Button>
              </div>
            </div>
          )}
        </div>
        
        {processResult && (
          <div className={`my-5 p-4 rounded-lg font-medium text-center ${
            processResult.includes('成功') ? 
            'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-700' : 
            'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-700'
          }`}>
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center justify-center gap-2">
                <span>{processResult}</span>
                {(isWhisperRunning && processResult.includes('语音识别')) || (processResult.includes('语音识别完成') && recognitionElapsedTime > 0) ? (
                  <span className="font-mono text-sm bg-blue-100 dark:bg-blue-900/50 px-2 py-1 rounded border">
                    ⏱️ {formatElapsedTime(recognitionElapsedTime)}
                  </span>
                ) : null}
              </div>
              
              {isWhisperRunning && (
                <div className="w-full max-w-md">
                  <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                    {totalDuration && totalDuration > 0 ? (
                      <span>{formatTime(currentProgress)}</span>
                    ) : (
                      <span></span>
                    )}
                    <span>{progressPercentage.toFixed(1)}%</span>
                    {totalDuration && totalDuration > 0 ? (
                      <span>{formatTime(totalDuration)}</span>
                    ) : (
                      <span></span>
                    )}
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {(isWhisperRunning || whisperOutput.length > 0) && (
          <div className="my-8 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800">
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-t-lg">
              <h3 className="m-0 text-gray-800 dark:text-gray-100 text-lg">🎤 {t('speechResults')}</h3>
              <div className="flex gap-2">
                {isWhisperRunning && (
                  <AlertDialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="destructive"
                        size="sm"
                      >
                        ⏹ {t('stop')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('confirmStopTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('confirmStopDesc')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <Button 
                          variant="outline"
                          onClick={() => setStopDialogOpen(false)}
                        >
                          {t('cancel')}
                        </Button>
                        <Button 
                          variant="destructive"
                          onClick={async () => { await stopWhisperRecognition(); setStopDialogOpen(false); }}
                        >
                          {t('confirm')}
                        </Button>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {hasSrtFile && (
                  <Button 
                    variant="outline"
                    size="sm"
                    onClick={saveSrtFile}
                    disabled={isWhisperRunning}
                  >
                    📁 {t('saveSrt')}
                  </Button>
                )}
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={copyWhisperOutput}
                  disabled={isWhisperRunning || whisperOutput.length === 0}
                >
                  📋 {t('copy')}
                </Button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto p-5 bg-gray-800 text-gray-200 font-mono text-sm leading-relaxed rounded-b-lg text-left whisper-output" ref={whisperOutputRef}>
              {whisperOutput.length === 0 ? (
                <div className="text-gray-400 italic text-left p-5">{t('waiting')}</div>
              ) : (
                whisperOutput.map((line, index) => (
                  <div key={index} className="mb-2 break-words">
                    {line}
                  </div>
                ))
              )}
              {isWhisperRunning && (
                <div className="whisper-cursor">▮</div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return renderMainContent();
}
