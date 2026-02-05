/**
 * =============================================================================
 * HR Analytics Backend - Import API Routes
 * =============================================================================
 * 
 * API endpoints for importing Excel files.
 * Handles both Monthly Details and Check In&Out formats.
 * 
 * @module routes/import
 * @author HR Analytics Team
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { getDatabase, executeTransaction } from '../database/connection';
import { createContextLogger } from '../utils/logger';
import {
    parseExcelBuffer,
    parseTimeValue,
    calculateLateMinutes,
    calculateEarlyLeaveMinutes,
    calculateTotalWorkMinutes,
    validateStatusCode
} from '../services/excelParser';
import { recalculateTimeRecords } from '../services/scheduleResolver';

// Create router instance
const router = Router();

// Create context-specific logger
const log = createContextLogger('ImportAPI');

// =============================================================================
// MULTER CONFIGURATION
// =============================================================================

/**
 * Multer configuration for file uploads
 * Stores files in memory as buffers
 */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept only Excel files
        const allowedMimes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
        ];

        if (allowedMimes.includes(file.mimetype) ||
            file.originalname.endsWith('.xlsx') ||
            file.originalname.endsWith('.xls')) {
            cb(null, true);
        } else {
            cb(new Error('Faqat Excel fayllar (.xlsx, .xls) qabul qilinadi'));
        }
    }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get or create department by name
 * 
 * @param db - Database instance
 * @param name - Department name
 * @returns Department ID
 */
function getOrCreateDepartment(db: ReturnType<typeof getDatabase>, name: string): number {
    const existingStmt = db.prepare('SELECT id FROM departments WHERE name = ?');
    const existing = existingStmt.get(name) as { id: number } | undefined;

    if (existing) {
        return existing.id;
    }

    const insertStmt = db.prepare('INSERT INTO departments (name) VALUES (?)');
    const result = insertStmt.run(name);

    log.info('Created new department', { id: result.lastInsertRowid, name });
    return result.lastInsertRowid as number;
}

/**
 * Upsert employee (create or update)
 * 
 * @param db - Database instance
 * @param externalId - External ID from Excel
 * @param name - Employee name
 * @param departmentId - Department ID
 * @returns { employeeId, isNew }
 */
