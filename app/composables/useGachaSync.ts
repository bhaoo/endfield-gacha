import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import type {
  AppConfig,
  EndFieldCharInfo,
  EndFieldGachaResponse,
} from "~/types/gacha";
import {
  analyzePoolData,
  delay,
  parseGachaParams,
  POOL_TYPES,
} from "~/utils/gachaCalc";

export const useGachaSync = () => {
  const toast = useToast();
  const showToast = (title: string, desc: string) => {
    toast.add({
      title: title,
      description: desc,
    });
  };

  const records = ref<Record<string, EndFieldCharInfo[]>>({});
  const isSyncing = ref(false);
  const user_agent = ref(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.112 Safari/537.36",
  );

  const statistics = computed(() => {
    if (!records.value || Object.keys(records.value).length === 0) return [];
    return Object.keys(records.value).map((poolKey) => {
      return analyzePoolData(poolKey, records.value[poolKey]);
    });
  });

  const loadFromUserData = async (uid: string) => {
    try {
      const rawLocalData = await invoke<any>("read_gacha_records", { uid });

      let localData: Record<string, EndFieldCharInfo[]> = {};

      if (Array.isArray(rawLocalData) && rawLocalData.length === 0) {
        localData = {};
      } else {
        localData = rawLocalData;
      }

      records.value = localData;
    } catch (err) {
      console.error("loadFromUserData error:", err);
    }
  };

  const mergeRecords = (
    oldRecords: EndFieldCharInfo[],
    newRecords: EndFieldCharInfo[],
  ): EndFieldCharInfo[] => {
    const existingIds = new Set(oldRecords.map((r) => r.seqId));
    const uniqueNewRecords = newRecords.filter(
      (r) => !existingIds.has(r.seqId),
    );
    if (uniqueNewRecords.length === 0) {
      return oldRecords;
    }
    const merged = [...oldRecords, ...uniqueNewRecords];

    return merged.sort((a, b) => {
      if (a.seqId.length === b.seqId.length) {
        return b.seqId.localeCompare(a.seqId);
      }
      return Number(b.seqId) - Number(a.seqId);
    });
  };

  const saveUserData = async (
    uid: string,
    fetchedData: Record<string, EndFieldCharInfo[]>,
  ) => {
    try {
      if (!uid) {
      }

      const rawLocalData = await invoke<any>("read_gacha_records", { uid });

      let localData: Record<string, EndFieldCharInfo[]> = {};

      if (Array.isArray(rawLocalData) && rawLocalData.length === 0) {
        localData = {};
      } else {
        localData = rawLocalData;
      }

      let totalNewCount = 0;

      for (const [poolType, newRecords] of Object.entries(fetchedData)) {
        const oldRecords = localData[poolType] || [];
        const mergedList = mergeRecords(oldRecords, newRecords);
        totalNewCount += mergedList.length - oldRecords.length;
        localData[poolType] = mergedList;
      }

      if (totalNewCount > 0) {
        await invoke("save_gacha_records", { uid, data: localData });
        console.log(`保存成功，共新增 ${totalNewCount} 条记录`);
        return totalNewCount;
      } else {
        console.log("数据已是最新");
        return 0;
      }
    } catch (err) {
      console.error("saveUserData error:", err);
      return -1;
    }
  };

  const fetchPoolData = async (u8_token: string, poolType: string) => {
    const allData: EndFieldCharInfo[] = [];
    let nextSeqId = "";
    let hasMore = true;

    const apiBaseUrl = "https://ef-webview.hypergryph.com/api/record/char";

    try {
      while (hasMore) {
        const query = new URLSearchParams({
          lang: "zh-cn",
          token: u8_token,
          server_id: "1",
          pool_type: poolType,
        });
        if (nextSeqId) query.set("seq_id", nextSeqId);

        const response = await fetch(`${apiBaseUrl}?${query.toString()}`, {
          method: "GET",
          headers: {
            "User-Agent": user_agent.value,
          },
        });

        if (!response.ok) {
          isSyncing.value = false;
          showToast("同步失败", "获取寻访记录数据失败。");
          return;
        }

        const res = (await response.json()) as EndFieldGachaResponse;

        if (res.code !== 0 || !res.data.list?.length) {
          isSyncing.value = false;
          showToast("同步失败", "获取寻访记录数据失败。");
          return;
        }

        const list = res.data.list;

        if (list.length === 0) {
          isSyncing.value = false;
          showToast("同步失败", "获取寻访记录数据异常。");
          return;
        }

        allData.push(...res.data.list);
        hasMore = res.data.hasMore;

        const lastItem = list[list.length - 1];
        nextSeqId = lastItem.seqId;

        if (hasMore) {
          await delay(500, 1000);
        }
      }

      return allData;
    } catch (error) {
      console.error("fetchPoolData error:", error);
      return allData;
    }
  };

  const getUserToken = async (uid: string) => {
    if (!uid) return null;

    try {
      const config = await invoke<AppConfig>("read_config");
      const targetUser = config.users?.find((u) => u.uid === uid);
      return targetUser ? targetUser.token : null;
    } catch (error) {
      console.error(`getUserToken ${uid} error: `, error);
      return null;
    }
  };

  const getU8Token = async (uid: string, token: string) => {
    if (!uid || !token) return null;

    const apiBaseUrl =
      "https://binding-api-account-prod.hypergryph.com/account/binding/v1/u8_token_by_uid";
    const payload = {
      uid: uid,
      token: token,
    };

    const response = await fetch(apiBaseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": user_agent.value,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.data.token;
  };

  const handleSync = async (uid: string) => {
    if (isSyncing.value) return;
    isSyncing.value = true;

    const token = await getUserToken(uid);
    if (!token) {
      isSyncing.value = false;
      showToast("同步失败", "UID 为空，请选择一个 UID。");
      return;
    }

    const apiBaseUrl = "https://as.hypergryph.com/user/oauth2/v2/grant";
    const payload = {
      type: 1,
      appCode: "be36d44aa36bfb5b",
      token: token,
    };

    const response = await fetch(apiBaseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": user_agent.value,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      isSyncing.value = false;
      showToast("同步失败", "token 可能过期，请重新添加账号 token。");
      return;
    }

    const data = await response.json();
    const u8_token = await getU8Token(uid, data.data.token);
    if (!u8_token) {
      isSyncing.value = false;
      showToast("同步失败", "无法获取 u8_token。");
      return;
    }

    const allData: Record<string, EndFieldCharInfo[]> = {};
    for (const poolType of POOL_TYPES) {
      console.log(`Get ${poolType}`);
      const poolData = await fetchPoolData(u8_token, poolType);
      allData[poolType] = poolData;
    }

    const saveStatus = await saveUserData(uid, allData);

    if (saveStatus !== -1) {
      await loadFromUserData(uid);
    }

    isSyncing.value = false;
    if (saveStatus === -1) {
      showToast("同步失败", "抽卡记录保存失败。");
    } else if (saveStatus === 0) {
      showToast("同步成功", "已经是最新的啦！如果是刚抽的话可能有延迟哦~");
    } else {
      showToast("同步成功", `新增 ${saveStatus} 条寻访记录！`);
    }
  };

  return {
    records,
    statistics,
    isSyncing,
    loadFromUserData,
    handleSync,
  };
};
