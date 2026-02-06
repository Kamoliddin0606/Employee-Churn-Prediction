import { getDatabase } from '../database/connection';

// =============================================================================
// TYPES
// =============================================================================

interface SalaryDeductionResult {
    employeeId: number;
    year: number;
    month: number;
    baseSalary: number;
    workDaysCount: number;
    dailyWorkMinutes: number;
    monthlyWorkMinutes: number;
    lateMinutes: number;
    earlyLeaveMinutes: number;
    absentMinutes: number;
    totalViolationMinutes: number;
    minuteRate: number;
    calculatedDeduction: number;
    maxDeductionPercent: number;
    maxDeductionAmount: number;
    finalDeduction: number;
    finalSalary: number;
    lunchBreakMinutes: number;
}

interface EmployeeWorkData {
    employeeId: number;
    baseSalary: number;
    workDays: Array<{
        date: string;
        workStart: number;
        workEnd: number;
    }>;
    violations: {
        lateMinutes: number;
        earlyLeaveMinutes: number;
        absentMinutes: number;
    };
}

/**
 * Convert time string (HH:MM) to minutes since midnight
 */
function timeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

// =============================================================================
// SETTINGS
// =============================================================================

/**
 * Get lunch break minutes from settings
 */
function getLunchBreakMinutes(): number {
    try {
        const db = getDatabase();
        const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('lunch_break_minutes') as { value: string } | undefined;
        return setting ? parseInt(setting.value) : 60;
    } catch (error) {
        console.error('Error getting lunch break minutes, using default 60:', error);
        return 60; // Default fallback
    }
}

/**
 * Get max salary deduction percent from settings
 */
function getMaxDeductionPercent(): number {
    try {
        const db = getDatabase();
        const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('max_salary_deduction_percent') as { value: string } | undefined;
        return setting ? parseFloat(setting.value) : 30;
    } catch (error) {
        console.error('Error getting max deduction percent, using default 30:', error);
        return 30; // Default fallback
    }
}

// =============================================================================
// WORK DATA COLLECTION
// =============================================================================

/**
 * Get employee work data for a specific month
 */
