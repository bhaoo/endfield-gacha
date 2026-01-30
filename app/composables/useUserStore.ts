import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, User } from "~/types/gacha";
import {
  isSystemUid,
  systemUidLabel,
  SYSTEM_UID_AUTO,
  SYSTEM_UID_BILIBILI,
  SYSTEM_UID_OFFICIAL,
} from "~/utils/systemAccount";

export const useUserStore = () => {
  const userList = useState<User[]>("global-user-list", () => []);

  const getUserKey = (u: User) =>
    u.key || (u.roleId?.roleId ? `${u.uid}_${u.roleId.roleId}` : u.uid);

  const uidList = computed(() =>
    [
      { label: systemUidLabel(SYSTEM_UID_AUTO), value: SYSTEM_UID_AUTO },
      { label: systemUidLabel(SYSTEM_UID_OFFICIAL), value: SYSTEM_UID_OFFICIAL },
      { label: systemUidLabel(SYSTEM_UID_BILIBILI), value: SYSTEM_UID_BILIBILI },
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
    try {
      const config = await invoke<AppConfig>("read_config");
      userList.value = Array.isArray(config.users)
        ? config.users.map((u) => ({
            ...u,
            provider: u.provider || "hypergryph",
            key: getUserKey(u),
          }))
        : [];

      const savedTheme = config.theme || "system";
      currentTheme.value = savedTheme;
      colorMode.preference = savedTheme;
    } catch (e) {
      console.error("加载配置失败", e);
      userList.value = [];
      currentTheme.value = "system";
    }
  };

  const saveConfig = async (): Promise<boolean> => {
    try {
      const configData: AppConfig = {
        users: toRaw(userList.value),
        theme: currentTheme.value,
      };
      await invoke("save_config", { data: configData });
      console.log("配置已同步到硬盘");
      return true;
    } catch (e) {
      console.error("保存配置失败:", e);
      return false;
    }
  };

  const setTheme = async (newTheme: "system" | "light" | "dark") => {
    if (currentTheme.value === newTheme) return;

    currentTheme.value = newTheme;
    colorMode.preference = newTheme;

    await saveConfig();
  };

  const addUser = async (newUser: User): Promise<boolean> => {
    const normalized = { ...newUser, key: getUserKey(newUser) };
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
    loadConfig,
    addUser,
    currentTheme,
    setTheme
  };
};
