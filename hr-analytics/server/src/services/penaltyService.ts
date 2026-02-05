/**
 * =============================================================================
 * HR Analytics Backend - Penalty Service
 * =============================================================================
 * 
 * Service for calculating and applying employee penalties based on violations.
 * Handles dynamic penalty rules, cross-month KPI zeroing, and termination flags.
 * 
 * Algorithm:
 * 1. Get ViolationSummary for employee (lateCount)
 * 2. Check if KPI was pre-zeroed from previous months
 * 3. Get penalty rules for the month
 * 4. Apply cumulative penalties based on lateCount
 * 5. Save results to employee_penalties and kpi_zero_records
 * 
 * @module services/penaltyService
 * @author HR Analytics Team
 * @version 1.0.0
 */

import { getDatabase } from '../database/connection';
import { createContextLogger } from '../utils/logger';
import type {
    PenaltyRule,
    EmployeePenalty,
    KpiZeroRecord,
    PenaltyCalculationResult,
    PenaltyType
} from '../models/types';

// Create context-specific logger
const log = createContextLogger('PenaltyService');

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get next month year and month values
 * Handles year rollover (December -> January)
 */
function getNextMonth(year: number, month: number): { year: number; month: number } {
    if (month === 12) {
        return { year: year + 1, month: 1 };
    }
    return { year, month: month + 1 };
}

/**
 * Transform database row to PenaltyRule object
 */
function transformPenaltyRule(row: Record<string, unknown>): PenaltyRule {
    return {
        id: row.id as number,
        year: row.year as number,
        month: row.month as number,
        level: row.level as number,
        penaltyType: row.penalty_type as PenaltyType,
        fineAmount: row.fine_amount as number,
        kpiMonths: row.kpi_months as number,
        description: row.description as string | null,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
    };
}

// =============================================================================
// PENALTY RULES MANAGEMENT
// =============================================================================

/**
 * Get all penalty rules for a specific year and month
 * 
 * @param year - Target year
 * @param month - Target month (1-12)
 * @returns Array of PenaltyRule sorted by level
 */
export function getPenaltyRules(year: number, month: number): PenaltyRule[] {
    const db = getDatabase();

    const stmt = db.prepare(`
        SELECT * FROM penalty_rules
        WHERE year = ? AND month = ? AND is_active = 1
        ORDER BY level ASC
    `);

    const rows = stmt.all(year, month) as Record<string, unknown>[];
    return rows.map(transformPenaltyRule);
}

/**
 * Get all penalty rules for a specific year (all months)
 * 
 * @param year - Target year
 * @returns Array of PenaltyRule grouped by month
 */
export function getPenaltyRulesByYear(year: number): PenaltyRule[] {
    const db = getDatabase();

    const stmt = db.prepare(`
        SELECT * FROM penalty_rules
        WHERE year = ? AND is_active = 1
        ORDER BY month ASC, level ASC
    `);

    const rows = stmt.all(year) as Record<string, unknown>[];
    return rows.map(transformPenaltyRule);
}

/**
 * Create or update penalty rule
 * 
 * @param rule - Penalty rule data (without id for create)
 * @returns Created/updated rule ID
 */
