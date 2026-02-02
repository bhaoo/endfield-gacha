import { invoke } from "@tauri-apps/api/core";

export type AppPlatform = "windows" | "macos" | "linux" | "unknown";

const normalizePlatform = (raw: string | null | undefined): AppPlatform => {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!v) return "unknown";
  if (v === "windows" || v === "win32") return "windows";
  if (v === "macos" || v === "darwin" || v === "mac") return "macos";
  if (v === "linux") return "linux";
  return "unknown";
};

const inferPlatformFromNavigator = (): AppPlatform => {
  try {
    const anyNavigator = navigator as any;
    const uaDataPlatform = String(anyNavigator?.userAgentData?.platform ?? "");
    const platform = String(navigator.platform ?? "");
    const ua = String(navigator.userAgent ?? "");
    return normalizePlatform(`${uaDataPlatform} ${platform} ${ua}`);
  } catch {
    return "unknown";
  }
};

export const usePlatform = () => {
  const platform = useState<AppPlatform>("app-platform", () =>
    inferPlatformFromNavigator(),
  );
  const ready = useState<boolean>("app-platform-ready", () => false);

  const isWindows = computed(() => platform.value === "windows");

  const detect = async (): Promise<AppPlatform> => {
    if (ready.value) return platform.value;
    try {
      const os = await invoke<string>("get_os");
      platform.value = normalizePlatform(os);
    } catch {
      platform.value = inferPlatformFromNavigator();
    } finally {
      ready.value = true;
    }
    return platform.value;
  };

  return { platform, isWindows, detect };
};

