/**
 * =============================================================================
 * HR Analytics Backend - Employees API Routes
 * =============================================================================
 * 
 * RESTful API endpoints for employee management.
 * Provides CRUD operations for employees.
 * 
 * @module routes/employees
 * @author HR Analytics Team
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import { getDatabase } from '../database/connection';
import { createContextLogger } from '../utils/logger';
import type { Employee, ApiResponse, PaginatedResponse } from '../models/types';

// Create router instance
const router = Router();

// Create context-specific logger
const log = createContextLogger('EmployeesAPI');

// =============================================================================
// GET /api/employees - List all employees
// =============================================================================

/**
 * Get all employees with optional filtering and pagination
 * 
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50)
 * - departmentId: Filter by department
 * - search: Search by name or external ID
 */
router.get('/', (req: Request, res: Response) => {
    try {
        const db = getDatabase();

        // Parse query parameters
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
        const offset = (page - 1) * limit;
        const departmentId = req.query.departmentId as string;
        const search = req.query.search as string;

        // Build query with optional filters
        let whereClause = '';
        const params: (string | number)[] = [];

        if (departmentId) {
            whereClause += ' WHERE e.department_id = ?';
            params.push(parseInt(departmentId));
        }

        if (search) {
            whereClause += whereClause ? ' AND' : ' WHERE';
            whereClause += ' (e.name LIKE ? OR e.external_id LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        // Get total count
        const countStmt = db.prepare(`
      SELECT COUNT(*) as total 
      FROM employees e 
      ${whereClause}
    `);
        const { total } = countStmt.get(...params) as { total: number };

        // Get paginated employees with department info
        const selectStmt = db.prepare(`
      SELECT 
        e.id,
        e.external_id as externalId,
        e.name,
        e.department_id as departmentId,
        d.name as departmentName,
        e.created_at as createdAt,
        e.updated_at as updatedAt
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      ${whereClause}
      ORDER BY e.name ASC
      LIMIT ? OFFSET ?
    `);

        const employees = selectStmt.all(...params, limit, offset);

        const response: ApiResponse<PaginatedResponse<Employee>> = {
            success: true,
            data: {
                items: employees as Employee[],
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };

        res.json(response);
    } catch (error) {
        log.error('Failed to fetch employees', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch employees'
        });
    }
});

// =============================================================================
// GET /api/employees/:id - Get single employee
// =============================================================================

/**
 * Get employee by ID with department info
 */
router.get('/:id', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const { id } = req.params;

        const stmt = db.prepare(`
      SELECT 
        e.id,
        e.external_id as externalId,
        e.name,
        e.department_id as departmentId,
        d.name as departmentName,
        e.created_at as createdAt,
        e.updated_at as updatedAt
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.id = ?
    `);

        const employee = stmt.get(id);

        if (!employee) {
            return res.status(404).json({
                success: false,
                error: 'Employee not found'
            });
        }

        res.json({
            success: true,
            data: employee
        });
    } catch (error) {
        log.error('Failed to fetch employee', { error, id: req.params.id });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch employee'
        });
    }
});

// =============================================================================
// POST /api/employees - Create new employee
// =============================================================================

/**
 * Create a new employee
 * 
 * Request body:
 * - externalId: External ID from Excel (required)
 * - name: Employee full name (required)
 * - departmentId: Department ID (required)
 */
router.post('/', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const { externalId, name, departmentId } = req.body;

        // Validate required fields
        if (!externalId || !name || !departmentId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: externalId, name, departmentId'
            });
        }

        // Check if employee with externalId already exists
        const existingStmt = db.prepare('SELECT id FROM employees WHERE external_id = ?');
        const existing = existingStmt.get(externalId);

        if (existing) {
            return res.status(409).json({
                success: false,
                error: 'Employee with this external ID already exists'
            });
        }

        // Insert new employee
        const insertStmt = db.prepare(`
      INSERT INTO employees (external_id, name, department_id)
      VALUES (?, ?, ?)
    `);

        const result = insertStmt.run(externalId, name, departmentId);

        log.info('Employee created', { id: result.lastInsertRowid, externalId, name });

        res.status(201).json({
            success: true,
            data: {
                id: result.lastInsertRowid,
                externalId,
                name,
                departmentId
            },
            message: 'Employee created successfully'
        });
    } catch (error) {
        log.error('Failed to create employee', { error, body: req.body });
        res.status(500).json({
            success: false,
            error: 'Failed to create employee'
        });
    }
});

// =============================================================================
// PUT /api/employees/:id - Update employee
// =============================================================================

/**
 * Update an existing employee
 */
router.put('/:id', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const { id } = req.params;
        const { name, departmentId } = req.body;

        // Check if employee exists
        const existingStmt = db.prepare('SELECT id FROM employees WHERE id = ?');
        const existing = existingStmt.get(id);

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: 'Employee not found'
            });
        }

        // Update employee
        const updateStmt = db.prepare(`
      UPDATE employees 
      SET name = COALESCE(?, name),
          department_id = COALESCE(?, department_id),
          updated_at = datetime('now')
      WHERE id = ?
    `);

        updateStmt.run(name, departmentId, id);

        log.info('Employee updated', { id, name, departmentId });

        res.json({
            success: true,
            message: 'Employee updated successfully'
        });
    } catch (error) {
        log.error('Failed to update employee', { error, id: req.params.id });
        res.status(500).json({
            success: false,
            error: 'Failed to update employee'
        });
    }
});

// =============================================================================
// DELETE /api/employees/:id - Delete employee
// =============================================================================

/**
 * Delete an employee
 * Also deletes related time records and attendance records
 */
router.delete('/:id', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const { id } = req.params;

        // Check if employee exists
        const existingStmt = db.prepare('SELECT id, name FROM employees WHERE id = ?');
        const existing = existingStmt.get(id) as { id: number; name: string } | undefined;

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: 'Employee not found'
            });
        }

        // Delete related records first (foreign key constraints)
        db.prepare('DELETE FROM time_records WHERE employee_id = ?').run(id);
        db.prepare('DELETE FROM attendance_records WHERE employee_id = ?').run(id);
        db.prepare('DELETE FROM violation_summary WHERE employee_id = ?').run(id);

        // Delete employee
        db.prepare('DELETE FROM employees WHERE id = ?').run(id);

        log.info('Employee deleted', { id, name: existing.name });

        res.json({
            success: true,
            message: 'Employee deleted successfully'
        });
    } catch (error) {
        log.error('Failed to delete employee', { error, id: req.params.id });
        res.status(500).json({
            success: false,
            error: 'Failed to delete employee'
        });
    }
});

export default router;
