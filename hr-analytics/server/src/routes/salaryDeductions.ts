import { Router, Request, Response } from 'express';
import ExcelJS from 'exceljs';
import {
    calculateEmployeeSalaryDeduction,
    calculateAndSaveSalaryDeduction,
    calculateAllSalaryDeductions,
    getSalaryDeductions
} from '../services/salaryDeductionCalculator';

const router = Router();

// =============================================================================
// GET /api/salary-deductions - Get salary deductions for a month
// =============================================================================

/**
 * Get salary deductions for a specific month
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
                error: 'Year and month are required'
            });
        }

        const deductions = getSalaryDeductions(
            parseInt(year as string),
            parseInt(month as string)
        );

        res.json({
            success: true,
            data: deductions
        });
    } catch (error) {
        console.error('Error getting salary deductions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get salary deductions'
        });
    }
});

// =============================================================================
// POST /api/salary-deductions/calculate - Calculate salary deductions
// =============================================================================

/**
 * Calculate salary deductions for a specific month
 * 
 * Body:
 * - year: Required
 * - month: Required
 * - employeeId: Optional (if not provided, calculates for all employees)
 */
router.post('/calculate', (req: Request, res: Response) => {
    try {
        const { year, month, employeeId } = req.body;

        if (!year || !month) {
            return res.status(400).json({
                success: false,
                error: 'Year and month are required'
            });
        }

        if (employeeId) {
            // Calculate for single employee
            const result = calculateAndSaveSalaryDeduction(
                employeeId,
                year,
                month
            );

            if (!result) {
                return res.status(404).json({
                    success: false,
                    error: 'Employee not found or no compensation data'
                });
            }

            res.json({
                success: true,
                data: result,
                message: 'Salary deduction calculated successfully'
            });
        } else {
            // Calculate for all employees
            const results = calculateAllSalaryDeductions(year, month);

            // Build user-friendly message
            let message = `${results.processed} ta xodim uchun hisoblandi`;
            if (results.errors.length > 0) {
                message += `. ${results.errors.length} ta xodim uchun xatolik yuz berdi`;
            }

            res.json({
                success: true,
                data: results,
                message,
                warnings: results.errors.length > 0 ? results.errors : undefined
            });
        }
    } catch (error) {
        console.error('Error calculating salary deductions:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        console.error('Error message:', error instanceof Error ? error.message : String(error));
        
        // User-friendly error messages
        let userMessage = 'Hisoblashda xatolik yuz berdi';
        if (error instanceof Error) {
            if (error.message.includes('no such table')) {
                userMessage = 'Database jadvali topilmadi. Iltimos, migratsiyalarni tekshiring';
            } else if (error.message.includes('FOREIGN KEY')) {
                userMessage = 'Ma\'lumotlar bog\'lanishida xatolik';
            } else if (error.message.includes('NOT NULL')) {
                userMessage = 'Majburiy maydon to\'ldirilmagan';
            } else {
                userMessage = error.message;
            }
        }
        
        res.status(500).json({
            success: false,
            error: userMessage,
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

// =============================================================================
// GET /api/salary-deductions/preview/:employeeId - Preview calculation
// =============================================================================

/**
 * Preview salary deduction calculation for an employee without saving
 * 
 * Query parameters:
 * - year: Required
 * - month: Required
 */
router.get('/preview/:employeeId', (req: Request, res: Response) => {
    try {
        const { employeeId } = req.params;
        const { year, month } = req.query;

        if (!year || !month) {
            return res.status(400).json({
                success: false,
                error: 'Year and month are required'
            });
        }

        const result = calculateEmployeeSalaryDeduction(
            parseInt(employeeId),
            parseInt(year as string),
            parseInt(month as string)
        );

        if (!result) {
            return res.status(404).json({
                success: false,
                error: 'Employee not found or no compensation data'
            });
        }

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error previewing salary deduction:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to preview salary deduction'
        });
    }
});

// =============================================================================
// GET /api/salary-deductions/export - Export to Excel
// =============================================================================

/**
 * Export salary deductions to a beautifully formatted Excel file
 * 
 * Query parameters:
 * - year: Required
 * - month: Required
 */
router.get('/export', async (req: Request, res: Response) => {
    try {
        const { year, month } = req.query;

        if (!year || !month) {
            return res.status(400).json({
                success: false,
                error: 'Year and month are required'
            });
        }

        const yearNum = parseInt(year as string);
        const monthNum = parseInt(month as string);

        // Get salary deductions data
        const deductions = getSalaryDeductions(yearNum, monthNum);

        if (deductions.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No data found for the specified period'
            });
        }

        // Calculate summary statistics
        const summary = {
            totalEmployees: deductions.length,
            totalBaseSalary: deductions.reduce((sum, d) => sum + d.baseSalary, 0),
            totalDeductions: deductions.reduce((sum, d) => sum + d.finalDeduction, 0),
            totalFinalSalary: deductions.reduce((sum, d) => sum + d.finalSalary, 0),
            totalKpiResult: deductions.reduce((sum, d) => sum + (d.kpiResult || 0), 0),
            totalWithKpi: deductions.reduce((sum, d) => sum + (d.totalWithKpi || 0), 0),
            employeesWithDeductions: deductions.filter(d => d.finalDeduction > 0).length
        };

        // Create workbook
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'HR Analytics System';
        workbook.created = new Date();

        // Month names in Uzbek
        const monthNames = [
            'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
            'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
        ];
        const monthName = monthNames[monthNum - 1];

        // Add worksheet
        const worksheet = workbook.addWorksheet(`Maosh ${monthName} ${yearNum}`);

        // Set column widths
        worksheet.columns = [
            { key: 'no', width: 5 },
            { key: 'employeeName', width: 30 },
            { key: 'departmentName', width: 25 },
            { key: 'baseSalary', width: 15 },
            { key: 'workDays', width: 10 },
            { key: 'lateMinutes', width: 12 },
            { key: 'earlyMinutes', width: 12 },
            { key: 'absentMinutes', width: 12 },
            { key: 'totalMinutes', width: 12 },
            { key: 'minuteRate', width: 12 },
            { key: 'calculated', width: 15 },
            { key: 'maxDeduction', width: 15 },
            { key: 'finalDeduction', width: 15 },
            { key: 'finalSalary', width: 15 },
            { key: 'kpiPlan', width: 15 },
            { key: 'kpiResult', width: 15 },
            { key: 'totalWithKpi', width: 18 },
        ];

        // Add title
        worksheet.mergeCells('A1:Q1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = `MAOSH USHLAB QOLISH HISOBOTI - ${monthName.toUpperCase()} ${yearNum}`;
        titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        titleCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF059669' }
        };
        worksheet.getRow(1).height = 35;

        // Add summary section
        worksheet.mergeCells('A2:D2');
        worksheet.getCell('A2').value = `Jami xodimlar: ${summary.totalEmployees}`;
        worksheet.mergeCells('E2:G2');
        worksheet.getCell('E2').value = `Bazaviy maosh: ${summary.totalBaseSalary.toLocaleString('uz-UZ')} so'm`;
        worksheet.mergeCells('H2:J2');
        worksheet.getCell('H2').value = `Ushlab qolish: ${summary.totalDeductions.toLocaleString('uz-UZ')} so'm`;
        worksheet.mergeCells('K2:M2');
        worksheet.getCell('K2').value = `Yakuniy maosh: ${summary.totalFinalSalary.toLocaleString('uz-UZ')} so'm`;
        worksheet.mergeCells('N2:Q2');
        worksheet.getCell('N2').value = `Maosh + KPI: ${summary.totalWithKpi.toLocaleString('uz-UZ')} so'm`;

        worksheet.getRow(2).eachCell((cell) => {
            cell.font = { bold: true };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD1FAE5' }
            };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
        worksheet.getRow(2).height = 25;

        // Add empty row
        worksheet.addRow([]);

        // Add headers
        const headerRow = worksheet.addRow([
            '№',
            'Xodim',
            'Bo\'lim',
            'Bazaviy Maosh',
            'Ish kunlari',
            'Kech (daq)',
            'Erta (daq)',
            'Kelmagan (daq)',
            'Jami (daq)',
            '1 daq',
            'Hisoblangan',
            'Maksimal',
            'Ushlab qolish',
            'Yakuniy maosh',
            'KPI (reja)',
            'KPI (natija)',
            'Maosh + KPI'
        ]);

        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF047857' }
        };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        headerRow.height = 30;

        // Add data rows
        deductions.forEach((deduction, index) => {
            const row = worksheet.addRow({
                no: index + 1,
                employeeName: deduction.employeeName,
                departmentName: deduction.departmentName,
                baseSalary: deduction.baseSalary,
                workDays: deduction.workDaysCount,
                lateMinutes: deduction.lateMinutes,
                earlyMinutes: deduction.earlyLeaveMinutes,
                absentMinutes: deduction.absentMinutes,
                totalMinutes: deduction.totalViolationMinutes,
                minuteRate: deduction.minuteRate,
                calculated: deduction.calculatedDeduction,
                maxDeduction: deduction.maxDeductionAmount,
                finalDeduction: deduction.finalDeduction,
                finalSalary: deduction.finalSalary,
                kpiPlan: deduction.kpiAmount,
                kpiResult: deduction.kpiResult,
                totalWithKpi: deduction.totalWithKpi
            });

            // Format currency columns
            row.getCell('baseSalary').numFmt = '#,##0 "so\'m"';
            row.getCell('minuteRate').numFmt = '#,##0';
            row.getCell('calculated').numFmt = '#,##0 "so\'m"';
            row.getCell('maxDeduction').numFmt = '#,##0 "so\'m"';
            row.getCell('finalDeduction').numFmt = '#,##0 "so\'m"';
            row.getCell('finalSalary').numFmt = '#,##0 "so\'m"';
            row.getCell('kpiPlan').numFmt = '#,##0 "so\'m"';
            row.getCell('kpiResult').numFmt = '#,##0 "so\'m"';
            row.getCell('totalWithKpi').numFmt = '#,##0 "so\'m"';

            // Color coding for violations
            if (deduction.lateMinutes > 0) {
                row.getCell('lateMinutes').fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFED7AA' }
                };
            }
            if (deduction.earlyLeaveMinutes > 0) {
                row.getCell('earlyMinutes').fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFEF3C7' }
                };
            }
            if (deduction.absentMinutes > 0) {
                row.getCell('absentMinutes').fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFECACA' }
                };
            }

            // Highlight deduction amount
            if (deduction.finalDeduction > 0) {
                row.getCell('finalDeduction').fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFECACA' }
                };
                row.getCell('finalDeduction').font = { bold: true, color: { argb: 'FF991B1B' } };
            }

            // Highlight final salary
            row.getCell('finalSalary').fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD1FAE5' }
            };
            row.getCell('finalSalary').font = { bold: true, color: { argb: 'FF065F46' } };

            // Highlight KPI result
            if (deduction.kpiResult > 0) {
                row.getCell('kpiResult').fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFD1FAE5' }
                };
                row.getCell('kpiResult').font = { bold: true, color: { argb: 'FF059669' } };
            }

            // Highlight total with KPI
            row.getCell('totalWithKpi').fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF059669' }
            };
            row.getCell('totalWithKpi').font = { bold: true, color: { argb: 'FFFFFFFF' } };

            // Alignment
            row.alignment = { vertical: 'middle' };
            row.getCell('no').alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell('workDays').alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell('lateMinutes').alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell('earlyMinutes').alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell('absentMinutes').alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell('totalMinutes').alignment = { horizontal: 'center', vertical: 'middle' };
        });

        // Add borders to all data cells
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 2) {
                row.eachCell((cell) => {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
                        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
                        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
                        right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
                    };
                });
            }
        });

        // Set response headers
        const filename = `Maosh_Ushlab_Qolish_${monthName}_${yearNum}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // Write to response
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting salary deductions to Excel:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export to Excel'
        });
    }
});

export default router;
