export const REALMOJI_OPTIONS = [
  { emoji: '😂', label: '爆笑' },
  { emoji: '🤣', label: '大爆笑' },
  { emoji: '😏', label: 'ニヤニヤ' },
  { emoji: '🙄', label: 'はいはい' },
  { emoji: '😜', label: 'ざんねん' },
  { emoji: '🥱', label: 'まだ眠いの？' },
] as const;

export type RealMojiEmoji = (typeof REALMOJI_OPTIONS)[number]['emoji'];

const REALMOJI_EMOJI_SET = new Set<string>(
  REALMOJI_OPTIONS.map((option) => option.emoji),
);

export function isRealMojiEmoji(value: unknown): value is RealMojiEmoji {
  return typeof value === 'string' && REALMOJI_EMOJI_SET.has(value);
}
