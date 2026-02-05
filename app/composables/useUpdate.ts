import { fetch } from "@tauri-apps/plugin-http";
import { getVersion } from "@tauri-apps/api/app";

type UpdateState = "idle" | "checking" | "uptodate" | "available" | "error";

type GitHubRelease = {
  tag_name: string;
  html_url: string;
};

const normalizeVersion = (v: string) => String(v || "").trim().replace(/^v/i, "");

const compareSemver = (aRaw: string, bRaw: string) => {
  const a = normalizeVersion(aRaw).split(".").map((x) => Number(x) || 0);
  const b = normalizeVersion(bRaw).split(".").map((x) => Number(x) || 0);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
};

export const useUpdate = () => {
  const { detect: detectPlatform } = usePlatform();
  const { updateSeenVersion } = useUserStore();

  const user_agent = ref(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.112 Safari/537.36",
  );

  const updateState = useState<UpdateState>("app-update-state", () => "idle");
  const latestVersion = useState<string>("app-latest-version", () => "");
  const latestReleaseUrl = useState<string>("app-latest-release-url", () => "");
  const updateError = useState<string>("app-update-error", () => "");
  const updateAvailable = computed(() => updateState.value === "available");
  const updateHint = computed(() => {
    if (!updateAvailable.value) return false;
    const latest = normalizeVersion(latestVersion.value);
    if (!latest) return false;
    return latest !== normalizeVersion(updateSeenVersion.value);
  });
  const lastCheckedAt = useState<number>("app-update-last-checked-at", () => 0);

  const checkForUpdate = async (opts?: { force?: boolean }) => {
    const force = Boolean(opts?.force);
    const now = Date.now();
    if (!force && now - lastCheckedAt.value < 10 * 60 * 1000) return;

    updateState.value = "checking";
    updateError.value = "";
    latestVersion.value = "";
    latestReleaseUrl.value = "";

    try {
      await detectPlatform();

      const api = "https://api.github.com/repos/bhaoo/endfield-gacha/releases/latest";
      const res = await fetch(api, {
        method: "GET",
        headers: {
          "User-Agent": user_agent.value,
          Accept: "application/vnd.github+json",
        },
      });
      if (!res.ok) throw new Error(`请求失败: ${res.status}`);
      const json = (await res.json()) as GitHubRelease;

      latestVersion.value = normalizeVersion(json.tag_name || "");
      latestReleaseUrl.value =
        json.html_url || "https://github.com/bhaoo/endfield-gacha/releases/latest";

      if (!latestVersion.value) throw new Error("未解析到最新版本号");

      let currentVersion = "";
      try {
        currentVersion = normalizeVersion(await getVersion());
      } catch {
        // ignore
      }

      // 运行时无法获取版本号时仍显示有新版本
      if (currentVersion && compareSemver(latestVersion.value, currentVersion) <= 0) {
        updateState.value = "uptodate";
      } else {
        updateState.value = "available";
      }

      lastCheckedAt.value = now;
    } catch (e: any) {
      updateState.value = "error";
      updateError.value = e?.message || "检查更新失败";
      lastCheckedAt.value = now;
    }
  };

  return {
    updateState,
    updateAvailable,
    updateHint,
    latestVersion,
    latestReleaseUrl,
    updateError,
    lastCheckedAt,
    checkForUpdate,
  };
};
