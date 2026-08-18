/**
 * Date utility helpers for generating the API date parameters.
 * Supports both ISO calendar (fallback) and Fiscal Calendar (preferred).
 */

function parseIsoDateLocal(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return new Date(dateStr);
  }
  return new Date(y, m - 1, d);
}

/** Build lookup indexes from the FiscalCalendar array returned by /api/sales/dds */
export function buildFiscalIndexes(items) {
  const calendar = {};
  const dayIndex = {};
  const weekIndex = {};
  const calDayIndex = {};

  for (const x of items) {
    const date = (x.FiscalDate || x.CalDate || '').trim();
    if (!date) continue;
    const fiscalYear = parseInt(x.FiscalYear, 10);
    const fiscalWeek = parseInt(x.WeekInYear || x.FiscalWeekInYear, 10);
    const fiscalDayWeek = parseInt(x.DayInWeek || x.FiscalDayInWeek, 10);
    const fiscalDayYear = parseInt(x.DayInYear || x.FiscalDayInYear, 10);
    const fiscalQuarter = parseInt(x.CalQuarter || x.FiscalQuarter, 10);

    const calendarYear = parseInt(x.CalendarYear, 10);
    const calendarMonth = parseInt(x.CalendarMonth, 10);
    const calendarWeek = parseInt(x.CalendarWeekInYear, 10);
    const calendarDayWeek = parseInt(x.CalendarDayInWeek, 10);
    const calendarDayYear = parseInt(x.CalendarDayInYear, 10);
    const calendarQuarter = parseInt(x.CalendarQuarter, 10);

    calendar[date] = {
      CalDate: date,
      FiscalDate: date,
      FiscalYear: fiscalYear,
      WeekInYear: fiscalWeek,
      FiscalWeekInYear: fiscalWeek,
      DayInWeek: fiscalDayWeek,
      FiscalDayInWeek: fiscalDayWeek,
      DayInYear: fiscalDayYear,
      FiscalDayInYear: fiscalDayYear,
      QuarterInYear: fiscalQuarter,
      FiscalQuarter: fiscalQuarter,

      CalendarYear: calendarYear,
      CalendarMonth: calendarMonth,
      CalendarWeekInYear: calendarWeek,
      CalendarDayInWeek: calendarDayWeek,
      CalendarDayInYear: calendarDayYear,
      CalendarQuarter: calendarQuarter,
    };

    // Fiscal indexes
    dayIndex[`${fiscalYear}_${fiscalDayYear}`] = date;
    weekIndex[`${fiscalYear}_${fiscalWeek}_${fiscalDayWeek}`] = date;
    if (fiscalDayYear === 1) {
      dayIndex[`${fiscalYear}_1`] = date;
    }

    // Calendar indexes
    if (!isNaN(calendarYear) && !isNaN(calendarDayYear)) {
      calDayIndex[`${calendarYear}_${calendarDayYear}`] = date;
      if (calendarDayYear === 1) {
        calDayIndex[`${calendarYear}_1`] = date;
      }
    }
  }

  return { calendar, dayIndex, weekIndex, calDayIndex };
}

function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getMonday(d) {
  const r = new Date(d);
  const day = r.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  r.setDate(r.getDate() + diff);
  return r;
}

function getISOWeek(d) {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function isoDow(d) {
  return d.getDay() === 0 ? 7 : d.getDay();
}

function getDayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d.getTime() - start.getTime()) / 86400000) + 1;
}

function getQuarterStart(dateStr) {
  const d = parseIsoDateLocal(dateStr);
  const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
  const qStart = new Date(d.getFullYear(), qStartMonth, 1);
  return fmt(qStart);
}

function getQuarterStartPrevYear(dateStr) {
  const d = parseIsoDateLocal(dateStr);
  const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
  const qStart = new Date(d.getFullYear() - 1, qStartMonth, 1);
  return fmt(qStart);
}

/**
 * Build DateParams using fiscal calendar data.
 */
