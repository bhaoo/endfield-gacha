import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, User } from "~/types/gacha";

export const useUserStore = () => {
  const userList = useState<User[]>("global-user-list", () => []);

  const uidList = computed(() => userList.value.map((u) => u.uid));

  const colorMode = useColorMode();
  const currentTheme = useState<"system" | "light" | "dark">(
    "global-theme",
    () => "system",
  );

  const loadConfig = async () => {
    try {
      const config = await invoke<AppConfig>("read_config");
      userList.value = Array.isArray(config.users) ? config.users : [];

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

  const addUser = async (newUser: User) => {
    const index = userList.value.findIndex((u) => u.uid === newUser.uid);
    if (index !== -1) {
      userList.value[index] = newUser;
    } else {
      userList.value.push(newUser);
    }

    await saveConfig();
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