function upsertEmployee(
    db: ReturnType<typeof getDatabase>,
    externalId: string,
    name: string,
    departmentId: number
): { employeeId: number; isNew: boolean } {
    const existingStmt = db.prepare('SELECT id FROM employees WHERE external_id = ?');
    const existing = existingStmt.get(externalId) as { id: number } | undefined;

    if (existing) {
        // Update existing employee
        const updateStmt = db.prepare(`
      UPDATE employees 
      SET name = ?, department_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
        updateStmt.run(name, departmentId, existing.id);

        return { employeeId: existing.id, isNew: false };
    }

    // Create new employee
    const insertStmt = db.prepare(`
    INSERT INTO employees (external_id, name, department_id)
    VALUES (?, ?, ?)
  `);
    const result = insertStmt.run(externalId, name, departmentId);

    return { employeeId: result.lastInsertRowid as number, isNew: true };
}

/**
 * Get effective schedule for employee on a specific date
 * Priority: Exception → Employee → Department → Organization
 * 
 * @param db - Database instance
 * @param employeeId - Employee ID
 * @param departmentId - Department ID
 * @param date - Date string (YYYY-MM-DD)
 * @returns Schedule with workStart, workEnd, lateTolerance, isWorkDay
 */
function getEffectiveSchedule(
    db: ReturnType<typeof getDatabase>,
    employeeId: number,
    departmentId: number,
    date: string
): { workStart: string; workEnd: string; lateTolerance: number; isWorkDay: boolean } {
    const dayOfWeek = new Date(date).getDay() || 7; // 1-7 (Mon-Sun)

    // 1. Check for exception
    const exceptionStmt = db.prepare(`
    SELECT work_start, work_end
    FROM schedule_exceptions
    WHERE date = ? AND employee_ids LIKE ?
  `);
    const exception = exceptionStmt.get(date, `%${employeeId}%`) as { work_start: string | null; work_end: string | null } | undefined;

    if (exception) {
        if (!exception.work_start) {
            return { workStart: '09:00', workEnd: '18:00', lateTolerance: 5, isWorkDay: false };
        }
        return {
            workStart: exception.work_start,
            workEnd: exception.work_end || '18:00',
            lateTolerance: 5,
            isWorkDay: true
        };
    }

    // 2. Check employee schedule
    const empScheduleStmt = db.prepare(`
    SELECT work_start, work_end, late_tolerance, work_days
    FROM work_schedules
    WHERE target_type = 'employee' AND target_id = ? AND is_active = 1
  `);
    const empSchedule = empScheduleStmt.get(employeeId) as Record<string, unknown> | undefined;

    if (empSchedule) {
        const workDays = JSON.parse(empSchedule.work_days as string) as number[];
        return {
            workStart: empSchedule.work_start as string,
            workEnd: empSchedule.work_end as string,
            lateTolerance: empSchedule.late_tolerance as number,
            isWorkDay: workDays.includes(dayOfWeek)
        };
    }

    // 3. Check department schedule
    const deptScheduleStmt = db.prepare(`
    SELECT work_start, work_end, late_tolerance, work_days
    FROM work_schedules
    WHERE target_type = 'department' AND target_id = ? AND is_active = 1
  `);
    const deptSchedule = deptScheduleStmt.get(departmentId) as Record<string, unknown> | undefined;

    if (deptSchedule) {
        const workDays = JSON.parse(deptSchedule.work_days as string) as number[];
        return {
            workStart: deptSchedule.work_start as string,
            workEnd: deptSchedule.work_end as string,
            lateTolerance: deptSchedule.late_tolerance as number,
            isWorkDay: workDays.includes(dayOfWeek)
        };
    }

    // 4. Organization default
    const orgScheduleStmt = db.prepare(`
    SELECT work_start, work_end, late_tolerance, work_days
    FROM work_schedules
    WHERE target_type = 'organization' AND is_active = 1
    LIMIT 1
  `);
    const orgSchedule = orgScheduleStmt.get() as Record<string, unknown> | undefined;

    if (orgSchedule) {
        const workDays = JSON.parse(orgSchedule.work_days as string) as number[];
        return {
            workStart: orgSchedule.work_start as string,
            workEnd: orgSchedule.work_end as string,
            lateTolerance: orgSchedule.late_tolerance as number,
            isWorkDay: workDays.includes(dayOfWeek)
        };
    }

    // Fallback
    return { workStart: '09:00', workEnd: '18:00', lateTolerance: 5, isWorkDay: dayOfWeek >= 1 && dayOfWeek <= 5 };
}

/**
 * Upload and process Excel file
 * File type can be specified in request or auto-detected
 * 
 * Body parameters (multipart form data):
 * - file: Excel file
 * - fileType: 'details' | 'checkinout' (optional, will auto-detect if not provided)
 */
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Fayl yuklanmadi'
            });
        }

        // Get user-specified file type (if provided)
        const userFileType = req.body.fileType as 'details' | 'checkinout' | undefined;

        log.info('Starting import', {
            fileName: req.file.originalname,
            size: req.file.size,
            userFileType: userFileType || 'auto-detect'
        });

        // Parse Excel file
        const parseResult = parseExcelBuffer(req.file.buffer);

        if (parseResult.errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: parseResult.errors.join('; '),
                warnings: parseResult.warnings
            });
        }

        // Use user-specified file type if provided, otherwise use auto-detected
        const effectiveFileType = userFileType || parseResult.fileType;
        log.info('Using file type', {
            detected: parseResult.fileType,
            userSpecified: userFileType,
            effective: effectiveFileType
        });

        // Process in transaction
        const result = executeTransaction((db) => {
            // Create import history record
            const historyStmt = db.prepare(`
        INSERT INTO import_history (file_name, file_type, records_count)
        VALUES (?, ?, ?)
      `);
            const historyResult = historyStmt.run(
                req.file!.originalname,
                effectiveFileType,
                parseResult.employees.length
            );
            const importId = historyResult.lastInsertRowid as number;

            let newEmployees = 0;
            let updatedRecords = 0;

            // Process each employee
            for (const emp of parseResult.employees) {
                // Get or create department
                const departmentId = getOrCreateDepartment(db, emp.department);

                // Upsert employee
                const { employeeId, isNew } = upsertEmployee(db, emp.externalId, emp.name, departmentId);
                if (isNew) newEmployees++;

                // Process daily data
                for (const [date, value] of emp.dailyData.entries()) {
                    if (!value || value === '') continue;

                    // Get effective schedule
                    const schedule = getEffectiveSchedule(db, employeeId, departmentId, date);

                    if (effectiveFileType === 'details') {
                        // Validate and normalize status code
                        const statusCode = validateStatusCode(value);
                        const isViolation = ['L', 'E', 'LE', 'A'].includes(statusCode);

                        const upsertStmt = db.prepare(`
              INSERT INTO attendance_records (employee_id, date, status_code, is_violation, import_id)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(employee_id, date) DO UPDATE SET
                status_code = excluded.status_code,
                is_violation = excluded.is_violation,
                import_id = excluded.import_id
            `);

                        upsertStmt.run(employeeId, date, statusCode, isViolation ? 1 : 0, importId);
                        updatedRecords++;

                    } else {
                        // Parse time value
                        const timeValue = parseTimeValue(value);

                        if (timeValue.isValid && (timeValue.checkIn || timeValue.checkOut)) {
                            // Calculate late/early based on schedule
                            const lateMinutes = schedule.isWorkDay
                                ? calculateLateMinutes(timeValue.checkIn, schedule.workStart, schedule.lateTolerance)
                                : 0;

                            const earlyLeaveMinutes = schedule.isWorkDay
                                ? calculateEarlyLeaveMinutes(timeValue.checkOut, schedule.workEnd)
                                : 0;

                            const totalWorkMinutes = calculateTotalWorkMinutes(timeValue.checkIn, timeValue.checkOut);

                            // Insert/update time record
                            const upsertStmt = db.prepare(`
                INSERT INTO time_records (
                  employee_id, date, check_in, check_out,
                  late_minutes, early_leave_minutes, total_work_minutes, import_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(employee_id, date) DO UPDATE SET
                  check_in = excluded.check_in,
                  check_out = excluded.check_out,
                  late_minutes = excluded.late_minutes,
                  early_leave_minutes = excluded.early_leave_minutes,
                  total_work_minutes = excluded.total_work_minutes,
                  import_id = excluded.import_id
              `);

                            upsertStmt.run(
                                employeeId,
                                date,
                                timeValue.checkIn,
                                timeValue.checkOut,
                                lateMinutes,
                                earlyLeaveMinutes,
                                totalWorkMinutes,
                                importId
                            );
                            updatedRecords++;
                        }
                    }
                }
            }

            // Update import history
            db.prepare(`
        UPDATE import_history 
        SET new_employees = ?, updated_records = ?
        WHERE id = ?
      `).run(newEmployees, updatedRecords, importId);

            return {
                importId,
                newEmployees,
                updatedRecords,
                totalEmployees: parseResult.employees.length,
                dateColumns: parseResult.dateColumns.length,
                fileType: parseResult.fileType
            };
        });

        log.info('Import completed', result);

        res.json({
            success: true,
            data: {
                ...result,
                warnings: parseResult.warnings
            },
            message: `Import muvaffaqiyatli yakunlandi. ${result.newEmployees} yangi xodim, ${result.updatedRecords} yozuv yangilandi.`
        });

    } catch (error) {
        log.error('Import failed', { error });
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Import xatosi'
        });
    }
});

// =============================================================================
// GET /api/import/history - Get import history
// =============================================================================

router.get('/history', (req: Request, res: Response) => {
    try {
        const db = getDatabase();

        const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

        const stmt = db.prepare(`
      SELECT 
        id,
        file_name as fileName,
        file_type as fileType,
        import_date as importDate,
        records_count as recordsCount,
        new_employees as newEmployees,
        updated_records as updatedRecords,
        errors
      FROM import_history
      ORDER BY import_date DESC
      LIMIT ?
    `);

        const history = stmt.all(limit) as Record<string, unknown>[];

        // Parse errors JSON
        const parsedHistory = history.map(h => ({
            ...h,
            errors: JSON.parse(h.errors as string || '[]')
        }));

        res.json({
            success: true,
            data: parsedHistory
        });
    } catch (error) {
        log.error('Failed to fetch import history', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch import history'
        });
    }
});

// =============================================================================
// GET /api/import/time-records - Get time records
// =============================================================================

router.get('/time-records', (req: Request, res: Response) => {
    try {
        const db = getDatabase();

        const employeeId = req.query.employeeId as string;
        const dateFrom = req.query.from as string;
        const dateTo = req.query.to as string;

        let whereClause = '';
        const params: (string | number)[] = [];

        if (employeeId) {
            whereClause += ' WHERE tr.employee_id = ?';
            params.push(parseInt(employeeId));
        }

        if (dateFrom) {
            whereClause += whereClause ? ' AND' : ' WHERE';
            whereClause += ' tr.date >= ?';
            params.push(dateFrom);
        }

        if (dateTo) {
            whereClause += whereClause ? ' AND' : ' WHERE';
            whereClause += ' tr.date <= ?';
            params.push(dateTo);
        }

        const stmt = db.prepare(`
      SELECT 
        tr.id,
        tr.employee_id as employeeId,
        e.name as employeeName,
        e.external_id as externalId,
        d.name as department,
        tr.date,
        tr.check_in as checkIn,
        tr.check_out as checkOut,
        tr.late_minutes as lateMinutes,
        tr.early_leave_minutes as earlyLeaveMinutes,
        tr.total_work_minutes as totalWorkMinutes
      FROM time_records tr
      JOIN employees e ON tr.employee_id = e.id
      JOIN departments d ON e.department_id = d.id
      ${whereClause}
      ORDER BY tr.date DESC, e.name ASC
      LIMIT 500
    `);

        const records = stmt.all(...params);

        res.json({
            success: true,
            data: records
        });
    } catch (error) {
        log.error('Failed to fetch time records', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch time records'
        });
    }
});

// =============================================================================
// POST /api/import/recalculate - Recalculate late/early minutes
// =============================================================================

/**
 * Recalculate all time records based on current schedule settings
 * Use this after changing schedules or adding exceptions
 * 
 * Request body:
 * - dateFrom: Start date (YYYY-MM-DD) - optional, defaults to 30 days ago
 * - dateTo: End date (YYYY-MM-DD) - optional, defaults to today
 */
router.post('/recalculate', (req: Request, res: Response) => {
    try {
        const { dateFrom, dateTo } = req.body;

        // Default date range: last 30 days to today
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const effectiveFrom = dateFrom || thirtyDaysAgo.toISOString().split('T')[0];
        const effectiveTo = dateTo || today.toISOString().split('T')[0];

        log.info('Starting recalculation', { dateFrom: effectiveFrom, dateTo: effectiveTo });

        // Recalculate using schedule resolver
        const updatedCount = recalculateTimeRecords(effectiveFrom, effectiveTo);

        res.json({
            success: true,
            data: {
                updatedRecords: updatedCount,
                dateFrom: effectiveFrom,
                dateTo: effectiveTo
            },
            message: `${updatedCount} ta yozuv qayta hisoblandi.`
        });
    } catch (error) {
        log.error('Recalculation failed', { error });
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Qayta hisoblash xatosi'
        });
    }
});

// =============================================================================
// GET /api/import/attendance-records - Get attendance records
// =============================================================================

router.get('/attendance-records', (req: Request, res: Response) => {
    try {
        const db = getDatabase();

        const employeeId = req.query.employeeId as string;
        const dateFrom = req.query.from as string;
        const dateTo = req.query.to as string;

        let whereClause = '';
        const params: (string | number)[] = [];

        if (employeeId) {
            whereClause += ' WHERE ar.employee_id = ?';
            params.push(parseInt(employeeId));
        }

        if (dateFrom) {
            whereClause += whereClause ? ' AND' : ' WHERE';
            whereClause += ' ar.date >= ?';
            params.push(dateFrom);
        }

        if (dateTo) {
            whereClause += whereClause ? ' AND' : ' WHERE';
            whereClause += ' ar.date <= ?';
            params.push(dateTo);
        }

        const stmt = db.prepare(`
            SELECT 
                ar.id,
                ar.employee_id as employeeId,
                e.name as employeeName,
                e.external_id as externalId,
                d.name as department,
                ar.date,
                ar.status_code as statusCode,
                ar.is_violation as isViolation
            FROM attendance_records ar
            JOIN employees e ON ar.employee_id = e.id
            JOIN departments d ON e.department_id = d.id
            ${whereClause}
            ORDER BY ar.date DESC, e.name ASC
            LIMIT 500
        `);

        const records = stmt.all(...params);

        res.json({
            success: true,
            data: records
        });
    } catch (error) {
        log.error('Failed to fetch attendance records', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch attendance records'
        });
    }
});

export default router;
