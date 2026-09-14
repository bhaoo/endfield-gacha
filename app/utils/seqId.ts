// seqId 多为数字字符串，按长度 + 字典序比较，避免 Number 转换带来的精度丢失
export const compareSeqId = (a: string, b: string) => {
  if (a === b) return 0;

  const aDigits = /^\d+$/.test(a);
  const bDigits = /^\d+$/.test(b);

  if (aDigits && bDigits) {
    if (a.length !== b.length) return a.length > b.length ? 1 : -1;
    return a.localeCompare(b);
  }

  if (aDigits !== bDigits) return aDigits ? 1 : -1;
  return a.localeCompare(b);
};
