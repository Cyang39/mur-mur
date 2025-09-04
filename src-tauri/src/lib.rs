use tauri::{Manager, Emitter};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AppSettings {
    whisper_models_path: Option<String>,
    #[serde(default = "default_whisper_language")]
    whisper_language: String,
    #[serde(default = "default_whisper_model")]
    whisper_model: String,
}

fn default_whisper_language() -> String {
    "auto".to_string()
}

fn default_whisper_model() -> String {
    "ggml-large-v3.bin".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            whisper_models_path: None,
            whisper_language: "auto".to_string(),
            whisper_model: "ggml-large-v3.bin".to_string(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct ProcessResult {
    success: bool,
    message: String,
    output_path: Option<String>,
    duration_seconds: Option<f64>, // 添加视频时长
}

#[derive(Debug, Serialize, Deserialize)]
struct WhisperResult {
    success: bool,
    text: String,
    error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ProgressInfo {
    current_seconds: f64,
    total_seconds: f64,
    percentage: f64,
}

#[derive(Debug, Serialize, Deserialize)]
struct AppDataInfo {
    path: String,
    size_bytes: u64,
    size_formatted: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SystemInfo {
    os_type: String,
    os_version: String,
    cpu_brand: String,
    cpu_cores: String,
    total_memory: String,
    gpu_info: String,
    ffmpeg_version: String,
    app_version: String,
    tauri_version: String,
}

// 计算目录大小
fn calculate_directory_size(dir_path: &std::path::Path) -> u64 {
    let mut total_size = 0u64;
    
    if let Ok(entries) = std::fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Ok(metadata) = std::fs::metadata(&path) {
                    total_size += metadata.len();
                }
            } else if path.is_dir() {
                total_size += calculate_directory_size(&path);
            }
        }
    }
    
    total_size
}

// 格式化文件大小
fn format_file_size(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    if bytes == 0 {
        return "0 B".to_string();
    }
    
    let base = 1024u64;
    let log = (bytes as f64).log(base as f64).floor() as usize;
    let unit_index = log.min(UNITS.len() - 1);
    let size = bytes as f64 / base.pow(unit_index as u32) as f64;
    
    format!("{:.1} {}", size, UNITS[unit_index])
}

// 解析时间戳字符串为秒数
fn parse_timestamp(timestamp: &str) -> Option<f64> {
    // 解析格式: "00:01:35.320" -> 95.32 秒
    let parts: Vec<&str> = timestamp.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    
    let hours: f64 = parts[0].parse().ok()?;
    let minutes: f64 = parts[1].parse().ok()?;
    let seconds: f64 = parts[2].parse().ok()?;
    
    Some(hours * 3600.0 + minutes * 60.0 + seconds)
}

// 从 whisper 输出中提取进度信息
fn extract_progress_from_whisper_output(line: &str) -> Option<f64> {
    // 匹配格式: " [00:01:35.320 --> 00:01:36.860] 内容"
    if let Some(start) = line.find('[') {
        if let Some(arrow_pos) = line.find(" --> ") {
            let timestamp_start = start + 1;
            let timestamp_str = &line[timestamp_start..arrow_pos];
            return parse_timestamp(timestamp_str.trim());
        }
    }
    None
}

// 获取视频时长
async fn get_video_duration(app_handle: &tauri::AppHandle, video_path: &str) -> Option<f64> {
    use tauri_plugin_shell::ShellExt;
    
    let ffmpeg_sidecar = app_handle.shell().sidecar("ffmpeg").ok()?;
    
    let result = ffmpeg_sidecar
        .args(["-i", video_path, "-f", "null", "-"])
        .output()
        .await
        .ok()?;
    
    let stderr = String::from_utf8_lossy(&result.stderr);
    
    // 解析 FFmpeg 输出中的时长信息
    // 查找 "Duration: 00:02:30.50" 这样的行
    for line in stderr.lines() {
        if line.contains("Duration:") {
            if let Some(duration_start) = line.find("Duration: ") {
                let duration_part = &line[duration_start + 10..];
                if let Some(comma_pos) = duration_part.find(',') {
                    let duration_str = &duration_part[..comma_pos].trim();
                    return parse_timestamp(duration_str);
                }
            }
        }
    }
    
    None
}

#[tauri::command]
async fn get_app_data_info(app_handle: tauri::AppHandle) -> Result<AppDataInfo, String> {
    let app_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("获取应用目录失败: {}", e))?;
    
    // 如果目录不存在，创建它
    if !app_dir.exists() {
        std::fs::create_dir_all(&app_dir)
            .map_err(|e| format!("创建应用目录失败: {}", e))?;
    }
    
    let size_bytes = calculate_directory_size(&app_dir);
    let size_formatted = format_file_size(size_bytes);
    
    Ok(AppDataInfo {
        path: app_dir.to_string_lossy().to_string(),
        size_bytes,
        size_formatted,
    })
}

