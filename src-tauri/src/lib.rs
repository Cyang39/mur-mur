use tauri::Manager;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct ProcessResult {
    success: bool,
    message: String,
    output_path: Option<String>,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
    
    // 执行 ffmpeg 命令
    let shell = app_handle.shell();
    match shell.command("ffmpeg")
        .args(&args)
        .output()
        .await {
        Ok(output) => {
            // 删除临时输入文件
            let _ = std::fs::remove_file(&input_path);
            
            if output.status.success() {
                Ok(ProcessResult {
                    success: true,
                    message: "文件转换成功！".to_string(),
                    output_path: Some(output_path.to_string_lossy().to_string()),
                })
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!("FFmpeg 执行失败: {}", stderr))
            }
        }
        Err(e) => {
            // 删除临时输入文件
            let _ = std::fs::remove_file(&input_path);
            Err(format!("无法执行 ffmpeg 命令，请确保已安装 ffmpeg 并添加到 PATH 环境变量: {}", e))
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet, process_media_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
