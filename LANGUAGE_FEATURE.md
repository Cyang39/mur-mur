# Whisper 语言参数优化功能

## 功能概述

现在用户可以通过界面选择 Whisper 语音识别的目标语言，实现了更灵活的语音识别配置。

## 实现的改进

### 1. 后端改进（Rust）

- **设置结构扩展**：在 `AppSettings` 中添加了 `whisper_language` 字段
- **动态参数构建**：修改了 `start_whisper_recognition` 函数，根据用户选择动态构建命令参数
- **智能参数传递**：只有当语言不是 "auto" 时才传递 `-l` 参数给 whisper-cli

### 2. 前端改进（React + TypeScript）

- **语言选择组件**：在设置页面添加了语言选择下拉菜单
- **多语言支持**：提供了 10 种常用语言选项，包括自动检测
- **用户友好界面**：每个选项都有中英文标识，便于用户理解

## 支持的语言

- 🔄 自动检测 (Auto) - 默认选项，不传递 `-l` 参数
- 🇨🇳 中文 (Chinese) - zh
- 🇺🇸 英文 (English) - en  
- 🇯🇵 日文 (Japanese) - ja
- 🇰🇷 韩文 (Korean) - ko
- 🇫🇷 法文 (French) - fr
- 🇩🇪 德文 (German) - de
- 🇪🇸 西班牙文 (Spanish) - es
- 🇷🇺 俄文 (Russian) - ru
- 🇸🇦 阿拉伯文 (Arabic) - ar

## 使用方法

1. 打开应用程序并进入 **Settings**（设置）页面
2. 在 "🌍 语音识别语言" 部分选择所需的语言
3. 点击 "💾 保存设置" 按钮保存配置
4. 现在进行语音识别时将使用选定的语言设置

## 技术实现细节

### 命令参数逻辑

```rust
// 构建命令参数，根据语言设置决定是否添加 -l 参数
let mut args = vec![
    "-m".to_string(),
    model_file.to_string_lossy().to_string(),
    "-f".to_string(),
    audio_file_path,
];

// 只有当语言不是 "auto" 时才添加 -l 参数
if settings.whisper_language != "auto" {
    args.push("-l".to_string());
    args.push(settings.whisper_language);
}
```

### 前端状态管理

```typescript
const [settings, setSettings] = useState({
    whisper_models_path: null as string | null,
    whisper_language: 'auto' as string,
});
```

## 优势

1. **提高识别准确度**：针对特定语言进行识别可以提高准确率
2. **减少识别时间**：避免自动语言检测的开销
3. **用户友好**：简单直观的界面设计
4. **向后兼容**：保持了原有功能的完整性
5. **智能默认**：默认使用自动检测，适合大多数用户

## 注意事项

- 选择 "自动检测" 时，Whisper 会自动识别语言，但可能需要更长时间
- 选择具体语言时，如果音频中包含其他语言，识别效果可能会下降
- 设置会自动保存并在下次启动时恢复