function getEmployeeWorkData(employeeId: number, year: number, month: number): EmployeeWorkData | null {
    try {
        const db = getDatabase();

        // Get base salary from employee_compensation
        const compensation = db.prepare(`
            SELECT base_salary
            FROM employee_compensation
            WHERE employee_id = ? AND year = ? AND month = ?
        `).get(employeeId, year, month) as { base_salary: number } | undefined;

        if (!compensation || !compensation.base_salary) {
            console.log(`No compensation found for employee ${employeeId}, year ${year}, month ${month}`);
            return null;
        }

        // Get default schedule (fallback values)
        const DEFAULT_WORK_START = '09:00';
        const DEFAULT_WORK_END = '18:00';

        // First, try to get schedule from work_schedules with cascading resolution
        const schedule = db.prepare(`
            SELECT 
                COALESCE(
                    (SELECT work_start FROM work_schedules 
                     WHERE target_type = 'employee' AND target_id = ? AND is_active = 1 LIMIT 1),
                    (SELECT work_start FROM work_schedules 
                     WHERE target_type = 'department' AND target_id = (SELECT department_id FROM employees WHERE id = ?) AND is_active = 1 LIMIT 1),
                    (SELECT work_start FROM work_schedules 
                     WHERE target_type = 'organization' AND is_active = 1 LIMIT 1),
                    ?
                ) as work_start,
                COALESCE(
                    (SELECT work_end FROM work_schedules 
                     WHERE target_type = 'employee' AND target_id = ? AND is_active = 1 LIMIT 1),
                    (SELECT work_end FROM work_schedules 
                     WHERE target_type = 'department' AND target_id = (SELECT department_id FROM employees WHERE id = ?) AND is_active = 1 LIMIT 1),
                    (SELECT work_end FROM work_schedules 
                     WHERE target_type = 'organization' AND is_active = 1 LIMIT 1),
                    ?
                ) as work_end
        `).get(employeeId, employeeId, DEFAULT_WORK_START, employeeId, employeeId, DEFAULT_WORK_END) as {
            work_start: string;
            work_end: string;
        };

        const workStart = schedule?.work_start || DEFAULT_WORK_START;
        const workEnd = schedule?.work_end || DEFAULT_WORK_END;

        // Get work_days from schedule (which days of week are working days)
        // Format: '[1,2,3,4,5]' where 1=Monday, 7=Sunday
        const DEFAULT_WORK_DAYS = '[1,2,3,4,5]'; // Mon-Fri
        const scheduleWorkDays = db.prepare(`
            SELECT 
                COALESCE(
                    (SELECT work_days FROM work_schedules 
                     WHERE target_type = 'employee' AND target_id = ? AND is_active = 1 LIMIT 1),
                    (SELECT work_days FROM work_schedules 
                     WHERE target_type = 'department' AND target_id = (SELECT department_id FROM employees WHERE id = ?) AND is_active = 1 LIMIT 1),
                    (SELECT work_days FROM work_schedules 
                     WHERE target_type = 'organization' AND is_active = 1 LIMIT 1),
                    ?
                ) as work_days
        `).get(employeeId, employeeId, DEFAULT_WORK_DAYS) as { work_days: string };

        // Parse work_days JSON array
        let workDaysArray: number[] = [1, 2, 3, 4, 5]; // Default: Mon-Fri
        try {
            const parsed = JSON.parse(scheduleWorkDays?.work_days || DEFAULT_WORK_DAYS);
            if (Array.isArray(parsed)) {
                workDaysArray = parsed;
            }
        } catch (e) {
            console.log(`Failed to parse work_days, using default Mon-Fri`);
        }

        console.log(`Schedule for employee ${employeeId}: ${workStart} - ${workEnd}, work days: ${JSON.stringify(workDaysArray)}`);

        // Calculate working days in the month based on schedule's work_days
        // work_days uses ISO weekday: 1=Monday, 7=Sunday
        // JavaScript getDay(): 0=Sunday, 1=Monday, 6=Saturday
        let workDaysCount = 0;
        const daysInMonth = new Date(year, month, 0).getDate();
        
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const jsDay = date.getDay(); // 0=Sunday, 1=Monday, 6=Saturday
            // Convert JS day to ISO day: Sunday(0)->7, others stay same
            const isoDay = jsDay === 0 ? 7 : jsDay;
            
            if (workDaysArray.includes(isoDay)) {
                workDaysCount++;
            }
        }
        
        console.log(`Calculated ${workDaysCount} working days for ${year}-${month} based on schedule`);

        // Create work days array with schedule
        const workStartMinutes = timeToMinutes(workStart);
        const workEndMinutes = timeToMinutes(workEnd);
        
        const processedWorkDays: Array<{ date: string; workStart: number; workEnd: number }> = [];
        for (let i = 0; i < workDaysCount; i++) {
            processedWorkDays.push({
                date: `${year}-${month.toString().padStart(2, '0')}-${(i + 1).toString().padStart(2, '0')}`,
                workStart: workStartMinutes,
                workEnd: workEndMinutes
            });
        }

        // Get violations from violation_summary
        const violations = db.prepare(`
            SELECT 
                total_late_minutes,
                total_early_leave_minutes,
                absent_total_minutes
            FROM violation_summary
            WHERE employee_id = ? AND year = ? AND month = ?
        `).get(employeeId, year, month) as {
            total_late_minutes: number;
            total_early_leave_minutes: number;
            absent_total_minutes: number;
        } | undefined;

        return {
            employeeId,
            baseSalary: compensation.base_salary,
            workDays: processedWorkDays,
            violations: {
                lateMinutes: violations?.total_late_minutes || 0,
                earlyLeaveMinutes: violations?.total_early_leave_minutes || 0,
                absentMinutes: violations?.absent_total_minutes || 0
            }
        };
    } catch (error) {
        console.error(`Error getting work data for employee ${employeeId}:`, error);
        return null;
    }
}

// =============================================================================
// CALCULATION
// =============================================================================

/**
 * Calculate salary deduction for an employee
 */
