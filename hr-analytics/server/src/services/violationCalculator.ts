/**
 * =============================================================================
 * HR Analytics Backend - Violation Calculator Service
 * =============================================================================
 * 
 * Calculates monthly violation statistics for employees.
 * Aggregates late minutes, early leave minutes, and violation counts.
 * Supports different calculation levels for comparison.
 * 
 * @module services/violationCalculator
 * @author HR Analytics Team
 * @version 1.0.0
 */

import { getDatabase } from '../database/connection';
import { createContextLogger } from '../utils/logger';
import { getEffectiveSchedule } from './scheduleResolver';
import type { ViolationSummary, CalculationLevel } from '../models/types';

// Create context-specific logger
const log = createContextLogger('ViolationCalculator');

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Time record from database
 * Extended with missing time tracking fields
 */
interface TimeRecordRow {
    id: number;
    employee_id: number;
    date: string;
    check_in: string | null;
    check_out: string | null;
    late_minutes: number;
    early_leave_minutes: number;
    is_auto_filled: number;      // 1 if time was auto-filled
    missing_type: string | null;  // 'check_in', 'check_out', 'both', or null
}

/**
 * Attendance record from database
 */
interface AttendanceRow {
    employee_id: number;
    date: string;
    status_code: string;
    is_violation: number;
}

/**
 * Calculation result for one employee's month
 * Extended with not-at-workplace tracking for missing time handling
 */
interface MonthlyViolationResult {
    totalLateMinutes: number;
    totalEarlyLeaveMinutes: number;
    lateCount: number;
    earlyLeaveCount: number;
    absentCount: number;
    violationCount: number;
    // Not-at-workplace tracking (Type 2 settings - both check_in and check_out missing)
    notAtWorkplaceCount: number;   // Days when employee was not at workplace
    notAtWorkplaceMinutes: number; // Total minutes of not-at-workplace time
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Parse time string to minutes from midnight
 * Converts "HH:MM" format to total minutes for calculations
 * 
 * @param time - Time string in "HH:MM" format
 * @returns Total minutes from midnight
 */
function timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Calculate late minutes based on schedule
 * 
 * @param checkIn - Check-in time (HH:MM)
 * @param workStart - Work start time (HH:MM)
 * @param tolerance - Grace period in minutes
 * @returns Minutes late (0 if on time)
 */
function calculateLateMinutes(
    checkIn: string | null,
    workStart: string,
    tolerance: number
): number {
    if (!checkIn) return 0;

    const [checkHour, checkMinute] = checkIn.split(':').map(Number);
    const [startHour, startMinute] = workStart.split(':').map(Number);

    const checkInTotal = checkHour * 60 + checkMinute;
    const workStartTotal = startHour * 60 + startMinute + tolerance;

    return Math.max(0, checkInTotal - workStartTotal);
}

/**
 * Calculate early leave minutes based on schedule
 * 
 * @param checkOut - Check-out time (HH:MM)
 * @param workEnd - Work end time (HH:MM)
 * @returns Minutes early (0 if on time or late)
 */
function calculateEarlyLeaveMinutes(
    checkOut: string | null,
    workEnd: string
): number {
    if (!checkOut) return 0;

    const [checkHour, checkMinute] = checkOut.split(':').map(Number);
    const [endHour, endMinute] = workEnd.split(':').map(Number);

    const checkOutTotal = checkHour * 60 + checkMinute;
    const workEndTotal = endHour * 60 + endMinute;

    return Math.max(0, workEndTotal - checkOutTotal);
}

/**
 * Get all dates in a month as YYYY-MM-DD strings
 * 
 * @param year - Year
 * @param month - Month (1-12)
 * @returns Array of date strings
 */
function getMonthDates(year: number, month: number): string[] {
    const dates: string[] = [];
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        dates.push(dateStr);
    }

    return dates;
}

// =============================================================================
// MAIN CALCULATION FUNCTIONS
// =============================================================================

/**
 * Calculate monthly violations for a single employee
 * Uses effective schedule based on calculation level
 * 
 * @param employeeId - Employee ID
 * @param year - Year
 * @param month - Month (1-12)
 * @param level - Calculation level (organization, department, employee, full)
 * @returns Monthly violation statistics
 */
