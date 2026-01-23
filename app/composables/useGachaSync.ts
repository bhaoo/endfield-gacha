import { readTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { fetch } from '@tauri-apps/plugin-http';
import { invoke } from '@tauri-apps/api/core';
import type { EndFieldCharInfo, EndFieldGachaResponse, EndfieldGachaParams } from '~/types/gacha';
import { analyzePoolData, delay, parseGachaParams, POOL_TYPES } from '~/utils/gachaCalc';

export const useGachaSync = () => {
  const records = ref<Record<string, EndFieldCharInfo[]>>({});
  const isSyncing = ref(false);

  const statistics = computed(() => {
    if (!records.value || Object.keys(records.value).length === 0) return [];
    return Object.keys(records.value).map(poolKey => {
      return analyzePoolData(poolKey, records.value[poolKey]);
    });
  });

  const loadFromUserData = async () => {
    try {
      const data = await invoke<Record<string, EndFieldCharInfo[]>>('read_json_from_userdata');
      if (data && Object.keys(data).length > 0) {
        records.value = data;
      }
    } catch (err) {
      console.error("读取本地数据失败:", err);
    }
  };

  const saveToUserData = async (newData: Record<string, EndFieldCharInfo[]>) => {
    try {
      // 读取旧数据
      const localData = records.value || {}; 
      
      const mergedData: Record<string, EndFieldCharInfo[]> = {};
      const allKeys = new Set([...Object.keys(localData), ...Object.keys(newData)]);

      for (const key of allKeys) {
        const oldList = localData[key] || [];
        const newList = newData[key] || [];
        
        const map = new Map();
        // 旧数据打底，新数据覆盖
        [...oldList, ...newList].forEach(item => map.set(item.seqId, item));
        
        // 排序：seqId 倒序 (大->小，即 新->旧)
        mergedData[key] = Array.from(map.values())
          .sort((a, b) => b.seqId.localeCompare(a.seqId));
      }

      await invoke('save_json_to_userdata', { data: mergedData });
      records.value = mergedData;
      return true;
    } catch (err) {
      console.error("保存失败:", err);
      return false;
    }
  };

  const getGachaUri = async () => {
    const logPath = 'AppData/LocalLow/Hypergryph/Endfield/sdklogs/HGWebview.log';
    const targetPrefix = 'https://ef-webview.hypergryph.com/page/gacha_char';
    try {
      const content = await readTextFile(logPath, { baseDir: BaseDirectory.Home });
      const lines = content.split(/\r?\n/).reverse();
      const matchLine = lines.find(line => line.includes(targetPrefix));
      
      if (matchLine) {
        const urlRegex = /(https:\/\/ef-webview\.hypergryph\.com\/page\/gacha_char[^\s]*)/;
        const result = matchLine.match(urlRegex);
        return result?.[1] || "";
      }
      return "";
    } catch (err) {
      console.error("日志读取失败:", err);
      return "";
    }
  };

  const fetchPoolData = async (params: EndfieldGachaParams, poolType: string, referer: string) => {
    const allData: EndFieldCharInfo[] = [];
    let seqId = "";
    const apiBaseUrl = "https://ef-webview.hypergryph.com/api/record/char";
    const authToken = params.u8_token || params.token || "";

    while (true) {
      const query = new URLSearchParams({
        lang: params.lang,
        token: authToken,
        server_id: params.server,
        pool_type: poolType,
      });
      if (seqId) query.set("seq_id", seqId);

      const response = await fetch(`${apiBaseUrl}?${query.toString()}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Referer': referer
        }
      });
      
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      const res = (await response.json()) as EndFieldGachaResponse;

      if (res.code !== 0 || !res.data.list?.length) break;

      allData.push(...res.data.list);
      seqId = res.data.list[res.data.list.length - 1].seqId;

      if (!res.data.hasMore) break;
      await delay(500, 1000);
    }
    return allData;
  };

  const handleSync = async () => {
    if (isSyncing.value) return;
    isSyncing.value = true;
    try {
      console.log("开始同步...");
      const uri = await getGachaUri();
      if (!uri) throw new Error("未找到抽卡链接");

      const params = parseGachaParams(uri);
      if (!params) throw new Error("链接参数解析失败");

      const newData: Record<string, EndFieldCharInfo[]> = {};
      
      for (const poolType of POOL_TYPES) {
        console.log(`抓取: ${poolType}`);
        newData[poolType] = await fetchPoolData(params, poolType, uri);
      }

      await saveToUserData(newData);
    } catch (e: any) {
      console.error(e);
      alert(`同步失败: ${e.message}`);
    } finally {
      isSyncing.value = false;
    }
  };

  return {
    records,
    statistics,
    isSyncing,
    loadFromUserData,
    handleSync
  };
}