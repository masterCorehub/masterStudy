const timestamp = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const valid = position => position && (
  (typeof position.cfi === 'string' && position.cfi.trim()) ||
  (Number.isFinite(position.page) && position.page >= 1)
);

export function latestReadingPosition(local, remote) {
  const left = local?.lastPosition;
  const right = remote?.lastPosition;
  if (!valid(left)) return valid(right) ? { ...right } : undefined;
  if (!valid(right)) return { ...left };
  // A metadata edit must not give an old reading position a newer clock.
  const leftClock = timestamp(left.savedAt);
  const rightClock = timestamp(right.savedAt);
  if (leftClock || rightClock) return { ...(leftClock >= rightClock ? left : right) };
  // Legacy records lack a position clock; retain the previous timestamp rule.
  return { ...(timestamp(local.updatedAt) >= timestamp(remote.updatedAt) ? left : right) };
}
