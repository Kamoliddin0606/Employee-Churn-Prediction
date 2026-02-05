/**
 * =============================================================================
 * HR Analytics Backend - Compensation API Routes
 * =============================================================================
 * 
 * RESTful API endpoints for employee compensation management.
 * Handles monthly KPI and salary data import, CRUD operations, and Excel template generation.
 * 
 * @module routes/compensation
 * @author HR Analytics Team
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { getDatabase } from '../database/connection';
import { createContextLogger } from '../utils/logger';
import type { EmployeeCompensation } from '../models/types';

// Create router instance
const router = Router();

// Create context-specific logger
const log = createContextLogger('CompensationAPI');

// =============================================================================
// MULTER CONFIGURATION
// =============================================================================

/**
 * Multer configuration for Excel file uploads
 * Stores files in memory as buffers for processing
 */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
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
 * Transform database row to EmployeeCompensation object
 * 
 * @param row - Raw database row
 * @returns Formatted EmployeeCompensation object
 */
function transformCompensation(row: Record<string, unknown>): EmployeeCompensation {
    return {
        id: row.id as number,
        employeeId: row.employee_id as number,
        year: row.year as number,
        month: row.month as number,
        baseSalary: row.base_salary as number,
        kpiAmount: row.kpi_amount as number,
        totalSalary: row.total_salary as number,
        bonus: row.bonus as number,
        deductions: row.deductions as number,
        notes: row.notes as string | null,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
    };
}

// =============================================================================
// GET /api/compensation/template - Download Excel Template
// =============================================================================

/**
 * Generate and download Excel template for compensation import
 * Template includes all employees with their latest KPI and salary data
 */
router.get('/template', async (req: Request, res: Response) => {
    try {
        log.info('Generating compensation template with employee data');

        const db = getDatabase();

        // Get all employees with their latest compensation data
        // Create safe SQL query compatible with all SQLite versions
        // Using subquery instead of ROW_NUMBER() window function
        const employeesStmt = db.prepare(`
            SELECT 
                e.id,
                e.external_id,
                e.name,
                d.name as department_name,
                ec.base_salary,
                ec.kpi_amount,
                ec.notes,
                ec.year,
                ec.month
            FROM employees e
            LEFT JOIN departments d ON e.department_id = d.id
            LEFT JOIN employee_compensation ec ON ec.id = (
                SELECT id FROM employee_compensation 
                WHERE employee_id = e.id 
                ORDER BY year DESC, month DESC 
                LIMIT 1
            )
            ORDER BY d.name, e.name
        `);

        const employees = employeesStmt.all() as Array<{
            id: number;
            external_id: string;
            name: string;
            department_name: string;
            base_salary: number | null;
            kpi_amount: number | null;
            notes: string | null;
            year: number | null;
            month: number | null;
        }>;

        // Create new workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('KPI va Maosh');

        // Define columns with proper formatting
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Ism Familya', key: 'name', width: 30 },
            { header: 'Bo\'lim', key: 'department', width: 20 },
            { header: 'KPI', key: 'kpi', width: 15 },
            { header: 'Maosh (KPIsiz)', key: 'salary', width: 15 },
            { header: 'Izoh', key: 'notes', width: 30 },
        ];

        // Style header row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4472C4' }
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 25;

        // Add employee data
        employees.forEach((emp, index) => {
            const row = worksheet.addRow({
                id: emp.external_id,
                name: emp.name,
                department: emp.department_name || '',
                kpi: emp.kpi_amount || 0,
                salary: emp.base_salary || 0,
                notes: emp.notes || ''
            });

            // Alternate row colors for better readability
            if (index % 2 === 0) {
                row.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF2F2F2' }
                };
            }

            // Center align ID and department
            row.getCell('id').alignment = { horizontal: 'center' };
            row.getCell('department').alignment = { horizontal: 'center' };
        });

        // Format number columns
        worksheet.getColumn('kpi').numFmt = '#,##0';
        worksheet.getColumn('salary').numFmt = '#,##0';

        // Add borders to all cells
        worksheet.eachRow((row, rowNumber) => {
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });

        // Generate buffer (safer than stream for small files)
        const buffer = await workbook.xlsx.writeBuffer();

        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=KPI_Maosh_Shablon.xlsx');

        log.info('Template generated successfully', { employeeCount: employees.length });
        res.send(buffer);
    } catch (error) {
        log.error('Failed to generate template', { error });
        res.status(500).json({
            success: false,
            error: 'Shablon yaratishda xatolik'
        });
    }
});

// =============================================================================
// GET /api/compensation - List Compensation Records
// =============================================================================

/**
 * Get compensation records with optional filtering by year and month
 * 
 * Query parameters:
 * - year: Filter by year (e.g., 2026)
 * - month: Filter by month (1-12)
 */
router.get('/', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const { year, month } = req.query;

        let whereClause = '';
        const params: (string | number)[] = [];

        if (year) {
            whereClause += ' WHERE year = ?';
            params.push(parseInt(year as string));
        }

        if (month) {
            whereClause += whereClause ? ' AND' : ' WHERE';
            whereClause += ' month = ?';
            params.push(parseInt(month as string));
        }

        const stmt = db.prepare(`
            SELECT 
                ec.*,
                e.name as employee_name,
                e.external_id as employee_external_id,
                d.name as department_name
            FROM employee_compensation ec
            JOIN employees e ON ec.employee_id = e.id
            JOIN departments d ON e.department_id = d.id
            ${whereClause}
            ORDER BY ec.year DESC, ec.month DESC, e.name ASC
        `);

        const rows = stmt.all(...params) as Record<string, unknown>[];
        const compensations = rows.map(row => ({
            ...transformCompensation(row),
            employeeName: row.employee_name,
            employeeExternalId: row.employee_external_id,
            departmentName: row.department_name,
        }));

        log.info('Compensation records fetched', { count: compensations.length, year, month });

        res.json({
            success: true,
            data: compensations
        });
    } catch (error) {
        log.error('Failed to fetch compensation records', { error });
        res.status(500).json({
            success: false,
            error: 'Ma\'lumotlarni yuklashda xatolik'
        });
    }
});

