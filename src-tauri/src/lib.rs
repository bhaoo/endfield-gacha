use tauri::command;
use std::fs;
use std::env;
use std::path::PathBuf;

fn get_data_file_path() -> Result<PathBuf, String> {
    let exe_path = env::current_exe().map_err(|e: std::io::Error| e.to_string())?;
    let exe_dir = exe_path.parent().ok_or("无法找到 exe 目录")?;
    let userdata_dir = exe_dir.join("userData");

    if !userdata_dir.exists() {
        fs::create_dir_all(&userdata_dir).map_err(|e: std::io::Error| e.to_string())?;
    }

    Ok(userdata_dir.join("gacha_records.json"))
}

#[command]
fn save_json_to_userdata(data: serde_json::Value) -> Result<String, String> {
    let file_path = get_data_file_path()?;
    let json_string = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(file_path, json_string).map_err(|e: std::io::Error| e.to_string())?;
    Ok("保存成功".into())
}

#[command]
fn read_json_from_userdata() -> Result<serde_json::Value, String> {
    let file_path = get_data_file_path()?;
    
    if !file_path.exists() {
        return Ok(serde_json::json!({}));
    }

    let content = fs::read_to_string(file_path).map_err(|e: std::io::Error| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(data)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![save_json_to_userdata, read_json_from_userdata])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
