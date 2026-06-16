export function dateToTimestamp(date: Date): { seconds: number; nanos: number } {
  const seconds = Math.floor(date.getTime() / 1000);
  const nanos = (date.getTime() % 1000) * 1000000;
  return { seconds, nanos };
}