// =============================================================================
// POST /api/compensation/import - Import Excel File
// =============================================================================

/**
 * Import compensation data from Excel file
 * 
 * Body (FormData):
 * - file: Excel file
 * - year: Target year (e.g., 2026)
 * - month: Target month (1-12)
 */
router.post('/import', upload.single('file'), async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Fayl yuklanmadi'
            });
        }

        const { year, month } = req.body;

        if (!year || !month) {
            return res.status(400).json({
                success: false,
                error: 'Yil va oy ko\'rsatilishi kerak'
            });
        }

        log.info('Starting compensation import', {
            fileName: req.file.originalname,
            year,
            month,
            size: req.file.size
        });

        const db = getDatabase();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);

        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
            throw new Error('Excel faylda varaq topilmadi');
        }

        let imported = 0;
        let updated = 0;
        let errors: string[] = [];

        // Start from row 2 (skip header)
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Skip header

            try {
                const id = row.getCell(1).value;
                const kpi = Number(row.getCell(3).value) || 0;
                const salary = Number(row.getCell(4).value) || 0;
                const notes = row.getCell(5).value?.toString() || null;

                if (!id) {
                    errors.push(`Qator ${rowNumber}: ID yo'q`);
                    return;
                }

                // Find employee by external_id
                const empStmt = db.prepare('SELECT id FROM employees WHERE external_id = ?');
                const employee = empStmt.get(id.toString()) as { id: number } | undefined;

                if (!employee) {
                    errors.push(`Qator ${rowNumber}: Xodim topilmadi (ID: ${id})`);
                    return;
                }

                // Check if record exists
                const existingStmt = db.prepare(`
                    SELECT id FROM employee_compensation 
                    WHERE employee_id = ? AND year = ? AND month = ?
                `);
                const existing = existingStmt.get(employee.id, year, month) as { id: number } | undefined;

                if (existing) {
                    // Update existing
                    const updateStmt = db.prepare(`
                        UPDATE employee_compensation
                        SET base_salary = ?, kpi_amount = ?, notes = ?, updated_at = datetime('now')
                        WHERE id = ?
                    `);
                    updateStmt.run(salary, kpi, notes, existing.id);
                    updated++;
                } else {
                    // Insert new
                    const insertStmt = db.prepare(`
                        INSERT INTO employee_compensation (employee_id, year, month, base_salary, kpi_amount, notes)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `);
                    insertStmt.run(employee.id, year, month, salary, kpi, notes);
                    imported++;
                }
            } catch (error) {
                errors.push(`Qator ${rowNumber}: ${error}`);
                log.error('Row import failed', { rowNumber, error });
            }
        });

        log.info('Compensation import completed', { imported, updated, errors: errors.length });

        res.json({
            success: true,
            data: {
                imported,
                updated,
                errors
            },
            message: `${imported} yangi, ${updated} yangilandi`
        });
    } catch (error) {
        log.error('Failed to import compensation', { error });
        res.status(500).json({
            success: false,
            error: 'Import jarayonida xatolik'
        });
    }
});

// =============================================================================
// PUT /api/compensation/:id - Update Compensation Record
// =============================================================================

/**
 * Update a single compensation record
 * 
 * Body:
 * - baseSalary: number
 * - kpiAmount: number
 * - notes: string (optional)
 */
router.put('/:id', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const { id } = req.params;
        const { baseSalary, kpiAmount, notes } = req.body;

        // Validate
        if (baseSalary === undefined || kpiAmount === undefined) {
            return res.status(400).json({
                success: false,
                error: 'baseSalary va kpiAmount kerak'
            });
        }

        // Check if exists
        const existingStmt = db.prepare('SELECT id FROM employee_compensation WHERE id = ?');
        const existing = existingStmt.get(id);

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: 'Yozuv topilmadi'
            });
        }

        // Update
        const updateStmt = db.prepare(`
            UPDATE employee_compensation
            SET base_salary = ?, kpi_amount = ?, notes = ?, updated_at = datetime('now')
            WHERE id = ?
        `);

        updateStmt.run(baseSalary, kpiAmount, notes || null, id);

        log.info('Compensation updated', { id, baseSalary, kpiAmount });

        res.json({
            success: true,
            message: 'Yangilandi'
        });
    } catch (error) {
        log.error('Failed to update compensation', { error, id: req.params.id });
        res.status(500).json({
            success: false,
            error: 'Yangilashda xatolik'
        });
    }
});

// =============================================================================
// DELETE /api/compensation/:id - Delete Compensation Record
// =============================================================================

/**
 * Delete a compensation record
 */
router.delete('/:id', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const { id } = req.params;

        const result = db.prepare('DELETE FROM employee_compensation WHERE id = ?').run(id);

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                error: 'Yozuv topilmadi'
            });
        }

        log.info('Compensation deleted', { id });

        res.json({
            success: true,
            message: 'O\'chirildi'
        });
    } catch (error) {
        log.error('Failed to delete compensation', { error, id: req.params.id });
        res.status(500).json({
            success: false,
            error: 'O\'chirishda xatolik'
        });
    }
});

export default router;
