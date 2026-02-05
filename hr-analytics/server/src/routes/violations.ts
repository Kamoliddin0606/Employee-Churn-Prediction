/**
 * =============================================================================
 * HR Analytics Backend - Violations API Routes
 * =============================================================================
 * 
 * API endpoints for violation statistics and calculations.
 * 
 * @module routes/violations
 * @author HR Analytics Team
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import { getDatabase } from '../database/connection';
import { createContextLogger } from '../utils/logger';
import {
    calculateAllEmployeesMonthlyViolations,
    getEmployeeViolationSummary,
    getAllViolationSummaries
} from '../services/violationCalculator';
import type { CalculationLevel } from '../models/types';

// Create router instance
const router = Router();

// Create context-specific logger
const log = createContextLogger('ViolationsAPI');

// =============================================================================
// GET /api/violations/summary - Get monthly violation summary
// =============================================================================

/**
 * Get all violation summaries for a specific month
 * 
 * Query parameters:
 * - year: Year (default: current year)
 * - month: Month 1-12 (default: current month)
 */
router.get('/summary', (req: Request, res: Response) => {
    try {
        const now = new Date();
        const year = parseInt(req.query.year as string) || now.getFullYear();
        const month = parseInt(req.query.month as string) || now.getMonth() + 1;

        // Validate
        if (month < 1 || month > 12) {
            return res.status(400).json({
                success: false,
                error: 'Oy 1-12 oralig\'ida bo\'lishi kerak'
            });
        }

        const summaries = getAllViolationSummaries(year, month);

        res.json({
            success: true,
            data: {
                year,
                month,
                items: summaries,
                total: summaries.length
            }
        });
    } catch (error) {
        log.error('Failed to fetch violation summaries', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch violation summaries'
        });
    }
});

// =============================================================================
// GET /api/violations/employee/:id - Get employee violation summary
// =============================================================================

/**
 * Get violation summary for a specific employee
 * 
 * Query parameters:
 * - year: Year
 * - month: Month 1-12
 */
router.get('/employee/:id', (req: Request, res: Response) => {
    try {
        const employeeId = parseInt(req.params.id);
        const now = new Date();
        const year = parseInt(req.query.year as string) || now.getFullYear();
        const month = parseInt(req.query.month as string) || now.getMonth() + 1;

        const summary = getEmployeeViolationSummary(employeeId, year, month);

        if (!summary) {
            return res.status(404).json({
                success: false,
                error: 'Bu oy uchun ma\'lumot topilmadi. Avval hisoblab chiqing.'
            });
        }

        res.json({
            success: true,
            data: summary
        });
    } catch (error) {
        log.error('Failed to fetch employee violation summary', { error, id: req.params.id });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch employee violation summary'
        });
    }
});

// =============================================================================
// POST /api/violations/calculate - Calculate violations for a month
// =============================================================================

/**
 * Calculate and save monthly violations for all employees
 * 
 * Request body:
 * - year: Year (default: current year)
 * - month: Month 1-12 (default: current month)
 * - level: Calculation level (default: from settings)
 */
router.post('/calculate', (req: Request, res: Response) => {
    try {
        const db = getDatabase();

        const now = new Date();
        let { year, month, level } = req.body;

        // Defaults
        year = year || now.getFullYear();
        month = month || now.getMonth() + 1;

        // Get level from settings if not provided
        if (!level) {
            const settingsStmt = db.prepare('SELECT level FROM calculation_settings WHERE id = 1');
            const settings = settingsStmt.get() as { level: CalculationLevel } | undefined;
            level = settings?.level || 'full';
        }

        // Validate
        if (month < 1 || month > 12) {
            return res.status(400).json({
                success: false,
                error: 'Oy 1-12 oralig\'ida bo\'lishi kerak'
            });
        }

        const validLevels: CalculationLevel[] = ['organization', 'department', 'employee', 'full'];
        if (!validLevels.includes(level)) {
            return res.status(400).json({
                success: false,
                error: `Noto'g'ri daraja. Qabul qilinadigan: ${validLevels.join(', ')}`
            });
        }

        log.info('Starting violation calculation', { year, month, level });

        const processedCount = calculateAllEmployeesMonthlyViolations(year, month, level);

        res.json({
            success: true,
            data: {
                year,
                month,
                level,
                processedEmployees: processedCount
            },
            message: `${processedCount} ta xodim uchun oylik statistika hisoblandi.`
        });
    } catch (error) {
        log.error('Violation calculation failed', { error });
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Hisoblash xatosi'
        });
    }
});

