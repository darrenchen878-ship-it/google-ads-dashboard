const DAY = 24 * 60 * 60 * 1000;

function shiftMonth(date, offset) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + offset);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function parseRange(range = "last_30_days", startDate, endDate) {
  if (startDate && endDate && startDate <= endDate) {
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    const previousStart = shiftMonth(start, -1);
    const previousEnd = shiftMonth(end, -1);
    return {
      days: Math.round((end - start) / DAY) + 1,
      explicit: true,
      current: { start: startDate, end: endDate },
      previous: { start: formatDate(previousStart), end: formatDate(previousEnd) }
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = {
    last_7_days: 7,
    last_14_days: 14,
    last_30_days: 30,
    last_90_days: 90
  }[range] ?? 30;

  const end = new Date(today.getTime() - DAY);
  const start = new Date(end.getTime() - (days - 1) * DAY);
  const previousEnd = new Date(start.getTime() - DAY);
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * DAY);

  return {
    days,
    explicit: false,
    current: { start: formatDate(start), end: formatDate(end) },
    previous: { start: formatDate(previousStart), end: formatDate(previousEnd) }
  };
}

export function formatDate(date) {
  return date.toISOString().slice(0, 10);
}
