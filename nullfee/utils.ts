export const sleep = (ms: number): Promise<void> =>
  new Promise<void>((r) => setTimeout(r, ms));

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomFloat(min: number, max: number, decimals = 6): number {
  const v = Math.random() * (max - min) + min;
  return parseFloat(v.toFixed(decimals));
}

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickTwoDifferent<T>(arr: T[]): [T, T] {
  if (arr.length < 2) throw new Error("Need at least 2 items to pick a pair");
  const a = pickRandom(arr);
  let b = pickRandom(arr);
  for (let i = 0; i < 10 && b === a; i++) b = pickRandom(arr);
  if (b === a) throw new Error("Could not pick two different items");
  return [a, b];
}

/** dot-path access: getDeep({a:{b:1}}, "a.b") => 1 */
export function getDeep(obj: any, dotPath: string | undefined): any {
  if (!dotPath) return obj;
  return dotPath
    .split(".")
    .reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

/** Replace {{VAR}} placeholders in any nested string within the template. */
export function applyTemplate(
  obj: any,
  vars: Record<string, string | number>
): any {
  if (typeof obj === "string") {
    return obj.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      vars[key] !== undefined ? String(vars[key]) : `{{${key}}}`
    );
  }
  if (Array.isArray(obj)) return obj.map((x) => applyTemplate(x, vars));
  if (obj && typeof obj === "object") {
    const out: Record<string, any> = {};
    for (const k of Object.keys(obj)) out[k] = applyTemplate(obj[k], vars);
    return out;
  }
  return obj;
}
