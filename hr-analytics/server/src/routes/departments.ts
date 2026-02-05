/**
 * =============================================================================
 * HR Analytics Backend - Departments API Routes
 * =============================================================================
 * 
 * RESTful API endpoints for department management.
 * 
 * @module routes/departments
 * @author HR Analytics Team
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import { getDatabase } from '../database/connection';
import { createContextLogger } from '../utils/logger';
import type { Department, ApiResponse } from '../models/types';

// Create router instance
const router = Router();

// Create context-specific logger
const log = createContextLogger('DepartmentsAPI');

// =============================================================================
// GET /api/departments - List all departments
// =============================================================================

/**
 * Get all departments with employee count
 */
router.get('/', (req: Request, res: Response) => {
    try {
        const db = getDatabase();

        const stmt = db.prepare(`
      SELECT 
        d.id,
        d.name,
        d.organization_id as organizationId,
        d.created_at as createdAt,
        d.updated_at as updatedAt,
        COUNT(e.id) as employeeCount
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id
      GROUP BY d.id
      ORDER BY d.name ASC
    `);

        const departments = stmt.all();

        res.json({
            success: true,
            data: departments
        });
    } catch (error) {
        log.error('Failed to fetch departments', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch departments'
        });
    }
});

// =============================================================================
// GET /api/departments/:id - Get single department
// =============================================================================

/**
 * Get department by ID with employee count
 */
router.get('/:id', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const { id } = req.params;

        const stmt = db.prepare(`
      SELECT 
        d.id,
        d.name,
        d.organization_id as organizationId,
        d.created_at as createdAt,
        d.updated_at as updatedAt,
        COUNT(e.id) as employeeCount
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id
      WHERE d.id = ?
      GROUP BY d.id
    `);

        const department = stmt.get(id);

        if (!department) {
            return res.status(404).json({
                success: false,
                error: 'Department not found'
            });
        }

        res.json({
            success: true,
            data: department
        });
    } catch (error) {
        log.error('Failed to fetch department', { error, id: req.params.id });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch department'
        });
    }
});

// =============================================================================
// POST /api/departments - Create new department
// =============================================================================

/**
 * Create a new department
 * 
 * Request body:
 * - name: Department name (required)
 * - organizationId: Organization ID (optional, default: 1)
 */
router.post('/', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const { name, organizationId = 1 } = req.body;

        // Validate required fields
        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: name'
            });
        }

        // Check if department already exists
        const existingStmt = db.prepare(
            'SELECT id FROM departments WHERE name = ? AND organization_id = ?'
        );
        const existing = existingStmt.get(name, organizationId);

        if (existing) {
            return res.status(409).json({
                success: false,
                error: 'Department with this name already exists'
            });
        }

        // Insert new department
        const insertStmt = db.prepare(`
      INSERT INTO departments (name, organization_id)
      VALUES (?, ?)
    `);

        const result = insertStmt.run(name, organizationId);

        log.info('Department created', { id: result.lastInsertRowid, name });

        res.status(201).json({
            success: true,
            data: {
                id: result.lastInsertRowid,
                name,
                organizationId
            },
            message: 'Department created successfully'
        });
    } catch (error) {
        log.error('Failed to create department', { error, body: req.body });
        res.status(500).json({
            success: false,
            error: 'Failed to create department'
        });
    }
});

// =============================================================================
// PUT /api/departments/:id - Update department
// =============================================================================

/**
 * Update an existing department
 */
router.put('/:id', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const { id } = req.params;
        const { name } = req.body;

        // Check if department exists
        const existingStmt = db.prepare('SELECT id FROM departments WHERE id = ?');
        const existing = existingStmt.get(id);

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: 'Department not found'
            });
        }

        // Update department
        const updateStmt = db.prepare(`
      UPDATE departments 
      SET name = COALESCE(?, name),
          updated_at = datetime('now')
      WHERE id = ?
    `);

        updateStmt.run(name, id);

        log.info('Department updated', { id, name });

        res.json({
            success: true,
            message: 'Department updated successfully'
        });
    } catch (error) {
        log.error('Failed to update department', { error, id: req.params.id });
        res.status(500).json({
            success: false,
            error: 'Failed to update department'
        });
    }
});

// =============================================================================
// DELETE /api/departments/:id - Delete department
// =============================================================================

/**
 * Delete a department
 * Note: Will fail if employees are assigned to this department
 */
router.delete('/:id', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const { id } = req.params;

        // Check if department exists
        const existingStmt = db.prepare('SELECT id, name FROM departments WHERE id = ?');
        const existing = existingStmt.get(id) as { id: number; name: string } | undefined;

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: 'Department not found'
            });
        }

        // Check if department has employees
        const employeeCountStmt = db.prepare(
            'SELECT COUNT(*) as count FROM employees WHERE department_id = ?'
        );
        const { count } = employeeCountStmt.get(id) as { count: number };

        if (count > 0) {
            return res.status(400).json({
                success: false,
                error: `Cannot delete department with ${count} employees. Reassign employees first.`
            });
        }

        // Delete department schedule if exists
        db.prepare(
            "DELETE FROM work_schedules WHERE target_type = 'department' AND target_id = ?"
        ).run(id);

        // Delete department
        db.prepare('DELETE FROM departments WHERE id = ?').run(id);

        log.info('Department deleted', { id, name: existing.name });

        res.json({
            success: true,
            message: 'Department deleted successfully'
        });
    } catch (error) {
        log.error('Failed to delete department', { error, id: req.params.id });
        res.status(500).json({
            success: false,
            error: 'Failed to delete department'
        });
    }
});

// =============================================================================
// POST /api/departments/upsert - Create or update department by name
// =============================================================================

/**
 * Upsert department - create if not exists, return existing if exists
 * Used during Excel import
 * 
 * Request body:
 * - name: Department name (required)
 */
router.post('/upsert', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: name'
            });
        }

        // Clean department name (uppercase, trim)
        const cleanName = name.trim().toUpperCase();

        // Check if exists
        const existingStmt = db.prepare('SELECT id, name FROM departments WHERE name = ?');
        let department = existingStmt.get(cleanName) as { id: number; name: string } | undefined;

        if (!department) {
            // Create new department
            const insertStmt = db.prepare('INSERT INTO departments (name) VALUES (?)');
            const result = insertStmt.run(cleanName);

            department = {
                id: result.lastInsertRowid as number,
                name: cleanName
            };

            log.info('Department created via upsert', { id: department.id, name: cleanName });
        }

        res.json({
            success: true,
            data: department
        });
    } catch (error) {
        log.error('Failed to upsert department', { error, body: req.body });
        res.status(500).json({
            success: false,
            error: 'Failed to upsert department'
        });
    }
});

export default router;
