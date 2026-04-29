export interface RankedItem {
  key: string;
  source: string;
  payload: unknown;
}

export interface FusedItem {
  key: string;
  score: number;
  sources: string[];
  payload: unknown;
}

export function reciprocalRankFusion(lists: RankedItem[][], k = 60): FusedItem[] {
  const acc = new Map<string, FusedItem>();

  for (const list of lists) {
    for (let i = 0; i < list.length; i++) {
      const item = list[i]!;
      const contribution = 1 / (k + i + 1);
      const existing = acc.get(item.key);
      if (existing) {
        existing.score += contribution;
        if (!existing.sources.includes(item.source)) existing.sources.push(item.source);
      } else {
        acc.set(item.key, {
          key: item.key,
          score: contribution,
          sources: [item.source],
          payload: item.payload,
        });
      }
    }
  }

  return Array.from(acc.values()).sort((a, b) => b.score - a.score);
}
