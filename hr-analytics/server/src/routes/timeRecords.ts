/**
 * =============================================================================
 * Time Records Correction Routes
 * =============================================================================
 * 
 * API endpoints for time records correction:
 * - Export template with employee data and date columns
 * - Preview corrections before applying
 * - Apply corrections and recalculate dependent data
 * 
 * @module routes/timeRecords
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { getDatabase } from '../database/connection';
import { getEffectiveSchedule } from '../services/scheduleResolver';
import { calculateAllEmployeesMonthlyViolations } from '../services/violationCalculator';
import { calculateAllPenalties } from '../services/penaltyService';
import { createContextLogger } from '../utils/logger';

const router = Router();
const log = createContextLogger('TimeRecordsRoutes');

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// =============================================================================
// TYPES
// =============================================================================

interface CorrectionPreview {
    employeeId: number;
    externalId: string;
    employeeName: string;
    department: string;
    date: string;
    currentCheckIn: string | null;
    currentCheckOut: string | null;
    newCheckIn: string;
    newCheckOut: string;
    isWorkDay: boolean;
}

interface CorrectionWarning {
    employeeId: number;
    externalId: string;
    date: string;
    reason: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get all dates in a date range
 */
function getDateRange(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const current = new Date(start);
    while (current <= end) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
    }
    
    return dates;
}

/**
 * Validate that dates are within same month
 */
function validateSameMonth(startDate: string, endDate: string): boolean {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return start.getFullYear() === end.getFullYear() && 
           start.getMonth() === end.getMonth();
}

/**
 * Format date for Excel header (1-1-2026)
 */
function formatDateHeader(date: string): string {
    const d = new Date(date);
    return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
}

// =============================================================================
// API ENDPOINTS
// =============================================================================

/**
 * GET /api/time-records/export-template
 * Export Excel template with employees and date columns
 */
