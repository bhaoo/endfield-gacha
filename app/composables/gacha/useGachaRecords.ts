import { invoke } from "@tauri-apps/api/core";
import type { EndFieldCharInfo, EndFieldWeaponInfo, GachaItem } from "~/types/gacha";

export const useGachaRecords = (params?: { loadPoolInfo?: () => Promise<void> }) => {
  const charRecords = useState<Record<string, EndFieldCharInfo[]>>(
    "gacha-records-char",
    () => ({}),
  );
  const weaponRecords = useState<Record<string, EndFieldWeaponInfo[]>>(
    "gacha-records-weapon",
    () => ({}),
  );

  const isDigitsOnly = (value: string) => /^\d+$/.test(value);

  const compareSeqId = (a: string, b: string) => {
    if (a === b) return 0;

    const aDigits = isDigitsOnly(a);
    const bDigits = isDigitsOnly(b);

    // Most seqId are numeric strings. Prefer stable string-based numeric compare to avoid Number overflow.
    if (aDigits && bDigits) {
      if (a.length !== b.length) return a.length > b.length ? 1 : -1;
      return a.localeCompare(b);
    }

    // Fallback: put digit-like seqId ahead of non-digit; otherwise lex compare.
    if (aDigits !== bDigits) return aDigits ? 1 : -1;
    return a.localeCompare(b);
  };

  const readUserDataRaw = async (uid: string, type: "char" | "weapon") => {
    const commandRead =
      type === "char" ? "read_char_records" : "read_weapon_records";
    try {
      return (await invoke<any>(commandRead, { uid })) || {};
    } catch (e) {
      console.error(e);
      return {};
    }
  };

  const readMaxSeqIdFromMeta = async (uid: string, type: "char" | "weapon") => {
    const command =
      type === "char" ? "read_char_max_seqid" : "read_weapon_max_seqid";
    try {
      const res = await invoke<string>(command, { uid });
      return String(res || "").trim();
    } catch (e) {
      console.error(e);
      return "";
    }
  };

  const getGlobalMaxSeqId = (allData: Record<string, GachaItem[]>) => {
    let maxSeqId = "";
    for (const list of Object.values(allData)) {
      for (const item of list || []) {
        const seqId = String(item?.seqId || "");
        if (!seqId) continue;
        if (!maxSeqId || compareSeqId(seqId, maxSeqId) > 0) maxSeqId = seqId;
      }
    }
    return maxSeqId;
  };

  const getMaxSeqIdByPoolKey = (allData: Record<string, GachaItem[]>) => {
    const result: Record<string, string> = {};
    for (const [poolKey, list] of Object.entries(allData)) {
      let maxSeqId = "";
      for (const item of list || []) {
        const seqId = String(item?.seqId || "");
        if (!seqId) continue;
        if (!maxSeqId || compareSeqId(seqId, maxSeqId) > 0) maxSeqId = seqId;
      }
      if (maxSeqId) result[poolKey] = maxSeqId;
    }
    return result;
  };

  const loadUserData = async (uid: string, type: "char" | "weapon") => {
    const command =
      type === "char" ? "read_char_records" : "read_weapon_records";
    try {
      const data = await invoke<any>(command, { uid });
      if (type === "char") charRecords.value = data || {};
      else weaponRecords.value = data || {};
      if (type === "char") await params?.loadPoolInfo?.();
    } catch (e) {
      console.error(e);
    }
  };

  const mergeRecords = <T extends GachaItem>(
    oldRecords: T[],
    newRecords: T[],
  ): T[] => {
    const existingIds = new Set(oldRecords.map((r) => r.seqId));
    const uniqueNewRecords = newRecords.filter(
      (r) => !existingIds.has(r.seqId),
    );
    if (uniqueNewRecords.length === 0) {
      return oldRecords;
    }
    const merged = [...oldRecords, ...uniqueNewRecords];

    return merged.sort((a, b) => {
      return -compareSeqId(a.seqId, b.seqId);
    });
  };

  const saveUserData = async (
    uid: string,
    newData: any,
    type: "char" | "weapon",
  ) => {
    const commandRead =
      type === "char" ? "read_char_records" : "read_weapon_records";
    const commandSave =
      type === "char" ? "save_char_records" : "save_weapon_records";

    const oldAllData = (await invoke<any>(commandRead, { uid })) || {};
    let totalNew = 0;

    for (const [poolKey, list] of Object.entries(newData)) {
      const oldList = oldAllData[poolKey] || [];
      const merged = mergeRecords(oldList as GachaItem[], list as GachaItem[]);
      totalNew += merged.length - oldList.length;
      oldAllData[poolKey] = merged;
    }

    if (totalNew > 0) {
      await invoke(commandSave, { uid, data: oldAllData });
    }
    return totalNew;
  };

  return {
    charRecords,
    weaponRecords,
    loadUserData,
    saveUserData,
    readUserDataRaw,
    readMaxSeqIdFromMeta,
    getGlobalMaxSeqIdFromRaw: async (uid: string, type: "char" | "weapon") => {
      const allData = (await readUserDataRaw(uid, type)) as Record<
        string,
        GachaItem[]
      >;
      return getGlobalMaxSeqId(allData);
    },
    getMaxSeqIdByPoolKeyFromRaw: async (uid: string, type: "char" | "weapon") => {
      const allData = (await readUserDataRaw(uid, type)) as Record<
        string,
        GachaItem[]
      >;
      return getMaxSeqIdByPoolKey(allData);
    },
  };
};