export function computeDateParamsFromFiscal(selectedDate, indexes) {
  const { calendar, dayIndex, weekIndex } = indexes;
  const current = calendar[selectedDate];
  if (!current) return null;

  const allValues = Object.entries(calendar).map(([CalDate, value]) => ({ CalDate, ...value }));
  const byDateAsc = (a, b) => a.CalDate.localeCompare(b.CalDate);

  const currentYear = current.FiscalYear;
  const prevYear = currentYear - 1;
  const week = current.WeekInYear;
  const dayWeek = current.DayInWeek;
  const dayInYear = current.DayInYear;
  const quarter = current.QuarterInYear;

  // Same fiscal day last year
  const prevYearSameDay = allValues.find((x) => x.DayInYear === dayInYear && x.FiscalYear === prevYear);
  if (!prevYearSameDay) return null;
  const DT_2 = prevYearSameDay.CalDate;

  // WTD — use current week and the matching week bucket from same fiscal day last year
  const weekThisYear = allValues
    .filter((x) => x.FiscalYear === currentYear && x.WeekInYear === week)
    .sort(byDateAsc);
  const weekLastYear = allValues
    .filter((x) => x.FiscalYear === prevYear && x.WeekInYear === prevYearSameDay.WeekInYear)
    .sort(byDateAsc);

  const P_WTD_1_S = weekThisYear[0]?.CalDate ?? weekIndex[`${currentYear}_${week}_1`] ?? '';
  const P_WTD_1_E = selectedDate;
  const P_WTD_2_S = weekLastYear[0]?.CalDate ?? weekIndex[`${prevYear}_${prevYearSameDay.WeekInYear}_1`] ?? '';
  const P_WTD_2_E = DT_2;

  // QTD — fiscal quarter start
  const quarterStartThisYear = allValues
    .filter((x) => x.FiscalYear === currentYear && x.QuarterInYear === quarter)
    .sort(byDateAsc)[0];
  const quarterStartLastYear = allValues
    .filter((x) => x.FiscalYear === prevYear && x.QuarterInYear === quarter)
    .sort(byDateAsc)[0];

  const P_QTD_1_S = quarterStartThisYear?.CalDate ?? '';
  const P_QTD_1_E = selectedDate;
  const P_QTD_2_S = quarterStartLastYear?.CalDate ?? '';
  const P_QTD_2_E = DT_2;

  // YTD — first fiscal date in each year
  const yearStartThisYear = allValues
    .filter((x) => x.FiscalYear === currentYear)
    .sort(byDateAsc)[0];
  const yearStartLastYear = allValues
    .filter((x) => x.FiscalYear === prevYear)
    .sort(byDateAsc)[0];

  const P_YTD_1_S = yearStartThisYear?.CalDate ?? dayIndex[`${currentYear}_1`] ?? '';
  const P_YTD_1_E = selectedDate;
  const P_YTD_2_S = yearStartLastYear?.CalDate ?? dayIndex[`${prevYear}_1`] ?? '';
  const P_YTD_2_E = DT_2;

  // Box day labels
  const boxDayCY = `${currentYear} Day ${dayInYear}`;
  const prevDay = prevYearSameDay.DayInYear;
  const boxDayLY = `${prevYear} Day ${prevDay}`;

  // Display date
  const dateObj = parseIsoDateLocal(selectedDate);
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const displayDate = `${dateObj.getFullYear()} ${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}, ${dayNames[dateObj.getDay()]}`.toUpperCase();

  return {
    displayDate,
    DT_1: selectedDate,
    DT_2,
    P_WTD_1_S, P_WTD_1_E,
    P_WTD_2_S, P_WTD_2_E,
    P_QTD_1_S, P_QTD_1_E,
    P_QTD_2_S, P_QTD_2_E,
    P_YTD_1_S, P_YTD_1_E,
    P_YTD_2_S, P_YTD_2_E,
    weekNumber: week,
    dayNumber: dayWeek,
    quarterNumber: quarter,
    calendarDayOfMonth: 0,
    calendarMonthNumber: 0,
    boxDayCY,
    boxDayLY,
  };
}

/**
 * Calendar-based date params matching the web app's prepareDateRanges_Calendar().
 */