export function calculateEmployeeSalaryDeduction(
    employeeId: number,
    year: number,
    month: number
): SalaryDeductionResult | null {
    try {
        const workData = getEmployeeWorkData(employeeId, year, month);
    
        if (!workData) {
            console.log(`No work data for employee ${employeeId}`);
            return null;
        }

        const lunchBreakMinutes = getLunchBreakMinutes();
        const maxDeductionPercent = getMaxDeductionPercent();

        // Calculate daily work minutes for each day
        let totalMonthlyWorkMinutes = 0;
        for (const day of workData.workDays) {
            const dailyMinutes = day.workEnd - day.workStart - lunchBreakMinutes;
            totalMonthlyWorkMinutes += Math.max(0, dailyMinutes); // Ensure non-negative
        }

        // If no work days or zero minutes, use default calculation
        if (totalMonthlyWorkMinutes === 0 || workData.workDays.length === 0) {
            // Fallback: assume 22 working days, 8 hours per day
            const defaultWorkDays = 22;
            const defaultDailyMinutes = 8 * 60 - lunchBreakMinutes; // 8 hours minus lunch
            totalMonthlyWorkMinutes = defaultWorkDays * defaultDailyMinutes;
            console.log(`Using default work minutes: ${totalMonthlyWorkMinutes} (${defaultWorkDays} days x ${defaultDailyMinutes} min)`);
        }

        // Calculate average daily work minutes
        const avgDailyWorkMinutes = workData.workDays.length > 0 
            ? Math.round(totalMonthlyWorkMinutes / workData.workDays.length)
            : 8 * 60 - lunchBreakMinutes;

        // Calculate total violation minutes
        const totalViolationMinutes = 
            workData.violations.lateMinutes +
            workData.violations.earlyLeaveMinutes +
            workData.violations.absentMinutes;

        // Calculate minute rate (prevent division by zero)
        const minuteRate = totalMonthlyWorkMinutes > 0 
            ? workData.baseSalary / totalMonthlyWorkMinutes 
            : 0;

        // Calculate deduction
        const calculatedDeduction = totalViolationMinutes * minuteRate;

        // Calculate max deduction
        const maxDeductionAmount = workData.baseSalary * (maxDeductionPercent / 100);

        // Final deduction (capped at max)
        const finalDeduction = Math.min(calculatedDeduction, maxDeductionAmount);

        // Final salary (never negative)
        const finalSalary = Math.max(0, workData.baseSalary - finalDeduction);

        return {
            employeeId,
            year,
            month,
            baseSalary: workData.baseSalary,
            workDaysCount: workData.workDays.length,
            dailyWorkMinutes: avgDailyWorkMinutes,
            monthlyWorkMinutes: totalMonthlyWorkMinutes,
            lateMinutes: workData.violations.lateMinutes,
            earlyLeaveMinutes: workData.violations.earlyLeaveMinutes,
            absentMinutes: workData.violations.absentMinutes,
            totalViolationMinutes,
            minuteRate,
            calculatedDeduction,
            maxDeductionPercent,
            maxDeductionAmount,
            finalDeduction,
            finalSalary,
            lunchBreakMinutes
        };
    } catch (error) {
        console.error(`Error calculating salary deduction for employee ${employeeId}:`, error);
        return null;
    }
}

/**
 * Calculate and save salary deduction to database
 */
export function calculateAndSaveSalaryDeduction(
    employeeId: number,
    year: number,
    month: number
): SalaryDeductionResult | null {
    try {
        const result = calculateEmployeeSalaryDeduction(employeeId, year, month);
    
        if (!result) {
            return null;
        }

        const db = getDatabase();

        // Upsert into salary_deductions table
        const stmt = db.prepare(`
        INSERT INTO salary_deductions (
            employee_id, year, month,
            base_salary, work_days_count, daily_work_minutes, monthly_work_minutes,
            late_minutes, early_leave_minutes, absent_minutes, total_violation_minutes,
            minute_rate, calculated_deduction, max_deduction_percent, max_deduction_amount,
            final_deduction, final_salary, lunch_break_minutes, calculated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(employee_id, year, month) DO UPDATE SET
            base_salary = excluded.base_salary,
            work_days_count = excluded.work_days_count,
            daily_work_minutes = excluded.daily_work_minutes,
            monthly_work_minutes = excluded.monthly_work_minutes,
            late_minutes = excluded.late_minutes,
            early_leave_minutes = excluded.early_leave_minutes,
            absent_minutes = excluded.absent_minutes,
            total_violation_minutes = excluded.total_violation_minutes,
            minute_rate = excluded.minute_rate,
            calculated_deduction = excluded.calculated_deduction,
            max_deduction_percent = excluded.max_deduction_percent,
            max_deduction_amount = excluded.max_deduction_amount,
            final_deduction = excluded.final_deduction,
            final_salary = excluded.final_salary,
            lunch_break_minutes = excluded.lunch_break_minutes,
            calculated_at = CURRENT_TIMESTAMP
    `);

        stmt.run(
            result.employeeId,
            result.year,
            result.month,
            result.baseSalary,
            result.workDaysCount,
            result.dailyWorkMinutes,
            result.monthlyWorkMinutes,
            result.lateMinutes,
            result.earlyLeaveMinutes,
            result.absentMinutes,
            result.totalViolationMinutes,
            result.minuteRate,
            result.calculatedDeduction,
            result.maxDeductionPercent,
            result.maxDeductionAmount,
            result.finalDeduction,
            result.finalSalary,
            result.lunchBreakMinutes
        );

        return result;
    } catch (error) {
        console.error(`Error saving salary deduction for employee ${employeeId}:`, error);
        throw new Error(`Ma'lumotlarni saqlashda xatolik: ${error instanceof Error ? error.message : 'Noma\'lum xato'}`);
    }
}