router.get('/export-template', async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, departmentId } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ 
                success: false, 
                error: 'startDate va endDate majburiy' 
            });
        }

        // Validate same month
        if (!validateSameMonth(startDate as string, endDate as string)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Faqat bir oy ichidagi kunlarni tanlash mumkin' 
            });
        }

        const db = getDatabase();
        
        // Get employees
        let employeesQuery = `
            SELECT e.id, e.external_id, e.name, d.name as department_name
            FROM employees e
            LEFT JOIN departments d ON e.department_id = d.id
            WHERE e.is_active = 1
        `;
        
        if (departmentId) {
            employeesQuery += ` AND e.department_id = ?`;
        }
        
        employeesQuery += ` ORDER BY e.external_id`;
        
        const employees = departmentId 
            ? db.prepare(employeesQuery).all(departmentId)
            : db.prepare(employeesQuery).all();

        // Get date range
        const dates = getDateRange(startDate as string, endDate as string);

        // Create workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Time Records Correction');

        // Header row
        const headers = ['External ID', 'Ism Familya', 'Bo\'lim', ...dates.map(formatDateHeader)];
        worksheet.addRow(headers);

        // Style header
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD9E1F2' }
        };

        // Freeze first row and first 3 columns
        worksheet.views = [
            { state: 'frozen', xSplit: 3, ySplit: 1 }
        ];

        // Add employee rows
        for (const emp of employees as any[]) {
            const row = [
                emp.external_id,
                emp.name,
                emp.department_name || '',
                ...dates.map(() => 0) // Default 0 for all dates
            ];
            worksheet.addRow(row);
        }

        // Set column widths
        worksheet.getColumn(1).width = 12; // External ID
        worksheet.getColumn(2).width = 25; // Name
        worksheet.getColumn(3).width = 20; // Department
        for (let i = 4; i <= headers.length; i++) {
            worksheet.getColumn(i).width = 12; // Date columns
        }

        // Add data validation (0 or 1 only) for date columns
        for (let row = 2; row <= employees.length + 1; row++) {
            for (let col = 4; col <= headers.length; col++) {
                const cell = worksheet.getCell(row, col);
                cell.dataValidation = {
                    type: 'list',
                    allowBlank: true,
                    formulae: ['"0,1"']
                };
            }
        }

        // Generate buffer
        const buffer = await workbook.xlsx.writeBuffer();

        // Send file
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=time_records_correction_${startDate}_${endDate}.xlsx`);
        res.send(buffer);

        log.info('Time records template exported', { 
            startDate, 
            endDate, 
            employeeCount: employees.length,
            dateCount: dates.length 
        });

    } catch (error) {
        log.error('Export template failed', { error });
        res.status(500).json({ 
            success: false, 
            error: 'Template export xatolik' 
        });
    }
});

/**
 * POST /api/time-records/preview-corrections
 * Preview corrections from uploaded Excel file
 */
router.post('/preview-corrections', upload.single('file'), async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'Fayl yuklanmadi' 
            });
        }

        const { startDate, endDate } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({ 
                success: false, 
                error: 'startDate va endDate majburiy' 
            });
        }

        // Parse Excel
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        if (data.length < 2) {
            return res.status(400).json({ 
                success: false, 
                error: 'Excel fayl bo\'sh' 
            });
        }

        const db = getDatabase();
        const corrections: CorrectionPreview[] = [];
        const warnings: CorrectionWarning[] = [];

        // Get headers (date columns start from index 3)
        const headers = data[0];
        const dateHeaders = headers.slice(3);

        // Process each employee row
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const externalId = row[0];
            const employeeName = row[1];
            const department = row[2];

            if (!externalId) continue;

            // Get employee from database
            const employee = db.prepare('SELECT id FROM employees WHERE external_id = ?').get(externalId) as any;
            
            if (!employee) {
                warnings.push({
                    employeeId: 0,
                    externalId,
                    date: '',
                    reason: 'Xodim topilmadi'
                });
                continue;
            }

            // Process each date column
            for (let j = 0; j < dateHeaders.length; j++) {
                const cellValue = row[3 + j];
                
                // Only process if value is 1
                if (cellValue !== 1 && cellValue !== '1') continue;

                // Parse date from header
                const dateHeader = dateHeaders[j];
                const dateParts = dateHeader.split('-');
                const date = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;

                // Get schedule for this date
                const schedule = getEffectiveSchedule(employee.id, date);

                if (!schedule.isWorkDay) {
                    warnings.push({
                        employeeId: employee.id,
                        externalId,
                        date,
                        reason: 'Ish kuni emas'
                    });
                    continue;
                }

                // Get current time record
                const currentRecord = db.prepare(`
                    SELECT check_in, check_out 
                    FROM time_records 
                    WHERE employee_id = ? AND date = ?
                `).get(employee.id, date) as any;

                corrections.push({
                    employeeId: employee.id,
                    externalId,
                    employeeName,
                    department,
                    date,
                    currentCheckIn: currentRecord?.check_in || null,
                    currentCheckOut: currentRecord?.check_out || null,
                    newCheckIn: schedule.workStart,
                    newCheckOut: schedule.workEnd,
                    isWorkDay: schedule.isWorkDay
                });
            }
        }

        log.info('Corrections previewed', { 
            correctionsCount: corrections.length,
            warningsCount: warnings.length 
        });

        res.json({
            success: true,
            data: {
                corrections,
                warnings,
                summary: {
                    totalCorrections: corrections.length,
                    totalWarnings: warnings.length
                }
            }
        });

    } catch (error) {
        log.error('Preview corrections failed', { error });
        res.status(500).json({ 
            success: false, 
            error: 'Preview xatolik' 
        });
    }
});

/**
 * POST /api/time-records/apply-corrections
 * Apply corrections and recalculate dependent data
 */
router.post('/apply-corrections', async (req: Request, res: Response) => {
    try {
        const { corrections, recalculate = true } = req.body;

        if (!corrections || !Array.isArray(corrections)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Corrections majburiy' 
            });
        }

        const db = getDatabase();
        let updatedCount = 0;
        let insertedCount = 0;

        // Prepare statements
        const updateStmt = db.prepare(`
            UPDATE time_records 
            SET check_in = ?, 
                check_out = ?, 
                late_minutes = 0, 
                early_leave_minutes = 0,
                is_auto_filled = 1,
                missing_type = NULL
            WHERE employee_id = ? AND date = ?
        `);

        const insertStmt = db.prepare(`
            INSERT INTO time_records (
                employee_id, date, check_in, check_out, 
                late_minutes, early_leave_minutes, is_auto_filled, missing_type
            ) VALUES (?, ?, ?, ?, 0, 0, 1, NULL)
        `);

        const checkStmt = db.prepare(`
            SELECT id FROM time_records WHERE employee_id = ? AND date = ?
        `);

        // Apply corrections
        for (const correction of corrections) {
            const exists = checkStmt.get(correction.employeeId, correction.date);
            
            if (exists) {
                updateStmt.run(
                    correction.newCheckIn,
                    correction.newCheckOut,
                    correction.employeeId,
                    correction.date
                );
                updatedCount++;
            } else {
                insertStmt.run(
                    correction.employeeId,
                    correction.date,
                    correction.newCheckIn,
                    correction.newCheckOut
                );
                insertedCount++;
            }
        }

        // Recalculate dependent data if requested
        let recalculationResults = null;
        if (recalculate && corrections.length > 0) {
            // Get unique year-month combinations
            const periods = new Set<string>();
            for (const correction of corrections) {
                const date = new Date(correction.date);
                periods.add(`${date.getFullYear()}-${date.getMonth() + 1}`);
            }

            recalculationResults = {
                violations: 0,
                penalties: 0
            };

            // Recalculate for each period
            for (const period of periods) {
                const [year, month] = period.split('-').map(Number);
                
                // Recalculate violations
                const violationsCount = calculateAllEmployeesMonthlyViolations(year, month, 'full');
                recalculationResults.violations += violationsCount;

                // Recalculate penalties
                const penaltiesResults = calculateAllPenalties(year, month);
                recalculationResults.penalties += penaltiesResults.length;
            }
        }

        log.info('Corrections applied', { 
            updatedCount, 
            insertedCount,
            recalculated: recalculate,
            recalculationResults
        });

        res.json({
            success: true,
            data: {
                updated: updatedCount,
                inserted: insertedCount,
                total: updatedCount + insertedCount,
                recalculated: recalculate,
                recalculationResults
            }
        });

    } catch (error) {
        log.error('Apply corrections failed', { error });
        res.status(500).json({ 
            success: false, 
            error: 'Corrections qo\'llash xatolik' 
        });
    }
});

export default router;