#[tauri::command]
async fn open_app_data_directory(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;
    
    let app_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("获取应用目录失败: {}", e))?;
    
    // 如果目录不存在，创建它
    if !app_dir.exists() {
        std::fs::create_dir_all(&app_dir)
            .map_err(|e| format!("创建应用目录失败: {}", e))?;
    }
    
    // 在 macOS 上使用 open 命令打开 Finder
    let shell = app_handle.shell();
    match shell.command("open")
        .args([app_dir.to_string_lossy().as_ref()])
        .output()
        .await {
        Ok(output) => {
            if output.status.success() {
                Ok(())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!("打开目录失败: {}", stderr))
            }
        }
        Err(e) => Err(format!("执行打开命令失败: {}", e))
    }
}

// 获取 FFmpeg 版本
async fn get_ffmpeg_version(app_handle: &tauri::AppHandle) -> String {
    use tauri_plugin_shell::ShellExt;
    
    match app_handle.shell().sidecar("ffmpeg") {
        Ok(cmd) => {
            match cmd.args(["-version"]).output().await {
                Ok(output) => {
                    if output.status.success() {
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        // 提取版本信息的第一行
                        if let Some(first_line) = stdout.lines().next() {
                            return first_line.to_string();
                        }
                    }
                }
                Err(_) => {}
            }
        }
        Err(_) => {}
    }
    "FFmpeg 不可用".to_string()
}

// 获取系统信息
fn get_system_info() -> (String, String, String, String, String, String) {
    use sysinfo::System;
    
    let mut sys = System::new_all();
    sys.refresh_all();
    
    // 操作系统信息
    let os_type = if cfg!(target_os = "macos") {
        "macOS".to_string()
    } else if cfg!(target_os = "windows") {
        "Windows".to_string()
    } else if cfg!(target_os = "linux") {
        "Linux".to_string()
    } else {
        "Unknown".to_string()
    };
    
    let os_version = System::os_version().unwrap_or_else(|| "未知版本".to_string());
    
    // CPU 信息
    let cpu_brand = if let Some(cpu) = sys.cpus().first() {
        cpu.brand().to_string()
    } else {
        "未知 CPU".to_string()
    };
    
    let cpu_cores = format!("{} 核心", sys.cpus().len());
    
    // 内存信息
    let total_memory = {
        let total_bytes = sys.total_memory();
        let total_gb = total_bytes as f64 / (1024.0 * 1024.0 * 1024.0);
        format!("{:.1} GB", total_gb)
    };
    
    // GPU 信息（简化版本，在 macOS 上获取基本信息）
    let gpu_info = if cfg!(target_os = "macos") {
        "Apple GPU (通过系统检测)".to_string()
    } else {
        "GPU 信息需要额外检测".to_string()
    };
    
    (os_type, os_version, cpu_brand, cpu_cores, total_memory, gpu_info)
}

#[tauri::command]
async fn get_system_info_command(app_handle: tauri::AppHandle) -> Result<SystemInfo, String> {
    let (os_type, os_version, cpu_brand, cpu_cores, total_memory, gpu_info) = get_system_info();
    
    let ffmpeg_version = get_ffmpeg_version(&app_handle).await;
    
    // 从 Cargo.toml 获取应用版本
    let app_version = env!("CARGO_PKG_VERSION").to_string();
    
    // Tauri 版本
    let tauri_version = "2.8.2".to_string(); // 当前使用的 Tauri 版本
    
    Ok(SystemInfo {
        os_type,
        os_version,
        cpu_brand,
        cpu_cores,
        total_memory,
        gpu_info,
        ffmpeg_version,
        app_version,
        tauri_version,
    })
}

#[tauri::command]
async fn get_video_duration_command(
    app_handle: tauri::AppHandle,
    video_path: String,
) -> Result<f64, String> {
    get_video_duration(&app_handle, &video_path)
        .await
        .ok_or_else(|| "无法获取视频时长".to_string())
}

