import { env } from "./index.js";
const CALENDARS = {
    NSE: {
        timezone: "Africa/Nairobi",
        tradingWeekdays: new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]),
        openMinutes: 9 * 60 + 30, // 09:30 EAT
        closeMinutes: 15 * 60, // 15:00 EAT
        holidays: new Set([
            // Kenyan public holidays — representative set, needs annual upkeep.
            "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-01",
            "2026-06-01", "2026-10-20", "2026-12-12", "2026-12-25", "2026-12-26",
        ]),
    },
};
function zonedParts(date, timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone, hour12: false,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", weekday: "short",
    }).formatToParts(date);
    const map = {};
    for (const p of parts)
        map[p.type] = p.value;
    return {
        dateStr: `${map.year}-${map.month}-${map.day}`,
        minutesSinceMidnight: Number(map.hour) * 60 + Number(map.minute),
        weekday: map.weekday,
    };
}
export function isTradingDay(exchange, at = new Date()) {
    const cal = CALENDARS[exchange];
    if (!cal)
        return true; // unknown exchange — don't block on a missing calendar
    const { dateStr, weekday } = zonedParts(at, cal.timezone);
    return cal.tradingWeekdays.has(weekday) && !cal.holidays.has(dateStr);
}
export function isMarketOpen(exchange, at = new Date()) {
    if (env.IGNORE_TRADING_CALENDAR)
        return true;
    const cal = CALENDARS[exchange];
    if (!cal)
        return true;
    if (!isTradingDay(exchange, at))
        return false;
    const { minutesSinceMidnight } = zonedParts(at, cal.timezone);
    return minutesSinceMidnight >= cal.openMinutes && minutesSinceMidnight < cal.closeMinutes;
}
