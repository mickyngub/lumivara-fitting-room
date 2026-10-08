/**
 * A skin of the fitting room's own: a class's plain look with its clothes'
 * colour parts, largest first, dyed onto these colours the way the outfit
 * colour tray dyes them.
 */
export type ClassSkin = {
  id: string;
  classId: string;
  name: string;
  description: string;
  dyes: [main: string, second: string, third: string];
};

export const CLASS_SKINS: ClassSkin[] = [];