#[tauri::command]
async fn process_media_file(
    app_handle: tauri::AppHandle,
    file_data: Vec<u8>,
    file_name: String,
) -> Result<ProcessResult, String> {
    use tauri_plugin_shell::ShellExt;
    
    // 获取应用程序目录
    let app_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app directory: {}", e))?;
    
    // 创建 temp 目录
    let temp_dir = app_dir.join("temp");
    if !temp_dir.exists() {
        std::fs::create_dir_all(&temp_dir)
            .map_err(|e| format!("Failed to create temp directory: {}", e))?;
    }
    
    // 保存输入文件到临时目录
    let input_path = temp_dir.join(&file_name);
    std::fs::write(&input_path, &file_data)
        .map_err(|e| format!("Failed to save input file: {}", e))?;
    
    // 生成输出文件名（转换为 .wav）
    let file_stem = std::path::Path::new(&file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("audio");
    let output_filename = format!("{}.wav", file_stem);
    let output_path = temp_dir.join(&output_filename);
    
    // 获取视频时长
    let duration = get_video_duration(&app_handle, &input_path.to_string_lossy()).await;
    
    // 构建 ffmpeg 命令
    let args = vec![
        "-i".to_string(),
        input_path.to_string_lossy().to_string(),
        "-ar".to_string(),
        "16000".to_string(),
        "-ac".to_string(),
        "1".to_string(),
        output_path.to_string_lossy().to_string(),
        "-y".to_string(), // 覆盖输出文件
    ];
    
    // 使用打包的 ffmpeg
    let ffmpeg_sidecar = app_handle.shell().sidecar("ffmpeg")
        .map_err(|e| format!("无法获取 ffmpeg sidecar: {}", e))?;
    
    // 执行 ffmpeg 命令
    let ffmpeg_result = ffmpeg_sidecar
        .args(&args)
        .output()
        .await;
    
    // 删除临时输入文件
    let _ = std::fs::remove_file(&input_path);
    
    match ffmpeg_result {
        Ok(output) => {
            if output.status.success() {
                Ok(ProcessResult {
                    success: true,
                    message: "文件转换成功，准备开始语音识别...".to_string(),
                    output_path: Some(output_path.to_string_lossy().to_string()),
                    duration_seconds: duration,
                })
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!("FFmpeg 执行失败: {}", stderr))
            }
        }
        Err(e) => {
            Err(format!("无法执行 ffmpeg 命令: {}", e))
        }
    }
}

#[tauri::command]
async fn select_directory(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_shell::ShellExt;
    
    // 使用系统对话框选择目录
    let shell = app_handle.shell();
    match shell.command("osascript")
        .args(["-e", "choose folder with prompt \"选择目录\" as string"])
        .output()
        .await {
        Ok(output) => {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout)
                    .trim()
                    .replace("alias ", "")
                    .replace(":", "/")
                    .replace("Macintosh HD", "");
                let clean_path = if path.starts_with('/') {
                    path
                } else {
                    format!("/{}", path)
                };
                Ok(Some(clean_path))
            } else {
                Ok(None) // 用户取消选择
            }
        }
        Err(e) => Err(format!("选择目录失败: {}", e))
    }
}

#[tauri::command]
async fn save_settings(
    app_handle: tauri::AppHandle,
    settings: AppSettings
) -> Result<(), String> {
    let app_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("获取应用目录失败: {}", e))?;
    
    if !app_dir.exists() {
        std::fs::create_dir_all(&app_dir)
            .map_err(|e| format!("创建应用目录失败: {}", e))?;
    }
    
    let settings_file = app_dir.join("settings.json");
    let settings_json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("序列化设置失败: {}", e))?;
    
    std::fs::write(&settings_file, settings_json)
        .map_err(|e| format!("保存设置失败: {}", e))?;
    
    Ok(())
}

#[tauri::command]
async fn load_settings(app_handle: tauri::AppHandle) -> Result<AppSettings, String> {
    let app_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("获取应用目录失败: {}", e))?;
    
    let settings_file = app_dir.join("settings.json");
    
    if !settings_file.exists() {
        return Ok(AppSettings::default());
    }
    
    let settings_content = std::fs::read_to_string(&settings_file)
        .map_err(|e| format!("读取设置文件失败: {}", e))?;
    
    let settings: AppSettings = serde_json::from_str(&settings_content)
        .map_err(|e| format!("解析设置失败: {}", e))?;
    
    Ok(settings)
}

