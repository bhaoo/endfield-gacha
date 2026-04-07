import { BaseDirectory, writeFile } from "@tauri-apps/plugin-fs";
import { downloadDir, join } from "@tauri-apps/api/path";
import type { EndFieldCharInfo, EndFieldWeaponInfo, User } from "~/types/gacha";

type ExportCell = string | number;
type ExportRow = ExportCell[];

const EXPORT_HEADERS = [
  "时间",
  "名称",
  "星级",
  "卡池名",
  "卡池 ID",
  "是否 NEW",
  "是否为加急招募",
  "seqId",
] as const;

const isDigitsOnly = (value: string) => /^\d+$/.test(value);

const compareSeqId = (a: string, b: string) => {
  if (a === b) return 0;

  const aDigits = isDigitsOnly(a);
  const bDigits = isDigitsOnly(b);

  if (aDigits && bDigits) {
    if (a.length !== b.length) return a.length > b.length ? 1 : -1;
    return a.localeCompare(b);
  }

  if (aDigits !== bDigits) return aDigits ? 1 : -1;
  return a.localeCompare(b);
};

// gachaTs 在接口里是字符串，导出时统一按本地 24 小时制格式化。
const normalizeTimestampMs = (value?: string) => {
  const raw = String(value || "").trim();
  if (!raw || !isDigitsOnly(raw)) return null;

  const num = Number(raw);
  if (!Number.isFinite(num)) return null;

  if (raw.length <= 10) return num * 1000;
  if (raw.length >= 13) return num;

  return num < 1e11 ? num * 1000 : num;
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const formatDateTime24h = (value?: string) => {
  const ms = normalizeTimestampMs(value);
  if (ms == null) return String(value || "");

  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return String(value || "");

  return [
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`,
  ].join(" ");
};

const sortRecordsDesc = <T extends { gachaTs?: string; seqId?: string }>(records: T[]) =>
  [...records].sort((a, b) => {
    const at = normalizeTimestampMs(a.gachaTs) ?? 0;
    const bt = normalizeTimestampMs(b.gachaTs) ?? 0;
    if (at !== bt) return bt - at;
    return -compareSeqId(String(a.seqId || ""), String(b.seqId || ""));
  });

const flattenRecordMap = <T>(recordMap: Record<string, T[]>) =>
  Object.values(recordMap || {}).flatMap((list) => (Array.isArray(list) ? list : []));

const toYesNo = (value?: boolean) => (value ? "是" : "否");

const toCharRows = (records: Record<string, EndFieldCharInfo[]>) =>
  sortRecordsDesc(flattenRecordMap(records)).map<ExportRow>((item) => [
    formatDateTime24h(item.gachaTs),
    String(item.charName || ""),
    Number.isFinite(item.rarity) ? item.rarity : "",
    String(item.poolName || ""),
    String(item.poolId || ""),
    toYesNo(item.isNew),
    toYesNo(item.isFree),
    String(item.seqId || ""),
  ]);

const toWeaponRows = (records: Record<string, EndFieldWeaponInfo[]>) =>
  sortRecordsDesc(flattenRecordMap(records)).map<ExportRow>((item) => [
    formatDateTime24h(item.gachaTs),
    String(item.weaponName || ""),
    Number.isFinite(item.rarity) ? item.rarity : "",
    String(item.poolName || ""),
    String(item.poolId || ""),
    toYesNo(item.isNew),
    "否",
    String(item.seqId || ""),
  ]);

const createSheetRows = (rows: ExportRow[]) => [Array.from(EXPORT_HEADERS), ...rows];

const getUserKey = (u: User) =>
  u.key || (u.roleId?.roleId ? `${u.uid}_${u.roleId.roleId}` : u.uid);

const getUserLabel = (u: User) =>
  u.roleId?.nickName && u.roleId?.roleId
    ? `${u.roleId.nickName}(${u.roleId.roleId})`
    : u.uid;

const sanitizeFilenamePart = (value: string) =>
  value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "user";

const formatFileStamp = (date: Date) =>
  `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}_${pad2(date.getHours())}${pad2(
    date.getMinutes(),
  )}${pad2(date.getSeconds())}`;

export const useExcelExport = () => {
  const isExporting = useState<boolean>("excel-exporting", () => false);
  const { currentUser, userList } = useUserStore();
  const { readUserDataRaw } = useGachaRecords();

  const currentUserLabel = computed(() => {
    const uid = String(currentUser.value || "").trim();
    if (!uid || uid === "none") return "";

    const matched = userList.value.find((user) => getUserKey(user) === uid);
    return matched ? getUserLabel(matched) : uid;
  });

  const canExport = computed(() => {
    const uid = String(currentUser.value || "").trim();
    return uid !== "" && uid !== "none";
  });

  const exportCurrentUserExcel = async () => {
    if (!canExport.value) {
      throw new Error("请先选择一个账号");
    }
    if (isExporting.value) {
      throw new Error("正在导出中，请稍候");
    }

    isExporting.value = true;

    try {
      const uid = String(currentUser.value).trim();
      const [charRaw, weaponRaw, XLSX] = await Promise.all([
        readUserDataRaw(uid, "char") as Promise<Record<string, EndFieldCharInfo[]>>,
        readUserDataRaw(uid, "weapon") as Promise<Record<string, EndFieldWeaponInfo[]>>,
        import("xlsx"),
      ]);

      const charRows = toCharRows(charRaw || {});
      const weaponRows = toWeaponRows(weaponRaw || {});

      if (charRows.length <= 0 && weaponRows.length <= 0) {
        throw new Error("当前账号暂无可导出的记录");
      }

      const workbook = XLSX.utils.book_new();
      const charSheet = XLSX.utils.aoa_to_sheet(createSheetRows(charRows));
      const weaponSheet = XLSX.utils.aoa_to_sheet(createSheetRows(weaponRows));

      const cols = [
        { wch: 20 },
        { wch: 24 },
        { wch: 8 },
        { wch: 24 },
        { wch: 20 },
        { wch: 12 },
        { wch: 16 },
        { wch: 24 },
      ];
      (charSheet as any)["!cols"] = cols;
      (weaponSheet as any)["!cols"] = cols;

      XLSX.utils.book_append_sheet(workbook, charSheet, "角色记录");
      XLSX.utils.book_append_sheet(workbook, weaponSheet, "武器记录");

      const label = sanitizeFilenamePart(currentUserLabel.value || uid);
      const fileName = `Endfield_Gacha_${label}_${formatFileStamp(new Date())}.xlsx`;
      const buffer = XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
        compression: true,
      }) as ArrayBuffer;

      await writeFile(fileName, new Uint8Array(buffer), {
        baseDir: BaseDirectory.Download,
      });

      const basePath = await downloadDir();
      const filePath = await join(basePath, fileName);

      return {
        fileName,
        filePath,
        charCount: charRows.length,
        weaponCount: weaponRows.length,
      };
    } finally {
      isExporting.value = false;
    }
  };

  return {
    canExport,
    currentUserLabel,
    isExporting,
    exportCurrentUserExcel,
  };
};
