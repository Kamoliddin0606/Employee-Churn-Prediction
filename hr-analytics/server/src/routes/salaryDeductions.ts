import { Router, Request, Response } from 'express';
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

export default router;
