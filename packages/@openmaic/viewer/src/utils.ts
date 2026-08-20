/** Detect RTL from language directive */
export function isRtl(directive?: string): boolean {
  if (!directive) return false;
  return /arabic|العربية|عربي|بالعربية|فارسی|اردو/i.test(directive);
}
