/**
 * =============================================================================
 * HR Analytics Backend - Penalty API Routes
 * =============================================================================
 * 
 * RESTful API endpoints for penalty management.
 * Handles penalty rules configuration, calculation, and reporting.
 * 
 * Endpoints:
 * - GET    /api/penalties/rules         - Get penalty rules for year/month
 * - POST   /api/penalties/rules         - Create/update penalty rule
 * - POST   /api/penalties/rules/copy    - Copy rules to another month
 * - POST   /api/penalties/calculate     - Calculate penalties for month
 * - GET    /api/penalties               - Get applied penalties
 * - GET    /api/penalties/summary       - Get penalty summary statistics
 * - GET    /api/penalties/:employeeId   - Get penalty details for employee
 * 
 * @module routes/penalties
 * @author HR Analytics Team
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import { createContextLogger } from '../utils/logger';
import {
    getPenaltyRules,
    getPenaltyRulesByYear,
    upsertPenaltyRule,
    copyPenaltyRules,
    calculateEmployeePenalty,
    calculateAllPenalties,
    applyPenalty,
    getAppliedPenalties,
    getPenaltySummary,
    getKpiZeroRecord,
} from '../services/penaltyService';
import { getDatabase } from '../database/connection';
import type { PenaltyType } from '../models/types';

// Create router instance
const router = Router();

// Create context-specific logger
const log = createContextLogger('PenaltyAPI');

// =============================================================================
// GET /api/penalties/rules - Get Penalty Rules
// =============================================================================

/**
 * Get penalty rules for a specific year and optionally month
 * 
 * Query parameters:
 * - year: Required, target year (e.g., 2026)
 * - month: Optional, target month (1-12). If not provided, returns all months
 */
router.get('/rules', (req: Request, res: Response) => {
    try {
        const { year, month } = req.query;

        if (!year) {
            return res.status(400).json({
                success: false,
                error: 'Yil ko\'rsatilishi kerak'
            });
        }

        const yearNum = parseInt(year as string);

        if (month) {
            const monthNum = parseInt(month as string);
            const rules = getPenaltyRules(yearNum, monthNum);

            log.info('Penalty rules fetched', { year: yearNum, month: monthNum, count: rules.length });

            return res.json({
                success: true,
                data: rules
            });
        }

        // Return all months for the year
        const rules = getPenaltyRulesByYear(yearNum);

        log.info('Penalty rules fetched for year', { year: yearNum, count: rules.length });

        res.json({
            success: true,
            data: rules
        });
    } catch (error) {
        log.error('Failed to fetch penalty rules', { error });
        res.status(500).json({
            success: false,
            error: 'Qoidalarni yuklashda xatolik'
        });
    }
});

// =============================================================================
// POST /api/penalties/rules - Create/Update Penalty Rule
// =============================================================================

/**
 * Create or update a penalty rule
 * 
 * Body:
 * - year: number (required)
 * - month: number 1-12 (required)
 * - level: number >= 1 (required)
 * - penaltyType: 'fine' | 'kpi_zero' | 'termination' (required)
 * - fineAmount: number (required for 'fine' type)
 * - kpiMonths: number (required for 'kpi_zero' type)
 * - description: string (optional)
 * - isActive: boolean (default true)
 */
router.post('/rules', (req: Request, res: Response) => {
    try {
        const { year, month, level, penaltyType, fineAmount, kpiMonths, description, isActive } = req.body;

        // Validation
        if (!year || !month || !level || !penaltyType) {
            return res.status(400).json({
                success: false,
                error: 'year, month, level va penaltyType kerak'
            });
        }

        if (!['fine', 'kpi_zero', 'termination'].includes(penaltyType)) {
            return res.status(400).json({
                success: false,
                error: 'penaltyType: fine, kpi_zero yoki termination bo\'lishi kerak'
            });
        }

        const ruleId = upsertPenaltyRule({
            year: parseInt(year),
            month: parseInt(month),
            level: parseInt(level),
            penaltyType: penaltyType as PenaltyType,
            fineAmount: parseFloat(fineAmount) || 0,
            kpiMonths: parseInt(kpiMonths) || 0,
            description: description || null,
            isActive: isActive !== false,
        });

        log.info('Penalty rule saved', { id: ruleId, year, month, level });

        res.json({
            success: true,
            data: { id: ruleId },
            message: 'Qoida saqlandi'
        });
    } catch (error) {
        log.error('Failed to save penalty rule', { error });
        res.status(500).json({
            success: false,
            error: 'Qoidani saqlashda xatolik'
        });
    }
});

// =============================================================================
// POST /api/penalties/rules/bulk - Bulk Update Rules for Month
// =============================================================================

