// ==========================================================================
// VUNA Life — CSV parser for academic imports
// Pure function. Headers are case-insensitive. Returns either a list of
// well-typed rows or a list of errors with line numbers. Never throws on
// malformed input — returns errors instead, so the admin screen can show
// per-row reasons.
// ==========================================================================
import { parse as parseCsv } from 'csv-parse/sync';

export type CsvResult<T> =
  | { ok: true; rows: T[]; ignored: Array<{ line: number; reason: string; raw: string }> }
  | { ok: false; error: string };

export type DepartmentRow = {
  code: string;
  name: string;
  faculty?: string;
};

export type CourseRow = {
  code: string;
  title: string;
  departmentCode: string;
  level: number;
  credits?: number;
};

export type TimetableRow = {
  courseCode: string;
  departmentCode?: string;
  level?: number;
  weekday: number; // 0..6 (0=Sun)
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  venuePin?: string;
};

const DAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

function normaliseTime(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = m[3]?.toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
}

function getHeader(record: string[], name: string, aliases: string[] = []): string | undefined {
  const lower = record.map((h) => h.toLowerCase().trim());
  const candidates = [name, ...aliases].map((c) => c.toLowerCase().trim());
  for (let i = 0; i < lower.length; i++) {
    if (candidates.includes(lower[i])) return record[i];
  }
  return undefined;
}

export function parseDepartmentsCsv(text: string): CsvResult<DepartmentRow> {
  let records: string[][];
  try {
    records = parseCsv(text, { relax_column_count: true, skip_empty_lines: true, trim: true });
  } catch (e: any) {
    return { ok: false, error: `CSV parse error: ${e.message}` };
  }
  if (records.length === 0) return { ok: false, error: 'Empty CSV.' };

  const header = records[0];
  const rows: DepartmentRow[] = [];
  const ignored: Array<{ line: number; reason: string; raw: string }> = [];

  for (let i = 1; i < records.length; i++) {
    const r = records[i];
    const raw = r.join(',');
    const code = getHeader(header, 'code', ['dept_code', 'department_code']) ?
      r[header.findIndex((h) => h.toLowerCase().trim() === 'code' || h.toLowerCase().trim() === 'dept_code' || h.toLowerCase().trim() === 'department_code')] : undefined;
    const codeIdx = header.findIndex((h) => ['code','dept_code','department_code'].includes(h.toLowerCase().trim()));
    const nameIdx = header.findIndex((h) => ['name','department_name','dept_name'].includes(h.toLowerCase().trim()));
    const facultyIdx = header.findIndex((h) => ['faculty','college','school'].includes(h.toLowerCase().trim()));

    const codeVal = codeIdx >= 0 ? r[codeIdx]?.trim() : undefined;
    const nameVal = nameIdx >= 0 ? r[nameIdx]?.trim() : undefined;
    const facultyVal = facultyIdx >= 0 ? r[facultyIdx]?.trim() : undefined;

    if (!codeVal || !nameVal) {
      ignored.push({ line: i + 1, reason: 'missing code or name', raw });
      continue;
    }
    rows.push({ code: codeVal, name: nameVal, faculty: facultyVal });
  }

  return { ok: true, rows, ignored };
}

export function parseCoursesCsv(text: string): CsvResult<CourseRow> {
  let records: string[][];
  try {
    records = parseCsv(text, { relax_column_count: true, skip_empty_lines: true, trim: true });
  } catch (e: any) {
    return { ok: false, error: `CSV parse error: ${e.message}` };
  }
  if (records.length === 0) return { ok: false, error: 'Empty CSV.' };

  const header = records[0];
  const rows: CourseRow[] = [];
  const ignored: Array<{ line: number; reason: string; raw: string }> = [];

  const codeIdx = header.findIndex((h) => ['code','course_code'].includes(h.toLowerCase().trim()));
  const titleIdx = header.findIndex((h) => ['title','name','course_title'].includes(h.toLowerCase().trim()));
  const deptIdx = header.findIndex((h) => ['department','dept','department_code','departmentcode'].includes(h.toLowerCase().trim()));
  const levelIdx = header.findIndex((h) => ['level','year'].includes(h.toLowerCase().trim()));
  const creditsIdx = header.findIndex((h) => ['credits','units'].includes(h.toLowerCase().trim()));

  for (let i = 1; i < records.length; i++) {
    const r = records[i];
    const raw = r.join(',');
    const codeVal = codeIdx >= 0 ? r[codeIdx]?.trim() : undefined;
    const titleVal = titleIdx >= 0 ? r[titleIdx]?.trim() : undefined;
    const deptVal = deptIdx >= 0 ? r[deptIdx]?.trim() : undefined;
    const levelVal = levelIdx >= 0 ? r[levelIdx]?.trim() : undefined;
    const creditsVal = creditsIdx >= 0 ? r[creditsIdx]?.trim() : undefined;

    if (!codeVal || !titleVal || !deptVal) {
      ignored.push({ line: i + 1, reason: 'missing code, title or department_code', raw });
      continue;
    }
    const levelNum = parseInt(levelVal ?? '0', 10);
    if (!levelNum || levelNum < 100 || levelNum > 800) {
      ignored.push({ line: i + 1, reason: `level '${levelVal}' is not 100..800`, raw });
      continue;
    }
    rows.push({
      code: codeVal,
      title: titleVal,
      departmentCode: deptVal,
      level: levelNum,
      credits: creditsVal ? parseInt(creditsVal, 10) || undefined : undefined,
    });
  }

  return { ok: true, rows, ignored };
}

