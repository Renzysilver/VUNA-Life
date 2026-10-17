// ==========================================================================
// VUNA Life — academic data adapter (departments, courses, timetable)
// DEMO_MODE: uses Prisma/SQLite. Same API surface for the Supabase adapter.
// ==========================================================================
import { db } from '@/lib/db';
import type { DepartmentRow, CourseRow, TimetableRow } from '@/lib/csv/parse';
import { writeAudit, type AuditContext } from './audit-log';

// ---------- departments ----------
export async function listDepartments() {
  return db.department.findMany({ orderBy: { code: 'asc' } });
}

export async function upsertDepartment(row: DepartmentRow) {
  return db.department.upsert({
    where: { code: row.code },
    update: { name: row.name, faculty: row.faculty ?? null },
    create: { code: row.code, name: row.name, faculty: row.faculty ?? null },
  });
}

export async function bulkUpsertDepartments(
  rows: DepartmentRow[],
  ctx: AuditContext,
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  for (const r of rows) {
    const found = await db.department.findUnique({ where: { code: r.code } });
    if (found) {
      await db.department.update({
        where: { code: r.code },
        data: { name: r.name, faculty: r.faculty ?? null },
      });
      updated++;
    } else {
      await db.department.create({ data: { code: r.code, name: r.name, faculty: r.faculty ?? null } });
      inserted++;
    }
  }
  await writeAudit(ctx, 'bulk_upsert', 'departments', null, null, { count: rows.length, inserted, updated });
  return { inserted, updated };
}

// ---------- courses ----------
export async function listCourses() {
  return db.course.findMany({
    include: { department: true },
    orderBy: [{ code: 'asc' }, { level: 'asc' }],
  });
}

export async function bulkUpsertCourses(
  rows: CourseRow[],
  ctx: AuditContext,
): Promise<{ inserted: number; updated: number; orphaned: Array<CourseRow> }> {
  let inserted = 0;
  let updated = 0;
  const orphaned: CourseRow[] = [];

  for (const r of rows) {
    const dept = await db.department.findUnique({ where: { code: r.departmentCode } });
    if (!dept) {
      orphaned.push(r);
      continue;
    }
    const existing = await db.course.findUnique({
      where: { code_departmentId_level: { code: r.code, departmentId: dept.id, level: r.level } },
    });
    if (existing) {
      await db.course.update({
        where: { id: existing.id },
        data: { title: r.title, credits: r.credits ?? null },
      });
      updated++;
    } else {
      await db.course.create({
        data: {
          code: r.code,
          title: r.title,
          departmentId: dept.id,
          level: r.level,
          credits: r.credits ?? null,
        },
      });
      inserted++;
    }
  }
  await writeAudit(ctx, 'bulk_upsert', 'courses', null, null, {
    count: rows.length,
    inserted,
    updated,
    orphaned: orphaned.length,
  });
  return { inserted, updated, orphaned };
}

// ---------- timetable ----------
export async function listTimetableForUser(opts: {
  departmentId?: string;
  level?: number;
  weekday?: number;
}) {
  return db.timetable.findMany({
    where: {
      departmentId: opts.departmentId,
      level: opts.level,
      weekday: opts.weekday,
    },
    include: {
      course: { include: { department: true } },
      venue: true,
      lecturer: true,
    },
    orderBy: { startTime: 'asc' },
  });
}

export async function bulkUpsertTimetable(
  rows: TimetableRow[],
  ctx: AuditContext,
): Promise<{
  inserted: number;
  orphanedCourse: Array<TimetableRow>;
  orphanedVenue: Array<TimetableRow>;
}> {
  let inserted = 0;
  const orphanedCourse: TimetableRow[] = [];
  const orphanedVenue: TimetableRow[] = [];

  for (const r of rows) {
    // Find course: by code + (department + level if provided)
    const courses = await db.course.findMany({ where: { code: r.courseCode } });
    if (courses.length === 0) {
      orphanedCourse.push(r);
      continue;
    }
    let course = courses[0];
    if (r.departmentCode) {
      const dept = await db.department.findUnique({ where: { code: r.departmentCode } });
      if (dept) {
        const filtered = courses.find((c) => c.departmentId === dept.id);
        if (filtered) course = filtered;
      }
    }
    if (r.level !== undefined) {
      const filtered = courses.find((c) => c.level === r.level);
      if (filtered) course = filtered;
    }

    let venueId: string | undefined;
    if (r.venuePin) {
      const venue = await db.building.findUnique({ where: { pin: r.venuePin } });
      if (!venue) {
        orphanedVenue.push(r);
        continue;
      }
      venueId = venue.id;
    }

    await db.timetable.create({
      data: {
        courseId: course.id,
        departmentId: course.departmentId,
        level: course.level ?? r.level,
        weekday: r.weekday,
        startTime: r.startTime,
        endTime: r.endTime,
        venueId: venueId ?? null,
      },
    });
    inserted++;
  }
  await writeAudit(ctx, 'bulk_upsert', 'timetable', null, null, {
    count: rows.length,
    inserted,
    orphanedCourse: orphanedCourse.length,
    orphanedVenue: orphanedVenue.length,
  });
  return { inserted, orphanedCourse, orphanedVenue };
}
