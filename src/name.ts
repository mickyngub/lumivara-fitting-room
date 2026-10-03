// The game caps character names at 20 characters.
export const NAME_MAX = 20;

export function cleanName(raw: string): string {
  const flat = raw
    .replace(/\s+/g, " ")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .trim();
  return [...flat].slice(0, NAME_MAX).join("").trim();
}
