import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { readTextFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import type { Ref } from "vue";
import type { AppConfig, User, UserRole } from "~/types/gacha";
import { parseGachaParams } from "~/utils/gachaCalc";
import {
  SYSTEM_UID_AUTO,
  SYSTEM_UID_CN,
  SYSTEM_UID_GLOBAL,
  systemUidLabel,
} from "~/utils/systemAccount";

export type GachaAuth = {
  u8Token: string;
  provider: "hypergryph" | "gryphline";
  serverId: string;
};

export type SystemGachaAuth = GachaAuth & {
  detectedUid: string;
  detectedRoleId: string;
  detectedUserKey: string;
  channelLabel: string;
  roleName: string;
  serverName: string;
};

export const useGachaAuth = (params: {
  userAgent: Ref<string>;
  isWindows: Ref<boolean>;
  detectPlatform: () => Promise<unknown>;
  loadPoolInfo: () => Promise<void>;
  addUser: (u: User) => Promise<boolean>;
}) => {
  const getGachaUri = async (provider: "hypergryph" | "gryphline") => {
    await params.detectPlatform();
    await params.loadPoolInfo();
    if (!params.isWindows.value) return "";

    const logPath =
      provider === "gryphline"
        ? "AppData/LocalLow/Gryphline/Endfield/sdklogs/HGWebview.log"
        : "AppData/LocalLow/Hypergryph/Endfield/sdklogs/HGWebview.log";
    const targetPrefix = `https://ef-webview.${provider}.com/page/gacha_`;
    try {
      const content = await readTextFile(logPath, {
        baseDir: BaseDirectory.Home,
      });
      const lines = content.split(/\r?\n/).reverse();
      const matchLine = lines.find((line) => line.includes(targetPrefix));

      if (matchLine) {
        const urlRegex = new RegExp(
          `(https:\\/\\/ef-webview\\.${provider}\\.com\\/page\\/gacha_[^\\s]*)`,
        );
        const result = matchLine.match(urlRegex);
        return result?.[1] || "";
      }
      return "";
    } catch (err) {
      console.error(`[日志读取失败] provider=${provider}`, err);
      return "";
    }
  };

  const inferChannelLabel = (p: {
    channel?: string;
    subChannel?: string;
  }): "官服" | "B服" | "未知渠道" => {
    const channel = String(p.channel ?? "");
    const subChannel = String(p.subChannel ?? "");
    if (channel === "1" && subChannel === "1") return "官服";
    if (channel === "2" && subChannel === "2") return "B服";
    return "未知渠道";
  };

  const queryUidRoleFromU8Token = async (
    provider: "hypergryph" | "gryphline",
    u8Token: string,
    serverId: string,
  ): Promise<{
    uid: string;
    roleId: string;
    roleName: string;
    serverName: string;
  }> => {
    const res = await fetch(
      `https://u8.${provider}.com/game/role/v1/query_role_list`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          "User-Agent": params.userAgent.value,
        },
        body: JSON.stringify({ token: u8Token, serverId }),
      },
    );

    if (!res.ok) {
      throw new Error(`query_role_list 请求失败: ${res.status}`);
    }

    const json = await res.json();
    if (json?.status !== 0) {
      throw new Error(`query_role_list 返回异常: ${json?.msg || "unknown"}`);
    }

    const uid = String(json?.data?.uid ?? "").trim();
    const roles = Array.isArray(json?.data?.roles) ? json.data.roles : [];
    const role =
      roles.find((r: any) => String(r?.serverId ?? "") === String(serverId)) ??
      roles[0];
    const roleId = String(role?.roleId ?? "").trim();
    const roleName = String(role?.nickname ?? role?.nickName ?? "").trim();
    const serverName = String(role?.serverName ?? "").trim();

    if (!uid) throw new Error("query_role_list 解析失败: 未找到 uid");
    if (!roleId) throw new Error("query_role_list 解析失败: 未找到 roleId");

    return { uid, roleId, roleName, serverName };
  };

  const getSystemAuthFromLog = async (
    systemUid: string,
  ): Promise<SystemGachaAuth> => {
    // system(自动识别) 仅用于兼容旧版本：优先尝试国服日志，找不到再尝试国际服日志。
    let provider: "hypergryph" | "gryphline" =
      systemUid === SYSTEM_UID_GLOBAL ? "gryphline" : "hypergryph";

    let uri = "";
    if (systemUid === SYSTEM_UID_AUTO) {
      uri =
        (await getGachaUri("hypergryph")) || (await getGachaUri("gryphline"));
      provider = uri.includes("ef-webview.gryphline.com")
        ? "gryphline"
        : "hypergryph";
    } else {
      uri = await getGachaUri(provider);
    }
    if (!uri) {
      throw new Error(
        "未在日志中找到抽卡链接哦~请先在游戏内打开一次抽卡记录页面，再进行同步~",
      );
    }

    const gachaParams = parseGachaParams(uri);
    if (!gachaParams?.u8_token) {
      throw new Error("抽卡链接参数解析失败：未找到 u8_token");
    }

    const pickServerId = () => {
      const candidates = [
        (gachaParams as any)?.server_id,
        (gachaParams as any)?.serverId,
        (gachaParams as any)?.serverid,
        (gachaParams as any)?.server,
      ];
      return String(
        candidates.find((x) => x != null && String(x).trim() !== "") ?? "",
      ).trim();
    };

    const serverId = provider === "gryphline" ? pickServerId() : "1";
    if (provider === "gryphline" && !serverId) {
      throw new Error("抽卡链接参数解析失败：未找到 serverId（国际服需要）");
    }

    const { uid, roleId, roleName, serverName } = await queryUidRoleFromU8Token(
      provider,
      gachaParams.u8_token,
      serverId,
    );

    const channelLabel =
      provider === "hypergryph"
        ? inferChannelLabel({
            channel: gachaParams.channel,
            subChannel: gachaParams.subChannel,
          })
        : "国际服";

    return {
      u8Token: gachaParams.u8_token,
      provider,
      serverId,
      detectedUid: uid,
      detectedRoleId: roleId,
      detectedUserKey: `${uid}_${roleId}`,
      channelLabel,
      roleName,
      serverName:
        serverName || (provider === "gryphline" ? "Global" : "China"),
    };
  };

  const getUserKey = (u: any) =>
    u?.key || (u?.roleId?.roleId ? `${u.uid}_${u.roleId.roleId}` : u?.uid);

  const findConfigUserByKey = (config: any, userKey: string): User | null => {
    const users = Array.isArray(config?.users) ? (config.users as User[]) : [];
    const u = users.find((x: any) => getUserKey(x) === userKey) as
      | User
      | undefined;
    return u || null;
  };

  const initUserRecord = async (uid: string) => {
    await invoke("init_user_record", { uid });
  };

  const upsertLogUser = async (auth: SystemGachaAuth): Promise<void> => {
    const key = auth.detectedUserKey;

    await initUserRecord(key);

    const role: UserRole = {
      serverId: auth.serverId,
      serverName:
        auth.serverName || (auth.provider === "gryphline" ? "Global" : "China"),
      nickName: auth.roleName || auth.detectedRoleId,
      roleId: auth.detectedRoleId,
    };

    const u: User = {
      key,
      uid: auth.detectedUid,
      token: "",
      provider: auth.provider,
      roleId: role,
      source: "log",
    };

    await params.addUser(u);
  };

  const getEfServerId = (
    provider: "hypergryph" | "gryphline",
    role?: { serverId: string; serverName: string } | null,
  ) => {
    if (provider === "hypergryph") return "1";

    const rawId = String(role?.serverId ?? "").trim();
    // const rawName = String(role?.serverName ?? "").toLowerCase();

    if (provider === "gryphline") return rawId;

    return "1";
  };

  const getAuthToken = async (userKey: string): Promise<GachaAuth | null> => {
    try {
      const config = await invoke<AppConfig>("read_config");
      const targetUser = config.users?.find((u) => getUserKey(u) === userKey);
      if (!targetUser?.token) return null;

      const provider = targetUser.provider || "hypergryph";
      const serverId = getEfServerId(provider, targetUser.roleId || null);
      const uid = targetUser.uid;

      const authRes = await fetch(
        `https://as.${provider}.com/user/oauth2/v2/grant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": params.userAgent.value,
          },
          body: JSON.stringify({
            type: 1,
            appCode:
              provider === "gryphline"
                ? "3dacefa138426cfe"
                : "be36d44aa36bfb5b",
            token: targetUser.token,
          }),
        },
      );
      if (!authRes.ok) return null;
      const authData = await authRes.json();

      const u8Res = await fetch(
        `https://binding-api-account-prod.${provider}.com/account/binding/v1/u8_token_by_uid`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": params.userAgent.value,
          },
          body: JSON.stringify({ uid, token: authData.data.token }),
        },
      );
      if (!u8Res.ok) return null;
      const u8Data = await u8Res.json();
      if (!u8Data?.data?.token) return null;
      return { u8Token: u8Data.data.token as string, provider, serverId };
    } catch (e) {
      console.error("Auth error", e);
      return null;
    }
  };

  const systemRegionLabel = (auth: SystemGachaAuth) =>
    auth.provider === "gryphline"
      ? systemUidLabel(SYSTEM_UID_GLOBAL)
      : systemUidLabel(SYSTEM_UID_CN);

  return {
    getAuthToken,
    getSystemAuthFromLog,
    findConfigUserByKey,
    initUserRecord,
    upsertLogUser,
    systemRegionLabel,
  };
};
