use std::env;
use std::fs;
use std::path::PathBuf;
use tauri::command;

fn get_userdata_dir() -> Result<PathBuf, String> {
    let exe_path = env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path.parent().ok_or("Unable to find exe directory")?;
    let userdata_dir = exe_dir.join("userData");

    if !userdata_dir.exists() {
        fs::create_dir_all(&userdata_dir).map_err(|e| e.to_string())?;
    }
    Ok(userdata_dir)
}

fn get_config_path() -> Result<PathBuf, String> {
    let root = get_userdata_dir()?;
    Ok(root.join("config.json"))
}

fn get_gacha_record_path(uid: &str) -> Result<PathBuf, String> {
    let root = get_userdata_dir()?;
    let gacha_dir = root.join("gachaData");

    if !gacha_dir.exists() {
        fs::create_dir_all(&gacha_dir).map_err(|e| e.to_string())?;
    }

    Ok(gacha_dir.join(format!("{}.json", uid)))
}

#[command]
fn save_config(data: serde_json::Value) -> Result<String, String> {
    let file_path = get_config_path()?;
    let json_string = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(file_path, json_string).map_err(|e| e.to_string())?;
    Ok("Configuration saved successfully".into())
}

#[command]
fn read_config() -> Result<serde_json::Value, String> {
    let file_path = get_config_path()?;

    if !file_path.exists() {
        return Ok(serde_json::json!({}));
    }

    let content = fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(data)
}

#[command]
fn save_gacha_records(uid: String, data: serde_json::Value) -> Result<String, String> {
    if uid.trim().is_empty() {
        return Err("UID cannot be empty".into());
    }

    let file_path = get_gacha_record_path(&uid)?;
    let json_string = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(file_path, json_string).map_err(|e| e.to_string())?;
    Ok(format!("UID {} data saved successfully", uid))
}

#[command]
fn read_gacha_records(uid: String) -> Result<serde_json::Value, String> {
    if uid.trim().is_empty() {
        return Err("UID cannot be empty".into());
    }

    let file_path = get_gacha_record_path(&uid)?;

    if !file_path.exists() {
        return Ok(serde_json::json!([]));
    }

    let content = fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(data)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            save_config,
            read_config,
            save_gacha_records,
            read_gacha_records
        ])
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