export function computeCalendarDateParams(selectedDate, fiscalIndexes) {
  if (fiscalIndexes && fiscalIndexes.calendar) {
    const { calendar } = fiscalIndexes;
    const current = calendar[selectedDate];
    if (current && current.CalendarYear) {
      const allValues = Object.values(calendar);
      const sDayInYear = current.CalendarDayInYear;
      const sThisYear = current.CalendarYear;
      const sLastYear = sThisYear - 1;
      const sQuarter = current.CalendarQuarter;

      const prevYearSameDay = allValues.find(
        (x) => x.CalendarDayInYear === sDayInYear && x.CalendarYear === sLastYear
      );

      const DT_2 = prevYearSameDay ? prevYearSameDay.CalDate : '';

      const monthThisYear = allValues
        .filter(
          (x) =>
            x.CalendarYear === sThisYear &&
            x.CalendarMonth === current.CalendarMonth
        )
        .sort((a, b) => a.CalDate.localeCompare(b.CalDate));

      const monthLastYear = allValues
        .filter(
          (x) =>
            x.CalendarYear === sLastYear &&
            x.CalendarMonth === current.CalendarMonth
        )
        .sort((a, b) => a.CalDate.localeCompare(b.CalDate));

      const P_WTD_1_S = monthThisYear[0]?.CalDate ?? '';
      const P_WTD_1_E = selectedDate;
      const P_WTD_2_S = monthLastYear[0]?.CalDate ?? '';
      const P_WTD_2_E = DT_2;

      const quarterStartThisYear = allValues
        .filter(
          (x) =>
            x.CalendarYear === sThisYear &&
            x.CalendarQuarter === sQuarter
        )
        .sort((a, b) => a.CalDate.localeCompare(b.CalDate))[0];

      const quarterStartLastYear = allValues
        .filter(
          (x) =>
            x.CalendarYear === sLastYear &&
            x.CalendarQuarter === sQuarter
        )
        .sort((a, b) => a.CalDate.localeCompare(b.CalDate))[0];

      const P_QTD_1_S = quarterStartThisYear?.CalDate ?? '';
      const P_QTD_1_E = selectedDate;
      const P_QTD_2_S = quarterStartLastYear?.CalDate ?? '';
      const P_QTD_2_E = DT_2;

      const yearStartThisYear = allValues
        .filter((x) => x.CalendarYear === sThisYear)
        .sort((a, b) => a.CalDate.localeCompare(b.CalDate))[0];

      const yearStartLastYear = allValues
        .filter((x) => x.CalendarYear === sLastYear)
        .sort((a, b) => a.CalDate.localeCompare(b.CalDate))[0];

      const P_YTD_1_S = yearStartThisYear?.CalDate ?? '';
      const P_YTD_1_E = selectedDate;
      const P_YTD_2_S = yearStartLastYear?.CalDate ?? '';
      const P_YTD_2_E = DT_2;

      const boxDayCY = `${sThisYear} Day ${sDayInYear}`;
      const boxDayLY = `${sLastYear} Day ${sDayInYear}`;

      const dateObj = parseIsoDateLocal(selectedDate);
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
      ];
      const dayNames = [
        'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
      ];
      const displayDate = `${dateObj.getFullYear()} ${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}, ${dayNames[dateObj.getDay()]}`.toUpperCase();

      return {
        displayDate,
        DT_1: selectedDate,
        DT_2,
        P_WTD_1_S,
        P_WTD_1_E,
        P_WTD_2_S,
        P_WTD_2_E,
        P_QTD_1_S,
        P_QTD_1_E,
        P_QTD_2_S,
        P_QTD_2_E,
        P_YTD_1_S,
        P_YTD_1_E,
        P_YTD_2_S,
        P_YTD_2_E,
        weekNumber: current.CalendarWeekInYear || getISOWeek(dateObj),
        dayNumber: current.CalendarDayInWeek || isoDow(dateObj),
        quarterNumber: current.CalendarQuarter || Math.ceil((dateObj.getMonth() + 1) / 3),
        calendarDayOfMonth: dateObj.getDate(),
        calendarMonthNumber: current.CalendarMonth || dateObj.getMonth() + 1,
        boxDayCY,
        boxDayLY,
      };
    }
  }

  // Fallback if no database calendar available
  const [year, month, day] = selectedDate.split('-').map(Number);
  const currentDate = new Date(year, month - 1, day);

  const currentYear = currentDate.getFullYear();
  const prevYear = currentYear - 1;

  let prevYearSameDay = new Date(prevYear, month - 1, day);
  if (prevYearSameDay.getMonth() !== month - 1) {
    prevYearSameDay = new Date(prevYear, month, 0);
  }

  const DT_1 = fmt(currentDate);
  const DT_2 = fmt(prevYearSameDay);

  const currentDayOfWeek = currentDate.getDay();

  const P_WTD_1_S = fmt(new Date(currentYear, month - 1, 1));
  const P_WTD_1_E = DT_1;
  const P_WTD_2_S = fmt(new Date(prevYear, month - 1, 1));
  const P_WTD_2_E = DT_2;

  const quarterStartMonth = Math.floor((month - 1) / 3) * 3;
  const P_QTD_1_S = fmt(new Date(currentYear, quarterStartMonth, 1));
  const P_QTD_1_E = DT_1;
  const P_QTD_2_S = fmt(new Date(prevYear, quarterStartMonth, 1));
  const P_QTD_2_E = DT_2;

  const P_YTD_1_S = fmt(new Date(currentYear, 0, 1));
  const P_YTD_1_E = DT_1;
  const P_YTD_2_S = fmt(new Date(prevYear, 0, 1));
  const P_YTD_2_E = DT_2;

  const boxDayCY = `${currentYear} Day ${getDayOfYear(currentDate)}`;
  const boxDayLY = `${prevYear} Day ${getDayOfYear(prevYearSameDay)}`;

  const weekNum = getISOWeek(currentDate);
  const quarter = Math.ceil(month / 3);

  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const displayDate = `${currentYear} ${monthNames[currentDate.getMonth()]} ${currentDate.getDate()}, ${dayNames[currentDate.getDay()]}`.toUpperCase();

  return {
    displayDate,
    DT_1, DT_2,
    P_WTD_1_S, P_WTD_1_E,
    P_WTD_2_S, P_WTD_2_E,
    P_QTD_1_S, P_QTD_1_E,
    P_QTD_2_S, P_QTD_2_E,
    P_YTD_1_S, P_YTD_1_E,
    P_YTD_2_S, P_YTD_2_E,
    weekNumber: weekNum,
    dayNumber: currentDayOfWeek === 0 ? 7 : currentDayOfWeek,
    quarterNumber: quarter,
    calendarDayOfMonth: currentDate.getDate(),
    calendarMonthNumber: month,
    boxDayCY,
    boxDayLY,
  };
}

