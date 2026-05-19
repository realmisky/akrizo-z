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

type TemplateValue = string | number | boolean;

/**
 * Replace {{VAR}} placeholders in any nested string within the template.
 *
 * Special case: if a string is *exactly* `"{{NAME}}"` (no surrounding text)
 * and the substituted value is a number/boolean, the raw value is returned
 * (preserving its type). This lets a JSON template like
 * `{ "amountUsd": "{{AMOUNT}}" }` produce `{ amountUsd: 10 }` (number),
 * not `{ amountUsd: "10" }` (string).
 */
export function applyTemplate(
  obj: any,
  vars: Record<string, TemplateValue>
): any {
  if (typeof obj === "string") {
    const exact = obj.match(/^\{\{(\w+)\}\}$/);
    if (exact && vars[exact[1]] !== undefined) {
      return vars[exact[1]];           // preserve original type
    }
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
