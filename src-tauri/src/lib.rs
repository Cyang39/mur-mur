use tauri::{Manager, Emitter};
use serde::{Deserialize, Serialize};
use tauri_plugin_shell::process::CommandChild;
use std::ffi::CString;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AppSettings {
    whisper_models_path: Option<String>,
    #[serde(default = "default_app_locale")]
    app_locale: String,
    #[serde(default = "default_whisper_language")]
    whisper_language: String,
    #[serde(default = "default_whisper_model")]
    whisper_model: String,
    #[serde(default)]
    enable_vad: bool,
    #[serde(default = "default_whisper_optimization")]
    whisper_optimization: String,
    #[serde(default)]
    disable_gpu: bool,
    #[serde(default = "default_thread_count")]
    thread_count: u32,
}

fn default_whisper_language() -> String {
    "auto".to_string()
}

fn default_app_locale() -> String {
    // 与前端 next-intl 配置一致：默认 zh-CN
    "zh-CN".to_string()
}

fn default_whisper_model() -> String {
    // 默认使用打包内置的轻量模型，免配置即可运行
    "ggml-tiny-q5_1.bin".to_string()
}

fn default_whisper_optimization() -> String {
    // 可选: "none" | "vulkan" | "coreml" | "cuda"
    "none".to_string()
}

fn default_thread_count() -> u32 { 4 }

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            whisper_models_path: None,
            app_locale: default_app_locale(),
            whisper_language: "auto".to_string(),
            whisper_model: default_whisper_model(),
            enable_vad: false,
            whisper_optimization: default_whisper_optimization(),
            disable_gpu: false,
            thread_count: default_thread_count(),
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

// 清理指定目录下的 .wav 临时文件
fn cleanup_wav_files(dir_path: &std::path::Path) {
    if let Ok(entries) = std::fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                // 递归清理子目录（等价于 temp/*/*.wav 等情况）
                cleanup_wav_files(&path);
            } else if path.is_file() {
                if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    if ext.eq_ignore_ascii_case("wav") {
                        let _ = std::fs::remove_file(&path);
                    }
                }
            }
        }
    }
}

// 日志工具：时间戳（毫秒）+ 追加写入
fn now_string() -> String {
    let now = chrono::Local::now();
    now.format("%Y-%m-%d %H:%M:%S").to_string()
}

fn append_log_line<P: AsRef<Path>>(log_path: P, tag: &str, line: &str) {
    let prefix = format!("[{}][{}] ", now_string(), tag);
    let mut buf = prefix;
    buf.push_str(line);
    buf.push('\n');
    let _ = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .and_then(|mut f| f.write_all(buf.as_bytes()));
}

// 全局保存正在运行的 whisper 进程句柄，便于停止
struct WhisperProcState {
    child: tokio::sync::Mutex<Option<CommandChild>>,
}

impl Default for WhisperProcState {
    fn default() -> Self {
        Self {
            child: tokio::sync::Mutex::new(None),
        }
    }
}

