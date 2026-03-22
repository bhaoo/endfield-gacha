use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::{thread, time::Duration};
use tauri::command;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

#[cfg(target_os = "linux")]
const APP_IDENTIFIER: &str = "com.bhao.endfieldgacha";

static USERDATA_DIR: OnceLock<PathBuf> = OnceLock::new();

fn get_userdata_dir() -> Result<PathBuf, String> {
    if let Some(dir) = USERDATA_DIR.get() {
        return Ok(dir.clone());
    }
    get_userdata_dir_fallback()
}

#[cfg(target_os = "linux")]
fn get_userdata_dir_fallback() -> Result<PathBuf, String> {
    let data_home = if let Some(path) = env::var_os("XDG_DATA_HOME") {
        PathBuf::from(path)
    } else if let Some(home) = env::var_os("HOME") {
        PathBuf::from(home).join(".local").join("share")
    } else {
        return Err("Unable to resolve data directory (XDG_DATA_HOME/HOME not set)".to_string());
    };

    let userdata_dir = data_home.join(APP_IDENTIFIER).join("userData");

    if !userdata_dir.exists() {
        fs::create_dir_all(&userdata_dir).map_err(|e| e.to_string())?;
    }
    Ok(userdata_dir)
}

#[cfg(target_os = "macos")]
fn get_userdata_dir_fallback() -> Result<PathBuf, String> {
    Err("userData dir not initialized (expected to be set in Tauri setup on macOS)".into())
}

#[cfg(all(not(target_os = "linux"), not(target_os = "macos")))]
fn get_userdata_dir_fallback() -> Result<PathBuf, String> {
    let exe_path = env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path.parent().ok_or("Unable to find exe directory")?;
    let userdata_dir = exe_dir.join("userData");

    if !userdata_dir.exists() {
        fs::create_dir_all(&userdata_dir).map_err(|e| e.to_string())?;
    }
    Ok(userdata_dir)
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn init_userdata_dir(app: &AppHandle) -> Result<(), String> {
    if USERDATA_DIR.get().is_some() {
        return Ok(());
    }

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let userdata_dir = app_data_dir.join("userData");

    if !userdata_dir.exists() {
        fs::create_dir_all(&userdata_dir).map_err(|e| e.to_string())?;
    }

    USERDATA_DIR
        .set(userdata_dir)
        .map_err(|_| "Unable to set userData directory".to_string())?;
    Ok(())
}

fn get_config_path() -> Result<PathBuf, String> {
    let root = get_userdata_dir()?;
    Ok(root.join("config.json"))
}

fn get_record_path(uid: &str) -> Result<PathBuf, String> {
    let root = get_userdata_dir()?;
    let gacha_dir = root.join("gachaData");

    if !gacha_dir.exists() {
        fs::create_dir_all(&gacha_dir).map_err(|e| e.to_string())?;
    }

    Ok(gacha_dir.join(format!("{}.json", uid)))
}

fn get_pool_info_path() -> Result<PathBuf, String> {
    let root = get_userdata_dir()?;
    let gacha_dir = root.join("gachaData");

    if !gacha_dir.exists() {
        fs::create_dir_all(&gacha_dir).map_err(|e| e.to_string())?;
    }

    Ok(gacha_dir.join("poolInfo.json"))
}

fn load_full_record(uid: &str) -> Result<serde_json::Value, String> {
    let file_path = get_record_path(uid)?;

    if !file_path.exists() {
        return Ok(serde_json::json!({}));
    }

    let content = fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&content).unwrap_or(serde_json::json!({}));

    if !data.is_object() {
        return Ok(serde_json::json!({}));
    }

    Ok(data)
}

fn is_digits_only(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|b| b.is_ascii_digit())
}

fn compare_seqid(a: &str, b: &str) -> std::cmp::Ordering {
    if a == b {
        return std::cmp::Ordering::Equal;
    }

    let a_digits = is_digits_only(a);
    let b_digits = is_digits_only(b);

    if a_digits && b_digits {
        if a.len() != b.len() {
            return a.len().cmp(&b.len());
        }
        return a.cmp(b);
    }

    if a_digits != b_digits {
        return if a_digits {
            std::cmp::Ordering::Greater
        } else {
            std::cmp::Ordering::Less
        };
    }

    a.cmp(b)
}

fn value_to_seqid(value: &serde_json::Value) -> Option<String> {
    if let Some(s) = value.as_str() {
        let s = s.trim();
        if s.is_empty() {
            None
        } else {
            Some(s.to_string())
        }
    } else if let Some(n) = value.as_i64() {
        Some(n.to_string())
    } else if let Some(n) = value.as_u64() {
        Some(n.to_string())
    } else {
        None
    }
}

