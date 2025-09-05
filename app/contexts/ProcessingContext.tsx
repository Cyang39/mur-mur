'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';

type SelectedFileInfo = {
  name: string;
  size: number;
  type: string;
  path?: string | null;
  blob?: File | null;
};

interface ProcessingState {
  // 文件相关状态
  selectedFile: SelectedFileInfo | null;
  currentAudioPath: string | null;
  
  // 处理状态
  isProcessing: boolean;
  isWhisperRunning: boolean;
  processResult: string | null;
  
  // 输出相关
  whisperOutput: string[];
  
  // 计时相关
  recognitionElapsedTime: number;
  hasSrtFile: boolean;
  
  // 进度相关
  totalDuration: number | null;
  currentProgress: number;
  progressPercentage: number;
}

interface ProcessingContextType {
  state: ProcessingState;
  updateState: (updates: Partial<ProcessingState>) => void;
  resetState: () => void;
  addWhisperOutput: (output: string) => void;
  setProcessingFile: (file: SelectedFileInfo | null) => void;
  startTimer: () => void;
  stopTimer: () => void;
  resetTimer: () => void;
}

const initialState: ProcessingState = {
  selectedFile: null,
  currentAudioPath: null,
  isProcessing: false,
  isWhisperRunning: false,
  processResult: null,
  whisperOutput: [],
  recognitionElapsedTime: 0,
  hasSrtFile: false,
  totalDuration: null,
  currentProgress: 0,
  progressPercentage: 0,
};

const ProcessingContext = createContext<ProcessingContextType | undefined>(undefined);

export function ProcessingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProcessingState>(initialState);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // 更新状态的函数
  const updateState = (updates: Partial<ProcessingState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  // 重置状态的函数
  const resetState = () => {
    setState(initialState);
  };

  // 添加 Whisper 输出的函数（去重）
  const addWhisperOutput = (output: string) => {
    setState(prev => {
      const lastLine = prev.whisperOutput[prev.whisperOutput.length - 1];
      if (lastLine !== output) {
        return { ...prev, whisperOutput: [...prev.whisperOutput, output] };
      }
      return prev;
    });
  };

  // 设置处理文件的函数
  const setProcessingFile = (file: SelectedFileInfo | null) => {
    setState(prev => ({ ...prev, selectedFile: file }));
  };

  // 开始计时器的函数
  const startTimer = () => {
    const startTime = Date.now();
    startTimeRef.current = startTime;
    setState(prev => ({ ...prev, recognitionElapsedTime: 0 }));
    
    // 启动计时器
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setState(prev => ({ ...prev, recognitionElapsedTime: Date.now() - startTimeRef.current! }));
      }
    }, 100); // 每100ms更新一次
  };

  // 停止计时器的函数（保留当前时间）
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // 重置计时器的函数（清零时间）
  const resetTimer = () => {
    stopTimer();
    startTimeRef.current = null;
    setState(prev => ({ ...prev, recognitionElapsedTime: 0 }));
  };

  // 设置全局事件监听器
  useEffect(() => {
    let unlistenFunctions: (() => void)[] = [];

    const setupEventListeners = async () => {
      try {
        // 监听 whisper 进度
        const unlistenProgress = await listen('whisper-progress', (event) => {
          const progressInfo = event.payload as {
            current_seconds: number;
            total_seconds: number;
            percentage: number;
          };
          updateState({
            currentProgress: progressInfo.current_seconds,
            progressPercentage: progressInfo.percentage,
            totalDuration: progressInfo.total_seconds,
          });
        });

        // 监听 whisper 输出
        const unlistenOutput = await listen('whisper-output', (event) => {
          const output = event.payload as string;
          addWhisperOutput(output);
        });

        // 监听 whisper 完成
        const unlistenComplete = await listen('whisper-complete', () => {
          stopTimer();
          updateState({
            isWhisperRunning: false,
            isProcessing: false,
            processResult: '语音识别完成！',
            hasSrtFile: true,
          });
        });

        // 监听 whisper 错误
        const unlistenError = await listen('whisper-error', (event) => {
          const error = event.payload as string;
          console.error('Whisper 错误:', error);
          if (error.includes('失败') || error.includes('错误')) {
            stopTimer();
            updateState({
              isWhisperRunning: false,
              isProcessing: false,
              processResult: `Whisper 错误: ${error}`,
            });
          }
        });

        // 监听 whisper 停止
        const unlistenStopped = await listen('whisper-stopped', () => {
          stopTimer();
          updateState({
            isWhisperRunning: false,
            isProcessing: false,
            processResult: '识别已手动停止',
          });
        });

        unlistenFunctions = [unlistenProgress, unlistenOutput, unlistenComplete, unlistenError, unlistenStopped];
      } catch (error) {
        console.error('设置事件监听器失败:', error);
      }
    };

    setupEventListeners();

    // 清理函数
    return () => {
      unlistenFunctions.forEach(unlisten => unlisten());
      // 清理计时器
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return (
    <ProcessingContext.Provider value={{
      state,
      updateState,
      resetState,
      addWhisperOutput,
      setProcessingFile,
      startTimer,
      stopTimer,
      resetTimer,
    }}>
      {children}
    </ProcessingContext.Provider>
  );
}

export function useProcessing() {
  const context = useContext(ProcessingContext);
  if (context === undefined) {
    throw new Error('useProcessing must be used within a ProcessingProvider');
  }
  return context;
}