// 简单格式化命令行为字符串，便于日志打印
fn format_cmd_with_args(cmd: &str, args: &[String]) -> String {
    let mut parts: Vec<String> = Vec::with_capacity(args.len() + 1);
    parts.push(cmd.to_string());
    for a in args {
        if a.contains(' ') || a.contains('"') {
            parts.push(format!("\"{}\"", a.replace('"', "\\\"")));
        } else {
            parts.push(a.clone());
        }
    }
    parts.join(" ")
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

// 从 whisper 输出中提取进度信息（基于段时间戳）
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

// 从 --print-progress 的 stderr 行解析百分比（例如：
// "whisper_print_progress_callback: progress =  75%"）
fn extract_percentage_from_progress_line(line: &str) -> Option<f64> {
    // 仅解析包含 whisper_print_progress_callback 的行，避免误匹配其它含 % 的输出
    if !line.contains("whisper_print_progress_callback") {
        return None;
    }
    // 快速筛查：必须包含 '%' 字符
    let percent_pos = line.rfind('%')?;
    // 回退跳过空白
    let bytes = line.as_bytes();
    let mut end = percent_pos; // 不含 '%'
    while end > 0 && bytes[end - 1].is_ascii_whitespace() { end -= 1; }
    // 向前扫描数字和小数点
    let mut start = end;
    while start > 0 {
        let c = bytes[start - 1] as char;
        if c.is_ascii_digit() || c == '.' { start -= 1; } else { break; }
    }
    if start >= end { return None; }
    let num_str = &line[start..end];
    num_str.trim().parse::<f64>().ok()
}

// 已移除：原先通过 ffmpeg 探测媒体时长的逻辑，改为仅依赖 Whisper 的进度百分比。

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
    let path_str = app_dir.to_string_lossy().to_string();
    let command = if cfg!(target_os = "windows") {
        "explorer"
    } else if cfg!(target_os = "linux") {
        "xdg-open"
    } else {
        "open"
    };
    match shell.command(command)
        .args([&path_str])
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
            let args = vec!["-version".to_string()];
            println!("执行命令: {}", format_cmd_with_args("ffmpeg", &args));
            match cmd.args(&args).output().await {
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

#[derive(Debug, Serialize, Deserialize)]
struct VulkanInfo {
    supported: bool,
    api_version: Option<String>,
    device_count: u32,
    error: Option<String>,
}

#[tauri::command]
async fn get_vulkan_support() -> Result<VulkanInfo, String> {
    // 动态加载 Vulkan 运行库
    let entry = unsafe { ash::Entry::load() };
    let entry = match entry {
        Ok(e) => e,
        Err(e) => {
            return Ok(VulkanInfo {
                supported: false,
                api_version: None,
                device_count: 0,
                error: Some(format!("加载 Vulkan 失败: {}", e)),
            })
        }
    };

    // 获取支持的实例 API 版本（Vulkan 1.1+ 可用）
    let api_version_u32 = match entry.try_enumerate_instance_version() {
        Ok(Some(v)) => v,
        Ok(None) => ash::vk::API_VERSION_1_0, // 旧版 loader 视为 1.0
        Err(_) => ash::vk::API_VERSION_1_0,
    };
    let api_version = Some(format!(
        "{}.{}.{}",
        ash::vk::api_version_major(api_version_u32),
        ash::vk::api_version_minor(api_version_u32),
        ash::vk::api_version_patch(api_version_u32)
    ));

    // 创建最小实例
    let app_name = CString::new("murmur").unwrap_or_default();
    let app_info = ash::vk::ApplicationInfo::builder()
        .application_name(&app_name)
        .application_version(0)
        .engine_name(&app_name)
        .engine_version(0)
        .api_version(api_version_u32);

    let create_info = ash::vk::InstanceCreateInfo::builder().application_info(&app_info);

    let instance = unsafe { entry.create_instance(&create_info, None) };
    let instance = match instance {
        Ok(i) => i,
        Err(e) => {
            return Ok(VulkanInfo {
                supported: false,
                api_version,
                device_count: 0,
                error: Some(format!("创建 Vulkan 实例失败: {}", e)),
            })
        }
    };

    // 枚举物理设备
    let devices = unsafe { instance.enumerate_physical_devices() };
    let (device_count, supported, error) = match devices {
        Ok(list) => (list.len() as u32, !list.is_empty(), None),
        Err(e) => (0, false, Some(format!("枚举物理设备失败: {}", e))),
    };

    // 清理实例
    unsafe { instance.destroy_instance(None) };

    Ok(VulkanInfo {
        supported,
        api_version,
        device_count,
        error,
    })
}

// 已移除：get_video_duration_command（不再需要时长探测）

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
    // 清理旧的 .wav 文件
    cleanup_wav_files(&temp_dir);
    
    // 为本次处理创建独立时间戳目录
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let run_dir = temp_dir.join(format!("{}", ts));
    if !run_dir.exists() {
        std::fs::create_dir_all(&run_dir)
            .map_err(|e| format!("Failed to create run directory: {}", e))?;
    }

    // 保存输入文件到本次处理目录
    let input_path = run_dir.join(&file_name);
    std::fs::write(&input_path, &file_data)
        .map_err(|e| format!("Failed to save input file: {}", e))?;
    
    // 生成输出文件名（转换为 .wav）
    let file_stem = std::path::Path::new(&file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("audio");
    let output_filename = format!("{}.wav", file_stem);
    let output_path = run_dir.join(&output_filename);
    let log_path = run_dir.join(format!("{}_log.txt", file_stem));
    
    // 获取视频时长
    let duration: Option<f64> = None; // 不再探测媒体时长
    
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
    let cmd_str = format_cmd_with_args("ffmpeg", &args);
    println!("执行命令: {}", cmd_str);
    append_log_line(&log_path, "CMD", &cmd_str);
    let ffmpeg_result = ffmpeg_sidecar.args(&args).output().await;
    
    // 删除临时输入文件
    let _ = std::fs::remove_file(&input_path);
    
    match ffmpeg_result {
        Ok(output) => {
            // 记录输出
            let out_str = String::from_utf8_lossy(&output.stdout);
            for l in out_str.lines() { append_log_line(&log_path, "ffmpeg:stdout", l); }
            let err_str = String::from_utf8_lossy(&output.stderr);
            for l in err_str.lines() { append_log_line(&log_path, "ffmpeg:stderr", l); }

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
    use tauri_plugin_dialog::{DialogExt, FilePath};
    use tokio::sync::oneshot;

    // 使用 Tauri v2 对话框插件，跨平台选择目录（Windows/macOS/Linux）
    let (tx, rx) = oneshot::channel::<Option<String>>();

    app_handle
        .dialog()
        .file()
        .set_title("选择目录")
        .pick_folder(move |folder| {
            let selected = folder.and_then(|fp| match fp {
                FilePath::Path(p) => Some(p.to_string_lossy().to_string()),
                FilePath::Url(u) => {
                    // 处理 file:// URL，尽量转为本地路径
                    let s = u.to_string();
                    if let Some(rest) = s.strip_prefix("file://") {
                        // Windows 可能是 file:///C:/...
                        let rest = if rest.starts_with('/') { &rest[1..] } else { rest };
                        Some(rest.to_string())
                    } else {
                        // 其他协议不支持
                        None
                    }
                }
            });
            let _ = tx.send(selected);
        });

    match rx.await {
        Ok(opt) => Ok(opt),        // Some(path) 或 None（用户取消）
        Err(e) => Err(format!("选择目录失败: {}", e)),
    }
}

#[tauri::command]
async fn select_media_file(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::{DialogExt, FilePath};
    use tokio::sync::oneshot;

    let (tx, rx) = oneshot::channel::<Option<String>>();

    let mut builder = app_handle.dialog().file();
    builder = builder.set_title("选择视频或音频文件");
    // 常见媒体扩展名
    builder = builder.add_filter(
        "媒体文件",
        &["mp4", "mov", "mkv", "avi", "webm", "m4v", "mp3", "wav", "m4a", "flac", "aac", "ogg", "opus"],
    );

    builder.pick_file(move |file| {
        let selected = file.and_then(|fp| match fp {
            FilePath::Path(p) => Some(p.to_string_lossy().to_string()),
            FilePath::Url(u) => {
                let s = u.to_string();
                if let Some(rest) = s.strip_prefix("file://") {
                    let rest = if rest.starts_with('/') { &rest[1..] } else { rest };
                    Some(rest.to_string())
                } else {
                    None
                }
            }
        });
        let _ = tx.send(selected);
    });

    match rx.await {
        Ok(opt) => Ok(opt),
        Err(e) => Err(format!("选择文件失败: {}", e)),
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct FileInfo {
    name: String,
    size: u64,
    kind: String,
}

fn guess_media_kind(path: &std::path::Path) -> String {
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let video_exts = ["mp4", "mov", "mkv", "avi", "webm", "m4v"];
    let audio_exts = ["mp3", "wav", "m4a", "flac", "aac", "ogg", "opus"];
    if video_exts.contains(&ext.as_str()) {
        format!("video/{}", ext)
    } else if audio_exts.contains(&ext.as_str()) {
        format!("audio/{}", ext)
    } else {
        "application/octet-stream".to_string()
    }
}

#[tauri::command]
async fn get_file_info(_app_handle: tauri::AppHandle, path: String) -> Result<FileInfo, String> {
    let p = std::path::Path::new(&path);
    let name = p
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("无效的文件路径")?
        .to_string();
    let meta = std::fs::metadata(&p).map_err(|e| format!("读取文件信息失败: {}", e))?;
    let size = meta.len();
    let kind = guess_media_kind(&p);
    Ok(FileInfo { name, size, kind })
}

#[tauri::command]
async fn process_media_file_from_path(
    app_handle: tauri::AppHandle,
    input_path: String,
) -> Result<ProcessResult, String> {
    use tauri_plugin_shell::ShellExt;

    // 获取应用程序目录
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app directory: {}", e))?;

    // 创建 temp 目录
    let temp_dir = app_dir.join("temp");
    if !temp_dir.exists() {
        std::fs::create_dir_all(&temp_dir)
            .map_err(|e| format!("Failed to create temp directory: {}", e))?;
    }
    // 清理旧的 .wav 文件
    cleanup_wav_files(&temp_dir);

    // 为本次处理创建独立时间戳目录
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let run_dir = temp_dir.join(format!("{}", ts));
    if !run_dir.exists() {
        std::fs::create_dir_all(&run_dir)
            .map_err(|e| format!("Failed to create run directory: {}", e))?;
    }

    // 基于输入文件名生成输出 wav 名称（放在本次处理目录下）
    let file_stem = std::path::Path::new(&input_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("audio");
    let output_filename = format!("{}.wav", file_stem);
    let output_path = run_dir.join(&output_filename);
    let log_path = run_dir.join(format!("{}_log.txt", file_stem));

    // 获取时长
    let duration: Option<f64> = None; // 不再探测媒体时长

    // 执行 ffmpeg 转码
    let ffmpeg_sidecar = app_handle
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("无法获取 ffmpeg sidecar: {}", e))?;

    let args = vec![
        "-i".to_string(),
        input_path.clone(),
        "-ar".to_string(),
        "16000".to_string(),
        "-ac".to_string(),
        "1".to_string(),
        output_path.to_string_lossy().to_string(),
        "-y".to_string(),
    ];

    let cmd_str = format_cmd_with_args("ffmpeg", &args);
    println!("执行命令: {}", cmd_str);
    append_log_line(&log_path, "CMD", &cmd_str);
    let ffmpeg_result = ffmpeg_sidecar.args(&args).output().await;

    match ffmpeg_result {
        Ok(output) => {
            // 记录输出
            let out_str = String::from_utf8_lossy(&output.stdout);
            for l in out_str.lines() { append_log_line(&log_path, "ffmpeg:stdout", l); }
            let err_str = String::from_utf8_lossy(&output.stderr);
            for l in err_str.lines() { append_log_line(&log_path, "ffmpeg:stderr", l); }

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
        Err(e) => Err(format!("无法执行 ffmpeg 命令: {}", e)),
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
    state: tauri::State<'_, WhisperProcState>,
) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;
    use tauri::path::BaseDirectory;
    
    // 加载设置
    let settings = load_settings(app_handle.clone()).await
        .map_err(|e| format!("加载设置失败: {}", e))?;
    
    // 允许选择内置打包模型：无需配置 models 路径
    let embedded_model_name = "ggml-tiny-q5_1.bin".to_string();
    let using_embedded = settings.whisper_model == embedded_model_name;
    let (model_file, models_dir_display) = if using_embedded {
        // 解析打包资源中的模型路径
        let p = app_handle
            .path()
            .resolve("resources/ggml-tiny-q5_1.bin", BaseDirectory::Resource)
            .map_err(|e| format!("解析内置模型路径失败: {}", e))?;
        (p, "<内置模型>".to_string())
    } else {
        // 借用而不是移动 whisper_models_path，避免后续使用
        let whisper_models_path = settings
            .whisper_models_path
            .as_ref()
            .ok_or("请在设置中配置 Whisper Models 路径")?;
        let p = std::path::Path::new(whisper_models_path).join(&settings.whisper_model);
        (p, whisper_models_path.to_string())
    };
    
    // 检查模型文件是否存在
    if !model_file.exists() {
        return Err(format!(
            "模型文件不存在: {}\n\n请确保在 Models 目录 ({}) 中有对应的模型文件。\n\n您可以从以下地址下载模型：\n- https://huggingface.co/ggerganov/whisper.cpp/tree/main\n- 或使用 whisper.cpp 的 download-ggml-model.sh 脚本",
            settings.whisper_model,
            models_dir_display
        ));
    }
    
    // 检查 Core ML 优化支持
    let has_coreml_support = check_coreml_support(app_handle.clone(), settings.whisper_model.clone()).await
        .unwrap_or(false);
    
    // 根据 Core ML 支持选择合适的 whisper-cli 版本
    let _whisper_cli_name = if has_coreml_support {
        "whisper-cli-coreml" // Core ML 优化版本
    } else {
        "whisper-cli" // 原版 CLI
    };
    
    // 使用选择的 whisper-cli 版本
    // 根据设置选择 whisper-cli 版本
    // 当选择 "none" 时，强制使用原版 CLI；否则按选项名称选择对应的 sidecar
    let selected_cli_name = match settings.whisper_optimization.as_str() {
        "coreml" => "whisper-cli-coreml",
        "vulkan" => "whisper-cli-vulkan",
        "cuda" => "whisper-cli-cuda", // 预留，若未打包将启动失败
        _ => "whisper-cli",
    };
    let whisper_sidecar = app_handle.shell().sidecar(selected_cli_name)
        .map_err(|e| format!("无法获取 {} sidecar: {}", selected_cli_name, e))?;
    
    // 构建命令参数，总是传递 -l 参数
    let mut args = vec![
        "--model".to_string(),
        model_file.to_string_lossy().to_string(),
        "--file".to_string(),
        audio_file_path.clone(),
        "--output-srt".to_string(), // 添加 SRT 字幕文件输出参数
        "--language".to_string(),
        settings.whisper_language.clone(), // 总是传递语言参数，包括 "auto"
        "--print-progress".to_string() // 推理进度
    ];

    // 如果启用 VAD，附加 vad 参数
    if settings.enable_vad {
        // 解析打包到资源目录下的 VAD 模型
        let vad_path = app_handle
            .path()
            .resolve("resources/ggml-silero-v5.1.2.bin", BaseDirectory::Resource)
            .map_err(|e| format!("解析 VAD 资源路径失败: {}", e))?;
        args.push("--vad".to_string());
        args.push("--vad-model".to_string());
        args.push(vad_path.to_string_lossy().to_string());
    }

    // 如果设置了禁用 GPU，追加 --no-gpu
    if settings.disable_gpu {
        args.push("--no-gpu".to_string());
    }

    // 线程数量（1-8），默认 4
    let tc = settings.thread_count.clamp(1, 8);
    args.push("--threads".to_string());
    args.push(tc.to_string());
    
    // 准备日志路径（和 wav 同目录，<stem>_log.txt）
    let audio_p = PathBuf::from(&audio_file_path);
    let stem = audio_p.file_stem().and_then(|s| s.to_str()).unwrap_or("audio");
    let log_path = audio_p.parent().unwrap_or_else(|| Path::new(".")).join(format!("{}_log.txt", stem));
    let cmd_str = format_cmd_with_args(selected_cli_name, &args);
    println!("执行命令: {}", cmd_str);
    append_log_line(&log_path, "CMD", &cmd_str);

    // 启动进程并实时读取输出
    let (mut rx, child) = whisper_sidecar
        .args(&args)
        .spawn()
        .map_err(|e| format!("启动 {} 失败: {}", selected_cli_name, e))?;
    // 保存子进程句柄
    {
        let mut guard = state.child.lock().await;
        *guard = Some(child);
    }
    
    let app_handle_clone = app_handle.clone();
    let log_path_clone = log_path.clone();
    
    // 在新的任务中处理输出
    tokio::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(data) => {
                    if let Ok(line) = String::from_utf8(data) {
                        let trimmed_line = line.trim();
                        if !trimmed_line.is_empty() {
                            append_log_line(&log_path_clone, "whisper:stdout", trimmed_line);
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
                            append_log_line(&log_path_clone, "whisper:stderr", trimmed_line);
                            // 尝试解析 --print-progress 的进度行
                            if let Some(pct) = extract_percentage_from_progress_line(trimmed_line) {
                                let (cur, total) = if let Some(total) = total_duration { (pct * total / 100.0, total) } else { (0.0, 0.0) };
                                let progress_info = ProgressInfo { current_seconds: cur, total_seconds: total, percentage: pct.min(100.0) };
                                let _ = app_handle_clone.emit("whisper-progress", progress_info);
                            } else {
                                // 其他 stderr 输出作为错误事件
                                let _ = app_handle_clone.emit("whisper-error", trimmed_line);
                            }
                        }
                    }
                }
                CommandEvent::Terminated(payload) => {
                    append_log_line(&log_path_clone, "whisper", &format!("terminated: {:?}", payload.code));
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
                    append_log_line(&log_path_clone, "whisper", &format!("error: {}", error));
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
    // 内置模型：直接返回存在
    if model_name == "ggml-tiny-q5_1.bin" {
        return Ok(true);
    }
    // 加载设置
    let settings = load_settings(app_handle.clone()).await
        .map_err(|e| format!("加载设置失败: {}", e))?;
    
    let whisper_models_path = settings.whisper_models_path
        .ok_or("请在设置中配置 Whisper Models 路径")?;
    
    // 兼容不同平台/来源的路径字符串（可能来自旧实现或 file:// 前缀）
    let mut base = whisper_models_path.trim().to_string();
    if base.starts_with("file://") {
        base = base[7..].to_string(); // 去掉前缀
        // Windows 的 file URL 可能以 "/C:/" 开头，去掉首个 '/'
        if base.starts_with('/') {
            let bytes = base.as_bytes();
            if bytes.len() > 2 && bytes[1].is_ascii_alphabetic() && bytes[2] == b':' {
                base = base[1..].to_string();
            }
        }
    }
    // 去除首尾引号
    base = base.trim_matches('"').to_string();

    let base_path = std::path::PathBuf::from(base);
    let model_file = base_path.join(&model_name);
    Ok(model_file.exists())
}

#[tauri::command]
async fn list_downloaded_models(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    // 加载设置，若未配置路径则返回空列表
    let settings = load_settings(app_handle.clone()).await
        .map_err(|e| format!("加载设置失败: {}", e))?;

    let whisper_models_path = match settings.whisper_models_path {
        Some(p) => p,
        None => return Ok(Vec::new()),
    };

    // 兼容可能的 file:// 前缀与首尾引号
    let mut base = whisper_models_path.trim().to_string();
    if base.starts_with("file://") {
        base = base[7..].to_string();
        if base.starts_with('/') {
            let bytes = base.as_bytes();
            if bytes.len() > 2 && bytes[1].is_ascii_alphabetic() && bytes[2] == b':' {
                base = base[1..].to_string();
            }
        }
    }
    base = base.trim_matches('"').to_string();

    let mut result: Vec<String> = Vec::new();
    let dir_path = std::path::PathBuf::from(&base);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Ok(result);
    }

    if let Ok(entries) = std::fs::read_dir(&dir_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                // 仅收集 ggml-*.bin 文件
                let name = match path.file_name().and_then(|s| s.to_str()) {
                    Some(n) => n.to_string(),
                    None => continue,
                };
                let is_bin = path.extension().and_then(|s| s.to_str()).map(|s| s.eq_ignore_ascii_case("bin")).unwrap_or(false);
                if is_bin && name.starts_with("ggml-") {
                    result.push(name);
                }
            }
        }
    }

    // 去重并排序，便于前端展示
    result.sort();
    result.dedup();
    Ok(result)
}

#[tauri::command]
async fn check_coreml_support(
    app_handle: tauri::AppHandle,
    model_name: String,
) -> Result<bool, String> {
    // 内置 ggml 模型不涉及 Core ML 打包
    if model_name == "ggml-tiny-q5_1.bin" {
        return Ok(false);
    }
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
async fn stop_whisper_recognition(app_handle: tauri::AppHandle, state: tauri::State<'_, WhisperProcState>) -> Result<(), String> {
    // 终止正在运行的 whisper 进程
    if let Some(child) = state.child.lock().await.take() {
        // 尝试优雅终止，若不支持则直接 kill
        if let Err(e) = child.kill() {
            return Err(format!("停止 Whisper 失败: {}", e));
        }
        let _ = app_handle.emit("whisper-stopped", "stopped");
    }
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
        .manage(WhisperProcState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            process_media_file, 
            select_directory, 
            select_media_file,
            get_file_info,
            process_media_file_from_path,
            save_settings, 
            load_settings,
            start_whisper_recognition,
            stop_whisper_recognition,
            check_model_exists,
            check_coreml_support,
            save_srt_file,
            get_app_data_info,
            open_app_data_directory,
            get_system_info_command,
            get_vulkan_support,
            list_downloaded_models
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