/**
 * ISO calendar–based fallback when no fiscal calendar is available.
 */
export function computeDateParams(today) {
  const d = today ?? new Date();

  const cyDate = fmt(d);
  const lyDate = fmt(addDays(d, -364));

  const monday = getMonday(d);
  const wtd1s = fmt(monday);
  const wtd1e = fmt(d);
  const lyMonday = addDays(monday, -364);
  const wtd2s = fmt(lyMonday);
  const wtd2e = fmt(addDays(d, -364));

  // QTD — calendar quarter
  const qtd1s = getQuarterStart(cyDate);
  const qtd1e = cyDate;
  const qtd2s = getQuarterStartPrevYear(cyDate);
  const qtd2e = lyDate;

  const ytd1s = fmt(new Date(d.getFullYear(), 0, 1));
  const ytd1e = fmt(d);
  const ytd2s = fmt(new Date(d.getFullYear() - 1, 0, 1));
  const ytd2e = fmt(addDays(d, -364));

  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const displayDate = `${d.getFullYear()} ${monthNames[d.getMonth()]} ${d.getDate()}, ${dayNames[d.getDay()]}`;

  const week = getISOWeek(d);
  const quarter = Math.ceil((d.getMonth() + 1) / 3);

  return {
    displayDate,
    DT_1: cyDate,
    DT_2: lyDate,
    P_WTD_1_S: wtd1s, P_WTD_1_E: wtd1e,
    P_WTD_2_S: wtd2s, P_WTD_2_E: wtd2e,
    P_QTD_1_S: qtd1s, P_QTD_1_E: qtd1e,
    P_QTD_2_S: qtd2s, P_QTD_2_E: qtd2e,
    P_YTD_1_S: ytd1s, P_YTD_1_E: ytd1e,
    P_YTD_2_S: ytd2s, P_YTD_2_E: ytd2e,
    weekNumber: week,
    dayNumber: isoDow(d),
    quarterNumber: quarter,
    calendarDayOfMonth: 0,
    calendarMonthNumber: 0,
    boxDayCY: `Day ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    boxDayLY: `Day ${addDays(d, -364).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
  };
}

export function formatNumber(n) {
  if (n == null || isNaN(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
}

export function formatPercent(n) {
  if (n == null || isNaN(n)) return '0.00%';
  return `${n.toFixed(2)}%`;
}

export function getBestMetric(data) {
  const stores = data.filter((r) => !r.IS_TERRITORY_TOTAL && !r.IS_GRAND_TOTAL);
  const hasDay = stores.some((r) => (r.DAY_SALES_CY ?? 0) !== 0);
  if (hasDay) return { cy: 'DAY_SALES_CY', ly: 'DAY_SALES_LY', comp: 'DAY_SALES_COMP', label: 'Day' };
  const hasWtd = stores.some((r) => (r.WTD_SALES_CY ?? 0) !== 0);
  if (hasWtd) return { cy: 'WTD_SALES_CY', ly: 'WTD_SALES_LY', comp: 'WTD_SALES_COMP', label: 'WTD' };
  return { cy: 'YTD_SALES_CY', ly: 'YTD_SALES_LY', comp: 'YTD_SALES_COMP', label: 'YTD' };
}