/**
 * Calculate salary deductions for all employees in a month
 */
export function calculateAllSalaryDeductions(year: number, month: number): {
    processed: number;
    results: SalaryDeductionResult[];
    errors: Array<{ employeeId: number; error: string }>;
} {
    try {
        const db = getDatabase();

        // Get all active employees with compensation for this month
        const employees = db.prepare(`
            SELECT DISTINCT ec.employee_id
            FROM employee_compensation ec
            JOIN employees e ON ec.employee_id = e.id
            WHERE ec.year = ? AND ec.month = ? AND e.is_active = 1
        `).all(year, month) as Array<{ employee_id: number }>;
        
        console.log(`Found ${employees.length} employees with compensation for ${year}-${month}`);

        const results: SalaryDeductionResult[] = [];
        const errors: Array<{ employeeId: number; error: string }> = [];

        for (const emp of employees) {
            try {
                const result = calculateAndSaveSalaryDeduction(emp.employee_id, year, month);
                if (result) {
                    results.push(result);
                } else {
                    errors.push({
                        employeeId: emp.employee_id,
                        error: 'Maosh yoki ish jadvali ma\'lumotlari topilmadi'
                    });
                }
            } catch (error) {
                errors.push({
                    employeeId: emp.employee_id,
                    error: error instanceof Error ? error.message : 'Noma\'lum xato'
                });
            }
        }

        return {
            processed: results.length,
            results,
            errors
        };
    } catch (error) {
        console.error('Error calculating all salary deductions:', error);
        throw new Error(`Umumiy hisoblashda xatolik: ${error instanceof Error ? error.message : 'Noma\'lum xato'}`);
    }
}

/**
 * Get salary deductions for a specific month
 */
export function getSalaryDeductions(year: number, month: number): Array<SalaryDeductionResult & {
    employeeName: string;
    departmentName: string;
    kpiAmount: number;
    kpiResult: number;
    totalWithKpi: number;
}> {
    try {
        const db = getDatabase();

        const deductions = db.prepare(`
            SELECT 
                sd.*,
                e.name as employee_name,
                d.name as department_name,
                COALESCE(ec.kpi_amount, 0) as kpi_amount,
                COALESCE(ep.kpi_result, 0) as kpi_result
            FROM salary_deductions sd
            JOIN employees e ON sd.employee_id = e.id
            JOIN departments d ON e.department_id = d.id
            LEFT JOIN employee_compensation ec ON ec.employee_id = sd.employee_id 
                AND ec.year = sd.year AND ec.month = sd.month
            LEFT JOIN employee_penalties ep ON ep.employee_id = sd.employee_id 
                AND ep.year = sd.year AND ep.month = sd.month
            WHERE sd.year = ? AND sd.month = ?
            ORDER BY sd.final_deduction DESC, e.name ASC
        `).all(year, month) as Array<any>;

        return deductions.map(row => {
            const finalSalary = row.final_salary || 0;
            const kpiResult = row.kpi_result || 0;
            const totalWithKpi = finalSalary + kpiResult;
            
            return {
                employeeId: row.employee_id,
                year: row.year,
                month: row.month,
                baseSalary: row.base_salary,
                workDaysCount: row.work_days_count,
                dailyWorkMinutes: row.daily_work_minutes,
                monthlyWorkMinutes: row.monthly_work_minutes,
                lateMinutes: row.late_minutes,
                earlyLeaveMinutes: row.early_leave_minutes,
                absentMinutes: row.absent_minutes,
                totalViolationMinutes: row.total_violation_minutes,
                minuteRate: row.minute_rate,
                calculatedDeduction: row.calculated_deduction,
                maxDeductionPercent: row.max_deduction_percent,
                maxDeductionAmount: row.max_deduction_amount,
                finalDeduction: row.final_deduction,
                finalSalary: row.final_salary,
                lunchBreakMinutes: row.lunch_break_minutes,
                employeeName: row.employee_name,
                departmentName: row.department_name,
                kpiAmount: row.kpi_amount || 0,
                kpiResult: row.kpi_result || 0,
                totalWithKpi
            };
        });
    } catch (error) {
        console.error('Error getting salary deductions:', error);
        throw new Error(`Ma'lumotlarni olishda xatolik: ${error instanceof Error ? error.message : 'Noma\'lum xato'}`);
    }
}