/**
 * Update all penalty rules for a month at once
 * 
 * Body:
 * - year: number
 * - month: number
 * - rules: Array of { level, penaltyType, fineAmount, kpiMonths, description }
 */
router.post('/rules/bulk', (req: Request, res: Response) => {
    try {
        const { year, month, rules } = req.body;

        if (!year || !month || !Array.isArray(rules)) {
            return res.status(400).json({
                success: false,
                error: 'year, month va rules[] kerak'
            });
        }

        let saved = 0;
        for (const rule of rules) {
            upsertPenaltyRule({
                year: parseInt(year),
                month: parseInt(month),
                level: parseInt(rule.level),
                penaltyType: rule.penaltyType as PenaltyType,
                fineAmount: parseFloat(rule.fineAmount) || 0,
                kpiMonths: parseInt(rule.kpiMonths) || 0,
                description: rule.description || null,
                isActive: rule.isActive !== false,
            });
            saved++;
        }

        log.info('Bulk penalty rules saved', { year, month, count: saved });

        res.json({
            success: true,
            data: { saved },
            message: `${saved} ta qoida saqlandi`
        });
    } catch (error) {
        log.error('Failed to bulk save penalty rules', { error });
        res.status(500).json({
            success: false,
            error: 'Qoidalarni saqlashda xatolik'
        });
    }
});

// =============================================================================
// POST /api/penalties/rules/copy - Copy Rules to Another Month
// =============================================================================

/**
 * Copy penalty rules from one month to another
 * 
 * Body:
 * - sourceYear: number
 * - sourceMonth: number
 * - targetYear: number
 * - targetMonth: number
 */
router.post('/rules/copy', (req: Request, res: Response) => {
    try {
        const { sourceYear, sourceMonth, targetYear, targetMonth } = req.body;

        if (!sourceYear || !sourceMonth || !targetYear || !targetMonth) {
            return res.status(400).json({
                success: false,
                error: 'sourceYear, sourceMonth, targetYear, targetMonth kerak'
            });
        }

        const copied = copyPenaltyRules(
            parseInt(sourceYear),
            parseInt(sourceMonth),
            parseInt(targetYear),
            parseInt(targetMonth)
        );

        log.info('Penalty rules copied', {
            from: `${sourceYear}-${sourceMonth}`,
            to: `${targetYear}-${targetMonth}`,
            count: copied
        });

        res.json({
            success: true,
            data: { copied },
            message: `${copied} ta qoida nusxalandi`
        });
    } catch (error) {
        log.error('Failed to copy penalty rules', { error });
        res.status(500).json({
            success: false,
            error: 'Qoidalarni nusxalashda xatolik'
        });
    }
});

// =============================================================================
// POST /api/penalties/calculate - Calculate Penalties
// =============================================================================

/**
 * Calculate penalties for all employees for a specific month
 * 
 * Body:
 * - year: number
 * - month: number
 */
router.post('/calculate', (req: Request, res: Response) => {
    try {
        const { year, month } = req.body;

        if (!year || !month) {
            return res.status(400).json({
                success: false,
                error: 'year va month kerak'
            });
        }

        const results = calculateAllPenalties(parseInt(year), parseInt(month));

        const summary = {
            totalEmployees: results.length,
            employeesWithFines: results.filter(r => r.totalFine > 0).length,
            totalFineAmount: results.reduce((sum, r) => sum + r.totalFine, 0),
            kpiZeroedCount: results.filter(r => r.kpiZeroed).length,
            terminationCount: results.filter(r => r.terminationRecommended).length,
        };

        log.info('Penalties calculated', { year, month, ...summary });

        res.json({
            success: true,
            data: {
                results,
                summary
            },
            message: `${results.length} xodim uchun jarimalar hisoblandi`
        });
    } catch (error) {
        log.error('Failed to calculate penalties', { error });
        res.status(500).json({
            success: false,
            error: 'Jarimalarni hisoblashda xatolik'
        });
    }
});

// =============================================================================
// GET /api/penalties - Get Applied Penalties
// =============================================================================

/**
 * Get applied penalties for a specific month
 * 
 * Query parameters:
 * - year: Required
 * - month: Required
 */
router.get('/', (req: Request, res: Response) => {
    try {
        const { year, month } = req.query;

        if (!year || !month) {
            return res.status(400).json({
                success: false,
                error: 'year va month kerak'
            });
        }

        const penalties = getAppliedPenalties(parseInt(year as string), parseInt(month as string));

        log.info('Applied penalties fetched', { year, month, count: penalties.length });

        res.json({
            success: true,
            data: penalties
        });
    } catch (error) {
        log.error('Failed to fetch applied penalties', { error });
        res.status(500).json({
            success: false,
            error: 'Jarimalarni yuklashda xatolik'
        });
    }
});