fn calc_max_seqid_from_records(records: &serde_json::Value) -> String {
    let obj = match records.as_object() {
        Some(o) => o,
        None => return "".into(),
    };

    let mut max_seqid: Option<String> = None;

    for (_pool_key, list) in obj.iter() {
        let arr = match list.as_array() {
            Some(a) => a,
            None => continue,
        };
        if arr.is_empty() {
            continue;
        }

        for item in [arr.first(), arr.last()] {
            let Some(item) = item else { continue };
            let Some(seq_val) = item.get("seqId") else {
                continue;
            };
            let Some(candidate) = value_to_seqid(seq_val) else {
                continue;
            };

            match &max_seqid {
                None => max_seqid = Some(candidate),
                Some(cur) => {
                    if compare_seqid(&candidate, cur) == std::cmp::Ordering::Greater {
                        max_seqid = Some(candidate);
                    }
                }
            }
        }
    }

    max_seqid.unwrap_or_else(|| "".into())
}

#[tauri::command]
async fn open_login_window(app: AppHandle, provider: Option<String>) {
    let provider = provider.unwrap_or_else(|| "hypergryph".to_string());
    let label = format!("hg-login-{}", provider);
    let (login_url, auth_url_match, poll_url, title) = match provider.as_str() {
        "gryphline" => (
            "https://user.gryphline.com/",
            "as.gryphline.com/user/auth",
            "https://web-api.gryphline.com/cookie_store/account_token",
            "登录鹰角通行证（国际服）",
        ),
        _ => (
            "https://user.hypergryph.com/",
            "as.hypergryph.com/user/auth",
            "https://web-api.hypergryph.com/account/info/hg",
            "登录鹰角通行证",
        ),
    };

    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.set_focus();
        return;
    }

    let script = r#"
      (function() {
        var hasSent = false;
        function sendToken(token) {
            if (hasSent || !token) return;
            console.log("捕获到 Token:", token);
            hasSent = true;
            // 🚀 核心修改：通过跳转 URL 传递 Token
            // 这个地址是假的，Rust 会拦截它，不会真的跳过去
            window.location.replace("http://tauri.localhost/login_success?token=" + token);
        }

        console.log("鹰角登录注入脚本启动...");

        // --- 策略一：拦截 XHR ---
        var originalOpen = XMLHttpRequest.prototype.open;
        var originalSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(method, url) {
            this._url = url;
            return originalOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function(body) {
            this.addEventListener('load', function() {
                try {
                    if (this._url && this._url.includes('__AUTH_URL_MATCH__')) {
                        var res = JSON.parse(this.responseText);
                        if (res.status === 0 && res.data && res.data.token) {
                            sendToken(res.data.token);
                        }
                    }
                } catch (e) { }
            });
            return originalSend.apply(this, arguments);
        };

        // --- 策略二：拦截 Fetch ---
        var originalFetch = window.fetch;
        window.fetch = async function(...args) {
            const response = await originalFetch(...args);
            try {
                const url = response.url;
                if (url && url.includes('__AUTH_URL_MATCH__')) {
                    const clone = response.clone();
                    clone.json().then(data => {
                        if (data.status === 0 && data.data && data.data.token) {
                            sendToken(data.data.token);
                        }
                    }).catch(e => {});
                }
            } catch (e) {}
            return response;
        };

        // --- 策略三：轮询 (带 Cookie) ---
        var timer = setInterval(function() {
            if (hasSent) { clearInterval(timer); return; }
            fetch("__POLL_URL__", {
                method: "GET",
                credentials: "include"
            })
            .then(res => res.json())
            .then(data => {
                if (data.code === 0 && data.data && data.data.content) {
                    sendToken(data.data.content);
                    clearInterval(timer);
                }
            })
            .catch(e => {});
        }, 1500);
      })();
    "#;
    let script = script
        .replace("__AUTH_URL_MATCH__", auth_url_match)
        .replace("__POLL_URL__", poll_url);

    let app_handle_for_nav = app.clone();
    let app_handle_for_event = app.clone();
    let label_for_close = label.clone();

    let win_builder = WebviewWindowBuilder::new(
        &app,
        label.clone(),
        WebviewUrl::External(login_url.parse().unwrap()),
    )
    .title(title)
    .inner_size(500.0, 700.0)
    .resizable(false)
    .initialization_script(script)
    .on_navigation(move |url| {
        let url_str = url.as_str();

        if url_str.starts_with("http://tauri.localhost/login_success") {
            println!("Rust 拦截到登录回调: {}", url_str);

            if let Some(query_start) = url_str.find("token=") {
                let token = &url_str[query_start + 6..];
                println!("解析 Token: {}", token);

                let _ = app_handle_for_nav.emit("hg-login-success", token);

                let app_handle_clone = app_handle_for_nav.clone();
                let label_clone = label_for_close.clone();

                thread::spawn(move || {
                    thread::sleep(Duration::from_millis(500));

                    if let Some(win) = app_handle_clone.get_webview_window(&label_clone) {
                        let _ = win.close();
                    }
                });
            }
            return false;
        }

        true
    });

    #[cfg(debug_assertions)]
    let win_builder = win_builder.devtools(true);

    match win_builder.build() {
        Ok(win) => {
            if let Err(e) = win.clear_all_browsing_data() {
                eprintln!("清理 Cookie 失败: {}", e);
            } else {
                println!("已清理旧的登录 Cookie，准备新登录");
            }

            win.on_window_event(move |event| {
                if let WindowEvent::Destroyed = event {
                    let _ = app_handle_for_event.emit("hg-login-closed", ());
                }
            });
        }
        Err(e) => {
            eprintln!("无法创建登录窗口: {}", e);
        }
    }
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
fn init_user_record(uid: String) -> Result<String, String> {
    if uid.trim().is_empty() {
        return Err("UID cannot be empty".into());
    }

    let file_path = get_record_path(&uid)?;
    if file_path.exists() {
        return Ok("Record already exists".into());
    }

    let init_data = serde_json::json!({
        "character_max_seqid": "",
        "weapon_max_seqid": "",
        "character": {},
        "weapon": {}
    });
    let json_string = serde_json::to_string_pretty(&init_data).map_err(|e| e.to_string())?;
    fs::write(file_path, json_string).map_err(|e| e.to_string())?;
    Ok("Record initialized".into())
}

#[command]
fn save_char_records(uid: String, data: serde_json::Value) -> Result<String, String> {
    if uid.trim().is_empty() {
        return Err("UID cannot be empty".into());
    }

    let mut full_data = load_full_record(&uid)?;
    full_data["character"] = data;
    let max_seqid = calc_max_seqid_from_records(&full_data["character"]);
    full_data["character_max_seqid"] = serde_json::json!(max_seqid);

    let file_path = get_record_path(&uid)?;
    let json_string = serde_json::to_string_pretty(&full_data).map_err(|e| e.to_string())?;
    fs::write(file_path, json_string).map_err(|e| e.to_string())?;
    Ok(format!("UID {} data saved successfully", uid))
}

#[command]
fn read_char_records(uid: String) -> Result<serde_json::Value, String> {
    if uid.trim().is_empty() {
        return Err("UID cannot be empty".into());
    }

    let full_data = load_full_record(&uid)?;
    let char_data = full_data
        .get("character")
        .unwrap_or(&serde_json::json!({}))
        .clone();
    Ok(char_data)
}

#[command]
fn save_weapon_records(uid: String, data: serde_json::Value) -> Result<String, String> {
    if uid.trim().is_empty() {
        return Err("UID cannot be empty".into());
    }

    let mut full_data = load_full_record(&uid)?;

    full_data["weapon"] = data;
    let max_seqid = calc_max_seqid_from_records(&full_data["weapon"]);
    full_data["weapon_max_seqid"] = serde_json::json!(max_seqid);

    let file_path = get_record_path(&uid)?;
    let json_string = serde_json::to_string_pretty(&full_data).map_err(|e| e.to_string())?;
    fs::write(file_path, json_string).map_err(|e| e.to_string())?;

    Ok(format!("UID {} weapon data saved", uid))
}

#[command]
fn read_char_max_seqid(uid: String) -> Result<String, String> {
    if uid.trim().is_empty() {
        return Err("UID cannot be empty".into());
    }

    let file_path = get_record_path(&uid)?;
    if !file_path.exists() {
        return Ok("".into());
    }

    let mut full_data = load_full_record(&uid)?;
    if let Some(v) = full_data
        .get("character_max_seqid")
        .and_then(|x| x.as_str())
    {
        let s = v.trim();
        if !s.is_empty() {
            return Ok(s.to_string());
        }
    }

    let computed =
        calc_max_seqid_from_records(full_data.get("character").unwrap_or(&serde_json::json!({})));
    if !computed.is_empty() {
        full_data["character_max_seqid"] = serde_json::json!(computed.clone());
        let json_string = serde_json::to_string_pretty(&full_data).map_err(|e| e.to_string())?;
        fs::write(file_path, json_string).map_err(|e| e.to_string())?;
    }
    Ok(computed)
}

#[command]
fn read_weapon_max_seqid(uid: String) -> Result<String, String> {
    if uid.trim().is_empty() {
        return Err("UID cannot be empty".into());
    }

    let file_path = get_record_path(&uid)?;
    if !file_path.exists() {
        return Ok("".into());
    }

    let mut full_data = load_full_record(&uid)?;
    if let Some(v) = full_data.get("weapon_max_seqid").and_then(|x| x.as_str()) {
        let s = v.trim();
        if !s.is_empty() {
            return Ok(s.to_string());
        }
    }

    let computed =
        calc_max_seqid_from_records(full_data.get("weapon").unwrap_or(&serde_json::json!({})));
    if !computed.is_empty() {
        full_data["weapon_max_seqid"] = serde_json::json!(computed.clone());
        let json_string = serde_json::to_string_pretty(&full_data).map_err(|e| e.to_string())?;
        fs::write(file_path, json_string).map_err(|e| e.to_string())?;
    }
    Ok(computed)
}

#[command]
fn read_weapon_records(uid: String) -> Result<serde_json::Value, String> {
    if uid.trim().is_empty() {
        return Err("UID cannot be empty".into());
    }

    let full_data = load_full_record(&uid)?;
    let weapon_data = full_data
        .get("weapon")
        .unwrap_or(&serde_json::json!({}))
        .clone();
    Ok(weapon_data)
}

#[command]
fn read_pool_info() -> Result<serde_json::Value, String> {
    let file_path = get_pool_info_path()?;

    if !file_path.exists() {
        let default_data = serde_json::json!([
            {
                "pool_gacha_type": "char",
                "pool_id": "special_1_0_1",
                "pool_name": "熔火灼痕",
                "pool_type": "special",
                "up6_id": "chr_0016_laevat"
            },
            {
                "pool_gacha_type": "char",
                "pool_id": "special_1_0_3",
                "pool_name": "轻飘飘的信使",
                "pool_type": "special",
                "up6_id": "chr_0013_aglina"
            },
            {
                "pool_gacha_type": "char",
                "pool_id": "special_1_0_2",
                "pool_name": "热烈色彩",
                "pool_type": "special",
                "up6_id": "chr_0017_yvonne"
            },
            {
                "pool_gacha_type": "weapon",
                "pool_id": "weponbox_1_0_3",
                "pool_name": "迅行申领",
                "pool_type": "special",
                "up6_id": "wpn_funnel_0011"
            },
            {
                "pool_gacha_type": "weapon",
                "pool_id": "weponbox_1_0_2",
                "pool_name": "绘涂申领",
                "pool_type": "special",
                "up6_id": "wpn_pistol_0010"
            },
            {
                "pool_gacha_type": "weapon",
                "pool_id": "weponbox_1_0_1",
                "pool_name": "熔铸申领",
                "pool_type": "special",
                "up6_id": "wpn_sword_0006"
            },
            {
                "pool_gacha_type": "weapon",
                "pool_id": "weaponbox_constant_2",
                "pool_name": "星声申领",
                "pool_type": "constant",
                "up6_id": "wpn_funnel_0013"
            },
            {
                "pool_gacha_type": "char",
                "pool_id": "special_1_1_1",
                "pool_name": "河流的女儿",
                "pool_type": "special",
                "up6_id": "chr_0027_tangtang"
            },
            {
                "pool_gacha_type": "weapon",
                "pool_id": "weponbox_1_1_1",
                "pool_name": "新芽申领",
                "pool_type": "special",
                "up6_id": "wpn_pistol_0011"
            }
        ]);

        let json_string = serde_json::to_string_pretty(&default_data).map_err(|e| e.to_string())?;
        fs::write(&file_path, json_string).map_err(|e| e.to_string())?;
        return Ok(default_data);
    }

    let content = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    let data: serde_json::Value =
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!([]));
    if data.is_array() {
        Ok(data)
    } else {
        Ok(serde_json::json!([]))
    }
}

#[command]
fn save_pool_info(data: serde_json::Value) -> Result<String, String> {
    let file_path = get_pool_info_path()?;
    if !data.is_array() {
        return Err("poolInfo must be a JSON array".into());
    }

    let json_string = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(file_path, json_string).map_err(|e| e.to_string())?;
    Ok("poolInfo saved".into())
}

#[command]
fn get_os() -> String {
    std::env::consts::OS.to_string()
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
            init_user_record,
            save_char_records,
            read_char_records,
            read_char_max_seqid,
            save_weapon_records,
            read_weapon_records,
            read_weapon_max_seqid,
            read_pool_info,
            save_pool_info,
            get_os,
            open_login_window
        ])
        .setup(|app| {
            #[cfg(any(target_os = "linux", target_os = "macos"))]
            init_userdata_dir(&app.handle())
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

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