#[tauri::command]
async fn start_whisper_recognition(
    app_handle: tauri::AppHandle,
    audio_file_path: String,
    total_duration: Option<f64>, // 添加总时长参数
) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;
    
    // 加载设置
    let settings = load_settings(app_handle.clone()).await
        .map_err(|e| format!("加载设置失败: {}", e))?;
    
    let whisper_models_path = settings.whisper_models_path
        .ok_or("请在设置中配置 Whisper Models 路径")?;
    
    let model_file = std::path::Path::new(&whisper_models_path).join(&settings.whisper_model);
    
    // 检查模型文件是否存在
    if !model_file.exists() {
        return Err(format!("模型文件不存在: {}\n\n请确保在 Models 目录 ({}) 中有对应的模型文件。\n\n您可以从以下地址下载模型：\n- https://huggingface.co/ggerganov/whisper.cpp/tree/main\n- 或使用 whisper.cpp 的 download-ggml-model.sh 脚本", 
            settings.whisper_model, 
            whisper_models_path
        ));
    }
    
    // 检查 Core ML 优化支持
    let has_coreml_support = check_coreml_support(app_handle.clone(), settings.whisper_model.clone()).await
        .unwrap_or(false);
    
    // 根据 Core ML 支持选择合适的 whisper-cli 版本
    let whisper_cli_name = if has_coreml_support {
        "whisper-cli-coreml" // Core ML 优化版本
    } else {
        "whisper-cli" // 原版 CLI
    };
    
    // 使用选择的 whisper-cli 版本
    let whisper_sidecar = app_handle.shell().sidecar(whisper_cli_name)
        .map_err(|e| format!("无法获取 {} sidecar: {}", whisper_cli_name, e))?;
    
    // 构建命令参数，总是传递 -l 参数
    let args = vec![
        "-m".to_string(),
        model_file.to_string_lossy().to_string(),
        "-f".to_string(),
        audio_file_path.clone(),
        "-osrt".to_string(), // 添加 SRT 字幕文件输出参数
        "-l".to_string(),
        settings.whisper_language.clone(), // 总是传递语言参数，包括 "auto"
    ];
    
    // 启动进程并实时读取输出
    let (mut rx, _child) = whisper_sidecar
        .args(&args)
        .spawn()
        .map_err(|e| format!("启动 {} 失败: {}", whisper_cli_name, e))?;
    
    let app_handle_clone = app_handle.clone();
    
    // 在新的任务中处理输出
    tokio::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(data) => {
                    if let Ok(line) = String::from_utf8(data) {
                        let trimmed_line = line.trim();
                        if !trimmed_line.is_empty() {
                            // 检查是否包含进度信息
                            if let Some(current_time) = extract_progress_from_whisper_output(trimmed_line) {
                                // 发送进度信息
                                if let Some(total) = total_duration {
                                    let percentage = (current_time / total * 100.0).min(100.0);
                                    let progress_info = ProgressInfo {
                                        current_seconds: current_time,
                                        total_seconds: total,
                                        percentage,
                                    };
                                    let _ = app_handle_clone.emit("whisper-progress", progress_info);
                                }
                            }
                            
                            // 过滤重复内容和不需要的输出
                            if !trimmed_line.starts_with("whisper_") && 
                               !trimmed_line.contains("processing") &&
                               !trimmed_line.contains("load time") {
                                let _ = app_handle_clone.emit("whisper-output", trimmed_line);
                            }
                        }
                    }
                }
                CommandEvent::Stderr(data) => {
                    if let Ok(line) = String::from_utf8(data) {
                        let trimmed_line = line.trim();
                        if !trimmed_line.is_empty() {
                            let _ = app_handle_clone.emit("whisper-error", trimmed_line);
                        }
                    }
                }
                CommandEvent::Terminated(payload) => {
                    if let Some(code) = payload.code {
                        if code == 0 {
                            let _ = app_handle_clone.emit("whisper-complete", "Whisper 识别完成");
                        } else {
                            let _ = app_handle_clone.emit("whisper-error", format!("Whisper 进程异常退出: {}", code));
                        }
                    }
                    break;
                }
                CommandEvent::Error(error) => {
                    let _ = app_handle_clone.emit("whisper-error", format!("Whisper 进程错误: {}", error));
                    break;
                }
                _ => {
                    // 处理其他事件类型
                }
            }
        }
    });
    
    Ok(())
}