export function parseTimetableCsv(text: string): CsvResult<TimetableRow> {
  let records: string[][];
  try {
    records = parseCsv(text, { relax_column_count: true, skip_empty_lines: true, trim: true });
  } catch (e: any) {
    return { ok: false, error: `CSV parse error: ${e.message}` };
  }
  if (records.length === 0) return { ok: false, error: 'Empty CSV.' };

  const header = records[0];
  const rows: TimetableRow[] = [];
  const ignored: Array<{ line: number; reason: string; raw: string }> = [];

  const courseIdx = header.findIndex((h) => ['course','course_code','code'].includes(h.toLowerCase().trim()));
  const deptIdx = header.findIndex((h) => ['department','dept','department_code'].includes(h.toLowerCase().trim()));
  const levelIdx = header.findIndex((h) => ['level','year'].includes(h.toLowerCase().trim()));
  const dayIdx = header.findIndex((h) => ['day','weekday'].includes(h.toLowerCase().trim()));
  const startIdx = header.findIndex((h) => ['start','start_time','from'].includes(h.toLowerCase().trim()));
  const endIdx = header.findIndex((h) => ['end','end_time','to'].includes(h.toLowerCase().trim()));
  const venueIdx = header.findIndex((h) => ['venue','venue_pin','building_pin','room'].includes(h.toLowerCase().trim()));

  for (let i = 1; i < records.length; i++) {
    const r = records[i];
    const raw = r.join(',');
    const courseVal = courseIdx >= 0 ? r[courseIdx]?.trim() : undefined;
    const deptVal = deptIdx >= 0 ? r[deptIdx]?.trim() : undefined;
    const levelVal = levelIdx >= 0 ? r[levelIdx]?.trim() : undefined;
    const dayVal = dayIdx >= 0 ? r[dayIdx]?.trim() : undefined;
    const startVal = startIdx >= 0 ? r[startIdx]?.trim() : undefined;
    const endVal = endIdx >= 0 ? r[endIdx]?.trim() : undefined;
    const venueVal = venueIdx >= 0 ? r[venueIdx]?.trim() : undefined;

    if (!courseVal || !dayVal || !startVal || !endVal) {
      ignored.push({ line: i + 1, reason: 'missing course, day, start or end', raw });
      continue;
    }
    const weekday = DAY_NAMES[dayVal.toLowerCase()];
    if (weekday === undefined) {
      ignored.push({ line: i + 1, reason: `day '${dayVal}' not recognised`, raw });
      continue;
    }
    const start = normaliseTime(startVal);
    const end = normaliseTime(endVal);
    if (!start || !end) {
      ignored.push({ line: i + 1, reason: `time '${startVal}'-'${endVal}' not HH:MM`, raw });
      continue;
    }
    if (start >= end) {
      ignored.push({ line: i + 1, reason: `start ${start} >= end ${end}`, raw });
      continue;
    }
    let level: number | undefined;
    if (levelVal) {
      const n = parseInt(levelVal, 10);
      if (n >= 100 && n <= 800) level = n;
    }
    rows.push({
      courseCode: courseVal,
      departmentCode: deptVal || undefined,
      level,
      weekday,
      startTime: start,
      endTime: end,
      venuePin: venueVal || undefined,
    });
  }

  return { ok: true, rows, ignored };
}
