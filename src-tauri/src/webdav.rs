use crate::{get_config_path, get_record_path, get_userdata_dir};
use chrono::{SecondsFormat, Utc};
use reqwest::{Client, Method, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::time::Duration;
use tauri::command;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppConfigData {
    #[serde(default)]
    users: Vec<AppUser>,
    #[serde(default)]
    current_user: String,
    #[serde(default)]
    theme: String,
    #[serde(default)]
    update_seen_version: String,
    #[serde(default)]
    webdav: WebDavConfigData,
    #[serde(default)]
    webdav_state: HashMap<String, WebDavStateItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppUser {
    #[serde(default)]
    key: String,
    #[serde(default)]
    uid: String,
    #[serde(default)]
    token: String,
    #[serde(default)]
    provider: String,
    #[serde(default, rename = "roleId")]
    role_id: Option<UserRoleMeta>,
    #[serde(default)]
    source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct UserRoleMeta {
    #[serde(default)]
    server_id: String,
    #[serde(default)]
    server_name: String,
    #[serde(default)]
    nick_name: String,
    #[serde(default)]
    role_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WebDavConfigData {
    #[serde(default)]
    base_url: String,
    #[serde(default)]
    username: String,
    #[serde(default)]
    password: String,
    #[serde(default = "default_base_path")]
    base_path: String,
    #[serde(default)]
    auto_sync: bool,
    #[serde(default = "default_silent_auto_sync")]
    silent_auto_sync: bool,
}

impl Default for WebDavConfigData {
    fn default() -> Self {
        Self {
            base_url: String::new(),
            username: String::new(),
            password: String::new(),
            base_path: default_base_path(),
            auto_sync: false,
            silent_auto_sync: default_silent_auto_sync(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct WebDavStateItem {
    #[serde(default)]
    last_local_hash: String,
    #[serde(default)]
    last_remote_hash: String,
    #[serde(default)]
    last_sync_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct AccountBundle {
    #[serde(default)]
    schema_version: u32,
    #[serde(default)]
    account: BundleAccount,
    #[serde(default, rename = "updatedAt")]
    updated_at: String,
    #[serde(default)]
    character_max_seqid: String,
    #[serde(default)]
    weapon_max_seqid: String,
    #[serde(default)]
    character: Value,
    #[serde(default)]
    weapon: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct BundleAccount {
    #[serde(default)]
    key: String,
    #[serde(default)]
    provider: String,
    #[serde(default)]
    uid: String,
    #[serde(default, rename = "roleId")]
    role_id: UserRoleMeta,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct ManifestFile {
    #[serde(default)]
    schema_version: u32,
    #[serde(default)]
    accounts: BTreeMap<String, ManifestEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ManifestEntry {
    #[serde(default)]
    path: String,
    #[serde(default)]
    updated_at: String,
    #[serde(default)]
    content_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavSyncResult {
    account_key: String,
    status: String,
    message: String,
    warning: Option<String>,
    local_changed: bool,
    manifest_updated: bool,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavRestoreAccount {
    key: String,
    provider: String,
    uid: String,
    #[serde(rename = "roleId")]
    role_id: UserRoleMeta,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavRestoreResult {
    restored: Vec<String>,
    current_user: String,
}

enum ManifestLoadState {
    Existing(ManifestFile),
    Missing,
    Invalid,
}

struct WebDavClient {
    client: Client,
    base_url: String,
    base_path: String,
    username: String,
    password: String,
}

fn default_base_path() -> String {
    "/endfield-gacha".into()
}

fn default_silent_auto_sync() -> bool {
    true
}

fn normalize_string(value: &str) -> String {
    value.trim().to_string()
}

fn normalize_provider(value: &str) -> Result<String, String> {
    let provider = normalize_string(value);
    match provider.as_str() {
        "hypergryph" => Ok("hypergryph".into()),
        "gryphline" => Ok("gryphline".into()),
        _ if provider.is_empty() => Err("provider 字段不能为空".into()),
        _ => Err(format!("provider 字段无效：{}", provider)),
    }
}

fn normalize_base_path(value: &str) -> String {
    let raw = value.trim().replace('\\', "/");
    if raw.is_empty() || raw == "/" {
        return default_base_path();
    }

    let collapsed = raw.replace("//", "/");
    let mut path = if collapsed.starts_with('/') {
        collapsed
    } else {
        format!("/{}", collapsed)
    };
    while path.ends_with('/') && path.len() > 1 {
        path.pop();
    }
    path
}

fn now_iso_string() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn get_user_key(user: &AppUser) -> String {
    let key = normalize_string(&user.key);
    if !key.is_empty() {
        return key;
    }
    let role_id = user
        .role_id
        .as_ref()
        .map(|role| normalize_string(&role.role_id))
        .unwrap_or_default();
    let uid = normalize_string(&user.uid);
    if !uid.is_empty() && !role_id.is_empty() {
        return format!("{}_{}", uid, role_id);
    }
    uid
}

fn normalize_user(user: &mut AppUser) -> Result<(), String> {
    user.uid = normalize_string(&user.uid);
    user.provider = normalize_provider(&user.provider)?;
    if user.source.trim().is_empty() {
        user.source = if user.token.trim().is_empty() {
            "log".into()
        } else {
            "login".into()
        };
    }
    if let Some(role) = user.role_id.as_mut() {
        role.server_id = normalize_string(&role.server_id);
        role.server_name = normalize_string(&role.server_name);
        role.nick_name = normalize_string(&role.nick_name);
        role.role_id = normalize_string(&role.role_id);
    }
    user.key = get_user_key(user);
    Ok(())
}

fn normalize_config(config: &mut AppConfigData) -> Result<(), String> {
    for user in config.users.iter_mut() {
        normalize_user(user)?;
    }
    config.webdav.base_url = normalize_string(&config.webdav.base_url);
    config.webdav.username = normalize_string(&config.webdav.username);
    config.webdav.base_path = normalize_base_path(&config.webdav.base_path);
    for state in config.webdav_state.values_mut() {
        state.last_local_hash = normalize_string(&state.last_local_hash);
        state.last_remote_hash = normalize_string(&state.last_remote_hash);
        state.last_sync_at = normalize_string(&state.last_sync_at);
    }
    Ok(())
}

fn load_config_data() -> Result<AppConfigData, String> {
    let path = get_config_path()?;
    if !path.exists() {
        return Ok(AppConfigData::default());
    }

    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut config: AppConfigData = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    normalize_config(&mut config)?;
    Ok(config)
}

fn save_config_data(config: &AppConfigData) -> Result<(), String> {
    let path = get_config_path()?;
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

fn load_local_record_value(user_key: &str) -> Result<Value, String> {
    let path = get_record_path(user_key)?;
    if !path.exists() {
        return Ok(json!({
            "character_max_seqid": "",
            "weapon_max_seqid": "",
            "character": {},
            "weapon": {}
        }));
    }

    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let data: Value = serde_json::from_str(&content).unwrap_or_else(|_| json!({}));
    if data.is_object() {
        Ok(data)
    } else {
        Ok(json!({
            "character_max_seqid": "",
            "weapon_max_seqid": "",
            "character": {},
            "weapon": {}
        }))
    }
}

fn write_bundle_to_local_record(user_key: &str, bundle: &AccountBundle) -> Result<(), String> {
    let path = get_record_path(user_key)?;
    let json = serde_json::to_string_pretty(bundle).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

fn default_manifest() -> ManifestFile {
    ManifestFile {
        schema_version: 1,
        accounts: BTreeMap::new(),
    }
}

fn build_bundle_account(user: &AppUser) -> Result<BundleAccount, String> {
    let role = user
        .role_id
        .clone()
        .ok_or_else(|| "当前账号缺少 roleId，无法写入 WebDAV".to_string())?;
    let role_id = normalize_string(&role.role_id);
    let provider = normalize_provider(&user.provider)?;
    if user.key.trim().is_empty() || user.uid.trim().is_empty() || role_id.is_empty() {
        return Err("当前账号缺少关键字段，无法写入 WebDAV".into());
    }

    Ok(BundleAccount {
        key: normalize_string(&user.key),
        provider,
        uid: normalize_string(&user.uid),
        role_id: UserRoleMeta {
            server_id: normalize_string(&role.server_id),
            server_name: normalize_string(&role.server_name),
            nick_name: normalize_string(&role.nick_name),
            role_id,
        },
    })
}

fn normalize_record_object(value: &Value) -> Value {
    if let Some(obj) = value.as_object() {
        return Value::Object(obj.clone());
    }
    json!({})
}

fn build_local_bundle(user: &AppUser) -> Result<AccountBundle, String> {
    let full_data = load_local_record_value(&user.key)?;
    let character = normalize_record_object(full_data.get("character").unwrap_or(&json!({})));
    let weapon = normalize_record_object(full_data.get("weapon").unwrap_or(&json!({})));
    let updated_at = full_data
        .get("updatedAt")
        .and_then(|value| value.as_str())
        .map(normalize_string)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(now_iso_string);

    let character_max_seqid = full_data
        .get("character_max_seqid")
        .and_then(|value| value.as_str())
        .map(normalize_string)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| calc_max_seqid_from_records(&character));
    let weapon_max_seqid = full_data
        .get("weapon_max_seqid")
        .and_then(|value| value.as_str())
        .map(normalize_string)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| calc_max_seqid_from_records(&weapon));

    Ok(AccountBundle {
        schema_version: 1,
        account: build_bundle_account(user)?,
        updated_at,
        character_max_seqid,
        weapon_max_seqid,
        character,
        weapon,
    })
}

fn validate_bundle(bundle: &AccountBundle) -> Result<(), String> {
    if bundle.schema_version != 1 {
        return Err("schema_version 不受支持".into());
    }
    if normalize_string(&bundle.account.key).is_empty()
        || normalize_string(&bundle.account.uid).is_empty()
        || normalize_string(&bundle.account.role_id.role_id).is_empty()
    {
        return Err("账号文件缺少关键字段".into());
    }
    if !bundle.character.is_object() || !bundle.weapon.is_object() {
        return Err("账号文件结构损坏".into());
    }
    Ok(())
}

fn parse_bundle_text(text: &str) -> Result<AccountBundle, String> {
    let mut bundle: AccountBundle = serde_json::from_str(text).map_err(|e| e.to_string())?;
    bundle.account.provider = normalize_provider(&bundle.account.provider)?;
    bundle.account.key = normalize_string(&bundle.account.key);
    bundle.account.uid = normalize_string(&bundle.account.uid);
    bundle.account.role_id.role_id = normalize_string(&bundle.account.role_id.role_id);
    bundle.account.role_id.nick_name = normalize_string(&bundle.account.role_id.nick_name);
    bundle.account.role_id.server_id = normalize_string(&bundle.account.role_id.server_id);
    bundle.account.role_id.server_name = normalize_string(&bundle.account.role_id.server_name);
    bundle.updated_at = normalize_string(&bundle.updated_at);
    bundle.character = normalize_record_object(&bundle.character);
    bundle.weapon = normalize_record_object(&bundle.weapon);
    if bundle.character_max_seqid.trim().is_empty() {
        bundle.character_max_seqid = calc_max_seqid_from_records(&bundle.character);
    }
    if bundle.weapon_max_seqid.trim().is_empty() {
        bundle.weapon_max_seqid = calc_max_seqid_from_records(&bundle.weapon);
    }
    validate_bundle(&bundle)?;
    Ok(bundle)
}

fn bundle_to_value(bundle: &AccountBundle) -> Value {
    serde_json::to_value(bundle).unwrap_or_else(|_| json!({}))
}

fn bundle_to_remote_value(bundle: &AccountBundle) -> Value {
    json!({
        "schema_version": bundle.schema_version,
        "account": bundle.account.clone(),
        "updatedAt": bundle.updated_at.clone(),
        "character": bundle.character.clone(),
        "weapon": bundle.weapon.clone(),
    })
}

fn bundle_has_records(bundle: &AccountBundle) -> bool {
    let has_character = bundle
        .character
        .as_object()
        .map(|obj| {
            obj.values().any(|value| {
                value
                    .as_array()
                    .map(|list| !list.is_empty())
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false);
    let has_weapon = bundle
        .weapon
        .as_object()
        .map(|obj| {
            obj.values().any(|value| {
                value
                    .as_array()
                    .map(|list| !list.is_empty())
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false);
    has_character || has_weapon
}

fn write_stable_json(value: &Value, output: &mut String) -> Result<(), String> {
    match value {
        Value::Null => output.push_str("null"),
        Value::Bool(flag) => output.push_str(if *flag { "true" } else { "false" }),
        Value::Number(number) => output.push_str(&number.to_string()),
        Value::String(text) => {
            output.push_str(&serde_json::to_string(text).map_err(|e| e.to_string())?)
        }
        Value::Array(items) => {
            output.push('[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                write_stable_json(item, output)?;
            }
            output.push(']');
        }
        Value::Object(map) => {
            output.push('{');
            let mut keys: Vec<_> = map.keys().cloned().collect();
            keys.sort();
            for (index, key) in keys.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                output.push_str(&serde_json::to_string(key).map_err(|e| e.to_string())?);
                output.push(':');
                if let Some(item) = map.get(key) {
                    write_stable_json(item, output)?;
                } else {
                    output.push_str("null");
                }
            }
            output.push('}');
        }
    }
    Ok(())
}

fn bundle_hash(bundle: &AccountBundle) -> Result<String, String> {
    let value = bundle_to_remote_value(bundle);
    let mut stable = String::new();
    write_stable_json(&value, &mut stable)?;
    let mut hasher = Sha256::new();
    hasher.update(stable.as_bytes());
    let digest = hasher.finalize();
    let hash = digest
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect::<String>();
    Ok(format!("sha256:{}", hash))
}

fn value_to_seqid(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        let normalized = normalize_string(text);
        if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        }
    } else if let Some(number) = value.as_i64() {
        Some(number.to_string())
    } else if let Some(number) = value.as_u64() {
        Some(number.to_string())
    } else {
        None
    }
}

fn is_digits_only(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit())
}

fn compare_seqid(a: &str, b: &str) -> Ordering {
    if a == b {
        return Ordering::Equal;
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
            Ordering::Greater
        } else {
            Ordering::Less
        };
    }
    a.cmp(b)
}

fn calc_max_seqid_from_records(records: &Value) -> String {
    let obj = match records.as_object() {
        Some(obj) => obj,
        None => return String::new(),
    };

    let mut max_seqid: Option<String> = None;
    for list in obj.values() {
        let Some(items) = list.as_array() else {
            continue;
        };
        for item in [items.first(), items.last()] {
            let Some(item) = item else {
                continue;
            };
            let Some(seq_value) = item.get("seqId") else {
                continue;
            };
            let Some(candidate) = value_to_seqid(seq_value) else {
                continue;
            };
            match &max_seqid {
                None => max_seqid = Some(candidate),
                Some(current) => {
                    if compare_seqid(&candidate, current) == Ordering::Greater {
                        max_seqid = Some(candidate);
                    }
                }
            }
        }
    }
    max_seqid.unwrap_or_default()
}

fn record_score(value: &Value) -> usize {
    value
        .as_object()
        .map(|obj| {
            obj.values()
                .filter(|item| {
                    if item.is_null() {
                        return false;
                    }
                    if let Some(text) = item.as_str() {
                        return !text.trim().is_empty();
                    }
                    true
                })
                .count()
        })
        .unwrap_or(0)
}

fn normalize_record_for_conflict_compare(value: &Value) -> Value {
    let Some(obj) = value.as_object() else {
        return value.clone();
    };

    let mut normalized = Map::new();
    let mut keys: Vec<_> = obj.keys().cloned().collect();
    keys.sort();

    for key in keys {
        if matches!(key.as_str(), "charName" | "weaponName" | "poolName") {
            continue;
        }
        if let Some(item) = obj.get(&key) {
            normalized.insert(key, item.clone());
        }
    }

    Value::Object(normalized)
}

fn pick_richer_record(current: &Value, candidate: &Value) -> Value {
    if record_score(candidate) >= record_score(current) {
        candidate.clone()
    } else {
        current.clone()
    }
}

fn merge_record_lists(local: &[Value], remote: &[Value]) -> Result<Vec<Value>, String> {
    let mut merged: Vec<(String, Value)> = Vec::new();
    let mut seq_index: HashMap<String, usize> = HashMap::new();

    let mut push_item = |item: &Value| -> Result<(), String> {
        let seq_id = item.get("seqId").and_then(value_to_seqid);
        if let Some(seq_id) = seq_id {
            if let Some(index) = seq_index.get(&seq_id).copied() {
                let current = merged[index].1.clone();
                let current_normalized = normalize_record_for_conflict_compare(&current);
                let candidate_normalized = normalize_record_for_conflict_compare(item);
                if current_normalized != candidate_normalized {
                    return Err(format!("抽卡记录 seqId ({}) 存在字段差异", seq_id));
                }
                merged[index].1 = pick_richer_record(&current, item);
            } else {
                seq_index.insert(seq_id.clone(), merged.len());
                merged.push((seq_id, item.clone()));
            }
        } else {
            let synthetic_key = format!("__missing__{}", merged.len());
            merged.push((synthetic_key, item.clone()));
        }
        Ok(())
    };

    for item in local {
        push_item(item)?;
    }
    for item in remote {
        push_item(item)?;
    }

    merged.sort_by(|a, b| {
        let a_seq =
            a.1.get("seqId")
                .and_then(value_to_seqid)
                .unwrap_or_default();
        let b_seq =
            b.1.get("seqId")
                .and_then(value_to_seqid)
                .unwrap_or_default();
        compare_seqid(&b_seq, &a_seq)
    });

    Ok(merged.into_iter().map(|(_, value)| value).collect())
}

fn merge_record_maps(local: &Value, remote: &Value) -> Result<Value, String> {
    let mut keys = BTreeSet::new();
    if let Some(obj) = local.as_object() {
        keys.extend(obj.keys().cloned());
    }
    if let Some(obj) = remote.as_object() {
        keys.extend(obj.keys().cloned());
    }

    let mut result = Map::new();
    for key in keys {
        let local_items = local
            .get(&key)
            .and_then(|value| value.as_array())
            .cloned()
            .unwrap_or_default();
        let remote_items = remote
            .get(&key)
            .and_then(|value| value.as_array())
            .cloned()
            .unwrap_or_default();
        let merged = merge_record_lists(&local_items, &remote_items)?;
        result.insert(key, Value::Array(merged));
    }
    Ok(Value::Object(result))
}

fn choose_recent_non_empty(primary: &str, secondary: &str) -> String {
    let primary = normalize_string(primary);
    if !primary.is_empty() {
        return primary;
    }
    normalize_string(secondary)
}

fn merge_account_meta(
    local: &BundleAccount,
    remote: &BundleAccount,
    local_updated_at: &str,
    remote_updated_at: &str,
) -> BundleAccount {
    let prefer_remote_name = remote_updated_at >= local_updated_at;
    let (primary_name, secondary_name) = if prefer_remote_name {
        (&remote.role_id.nick_name, &local.role_id.nick_name)
    } else {
        (&local.role_id.nick_name, &remote.role_id.nick_name)
    };

    BundleAccount {
        key: local.key.clone(),
        provider: local.provider.clone(),
        uid: local.uid.clone(),
        role_id: UserRoleMeta {
            role_id: local.role_id.role_id.clone(),
            nick_name: choose_recent_non_empty(primary_name, secondary_name),
            server_id: choose_recent_non_empty(&remote.role_id.server_id, &local.role_id.server_id),
            server_name: choose_recent_non_empty(
                &remote.role_id.server_name,
                &local.role_id.server_name,
            ),
        },
    }
}

fn validate_identity(local: &AccountBundle, remote: &AccountBundle) -> Result<(), String> {
    if local.account.key != remote.account.key {
        return Err("key 不一致".into());
    }
    if local.account.uid != remote.account.uid {
        return Err("UID 不一致".into());
    }
    if local.account.provider != remote.account.provider {
        return Err("provider 不一致".into());
    }
    if local.account.role_id.role_id != remote.account.role_id.role_id {
        return Err("roleId 不一致".into());
    }
    Ok(())
}

fn validate_record_conflicts(local: &AccountBundle, remote: &AccountBundle) -> Result<(), String> {
    merge_record_maps(&local.character, &remote.character)?;
    merge_record_maps(&local.weapon, &remote.weapon)?;
    Ok(())
}

fn merge_bundles(local: &AccountBundle, remote: &AccountBundle) -> Result<AccountBundle, String> {
    validate_identity(local, remote)?;
    let character = merge_record_maps(&local.character, &remote.character)?;
    let weapon = merge_record_maps(&local.weapon, &remote.weapon)?;
    Ok(AccountBundle {
        schema_version: 1,
        account: merge_account_meta(
            &local.account,
            &remote.account,
            &local.updated_at,
            &remote.updated_at,
        ),
        updated_at: now_iso_string(),
        character_max_seqid: calc_max_seqid_from_records(&character),
        weapon_max_seqid: calc_max_seqid_from_records(&weapon),
        character,
        weapon,
    })
}

fn save_conflict_snapshots(
    user_key: &str,
    local_value: &Value,
    remote_value: &Value,
) -> Result<(), String> {
    let dir = get_userdata_dir()?.join("webdavConflicts");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }

    let local_path = dir.join(format!("{}.local.json", user_key));
    let remote_path = dir.join(format!("{}.remote.json", user_key));
    let local_json = serde_json::to_string_pretty(local_value).map_err(|e| e.to_string())?;
    let remote_json = serde_json::to_string_pretty(remote_value).map_err(|e| e.to_string())?;
    fs::write(local_path, local_json).map_err(|e| e.to_string())?;
    fs::write(remote_path, remote_json).map_err(|e| e.to_string())?;
    Ok(())
}

fn build_manifest_entry(bundle: &AccountBundle) -> Result<ManifestEntry, String> {
    Ok(ManifestEntry {
        path: account_relative_path(&bundle.account.key),
        updated_at: bundle.updated_at.clone(),
        content_hash: bundle_hash(bundle)?,
    })
}

fn build_manifest_from_bundles(bundles: &[AccountBundle]) -> Result<ManifestFile, String> {
    let mut manifest = default_manifest();
    for bundle in bundles {
        manifest
            .accounts
            .insert(bundle.account.key.clone(), build_manifest_entry(bundle)?);
    }
    Ok(manifest)
}

fn upsert_user_from_bundle(
    config: &mut AppConfigData,
    bundle: &AccountBundle,
    restored: bool,
) -> Result<(), String> {
    let key = bundle.account.key.clone();
    if let Some(user) = config
        .users
        .iter_mut()
        .find(|item| get_user_key(item) == key)
    {
        let preserved_token = user.token.clone();
        let preserved_source = normalize_string(&user.source);
        user.key = key.clone();
        user.uid = bundle.account.uid.clone();
        user.provider = bundle.account.provider.clone();
        user.role_id = Some(bundle.account.role_id.clone());
        user.token = preserved_token;
        user.source = preserved_source;

        if user.source.trim().is_empty() {
            let has_token = !normalize_string(&user.token).is_empty();
            user.source = if restored {
                if has_token {
                    "login".into()
                } else {
                    "remote".into()
                }
            } else if has_token {
                "login".into()
            } else {
                "log".into()
            };
        }
        normalize_user(user)?;
        return Ok(());
    }

    let mut user = AppUser {
        key: key.clone(),
        uid: bundle.account.uid.clone(),
        token: String::new(),
        provider: bundle.account.provider.clone(),
        role_id: Some(bundle.account.role_id.clone()),
        source: "remote".into(),
    };
    normalize_user(&mut user)?;
    config.users.push(user);
    Ok(())
}

fn account_relative_path(user_key: &str) -> String {
    format!("accounts/{}.json", user_key)
}

impl WebDavClient {
    fn new(config: &WebDavConfigData) -> Result<Self, String> {
        let base_url = normalize_string(&config.base_url)
            .trim_end_matches('/')
            .to_string();
        let username = normalize_string(&config.username);
        let password = config.password.clone();
        let base_path = normalize_base_path(&config.base_path);

        if base_url.is_empty() || username.is_empty() || password.is_empty() || base_path.is_empty()
        {
            return Err("请先填写完整的 WebDAV 配置".into());
        }

        let client = Client::builder()
            .timeout(Duration::from_secs(20))
            .user_agent("endfield-gacha/webdav")
            .build()
            .map_err(|e| e.to_string())?;

        Ok(Self {
            client,
            base_url,
            base_path,
            username,
            password,
        })
    }

    fn url_for_absolute_path(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }

    fn url_for_relative(&self, relative_path: &str) -> String {
        let relative_path = relative_path.trim_start_matches('/');
        if relative_path.is_empty() {
            self.url_for_absolute_path(&self.base_path)
        } else {
            self.url_for_absolute_path(&format!("{}/{}", self.base_path, relative_path))
        }
    }

    async fn send(&self, method: Method, url: String) -> Result<reqwest::Response, String> {
        self.client
            .request(method, url)
            .basic_auth(&self.username, Some(&self.password))
            .send()
            .await
            .map_err(|e| e.to_string())
    }

    async fn propfind_exists_absolute(&self, absolute_path: &str) -> Result<bool, String> {
        let method = Method::from_bytes(b"PROPFIND").map_err(|e| e.to_string())?;
        let response = self
            .client
            .request(method, self.url_for_absolute_path(absolute_path))
            .basic_auth(&self.username, Some(&self.password))
            .header("Depth", "0")
            .header("Content-Type", "application/xml; charset=utf-8")
            .body(r#"<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname /></d:prop></d:propfind>"#)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        match response.status() {
            StatusCode::OK | StatusCode::MULTI_STATUS => Ok(true),
            StatusCode::NOT_FOUND => Ok(false),
            status => Err(format!("PROPFIND {} 失败: {}", absolute_path, status)),
        }
    }

    async fn ensure_collection_absolute(&self, absolute_path: &str) -> Result<(), String> {
        if self.propfind_exists_absolute(absolute_path).await? {
            return Ok(());
        }

        let method = Method::from_bytes(b"MKCOL").map_err(|e| e.to_string())?;
        let response = self
            .client
            .request(method, self.url_for_absolute_path(absolute_path))
            .basic_auth(&self.username, Some(&self.password))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        match response.status() {
            StatusCode::CREATED
            | StatusCode::OK
            | StatusCode::NO_CONTENT
            | StatusCode::METHOD_NOT_ALLOWED => Ok(()),
            status => {
                if self.propfind_exists_absolute(absolute_path).await? {
                    return Ok(());
                }
                Err(format!("初始化目录失败 {}: {}", absolute_path, status))
            }
        }
    }

    async fn ensure_structure(&self) -> Result<(), String> {
        let mut current = String::new();
        for segment in self
            .base_path
            .trim_start_matches('/')
            .split('/')
            .filter(|item| !item.is_empty())
        {
            current.push('/');
            current.push_str(segment);
            self.ensure_collection_absolute(&current).await?;
        }
        self.ensure_collection_absolute(&format!("{}/accounts", self.base_path))
            .await
    }

    async fn get_text_relative(&self, relative_path: &str) -> Result<Option<String>, String> {
        let response = self
            .send(Method::GET, self.url_for_relative(relative_path))
            .await?;
        match response.status() {
            StatusCode::OK => response.text().await.map(Some).map_err(|e| e.to_string()),
            StatusCode::NOT_FOUND => Ok(None),
            status => Err(format!("GET {} 失败: {}", relative_path, status)),
        }
    }

    async fn put_json_relative<T: Serialize>(
        &self,
        relative_path: &str,
        payload: &T,
    ) -> Result<(), String> {
        let body = serde_json::to_string_pretty(payload).map_err(|e| e.to_string())?;
        let response = self
            .client
            .request(Method::PUT, self.url_for_relative(relative_path))
            .basic_auth(&self.username, Some(&self.password))
            .header("Content-Type", "application/json; charset=utf-8")
            .body(body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        match response.status() {
            StatusCode::OK | StatusCode::CREATED | StatusCode::NO_CONTENT => Ok(()),
            status => Err(format!("PUT {} 失败: {}", relative_path, status)),
        }
    }

    async fn load_manifest_state(&self) -> Result<ManifestLoadState, String> {
        let Some(text) = self.get_text_relative("manifest.json").await? else {
            return Ok(ManifestLoadState::Missing);
        };

        match serde_json::from_str::<ManifestFile>(&text) {
            Ok(mut manifest) => {
                if manifest.schema_version == 0 {
                    manifest.schema_version = 1;
                }
                Ok(ManifestLoadState::Existing(manifest))
            }
            Err(_) => Ok(ManifestLoadState::Invalid),
        }
    }

    async fn download_account_text_for_key(
        &self,
        user_key: &str,
        manifest: Option<&ManifestFile>,
    ) -> Result<Option<(String, String)>, String> {
        let mut candidate_paths = Vec::new();
        if let Some(manifest) = manifest {
            if let Some(entry) = manifest.accounts.get(user_key) {
                let path = normalize_string(&entry.path)
                    .trim_start_matches('/')
                    .to_string();
                if !path.is_empty() {
                    candidate_paths.push(path);
                }
            }
        }

        let default_path = account_relative_path(user_key);
        if !candidate_paths.iter().any(|path| path == &default_path) {
            candidate_paths.push(default_path);
        }

        for path in candidate_paths {
            if let Some(text) = self.get_text_relative(&path).await? {
                return Ok(Some((path, text)));
            }
        }

        Ok(None)
    }

    async fn scan_account_paths(&self) -> Result<Vec<String>, String> {
        let method = Method::from_bytes(b"PROPFIND").map_err(|e| e.to_string())?;
        let response = self
            .client
            .request(method, self.url_for_absolute_path(&format!("{}/accounts", self.base_path)))
            .basic_auth(&self.username, Some(&self.password))
            .header("Depth", "1")
            .header("Content-Type", "application/xml; charset=utf-8")
            .body(r#"<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname /></d:prop></d:propfind>"#)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        match response.status() {
            StatusCode::OK | StatusCode::MULTI_STATUS => {
                let xml = response.text().await.map_err(|e| e.to_string())?;
                let mut paths = BTreeSet::new();
                for href in extract_href_values(&xml) {
                    let path = href_to_path(&href);
                    let base_prefix = format!("{}/", self.base_path.trim_end_matches('/'));
                    if !path.starts_with(&base_prefix) {
                        continue;
                    }
                    let relative = path[self.base_path.trim_end_matches('/').len() + 1..]
                        .trim()
                        .trim_start_matches('/')
                        .to_string();
                    if relative.starts_with("accounts/") && relative.ends_with(".json") {
                        paths.insert(relative);
                    }
                }
                Ok(paths.into_iter().collect())
            }
            StatusCode::NOT_FOUND => Ok(Vec::new()),
            status => Err(format!("扫描 accounts 目录失败: {}", status)),
        }
    }
}

fn href_to_path(href: &str) -> String {
    if href.starts_with("http://") || href.starts_with("https://") {
        if let Ok(url) = reqwest::Url::parse(href) {
            return url.path().trim_end_matches('/').to_string();
        }
    }
    href.trim().trim_end_matches('/').to_string()
}

fn extract_href_values(xml: &str) -> Vec<String> {
    let lower = xml.to_ascii_lowercase();
    let mut result = Vec::new();
    let mut cursor = 0usize;

    while let Some(tag_start_rel) = lower[cursor..].find('<') {
        let tag_start = cursor + tag_start_rel;
        let Some(tag_end_rel) = lower[tag_start..].find('>') else {
            break;
        };
        let tag_end = tag_start + tag_end_rel;
        let tag_content = lower[tag_start + 1..tag_end].trim();
        let tag_name = tag_content
            .trim_start_matches('/')
            .split_whitespace()
            .next()
            .unwrap_or("")
            .split(':')
            .last()
            .unwrap_or("");

        if tag_content.starts_with('/') || tag_name != "href" {
            cursor = tag_end + 1;
            continue;
        }

        let content_start = tag_end + 1;
        let Some(close_start_rel) = lower[content_start..].find("</") else {
            break;
        };
        let close_start = content_start + close_start_rel;
        let Some(close_end_rel) = lower[close_start..].find('>') else {
            break;
        };
        let close_end = close_start + close_end_rel;
        let close_content = lower[close_start + 2..close_end].trim();
        let close_name = close_content
            .split_whitespace()
            .next()
            .unwrap_or("")
            .split(':')
            .last()
            .unwrap_or("");
        if close_name == "href" {
            result.push(xml[content_start..close_start].trim().to_string());
        }
        cursor = close_end + 1;
    }

    result
}

async fn scan_remote_bundles(client: &WebDavClient) -> Result<Vec<AccountBundle>, String> {
    let mut bundles = Vec::new();
    for path in client.scan_account_paths().await? {
        let Some(text) = client.get_text_relative(&path).await? else {
            continue;
        };
        if let Ok(bundle) = parse_bundle_text(&text) {
            bundles.push(bundle);
        }
    }
    Ok(bundles)
}

async fn update_manifest_with_bundle(
    client: &WebDavClient,
    bundle: &AccountBundle,
) -> Result<Option<String>, String> {
    let state = client.load_manifest_state().await?;
    let mut warning = None;
    let mut manifest = match state {
        ManifestLoadState::Existing(manifest) => manifest,
        ManifestLoadState::Missing => {
            let bundles = scan_remote_bundles(client).await?;
            if bundles.is_empty() {
                default_manifest()
            } else {
                warning = Some("manifest.json 缺失，已按账号文件重建".into());
                build_manifest_from_bundles(&bundles)?
            }
        }
        ManifestLoadState::Invalid => {
            let bundles = scan_remote_bundles(client).await?;
            warning = Some("manifest.json 损坏，已按账号文件重建".into());
            if bundles.is_empty() {
                default_manifest()
            } else {
                build_manifest_from_bundles(&bundles)?
            }
        }
    };
    manifest.schema_version = 1;
    manifest
        .accounts
        .insert(bundle.account.key.clone(), build_manifest_entry(bundle)?);
    client.put_json_relative("manifest.json", &manifest).await?;
    Ok(warning)
}

fn extract_webdav_config(config: &AppConfigData) -> Result<WebDavConfigData, String> {
    let mut result = config.webdav.clone();
    result.base_url = normalize_string(&result.base_url);
    result.username = normalize_string(&result.username);
    result.base_path = normalize_base_path(&result.base_path);

    if result.base_url.is_empty()
        || result.username.is_empty()
        || result.password.is_empty()
        || result.base_path.is_empty()
    {
        return Err("请先填写完整的 WebDAV 配置".into());
    }
    Ok(result)
}

#[command]
pub async fn webdav_test_connection() -> Result<Value, String> {
    let config = load_config_data()?;
    let webdav = extract_webdav_config(&config)?;
    let client = WebDavClient::new(&webdav)?;
    client.ensure_structure().await?;

    let manifest = match client.load_manifest_state().await? {
        ManifestLoadState::Existing(manifest) => manifest,
        ManifestLoadState::Missing => default_manifest(),
        ManifestLoadState::Invalid => {
            return Err("远端 manifest.json 结构错误，请先修复后再重试".into())
        }
    };

    client.put_json_relative("manifest.json", &manifest).await?;
    match client.load_manifest_state().await? {
        ManifestLoadState::Existing(_) => Ok(json!({ "ok": true })),
        _ => Err("manifest.json 写入后无法再次读取".into()),
    }
}

#[command]
pub async fn webdav_sync_account(user_key: Option<String>) -> Result<WebDavSyncResult, String> {
    let mut config = load_config_data()?;
    let webdav = extract_webdav_config(&config)?;
    let client = WebDavClient::new(&webdav)?;
    client.ensure_structure().await?;

    let target_key = normalize_string(user_key.as_deref().unwrap_or(&config.current_user));
    if target_key.is_empty() || target_key == "none" {
        return Err("请先选择一个账号".into());
    }

    let user = config
        .users
        .iter()
        .find(|item| get_user_key(item) == target_key)
        .cloned()
        .ok_or_else(|| "当前账号不存在，无法执行 WebDAV 同步".to_string())?;

    let local_bundle = build_local_bundle(&user)?;
    let local_hash = bundle_hash(&local_bundle)?;
    let state = config
        .webdav_state
        .get(&target_key)
        .cloned()
        .unwrap_or_default();
    let has_previous_state = config.webdav_state.contains_key(&target_key);

    let manifest_state = client.load_manifest_state().await?;
    let manifest = match &manifest_state {
        ManifestLoadState::Existing(manifest) => Some(manifest),
        _ => None,
    };

    let remote_payload = client
        .download_account_text_for_key(&target_key, manifest)
        .await?;
    let remote_bundle = if let Some((_path, text)) = remote_payload.as_ref() {
        match parse_bundle_text(text) {
            Ok(bundle) => Some(bundle),
            Err(error) => {
                let remote_value = match serde_json::from_str::<Value>(text) {
                    Ok(raw) => json!({
                        "parseError": error,
                        "raw": raw,
                    }),
                    Err(_) => json!({
                        "parseError": error,
                        "rawText": text,
                    }),
                };
                let _ = save_conflict_snapshots(
                    &target_key,
                    &bundle_to_value(&local_bundle),
                    &remote_value,
                );
                return Err("检测到账号冲突，已暂停同步：远端账号文件结构损坏".into());
            }
        }
    } else {
        None
    };

    if let Some(remote_bundle) = remote_bundle.as_ref() {
        if let Err(error) = validate_identity(&local_bundle, remote_bundle) {
            let _ = save_conflict_snapshots(
                &target_key,
                &bundle_to_value(&local_bundle),
                &bundle_to_value(remote_bundle),
            );
            return Err(format!("存在账号冲突，已暂停同步：{}", error));
        }
        if let Err(error) = validate_record_conflicts(&local_bundle, remote_bundle) {
            let _ = save_conflict_snapshots(
                &target_key,
                &bundle_to_value(&local_bundle),
                &bundle_to_value(remote_bundle),
            );
            return Err(format!("存在账号冲突，已暂停同步：{}", error));
        }
    }

    let remote_hash = if let Some(bundle) = remote_bundle.as_ref() {
        bundle_hash(bundle)?
    } else {
        String::new()
    };

    let decide_without_state = |local_bundle: &AccountBundle,
                                remote_bundle: Option<&AccountBundle>,
                                local_hash: &str,
                                remote_hash: &str| {
        let Some(remote_bundle) = remote_bundle else {
            return "uploaded".to_string();
        };
        if local_hash == remote_hash {
            return "noop".to_string();
        }
        if !bundle_has_records(local_bundle) && bundle_has_records(remote_bundle) {
            return "downloaded".to_string();
        }
        if bundle_has_records(local_bundle) && !bundle_has_records(remote_bundle) {
            return "uploaded".to_string();
        }
        "merged".to_string()
    };

    let action = if !has_previous_state {
        decide_without_state(
            &local_bundle,
            remote_bundle.as_ref(),
            &local_hash,
            &remote_hash,
        )
    } else if remote_bundle.is_none() {
        "uploaded".to_string()
    } else if local_hash == state.last_local_hash && remote_hash == state.last_remote_hash {
        "noop".to_string()
    } else if local_hash != state.last_local_hash && remote_hash == state.last_remote_hash {
        "uploaded".to_string()
    } else if local_hash == state.last_local_hash && remote_hash != state.last_remote_hash {
        "downloaded".to_string()
    } else {
        "merged".to_string()
    };

    let mut warning_parts: Vec<String> = Vec::new();
    let now = now_iso_string();
    let mut manifest_updated = false;
    let mut local_changed = false;
    let mut final_bundle = local_bundle.clone();
    let final_hash = match action.as_str() {
        "noop" => {
            config.webdav_state.insert(
                target_key.clone(),
                WebDavStateItem {
                    last_local_hash: local_hash.clone(),
                    last_remote_hash: remote_hash.clone(),
                    last_sync_at: if state.last_sync_at.trim().is_empty() {
                        now.clone()
                    } else {
                        state.last_sync_at.clone()
                    },
                },
            );
            save_config_data(&config)?;
            return Ok(WebDavSyncResult {
                account_key: target_key,
                status: "noop".into(),
                message: "双端无变化，未执行写入。".into(),
                warning: None,
                local_changed: false,
                manifest_updated: false,
                updated_at: now,
            });
        }
        "uploaded" => {
            final_bundle.updated_at = now.clone();
            client
                .put_json_relative(
                    &account_relative_path(&target_key),
                    &bundle_to_remote_value(&final_bundle),
                )
                .await?;
            write_bundle_to_local_record(&target_key, &final_bundle)?;
            match update_manifest_with_bundle(&client, &final_bundle).await {
                Ok(warning) => {
                    manifest_updated = true;
                    if let Some(warning) = warning {
                        warning_parts.push(warning);
                    }
                }
                Err(error) => warning_parts.push(error),
            }
            bundle_hash(&final_bundle)?
        }
        "downloaded" => {
            let remote_bundle = remote_bundle.ok_or_else(|| "远端账号文件不存在".to_string())?;
            write_bundle_to_local_record(&target_key, &remote_bundle)?;
            upsert_user_from_bundle(&mut config, &remote_bundle, false)?;
            let hash = bundle_hash(&remote_bundle)?;
            final_bundle = remote_bundle;
            local_changed = true;
            hash
        }
        "merged" => {
            let remote_bundle = remote_bundle.ok_or_else(|| "远端账号文件不存在".to_string())?;
            let merged = match merge_bundles(&local_bundle, &remote_bundle) {
                Ok(merged) => merged,
                Err(error) => {
                    let _ = save_conflict_snapshots(
                        &target_key,
                        &bundle_to_value(&local_bundle),
                        &bundle_to_value(&remote_bundle),
                    );
                    return Err(format!("检测到账号冲突，已暂停同步：{}", error));
                }
            };
            client
                .put_json_relative(
                    &account_relative_path(&target_key),
                    &bundle_to_remote_value(&merged),
                )
                .await?;
            write_bundle_to_local_record(&target_key, &merged)?;
            upsert_user_from_bundle(&mut config, &merged, false)?;
            match update_manifest_with_bundle(&client, &merged).await {
                Ok(warning) => {
                    manifest_updated = true;
                    if let Some(warning) = warning {
                        warning_parts.push(warning);
                    }
                }
                Err(error) => warning_parts.push(error),
            }
            let hash = bundle_hash(&merged)?;
            final_bundle = merged;
            local_changed = true;
            hash
        }
        _ => return Err("未知同步状态".into()),
    };

    config.webdav_state.insert(
        target_key.clone(),
        WebDavStateItem {
            last_local_hash: final_hash.clone(),
            last_remote_hash: final_hash.clone(),
            last_sync_at: final_bundle.updated_at.clone(),
        },
    );
    save_config_data(&config)?;

    let message = match action.as_str() {
        "uploaded" => "本地账号数据已上传到 WebDAV。".to_string(),
        "downloaded" => "已使用 WebDAV 远端数据覆盖本地账号数据。".to_string(),
        "merged" => "检测到双端变更，已完成自动并集合并。".to_string(),
        _ => "同步完成。".to_string(),
    };

    Ok(WebDavSyncResult {
        account_key: target_key,
        status: action,
        message,
        warning: if warning_parts.is_empty() {
            None
        } else {
            Some(warning_parts.join("；"))
        },
        local_changed,
        manifest_updated,
        updated_at: final_bundle.updated_at,
    })
}

#[command]
pub async fn webdav_list_restore_accounts() -> Result<Vec<WebDavRestoreAccount>, String> {
    let config = load_config_data()?;
    let webdav = extract_webdav_config(&config)?;
    let client = WebDavClient::new(&webdav)?;
    client.ensure_structure().await?;

    let manifest_state = client.load_manifest_state().await?;
    let mut by_key: BTreeMap<String, AccountBundle> = BTreeMap::new();

    if let ManifestLoadState::Existing(manifest) = &manifest_state {
        for key in manifest.accounts.keys() {
            let Some((_path, text)) = client
                .download_account_text_for_key(key, Some(manifest))
                .await?
            else {
                continue;
            };
            if let Ok(bundle) = parse_bundle_text(&text) {
                by_key.insert(bundle.account.key.clone(), bundle);
            }
        }
    }

    for bundle in scan_remote_bundles(&client).await? {
        by_key.insert(bundle.account.key.clone(), bundle);
    }

    let bundles: Vec<_> = by_key.into_values().collect();
    if !bundles.is_empty() {
        let manifest = build_manifest_from_bundles(&bundles)?;
        let _ = client.put_json_relative("manifest.json", &manifest).await;
    }

    let mut result = bundles
        .into_iter()
        .map(|bundle| WebDavRestoreAccount {
            key: bundle.account.key,
            provider: bundle.account.provider,
            uid: bundle.account.uid,
            role_id: bundle.account.role_id,
            updated_at: bundle.updated_at,
        })
        .collect::<Vec<_>>();
    result.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(result)
}

#[command]
pub async fn webdav_restore_accounts(keys: Vec<String>) -> Result<WebDavRestoreResult, String> {
    let selected_keys = keys
        .into_iter()
        .map(|item| normalize_string(&item))
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();
    if selected_keys.is_empty() {
        return Err("请至少选择一个远端账号".into());
    }

    let mut config = load_config_data()?;
    let webdav = extract_webdav_config(&config)?;
    let client = WebDavClient::new(&webdav)?;
    client.ensure_structure().await?;

    let manifest_state = client.load_manifest_state().await?;
    let manifest = match &manifest_state {
        ManifestLoadState::Existing(manifest) => Some(manifest),
        _ => None,
    };

    let mut restored = Vec::new();

    for key in selected_keys {
        let Some((_path, text)) = client.download_account_text_for_key(&key, manifest).await?
        else {
            return Err(format!("远端账号文件不存在：{}", key));
        };
        let bundle = parse_bundle_text(&text).map_err(|_| format!("远端账号文件损坏：{}", key))?;
        write_bundle_to_local_record(&bundle.account.key, &bundle)?;
        upsert_user_from_bundle(&mut config, &bundle, true)?;
        let hash = bundle_hash(&bundle)?;
        config.webdav_state.insert(
            bundle.account.key.clone(),
            WebDavStateItem {
                last_local_hash: hash.clone(),
                last_remote_hash: hash.clone(),
                last_sync_at: bundle.updated_at.clone(),
            },
        );
        restored.push(bundle.account.key.clone());
    }

    if !restored.is_empty() {
        let has_current_user = config
            .users
            .iter()
            .any(|user| get_user_key(user) == config.current_user);
        if !has_current_user {
            config.current_user = restored[0].clone();
        }
    }

    save_config_data(&config)?;
    Ok(WebDavRestoreResult {
        restored,
        current_user: config.current_user,
    })
}