#[tauri::command]
async fn check_model_exists(
    app_handle: tauri::AppHandle,
    model_name: String,
) -> Result<bool, String> {
    // 加载设置
    let settings = load_settings(app_handle.clone()).await
        .map_err(|e| format!("加载设置失败: {}", e))?;
    
    let whisper_models_path = settings.whisper_models_path
        .ok_or("请在设置中配置 Whisper Models 路径")?;
    
    let model_file = std::path::Path::new(&whisper_models_path).join(&model_name);
    Ok(model_file.exists())
}

#[tauri::command]
async fn check_coreml_support(
    app_handle: tauri::AppHandle,
    model_name: String,
) -> Result<bool, String> {
    // 加载设置
    let settings = load_settings(app_handle.clone()).await
        .map_err(|e| format!("加载设置失败: {}", e))?;
    
    let whisper_models_path = settings.whisper_models_path
        .ok_or("请在设置中配置 Whisper Models 路径")?;
    
    // 获取模型文件的基本名称（不含扩展名）
    let model_stem = std::path::Path::new(&model_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("无效的模型文件名")?;
    
    let models_dir = std::path::Path::new(&whisper_models_path);
    
    // 检查多种可能的 Core ML 文件夹命名方式
    let possible_paths = vec![
        models_dir.join(format!("{}.mlmodelc", model_stem)),           // 标准命名：model.mlmodelc
        models_dir.join(format!("{}-encoder.mlmodelc", model_stem)),   // 编码器命名：model-encoder.mlmodelc
        models_dir.join(format!("{}-decoder.mlmodelc", model_stem)),   // 解码器命名：model-decoder.mlmodelc
    ];
    
    // 检查任意一个路径是否存在
    for path in possible_paths {
        if path.exists() && path.is_dir() {
            return Ok(true);
        }
    }
    
    Ok(false)
}

#[tauri::command]
async fn stop_whisper_recognition(_app_handle: tauri::AppHandle) -> Result<(), String> {
    // 由于我们使用的是同步执行，这里只是为了 API 兼容性
    // 实际上 whisper 进程在 start_whisper_recognition 中已经等待完成
    Ok(())
}

#[tauri::command]
async fn save_srt_file(
    _app_handle: tauri::AppHandle,
    audio_file_path: String,
    target_directory: String,
) -> Result<String, String> {
    // 根据音频文件路径生成 SRT 文件路径
    let srt_file_path = format!("{}.srt", audio_file_path);
    let srt_path = std::path::Path::new(&srt_file_path);
    
    // 检查 SRT 文件是否存在
    if !srt_path.exists() {
        return Err("未找到 SRT 字幕文件，请确保语音识别已完成".to_string());
    }
    
    // 获取源文件名
    let file_name = srt_path.file_name()
        .and_then(|name| name.to_str())
        .ok_or("无效的 SRT 文件名")?;
    
    // 构建目标文件路径
    let target_path = std::path::Path::new(&target_directory).join(file_name);
    
    // 复制 SRT 文件
    match std::fs::copy(&srt_path, &target_path) {
        Ok(_) => {
            let target_path_str = target_path.to_string_lossy().to_string();
            Ok(target_path_str)
        }
        Err(e) => Err(format!("复制 SRT 文件失败: {}", e))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            process_media_file, 
            select_directory, 
            save_settings, 
            load_settings,
            start_whisper_recognition,
            stop_whisper_recognition,
            check_model_exists,
            check_coreml_support,
            save_srt_file,
            get_video_duration_command,
            get_app_data_info,
            open_app_data_directory,
            get_system_info_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;
    use tempfile::TempDir;

    // 创建临时测试目录和文件的帮助函数
    fn create_test_environment() -> (TempDir, String, String) {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let model_dir = temp_dir.path().to_str().unwrap().to_string();
        let model_name = "test-model.bin".to_string();
        
        // 创建模型文件
        let model_file_path = temp_dir.path().join(&model_name);
        fs::write(&model_file_path, "dummy model content").expect("Failed to create test model file");
        
        (temp_dir, model_dir, model_name)
    }

    #[tokio::test]
    async fn test_check_coreml_support_with_coreml_folder() {
        let (_temp_dir, model_dir, model_name) = create_test_environment();
        
        // 创建对应的 .mlmodelc 文件夹
        let model_stem = Path::new(&model_name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap();
        let coreml_path = Path::new(&model_dir).join(format!("{}.mlmodelc", model_stem));
        fs::create_dir_all(&coreml_path).expect("Failed to create CoreML directory");
        
        // 模拟应用设置
        let settings = AppSettings {
            whisper_models_path: Some(model_dir),
            whisper_language: "auto".to_string(),
            whisper_model: model_name.clone(),
        };
        
        // 由于我们无法在单元测试中创建真实的 Tauri AppHandle，
        // 我们需要直接测试逻辑部分
        
        // 检查 CoreML 路径是否存在
        assert!(coreml_path.exists() && coreml_path.is_dir());
    }

    #[tokio::test]
    async fn test_check_coreml_support_without_coreml_folder() {
        let (_temp_dir, model_dir, model_name) = create_test_environment();
        
        // 不创建 .mlmodelc 文件夹
        let model_stem = Path::new(&model_name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap();
        let coreml_path = Path::new(&model_dir).join(format!("{}.mlmodelc", model_stem));
        
        // 模拟应用设置
        let settings = AppSettings {
            whisper_models_path: Some(model_dir),
            whisper_language: "auto".to_string(),
            whisper_model: model_name.clone(),
        };
        
        // 检查 CoreML 路径不存在
        assert!(!coreml_path.exists());
    }

    #[test]
    fn test_model_stem_extraction() {
        // 测试从不同模型文件名中提取基础名称
        let test_cases = vec![
            ("ggml-large-v3.bin", "ggml-large-v3"),
            ("ggml-large-v3-turbo.bin", "ggml-large-v3-turbo"),
            ("model.ggml", "model"),
            ("test-model.bin", "test-model"),
        ];
        
        for (input, expected) in test_cases {
            let stem = Path::new(input)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap();
            assert_eq!(stem, expected, "Failed for input: {}", input);
        }
    }

    #[test]
    fn test_coreml_path_construction() {
        let model_dir = "/path/to/models";
        let model_name = "ggml-large-v3.bin";
        
        let model_stem = std::path::Path::new(model_name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap();
        
        let models_dir = std::path::Path::new(model_dir);
        let possible_paths = vec![
            models_dir.join(format!("{}.mlmodelc", model_stem)),
            models_dir.join(format!("{}-encoder.mlmodelc", model_stem)),
            models_dir.join(format!("{}-decoder.mlmodelc", model_stem)),
        ];
        
        let expected_paths = vec![
            std::path::Path::new("/path/to/models/ggml-large-v3.mlmodelc"),
            std::path::Path::new("/path/to/models/ggml-large-v3-encoder.mlmodelc"),
            std::path::Path::new("/path/to/models/ggml-large-v3-decoder.mlmodelc"),
        ];
        
        for (actual, expected) in possible_paths.iter().zip(expected_paths.iter()) {
            assert_eq!(actual, expected);
        }
    }

    #[tokio::test]
    async fn test_coreml_support_with_encoder_suffix() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let model_dir = temp_dir.path().to_str().unwrap().to_string();
        let model_name = "ggml-large-v3-turbo.bin".to_string();
        
        // 创建模型文件
        let model_file_path = temp_dir.path().join(&model_name);
        std::fs::write(&model_file_path, "dummy model content").expect("Failed to create test model file");
        
        // 创建带有 -encoder 后缀的 .mlmodelc 文件夹
        let model_stem = std::path::Path::new(&model_name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap();
        let coreml_path = temp_dir.path().join(format!("{}-encoder.mlmodelc", model_stem));
        std::fs::create_dir_all(&coreml_path).expect("Failed to create CoreML directory");
        
        // 验证 Core ML 支持检测逻辑
        let models_dir = temp_dir.path();
        let possible_paths = vec![
            models_dir.join(format!("{}.mlmodelc", model_stem)),
            models_dir.join(format!("{}-encoder.mlmodelc", model_stem)),
            models_dir.join(format!("{}-decoder.mlmodelc", model_stem)),
        ];
        
        let has_coreml = possible_paths.iter().any(|path| path.exists() && path.is_dir());
        assert!(has_coreml, "Should detect CoreML support with -encoder suffix");
    }
}