export function upsertPenaltyRule(rule: Omit<PenaltyRule, 'id' | 'createdAt' | 'updatedAt'>): number {
    const db = getDatabase();

    // Check if rule exists
    const existingStmt = db.prepare(`
        SELECT id FROM penalty_rules
        WHERE year = ? AND month = ? AND level = ?
    `);
    const existing = existingStmt.get(rule.year, rule.month, rule.level) as { id: number } | undefined;

    if (existing) {
        // Update existing rule
        const updateStmt = db.prepare(`
            UPDATE penalty_rules
            SET penalty_type = ?, fine_amount = ?, kpi_months = ?, 
                description = ?, is_active = ?, updated_at = datetime('now')
            WHERE id = ?
        `);
        updateStmt.run(
            rule.penaltyType,
            rule.fineAmount,
            rule.kpiMonths,
            rule.description,
            rule.isActive ? 1 : 0,
            existing.id
        );

        log.info('Penalty rule updated', { id: existing.id, year: rule.year, month: rule.month, level: rule.level });
        return existing.id;
    } else {
        // Insert new rule
        const insertStmt = db.prepare(`
            INSERT INTO penalty_rules (year, month, level, penalty_type, fine_amount, kpi_months, description, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const result = insertStmt.run(
            rule.year,
            rule.month,
            rule.level,
            rule.penaltyType,
            rule.fineAmount,
            rule.kpiMonths,
            rule.description,
            rule.isActive ? 1 : 0
        );

        log.info('Penalty rule created', { id: result.lastInsertRowid, year: rule.year, month: rule.month, level: rule.level });
        return Number(result.lastInsertRowid);
    }
}

/**
 * Copy penalty rules from one month to another
 * Useful for initializing new months with default rules
 * 
 * @param sourceYear - Source year
 * @param sourceMonth - Source month
 * @param targetYear - Target year
 * @param targetMonth - Target month
 * @returns Number of rules copied
 */
export function copyPenaltyRules(
    sourceYear: number,
    sourceMonth: number,
    targetYear: number,
    targetMonth: number
): number {
    const sourceRules = getPenaltyRules(sourceYear, sourceMonth);

    let copied = 0;
    for (const rule of sourceRules) {
        upsertPenaltyRule({
            year: targetYear,
            month: targetMonth,
            level: rule.level,
            penaltyType: rule.penaltyType,
            fineAmount: rule.fineAmount,
            kpiMonths: rule.kpiMonths,
            description: rule.description,
            isActive: rule.isActive,
        });
        copied++;
    }

    log.info('Penalty rules copied', { from: `${sourceYear}-${sourceMonth}`, to: `${targetYear}-${targetMonth}`, count: copied });
    return copied;
}

// =============================================================================
// KPI ZERO TRACKING
// =============================================================================

/**
 * Check if employee's KPI is pre-zeroed for a specific month
 * (due to penalties from previous months)
 * 
 * @param employeeId - Employee ID
 * @param year - Target year
 * @param month - Target month
 * @returns KpiZeroRecord if found, null otherwise
 */
export function getKpiZeroRecord(employeeId: number, year: number, month: number): KpiZeroRecord | null {
    const db = getDatabase();

    const stmt = db.prepare(`
        SELECT * FROM kpi_zero_records
        WHERE employee_id = ? AND target_year = ? AND target_month = ?
        LIMIT 1
    `);

    const row = stmt.get(employeeId, year, month) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
        id: row.id as number,
        employeeId: row.employee_id as number,
        targetYear: row.target_year as number,
        targetMonth: row.target_month as number,
        sourceYear: row.source_year as number,
        sourceMonth: row.source_month as number,
        reason: row.reason as string,
        createdAt: row.created_at as string,
    };
}

/**
 * Record KPI zeroing for an employee
 * 
 * @param employeeId - Employee ID
 * @param targetYear - Year when KPI is zeroed
 * @param targetMonth - Month when KPI is zeroed
 * @param sourceYear - Year of violation that caused zeroing
 * @param sourceMonth - Month of violation that caused zeroing
 * @param reason - Description of why KPI was zeroed
 */
export function recordKpiZero(
    employeeId: number,
    targetYear: number,
    targetMonth: number,
    sourceYear: number,
    sourceMonth: number,
    reason: string
): void {
    const db = getDatabase();

    const stmt = db.prepare(`
        INSERT OR IGNORE INTO kpi_zero_records 
        (employee_id, target_year, target_month, source_year, source_month, reason)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(employeeId, targetYear, targetMonth, sourceYear, sourceMonth, reason);

    log.info('KPI zero recorded', {
        employeeId,
        target: `${targetYear}-${targetMonth}`,
        source: `${sourceYear}-${sourceMonth}`,
        reason
    });
}

// =============================================================================
// PENALTY CALCULATION
// =============================================================================

/**
 * Calculate penalties for a single employee for a specific month
 * 
 * @param employeeId - Employee ID
 * @param year - Target year
 * @param month - Target month
 * @returns PenaltyCalculationResult
 */
export function calculateEmployeePenalty(
    employeeId: number,
    year: number,
    month: number
): PenaltyCalculationResult | null {
    const db = getDatabase();

    // Get employee info
    const empStmt = db.prepare('SELECT id, name FROM employees WHERE id = ?');
    const employee = empStmt.get(employeeId) as { id: number; name: string } | undefined;

    if (!employee) {
        log.warn('Employee not found for penalty calculation', { employeeId });
        return null;
    }

    // Get violation summary for this month
    // Using all violations: late + early_leave + absent
    const violationStmt = db.prepare(`
        SELECT 
            late_count,
            early_leave_count,
            absent_count,
            (late_count + early_leave_count + absent_count) as total_violations
        FROM violation_summary
        WHERE employee_id = ? AND year = ? AND month = ?
    `);
    const violation = violationStmt.get(employeeId, year, month) as { 
        late_count: number;
        early_leave_count: number;
        absent_count: number;
        total_violations: number;
    } | undefined;

    // Extract individual violation counts
    const lateOnly = violation?.late_count || 0;
    const earlyLeaveCount = violation?.early_leave_count || 0;
    const absentCount = violation?.absent_count || 0;
    // Use total violations (late + early leave + absent) for penalty calculation
    const totalViolations = violation?.total_violations || 0;

    // Check if KPI was pre-zeroed from previous months
    const preZeroRecord = getKpiZeroRecord(employeeId, year, month);
    const preZeroedKpi = preZeroRecord !== null;

    // Get penalty rules for this month
    const rules = getPenaltyRules(year, month);

    if (rules.length === 0) {
        log.warn('No penalty rules found', { year, month });
        return {
            employeeId,
            employeeName: employee.name,
            year,
            month,
            lateCount: lateOnly,
            earlyLeaveCount,
            absentCount,
            totalViolations,
            fines: [],
            totalFine: 0,
            kpiZeroed: preZeroedKpi,
            kpiZeroedMonths: 0,
            terminationRecommended: false,
            preZeroedKpi,
        };
    }

    // Calculate penalties based on late count
    const fines: Array<{ level: number; amount: number; description: string }> = [];
    let totalFine = 0;
    let kpiZeroed = preZeroedKpi;
    let kpiZeroedMonths = 0;
    let terminationRecommended = false;

    // Apply cumulative penalties for each violation occurrence
    for (let level = 1; level <= totalViolations; level++) {
        // Find rule for this level (or use highest level rule for 6+)
        let rule = rules.find(r => r.level === level);

        // If no exact match, use the highest level rule (for 6+ lates)
        if (!rule && level > rules[rules.length - 1].level) {
            rule = rules[rules.length - 1];
        }

        if (!rule) continue;

        switch (rule.penaltyType) {
            case 'fine':
                fines.push({
                    level,
                    amount: rule.fineAmount,
                    description: rule.description || `${level}-marta kech qolish jarimasi`
                });
                totalFine += rule.fineAmount;
                break;

            case 'kpi_zero':
                kpiZeroed = true;
                kpiZeroedMonths = Math.max(kpiZeroedMonths, rule.kpiMonths);
                break;

            case 'termination':
                terminationRecommended = true;
                break;
        }
    }

    log.debug('Penalty calculated', {
        employeeId,
        employeeName: employee.name,
        totalViolations,
        totalFine,
        kpiZeroed,
        terminationRecommended
    });

    return {
        employeeId,
        employeeName: employee.name,
        year,
        month,
        lateCount: lateOnly,
        earlyLeaveCount,
        absentCount,
        totalViolations,
        fines,
        totalFine,
        kpiZeroed,
        kpiZeroedMonths,
        terminationRecommended,
        preZeroedKpi,
    };
}

/**
 * Apply calculated penalties to database
 * Saves to employee_penalties and creates kpi_zero_records if needed
 * 
 * @param result - Penalty calculation result
 * @returns Applied penalty ID
 */
export function applyPenalty(result: PenaltyCalculationResult): number {
    const db = getDatabase();

    // Upsert employee_penalties record
    const existingStmt = db.prepare(`
        SELECT id FROM employee_penalties
        WHERE employee_id = ? AND year = ? AND month = ?
    `);
    const existing = existingStmt.get(result.employeeId, result.year, result.month) as { id: number } | undefined;

    let penaltyId: number;

    if (existing) {
        // Update existing
        const updateStmt = db.prepare(`
            UPDATE employee_penalties
            SET late_count = ?, total_fine = ?, kpi_zeroed = ?, 
                kpi_zeroed_months = ?, termination_recommended = ?,
                calculated_at = datetime('now'), updated_at = datetime('now')
            WHERE id = ?
        `);
        updateStmt.run(
            result.lateCount,
            result.totalFine,
            result.kpiZeroed ? 1 : 0,
            result.kpiZeroedMonths,
            result.terminationRecommended ? 1 : 0,
            existing.id
        );
        penaltyId = existing.id;
    } else {
        // Insert new
        const insertStmt = db.prepare(`
            INSERT INTO employee_penalties 
            (employee_id, year, month, late_count, total_fine, kpi_zeroed, kpi_zeroed_months, termination_recommended)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insertResult = insertStmt.run(
            result.employeeId,
            result.year,
            result.month,
            result.lateCount,
            result.totalFine,
            result.kpiZeroed ? 1 : 0,
            result.kpiZeroedMonths,
            result.terminationRecommended ? 1 : 0
        );
        penaltyId = Number(insertResult.lastInsertRowid);
    }

    // Clear and re-insert penalty details
    db.prepare('DELETE FROM penalty_details WHERE penalty_id = ?').run(penaltyId);

    const detailStmt = db.prepare(`
        INSERT INTO penalty_details (penalty_id, level, penalty_type, amount, description)
        VALUES (?, ?, ?, ?, ?)
    `);

    for (const fine of result.fines) {
        detailStmt.run(penaltyId, fine.level, 'fine', fine.amount, fine.description);
    }

    // Record KPI zeroing for current and future months if needed
    if (result.kpiZeroed && result.kpiZeroedMonths > 0 && !result.preZeroedKpi) {
        // Zero current month
        recordKpiZero(
            result.employeeId,
            result.year,
            result.month,
            result.year,
            result.month,
            `${result.lateCount}-marta kech qolish sababli`
        );

        // Zero future months if kpiZeroedMonths > 1
        let targetYear = result.year;
        let targetMonth = result.month;

        for (let i = 1; i < result.kpiZeroedMonths; i++) {
            const next = getNextMonth(targetYear, targetMonth);
            targetYear = next.year;
            targetMonth = next.month;

            recordKpiZero(
                result.employeeId,
                targetYear,
                targetMonth,
                result.year,
                result.month,
                `${result.year}-${result.month} oyidagi ${result.lateCount}-marta kech qolish sababli`
            );
        }
    }

    log.info('Penalty applied', {
        penaltyId,
        employeeId: result.employeeId,
        totalFine: result.totalFine,
        kpiZeroed: result.kpiZeroed
    });

    return penaltyId;
}

/**
 * Calculate and apply penalties for all employees for a specific month
 * 
 * @param year - Target year
 * @param month - Target month
 * @returns Array of calculation results
 */
export function calculateAllPenalties(year: number, month: number): PenaltyCalculationResult[] {
    const db = getDatabase();

    log.info('Starting bulk penalty calculation', { year, month });

    // Get all employees with violations for this month
    const employeesStmt = db.prepare(`
        SELECT DISTINCT e.id
        FROM employees e
        LEFT JOIN violation_summary vs ON e.id = vs.employee_id 
            AND vs.year = ? AND vs.month = ?
        ORDER BY e.id
    `);

    const employees = employeesStmt.all(year, month) as Array<{ id: number }>;
    const results: PenaltyCalculationResult[] = [];

    for (const emp of employees) {
        const result = calculateEmployeePenalty(emp.id, year, month);
        if (result) {
            applyPenalty(result);
            results.push(result);
        }
    }

    log.info('Bulk penalty calculation completed', {
        year,
        month,
        totalEmployees: results.length,
        totalFines: results.reduce((sum, r) => sum + r.totalFine, 0),
        kpiZeroed: results.filter(r => r.kpiZeroed).length,
        terminations: results.filter(r => r.terminationRecommended).length
    });

    return results;
}

/**
 * Get applied penalties for a specific month
 * 
 * @param year - Target year
 * @param month - Target month
 * @returns Array of employee penalties with employee info
 */
export function getAppliedPenalties(year: number, month: number): Array<EmployeePenalty & {
    employeeName: string;
    departmentName: string;
}> {
    const db = getDatabase();

    const stmt = db.prepare(`
        SELECT 
            ep.*,
            e.name as employee_name,
            d.name as department_name
        FROM employee_penalties ep
        JOIN employees e ON ep.employee_id = e.id
        JOIN departments d ON e.department_id = d.id
        WHERE ep.year = ? AND ep.month = ?
        ORDER BY ep.total_fine DESC, e.name ASC
    `);

    const rows = stmt.all(year, month) as Record<string, unknown>[];

    return rows.map(row => ({
        id: row.id as number,
        employeeId: row.employee_id as number,
        year: row.year as number,
        month: row.month as number,
        lateCount: row.late_count as number,
        totalFine: row.total_fine as number,
        kpiZeroed: Boolean(row.kpi_zeroed),
        kpiZeroedMonths: row.kpi_zeroed_months as number,
        terminationRecommended: Boolean(row.termination_recommended),
        notes: row.notes as string | null,
        calculatedAt: row.calculated_at as string,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        employeeName: row.employee_name as string,
        departmentName: row.department_name as string,
    }));
}

/**
 * Get penalty summary statistics for a month
 */
export function getPenaltySummary(year: number, month: number): {
    totalEmployees: number;
    employeesWithFines: number;
    totalFineAmount: number;
    kpiZeroedCount: number;
    terminationCount: number;
} {
    const db = getDatabase();

    const stmt = db.prepare(`
        SELECT 
            COUNT(*) as total_employees,
            SUM(CASE WHEN total_fine > 0 THEN 1 ELSE 0 END) as employees_with_fines,
            SUM(total_fine) as total_fine_amount,
            SUM(kpi_zeroed) as kpi_zeroed_count,
            SUM(termination_recommended) as termination_count
        FROM employee_penalties
        WHERE year = ? AND month = ?
    `);

    const row = stmt.get(year, month) as Record<string, unknown>;

    return {
        totalEmployees: (row.total_employees as number) || 0,
        employeesWithFines: (row.employees_with_fines as number) || 0,
        totalFineAmount: (row.total_fine_amount as number) || 0,
        kpiZeroedCount: (row.kpi_zeroed_count as number) || 0,
        terminationCount: (row.termination_count as number) || 0,
    };
}
