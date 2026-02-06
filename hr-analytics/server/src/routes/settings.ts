/**
 * =============================================================================
 * HR Analytics Backend - Settings API Routes
 * =============================================================================
 * 
 * API endpoints for application settings including calculation level.
 * 
 * @module routes/settings
 * @author HR Analytics Team
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import { getDatabase } from '../database/connection';
import { createContextLogger } from '../utils/logger';
import type { CalculationLevel, CalculationSettings } from '../models/types';

// Create router instance
const router = Router();

// Create context-specific logger
const log = createContextLogger('SettingsAPI');

// =============================================================================
// GET /api/settings/calculation - Get calculation settings
// =============================================================================

/**
 * Get current calculation settings
 */
router.get('/calculation', (req: Request, res: Response) => {
    try {
        const db = getDatabase();

        const stmt = db.prepare('SELECT * FROM calculation_settings WHERE id = 1');
        const settings = stmt.get() as Record<string, unknown> | undefined;

        if (!settings) {
            // Return default if not exists
            return res.json({
                success: true,
                data: {
                    id: 1,
                    level: 'full',
                    updatedAt: new Date().toISOString()
                }
            });
        }

        res.json({
            success: true,
            data: {
                id: settings.id,
                level: settings.level,
                updatedAt: settings.updated_at
            }
        });
    } catch (error) {
        log.error('Failed to fetch calculation settings', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch calculation settings'
        });
    }
});

// =============================================================================
// PUT /api/settings/calculation - Update calculation settings
// =============================================================================

/**
 * Update calculation level
 * 
 * Request body:
 * - level: 'organization' | 'department' | 'employee' | 'full'
 */
router.put('/calculation', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const { level } = req.body;

        // Validate level
        const validLevels: CalculationLevel[] = ['organization', 'department', 'employee', 'full'];
        if (!level || !validLevels.includes(level)) {
            return res.status(400).json({
                success: false,
                error: `Invalid level. Must be one of: ${validLevels.join(', ')}`
            });
        }

        // Upsert calculation settings
        const upsertStmt = db.prepare(`
      INSERT INTO calculation_settings (id, level, updated_at)
      VALUES (1, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        level = excluded.level,
        updated_at = excluded.updated_at
    `);

        upsertStmt.run(level);

        log.info('Calculation settings updated', { level });

        res.json({
            success: true,
            data: {
                id: 1,
                level,
                updatedAt: new Date().toISOString()
            },
            message: 'Calculation settings updated successfully'
        });
    } catch (error) {
        log.error('Failed to update calculation settings', { error, body: req.body });
        res.status(500).json({
            success: false,
            error: 'Failed to update calculation settings'
        });
    }
});

// =============================================================================
// GET /api/settings/organization - Get organization info
// =============================================================================

/**
 * Get organization information
 */
router.get('/organization', (req: Request, res: Response) => {
    try {
        const db = getDatabase();

        const stmt = db.prepare(`
      SELECT 
        o.id,
        o.name,
        o.created_at as createdAt,
        ws.work_start as workStart,
        ws.work_end as workEnd,
        ws.late_tolerance as lateTolerance,
        ws.work_days as workDays
      FROM organizations o
      LEFT JOIN work_schedules ws ON ws.target_type = 'organization' AND ws.target_id = o.id AND ws.is_active = 1
      WHERE o.id = 1
    `);

        const org = stmt.get() as Record<string, unknown> | undefined;

        if (!org) {
            return res.status(404).json({
                success: false,
                error: 'Organization not found'
            });
        }

        res.json({
            success: true,
            data: {
                id: org.id,
                name: org.name,
                createdAt: org.createdAt,
                schedule: {
                    workStart: org.workStart || '09:00',
                    workEnd: org.workEnd || '18:00',
                    lateTolerance: org.lateTolerance || 5,
                    workDays: org.workDays ? JSON.parse(org.workDays as string) : [1, 2, 3, 4, 5]
                }
            }
        });
    } catch (error) {
        log.error('Failed to fetch organization', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch organization'
        });
    }
});

// =============================================================================
// PUT /api/settings/organization - Update organization
// =============================================================================

/**
 * Update organization name
 */
router.put('/organization', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: name'
            });
        }

        const updateStmt = db.prepare(`
      UPDATE organizations 
      SET name = ?, updated_at = datetime('now')
      WHERE id = 1
    `);

        updateStmt.run(name);

        log.info('Organization updated', { name });

        res.json({
            success: true,
            message: 'Organization updated successfully'
        });
    } catch (error) {
        log.error('Failed to update organization', { error, body: req.body });
        res.status(500).json({
            success: false,
            error: 'Failed to update organization'
        });
    }
});