// =============================================================================
// GET /api/penalties/summary - Get Penalty Summary
// =============================================================================

/**
 * Get penalty summary statistics for a month
 * 
 * Query parameters:
 * - year: Required
 * - month: Required
 */
router.get('/summary', (req: Request, res: Response) => {
    try {
        const { year, month } = req.query;

        if (!year || !month) {
            return res.status(400).json({
                success: false,
                error: 'year va month kerak'
            });
        }

        const summary = getPenaltySummary(parseInt(year as string), parseInt(month as string));

        log.info('Penalty summary fetched', { year, month, ...summary });

        res.json({
            success: true,
            data: summary
        });
    } catch (error) {
        log.error('Failed to fetch penalty summary', { error });
        res.status(500).json({
            success: false,
            error: 'Statistikani yuklashda xatolik'
        });
    }
});

// =============================================================================
// GET /api/penalties/:employeeId - Get Employee Penalty Details
// =============================================================================

/**
 * Get penalty details for a specific employee
 * 
 * URL parameters:
 * - employeeId: Employee ID
 * 
 * Query parameters:
 * - year: Required
 * - month: Required
 */
router.get('/:employeeId', (req: Request, res: Response) => {
    try {
        const { employeeId } = req.params;
        const { year, month } = req.query;

        if (!year || !month) {
            return res.status(400).json({
                success: false,
                error: 'year va month kerak'
            });
        }

        const db = getDatabase();
        const yearNum = parseInt(year as string);
        const monthNum = parseInt(month as string);
        const empId = parseInt(employeeId);

        // Get employee info
        const empStmt = db.prepare(`
            SELECT e.*, d.name as department_name
            FROM employees e
            JOIN departments d ON e.department_id = d.id
            WHERE e.id = ?
        `);
        const employee = empStmt.get(empId) as Record<string, unknown> | undefined;

        if (!employee) {
            return res.status(404).json({
                success: false,
                error: 'Xodim topilmadi'
            });
        }

        // Get penalty record
        const penaltyStmt = db.prepare(`
            SELECT * FROM employee_penalties
            WHERE employee_id = ? AND year = ? AND month = ?
        `);
        const penalty = penaltyStmt.get(empId, yearNum, monthNum) as Record<string, unknown> | undefined;

        // Get penalty details
        let details: Array<Record<string, unknown>> = [];
        if (penalty) {
            const detailsStmt = db.prepare(`
                SELECT * FROM penalty_details
                WHERE penalty_id = ?
                ORDER BY level ASC
            `);
            details = detailsStmt.all(penalty.id) as Array<Record<string, unknown>>;
        }

        // Get KPI zero record
        const kpiZeroRecord = getKpiZeroRecord(empId, yearNum, monthNum);

        // Get violation summary
        const violationStmt = db.prepare(`
            SELECT * FROM violation_summary
            WHERE employee_id = ? AND year = ? AND month = ?
        `);
        const violation = violationStmt.get(empId, yearNum, monthNum) as Record<string, unknown> | undefined;

        log.info('Employee penalty details fetched', { employeeId: empId, year: yearNum, month: monthNum });

        res.json({
            success: true,
            data: {
                employee: {
                    id: employee.id,
                    name: employee.name,
                    externalId: employee.external_id,
                    departmentName: employee.department_name,
                },
                penalty: penalty ? {
                    id: penalty.id,
                    lateCount: penalty.late_count,
                    totalFine: penalty.total_fine,
                    kpiZeroed: Boolean(penalty.kpi_zeroed),
                    kpiZeroedMonths: penalty.kpi_zeroed_months,
                    terminationRecommended: Boolean(penalty.termination_recommended),
                    calculatedAt: penalty.calculated_at,
                } : null,
                details: details.map(d => ({
                    level: d.level,
                    penaltyType: d.penalty_type,
                    amount: d.amount,
                    description: d.description,
                })),
                kpiZeroRecord: kpiZeroRecord ? {
                    sourceYear: kpiZeroRecord.sourceYear,
                    sourceMonth: kpiZeroRecord.sourceMonth,
                    reason: kpiZeroRecord.reason,
                } : null,
                violation: violation ? {
                    lateCount: violation.late_count,
                    totalLateMinutes: violation.total_late_minutes,
                    earlyLeaveCount: violation.early_leave_count,
                    absentCount: violation.absent_count,
                } : null,
            }
        });
    } catch (error) {
        log.error('Failed to fetch employee penalty details', { error });
        res.status(500).json({
            success: false,
            error: 'Xodim jarimalarini yuklashda xatolik'
        });
    }
});

export default router;
