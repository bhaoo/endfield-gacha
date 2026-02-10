import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, User } from "~/types/gacha";
import {
  isSystemUid,
  systemUidLabel,
  SYSTEM_UID_CN,
  SYSTEM_UID_GLOBAL,
} from "~/utils/systemAccount";

export const useUserStore = () => {
  const userList = useState<User[]>("global-user-list", () => []);
  const { isWindows } = usePlatform();
  const updateSeenVersion = useState<string>("global-update-seen-version", () => "");
  const currentUser = useState<string>("current-uid", () => "none");
  const savabled = useState<boolean>("global-savabled", () => false);

  const getUserKey = (u: User) =>
    u.key || (u.roleId?.roleId ? `${u.uid}_${u.roleId.roleId}` : u.uid);

  const uidList = computed(() =>
    [
      ...(isWindows.value
        ? [
            { label: systemUidLabel(SYSTEM_UID_CN), value: SYSTEM_UID_CN },
            { label: systemUidLabel(SYSTEM_UID_GLOBAL), value: SYSTEM_UID_GLOBAL },
          ]
        : []),
      ...userList.value
        .map((u) => ({
          label:
            u.roleId?.nickName && u.roleId?.roleId
              ? `${u.roleId.nickName}(${u.roleId.roleId})`
              : u.uid,
          value: getUserKey(u),
        }))
        .filter((item) => !isSystemUid(item.value)),
    ],
  );

  const colorMode = useColorMode();
  const currentTheme = useState<"system" | "light" | "dark">(
    "global-theme",
    () => "system",
  );

  const loadConfig = async () => {
    savabled.value = false;
    try {
      await usePlatform().detect();
      const config = await invoke<AppConfig>("read_config");
      userList.value = Array.isArray(config.users)
        ? config.users.map((u) => ({
            ...u,
            provider: u.provider || "hypergryph",
            source: u.source || (u.token ? "login" : "log"),
            key: getUserKey(u),
          }))
        : [];

      if (config.currentUser) {
        currentUser.value = config.currentUser;
      }

      const savedTheme = config.theme || "system";
      currentTheme.value = savedTheme;
      colorMode.preference = savedTheme;

      updateSeenVersion.value = config.updateSeenVersion || "";
    } catch (e) {
      console.error("加载配置失败", e);
      userList.value = [];
      currentTheme.value = "system";
      updateSeenVersion.value = "";
    } finally {
      savabled.value = true;
    }
  };

  const saveConfig = async (): Promise<boolean> => {
    if (!savabled.value) {
      console.log("当前状态不允许保存配置");
      return false;
    }
    try {
      const configData: AppConfig = {
        users: toRaw(userList.value),
        currentUser: currentUser.value,
        theme: currentTheme.value,
        updateSeenVersion: updateSeenVersion.value || "",
      };
      await invoke("save_config", { data: configData });
      console.log("配置已同步到硬盘");
      return true;
    } catch (e) {
      console.error("保存配置失败:", e);
      return false;
    }
  };

  watch(currentUser, async (newVal, oldVal) => {
    if (newVal !== oldVal) {
      await saveConfig();
    }
  });

  const setTheme = async (newTheme: "system" | "light" | "dark") => {
    if (currentTheme.value === newTheme) return;

    currentTheme.value = newTheme;
    colorMode.preference = newTheme;

    await saveConfig();
  };

  const setUpdateSeenVersion = async (version: string) => {
    updateSeenVersion.value = String(version || "").trim();
    await saveConfig();
  };

  const addUser = async (newUser: User): Promise<boolean> => {
    const normalized = {
      ...newUser,
      provider: newUser.provider || "hypergryph",
      source: newUser.source || (newUser.token ? "login" : "log"),
      key: getUserKey(newUser),
    };
    const index = userList.value.findIndex((u) => getUserKey(u) === normalized.key);
    if (index !== -1) {
      userList.value[index] = normalized;
    } else {
      userList.value.push(normalized);
    }

    return await saveConfig();
  };

  return {
    userList,
    uidList,
    currentUser,
    loadConfig,
    addUser,
    updateSeenVersion,
    setUpdateSeenVersion,
    currentTheme,
    setTheme,
  };
};