// =============================================================================
// POST /api/settings/reset - Reset all data (clear database)
// =============================================================================

/**
 * Reset all data - clears all tables except organizations and default settings
 * 
 * WARNING: This is a destructive operation!
 * Deletes: employees, departments, time_records, attendance_records,
 *          violation_summary, import_history, employee_penalties,
 *          employee_compensation, kpi_zero_records, penalty_details
 */
router.post('/reset', (req: Request, res: Response) => {
    try {
        const db = getDatabase();

        log.warn('Starting database reset - clearing all data');

        // Get counts before deletion for logging
        const countsBefore = {
            employees: (db.prepare('SELECT COUNT(*) as count FROM employees').get() as { count: number })?.count || 0,
            departments: (db.prepare('SELECT COUNT(*) as count FROM departments').get() as { count: number })?.count || 0,
            timeRecords: (db.prepare('SELECT COUNT(*) as count FROM time_records').get() as { count: number })?.count || 0,
            attendanceRecords: (db.prepare('SELECT COUNT(*) as count FROM attendance_records').get() as { count: number })?.count || 0,
            violationSummary: (db.prepare('SELECT COUNT(*) as count FROM violation_summary').get() as { count: number })?.count || 0,
            importHistory: (db.prepare('SELECT COUNT(*) as count FROM import_history').get() as { count: number })?.count || 0,
            employeePenalties: (db.prepare('SELECT COUNT(*) as count FROM employee_penalties').get() as { count: number })?.count || 0,
            employeeCompensation: (db.prepare('SELECT COUNT(*) as count FROM employee_compensation').get() as { count: number })?.count || 0,
        };

        log.info('Data counts before reset', countsBefore);

        // Delete in correct order (respecting foreign key constraints)
        // 1. Delete penalty-related tables first
        db.prepare('DELETE FROM penalty_details').run();
        db.prepare('DELETE FROM kpi_zero_records').run();
        db.prepare('DELETE FROM employee_penalties').run();

        // 2. Delete compensation data
        db.prepare('DELETE FROM employee_compensation').run();

        // 3. Delete violation summaries
        db.prepare('DELETE FROM violation_summary').run();

        // 4. Delete time and attendance records
        db.prepare('DELETE FROM time_records').run();
        db.prepare('DELETE FROM attendance_records').run();

        // 5. Delete import history
        db.prepare('DELETE FROM import_history').run();

        // 6. Delete schedule exceptions (but keep work_schedules)
        db.prepare('DELETE FROM schedule_exceptions').run();

        // 7. Delete missing time settings for employees and departments (keep organization)
        db.prepare("DELETE FROM missing_time_settings WHERE target_type != 'organization'").run();

        // 8. Delete work schedules for employees and departments (keep organization)
        db.prepare("DELETE FROM work_schedules WHERE target_type != 'organization'").run();

        // 9. Delete employees
        db.prepare('DELETE FROM employees').run();

        // 10. Delete departments
        db.prepare('DELETE FROM departments').run();

        log.info('Database reset completed successfully');

        res.json({
            success: true,
            message: "Barcha ma'lumotlar muvaffaqiyatli o'chirildi",
            deletedCounts: countsBefore
        });

    } catch (error) {
        log.error('Failed to reset database', { error });
        res.status(500).json({
            success: false,
            error: "Ma'lumotlarni o'chirishda xatolik yuz berdi"
        });
    }
});

// =============================================================================
// GET /api/settings/stats - Get database statistics
// =============================================================================

/**
 * Get database statistics for admin panel
 */
router.get('/stats', (req: Request, res: Response) => {
    try {
        const db = getDatabase();

        const stats = {
            employees: (db.prepare('SELECT COUNT(*) as count FROM employees').get() as { count: number })?.count || 0,
            departments: (db.prepare('SELECT COUNT(*) as count FROM departments').get() as { count: number })?.count || 0,
            timeRecords: (db.prepare('SELECT COUNT(*) as count FROM time_records').get() as { count: number })?.count || 0,
            attendanceRecords: (db.prepare('SELECT COUNT(*) as count FROM attendance_records').get() as { count: number })?.count || 0,
            imports: (db.prepare('SELECT COUNT(*) as count FROM import_history').get() as { count: number })?.count || 0,
            uniqueDates: (db.prepare('SELECT COUNT(DISTINCT date) as count FROM time_records').get() as { count: number })?.count || 0,
        };

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        log.error('Failed to fetch database stats', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch database statistics'
        });
    }
});

export default router;
