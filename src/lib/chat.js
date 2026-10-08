export const CHAT_HOURS = 72;
export const CHAT_MAX_LENGTH = 2000;

export function retainChat(messages, now = Date.now()) {
  const groups = new Map();
  for (const message of messages) {
    const key = `${message.patient_id}/${message.doctor_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(message);
  }
  return [...groups.values()].flatMap((group) => {
    const sorted = group.toSorted((a, b) => Number(a.seq) - Number(b.seq));
    const latest = new Set(sorted.slice(-2).map((m) => m.id));
    return sorted.filter(
      (m) => latest.has(m.id) || Date.parse(m.created_at) >= now - CHAT_HOURS * 3600000,
    );
  });
}

export function ownRank(scores, id) {
  const own = scores.find((s) => s.id === id);
  if (own?.score == null) return { position: null, score: null, tied: false };
  return {
    position: 1 + scores.filter((s) => s.score != null && s.score > own.score).length,
    score: own.score,
    tied: scores.some((s) => s.id !== id && s.score === own.score),
  };
}
