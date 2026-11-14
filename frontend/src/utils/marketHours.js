// Schedule-based market status. This only knows regular weekday trading hours
// in each exchange's own time zone (DST handled by Intl). It does NOT know
// exchange holidays or early closes, so the UI labels it "scheduled hours".

const EXCHANGES = [
  { id: 'US', label: 'NYSE / Nasdaq', timeZone: 'America/New_York', open: [9, 30], close: [16, 0] },
  { id: 'IN', label: 'NSE / BSE', timeZone: 'Asia/Kolkata', open: [9, 15], close: [15, 30] },
];

function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return { weekday: get('weekday'), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

export function getMarketStatus(date = new Date()) {
  return EXCHANGES.map((ex) => {
    const { weekday, minutes } = localParts(date, ex.timeZone);
    const isWeekday = !['Sat', 'Sun'].includes(weekday);
    const open = ex.open[0] * 60 + ex.open[1];
    const close = ex.close[0] * 60 + ex.close[1];
    return { id: ex.id, label: ex.label, isOpen: isWeekday && minutes >= open && minutes < close };
  });
}