export function calculateEmployeeMonthlyViolations(
    employeeId: number,
    year: number,
    month: number,
    level: CalculationLevel
): MonthlyViolationResult {
    const db = getDatabase();

    // Get start and end dates for the month
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay}`;

    // Get time records for this employee and month
    // Include missing time tracking fields for not-at-workplace calculation
    const timeRecordStmt = db.prepare(`
    SELECT id, employee_id, date, check_in, check_out,
           late_minutes, early_leave_minutes, is_auto_filled, missing_type
    FROM time_records
    WHERE employee_id = ? AND date >= ? AND date <= ?
    ORDER BY date
  `);

    const timeRecords = timeRecordStmt.all(employeeId, startDate, endDate) as TimeRecordRow[];

    // Get attendance records for absent days
    const attendanceStmt = db.prepare(`
    SELECT employee_id, date, status_code, is_violation
    FROM attendance_records
    WHERE employee_id = ? AND date >= ? AND date <= ? AND status_code = 'A'
  `);

    const absentRecords = attendanceStmt.all(employeeId, startDate, endDate) as AttendanceRow[];

    // Initialize result with not-at-workplace tracking
    const result: MonthlyViolationResult = {
        totalLateMinutes: 0,
        totalEarlyLeaveMinutes: 0,
        lateCount: 0,
        earlyLeaveCount: 0,
        absentCount: absentRecords.length,
        violationCount: 0,
        notAtWorkplaceCount: 0,
        notAtWorkplaceMinutes: 0
    };

    // Process each time record
    for (const record of timeRecords) {
        // Get effective schedule based on level
        const schedule = getScheduleByLevel(employeeId, record.date, level);

        // Skip non-work days
        if (!schedule.isWorkDay) continue;

        // =================================================================
        // NOT-AT-WORKPLACE TRACKING
        // =================================================================
        // If missing_type is 'both', employee was not at workplace
        // This happens when both check_in and check_out were missing
        // and Type 2 settings were applied (auto-fill with penalty)
        // =================================================================
        if (record.missing_type === 'both') {
            result.notAtWorkplaceCount++;
            // Calculate full work day minutes for not-at-workplace
            const workStartMinutes = timeToMinutes(schedule.workStart);
            const workEndMinutes = timeToMinutes(schedule.workEnd);
            result.notAtWorkplaceMinutes += (workEndMinutes - workStartMinutes);
        }

        // Use pre-calculated late/early minutes from import if available
        // Otherwise calculate based on check-in/check-out times
        let lateMinutes = 0;
        let earlyMinutes = 0;

        if (record.is_auto_filled && record.late_minutes !== undefined) {
            // Use pre-calculated values from import (already processed by MissingTimeResolver)
            lateMinutes = record.late_minutes;
            earlyMinutes = record.early_leave_minutes;
        } else {
            // Calculate late minutes
            lateMinutes = calculateLateMinutes(
                record.check_in,
                schedule.workStart,
                schedule.lateTolerance
            );

            // Calculate early leave minutes
            earlyMinutes = calculateEarlyLeaveMinutes(
                record.check_out,
                schedule.workEnd
            );
        }

        if (lateMinutes > 0) {
            result.totalLateMinutes += lateMinutes;
            result.lateCount++;
        }

        if (earlyMinutes > 0) {
            result.totalEarlyLeaveMinutes += earlyMinutes;
            result.earlyLeaveCount++;
        }
    }

    // Total violation count (includes not-at-workplace)
    result.violationCount = result.lateCount + result.earlyLeaveCount + 
                           result.absentCount + result.notAtWorkplaceCount;

    return result;
}

/**
 * Get schedule based on calculation level
 * 
 * @param employeeId - Employee ID
 * @param date - Date string
 * @param level - Calculation level
 */
function getScheduleByLevel(
    employeeId: number,
    date: string,
    level: CalculationLevel
): { workStart: string; workEnd: string; lateTolerance: number; isWorkDay: boolean } {
    const db = getDatabase();
    const dayOfWeek = new Date(date).getDay() || 7; // 1-7 (Mon-Sun)

    // For 'full' level, use the complete priority resolution
    if (level === 'full') {
        return getEffectiveSchedule(employeeId, date);
    }

    // For other levels, get specific schedule type only
    let targetType: string;
    let targetId: number;

    if (level === 'organization') {
        targetType = 'organization';
        targetId = 1; // Default organization
    } else if (level === 'department') {
        // Get employee's department
        const empStmt = db.prepare('SELECT department_id FROM employees WHERE id = ?');
        const emp = empStmt.get(employeeId) as { department_id: number } | undefined;

        // Check if department schedule exists
        const deptScheduleStmt = db.prepare(`
      SELECT work_start, work_end, late_tolerance, work_days
      FROM work_schedules
      WHERE target_type = 'department' AND target_id = ? AND is_active = 1
    `);
        const deptSchedule = emp ? deptScheduleStmt.get(emp.department_id) as Record<string, unknown> | undefined : undefined;

        if (deptSchedule) {
            const workDays = JSON.parse(deptSchedule.work_days as string) as number[];
            return {
                workStart: deptSchedule.work_start as string,
                workEnd: deptSchedule.work_end as string,
                lateTolerance: deptSchedule.late_tolerance as number,
                isWorkDay: workDays.includes(dayOfWeek)
            };
        }

        // Fall back to organization if no department schedule
        targetType = 'organization';
        targetId = 1;
    } else {
        // Employee level - check employee schedule first
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

        // Fall back to organization
        targetType = 'organization';
        targetId = 1;
    }

    // Get organization schedule
    const scheduleStmt = db.prepare(`
    SELECT work_start, work_end, late_tolerance, work_days
    FROM work_schedules
    WHERE target_type = ? AND target_id = ? AND is_active = 1
  `);
    const schedule = scheduleStmt.get(targetType, targetId) as Record<string, unknown> | undefined;

    if (schedule) {
        const workDays = JSON.parse(schedule.work_days as string) as number[];
        return {
            workStart: schedule.work_start as string,
            workEnd: schedule.work_end as string,
            lateTolerance: schedule.late_tolerance as number,
            isWorkDay: workDays.includes(dayOfWeek)
        };
    }

    // Ultimate fallback
    return {
        workStart: '09:00',
        workEnd: '18:00',
        lateTolerance: 5,
        isWorkDay: dayOfWeek >= 1 && dayOfWeek <= 5
    };
}

/**
 * Calculate and save monthly violations for all employees
 * 
 * @param year - Year
 * @param month - Month (1-12)
 * @param level - Calculation level
 * @returns Number of employees processed
 */
export function calculateAllEmployeesMonthlyViolations(
    year: number,
    month: number,
    level: CalculationLevel
): number {
    const db = getDatabase();

    log.info('Starting monthly violation calculation', { year, month, level });

    // Get all employees
    const employeesStmt = db.prepare('SELECT id FROM employees');
    const employees = employeesStmt.all() as Array<{ id: number }>;

    // Prepare upsert statement
    const upsertStmt = db.prepare(`
    INSERT INTO violation_summary (
      employee_id, year, month, 
      total_late_minutes, total_early_leave_minutes,
      late_count, early_leave_count, absent_count, violation_count,
      calculation_level, calculated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(employee_id, year, month) DO UPDATE SET
      total_late_minutes = excluded.total_late_minutes,
      total_early_leave_minutes = excluded.total_early_leave_minutes,
      late_count = excluded.late_count,
      early_leave_count = excluded.early_leave_count,
      absent_count = excluded.absent_count,
      violation_count = excluded.violation_count,
      calculation_level = excluded.calculation_level,
      calculated_at = excluded.calculated_at
  `);

    let processedCount = 0;

    for (const emp of employees) {
        try {
            const violations = calculateEmployeeMonthlyViolations(emp.id, year, month, level);

            upsertStmt.run(
                emp.id,
                year,
                month,
                violations.totalLateMinutes,
                violations.totalEarlyLeaveMinutes,
                violations.lateCount,
                violations.earlyLeaveCount,
                violations.absentCount,
                violations.violationCount,
                level
            );

            processedCount++;
        } catch (error) {
            log.error('Failed to calculate violations for employee', { employeeId: emp.id, error });
        }
    }

    log.info('Monthly violation calculation completed', {
        year,
        month,
        level,
        processedCount
    });

    return processedCount;
}

/**
 * Get violation summary for an employee
 * 
 * @param employeeId - Employee ID
 * @param year - Year
 * @param month - Month
 */
export function getEmployeeViolationSummary(
    employeeId: number,
    year: number,
    month: number
): ViolationSummary | null {
    const db = getDatabase();

    const stmt = db.prepare(`
    SELECT 
      id, employee_id as employeeId, year, month,
      total_late_minutes as totalLateMinutes,
      total_early_leave_minutes as totalEarlyLeaveMinutes,
      late_count as lateCount,
      early_leave_count as earlyLeaveCount,
      absent_count as absentCount,
      violation_count as violationCount,
      calculation_level as calculationLevel,
      calculated_at as calculatedAt
    FROM violation_summary
    WHERE employee_id = ? AND year = ? AND month = ?
  `);

    return stmt.get(employeeId, year, month) as ViolationSummary | null;
}

/**
 * Get all violation summaries for a month
 * 
 * @param year - Year
 * @param month - Month
 */
export function getAllViolationSummaries(
    year: number,
    month: number
): ViolationSummary[] {
    const db = getDatabase();

    const stmt = db.prepare(`
    SELECT 
      vs.id,
      vs.employee_id as employeeId,
      e.name as employeeName,
      e.external_id as externalId,
      d.name as department,
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
    WHERE vs.year = ? AND vs.month = ?
    ORDER BY vs.violation_count DESC, e.name ASC
  `);

    return stmt.all(year, month) as ViolationSummary[];
}

export default {
    calculateEmployeeMonthlyViolations,
    calculateAllEmployeesMonthlyViolations,
    getEmployeeViolationSummary,
    getAllViolationSummaries
};