// =============================================================================
// GET /api/violations/report - Generate violation report
// =============================================================================

/**
 * Get detailed violation report with filters
 * 
 * Query parameters:
 * - year: Year
 * - month: Month
 * - departmentId: Filter by department
 * - sortBy: late_minutes, early_leave_minutes, violation_count
 * - sortOrder: asc, desc
 */
router.get('/report', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const now = new Date();

        const year = parseInt(req.query.year as string) || now.getFullYear();
        const month = parseInt(req.query.month as string) || now.getMonth() + 1;
        const departmentId = req.query.departmentId as string;
        const sortBy = req.query.sortBy as string || 'violation_count';
        const sortOrder = req.query.sortOrder as string || 'desc';

        // Build query
        let whereClause = 'WHERE vs.year = ? AND vs.month = ?';
        const params: (number | string)[] = [year, month];

        if (departmentId) {
            whereClause += ' AND e.department_id = ?';
            params.push(parseInt(departmentId));
        }

        // Validate sort field
        const validSortFields = [
            'total_late_minutes', 'total_early_leave_minutes',
            'late_count', 'early_leave_count', 'violation_count', 'name'
        ];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'violation_count';
        const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        const stmt = db.prepare(`
      SELECT 
        vs.id,
        vs.employee_id as employeeId,
        e.name as employeeName,
        e.external_id as externalId,
        d.name as department,
        d.id as departmentId,
        vs.year,
        vs.month,
        vs.total_late_minutes as totalLateMinutes,
        vs.total_early_leave_minutes as totalEarlyLeaveMinutes,
        vs.late_count as lateCount,
        vs.early_leave_count as earlyLeaveCount,
        vs.absent_count as absentCount,
        vs.violation_count as violationCount,
        vs.calculation_level as calculationLevel,
        vs.calculated_at as calculatedAt
      FROM violation_summary vs
      JOIN employees e ON vs.employee_id = e.id
      JOIN departments d ON e.department_id = d.id
      ${whereClause}
      ORDER BY ${sortField === 'name' ? 'e.name' : 'vs.' + sortField} ${order}
    `);

        const report = stmt.all(...params);

        // Define totals type
        interface ReportTotals {
            totalLateMinutes: number;
            totalEarlyLeaveMinutes: number;
            lateCount: number;
            earlyLeaveCount: number;
            absentCount: number;
            violationCount: number;
        }

        // Calculate totals
        const totals = (report as Record<string, unknown>[]).reduce<ReportTotals>((acc, row) => ({
            totalLateMinutes: acc.totalLateMinutes + (row.totalLateMinutes as number || 0),
            totalEarlyLeaveMinutes: acc.totalEarlyLeaveMinutes + (row.totalEarlyLeaveMinutes as number || 0),
            lateCount: acc.lateCount + (row.lateCount as number || 0),
            earlyLeaveCount: acc.earlyLeaveCount + (row.earlyLeaveCount as number || 0),
            absentCount: acc.absentCount + (row.absentCount as number || 0),
            violationCount: acc.violationCount + (row.violationCount as number || 0)
        }), {
            totalLateMinutes: 0,
            totalEarlyLeaveMinutes: 0,
            lateCount: 0,
            earlyLeaveCount: 0,
            absentCount: 0,
            violationCount: 0
        });

        res.json({
            success: true,
            data: {
                year,
                month,
                employees: report,
                totals,
                employeeCount: report.length
            }
        });
    } catch (error) {
        log.error('Failed to generate violation report', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to generate violation report'
        });
    }
});

export default router;
