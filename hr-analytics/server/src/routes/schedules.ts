/**
 * =============================================================================
 * HR Analytics Backend - Work Schedules API Routes
 * =============================================================================
 * 
 * RESTful API endpoints for work schedule management.
 * Supports organization, department, and employee level schedules.
 * 
 * @module routes/schedules
 * @author HR Analytics Team
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import { getDatabase } from '../database/connection';
import { createContextLogger } from '../utils/logger';
import type { WorkSchedule, ScheduleException, ScheduleTargetType } from '../models/types';

// Create router instance
const router = Router();

// Create context-specific logger
const log = createContextLogger('SchedulesAPI');

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Parse work days from JSON string to array
 * @param workDaysJson - JSON string like "[1,2,3,4,5]"
 * @returns Array of weekday numbers
 */
function parseWorkDays(workDaysJson: string): number[] {
    try {
        return JSON.parse(workDaysJson);
    } catch {
        return [1, 2, 3, 4, 5]; // Default Monday-Friday
    }
}

/**
 * Transform database row to WorkSchedule object
 */
function transformSchedule(row: Record<string, unknown>): WorkSchedule {
    return {
        id: row.id as number,
        targetType: row.target_type as ScheduleTargetType,
        targetId: row.target_id as number,
        workStart: row.work_start as string,
        workEnd: row.work_end as string,
        lateTolerance: row.late_tolerance as number,
        workDays: parseWorkDays(row.work_days as string),
        validFrom: row.valid_from as string | null,
        validTo: row.valid_to as string | null,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string
    };
}

// =============================================================================
// GET /api/schedules - List all schedules
// =============================================================================

/**
 * Get all work schedules with optional filtering
 * 
 * Query parameters:
 * - targetType: Filter by type (organization, department, employee)
 * - targetId: Filter by target ID
 * - active: Filter by active status (true/false)
 */
router.get('/', (req: Request, res: Response) => {
    try {
        const db = getDatabase();

        const targetType = req.query.targetType as string;
        const targetId = req.query.targetId as string;
        const active = req.query.active as string;

        let whereClause = '';
        const params: (string | number)[] = [];

        if (targetType) {
            whereClause += ' WHERE target_type = ?';
            params.push(targetType);
        }

        if (targetId) {
            whereClause += whereClause ? ' AND' : ' WHERE';
            whereClause += ' target_id = ?';
            params.push(parseInt(targetId));
        }

        if (active !== undefined) {
            whereClause += whereClause ? ' AND' : ' WHERE';
            whereClause += ' is_active = ?';
            params.push(active === 'true' ? 1 : 0);
        }

        const stmt = db.prepare(`
      SELECT * FROM work_schedules
      ${whereClause}
      ORDER BY 
        CASE target_type 
          WHEN 'organization' THEN 1 
          WHEN 'department' THEN 2 
          WHEN 'employee' THEN 3 
        END,
        target_id
    `);

        const rows = stmt.all(...params) as Record<string, unknown>[];
        const schedules = rows.map(transformSchedule);

        res.json({
            success: true,
            data: schedules
        });
    } catch (error) {
        log.error('Failed to fetch schedules', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch schedules'
        });
    }
});

// =============================================================================
// GET /api/schedules/:id - Get single schedule
// =============================================================================

router.get('/:id', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const { id } = req.params;

        const stmt = db.prepare('SELECT * FROM work_schedules WHERE id = ?');
        const row = stmt.get(id) as Record<string, unknown> | undefined;

        if (!row) {
            return res.status(404).json({
                success: false,
                error: 'Schedule not found'
            });
        }

        res.json({
            success: true,
            data: transformSchedule(row)
        });
    } catch (error) {
        log.error('Failed to fetch schedule', { error, id: req.params.id });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch schedule'
        });
    }
});

// =============================================================================
// POST /api/schedules - Create new schedule
// =============================================================================

/**
 * Create a new work schedule
 * 
 * Request body:
 * - targetType: 'organization' | 'department' | 'employee' (required)
 * - targetId: ID of the target entity (required)
 * - workStart: Start time "HH:MM" (default: "09:00")
 * - workEnd: End time "HH:MM" (default: "18:00")
 * - lateTolerance: Minutes (default: 5)
 * - workDays: Array of weekday numbers [1-7] (default: [1,2,3,4,5])
 * - validFrom: Start date (optional)
 * - validTo: End date (optional)
 */
router.post('/', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const {
            targetType,
            targetId,
            workStart = '09:00',
            workEnd = '18:00',
            lateTolerance = 5,
            workDays = [1, 2, 3, 4, 5],
            validFrom = null,
            validTo = null
        } = req.body;

        // Validate required fields
        if (!targetType || targetId === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: targetType, targetId'
            });
        }

        // Validate targetType
        if (!['organization', 'department', 'employee'].includes(targetType)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid targetType. Must be: organization, department, or employee'
            });
        }

        // Check for existing active schedule
        const existingStmt = db.prepare(`
      SELECT id FROM work_schedules 
      WHERE target_type = ? AND target_id = ? AND is_active = 1
    `);
        const existing = existingStmt.get(targetType, targetId);

        if (existing) {
            // Deactivate existing schedule
            db.prepare(`
        UPDATE work_schedules SET is_active = 0, updated_at = datetime('now')
        WHERE target_type = ? AND target_id = ? AND is_active = 1
      `).run(targetType, targetId);

            log.info('Deactivated existing schedule', { targetType, targetId });
        }

        // Insert new schedule
        const insertStmt = db.prepare(`
      INSERT INTO work_schedules (
        target_type, target_id, work_start, work_end, 
        late_tolerance, work_days, valid_from, valid_to
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

        const result = insertStmt.run(
            targetType,
            targetId,
            workStart,
            workEnd,
            lateTolerance,
            JSON.stringify(workDays),
            validFrom,
            validTo
        );

        log.info('Schedule created', {
            id: result.lastInsertRowid,
            targetType,
            targetId,
            workStart,
            workEnd,
            workDays
        });

        res.status(201).json({
            success: true,
            data: {
                id: result.lastInsertRowid,
                targetType,
                targetId,
                workStart,
                workEnd,
                lateTolerance,
                workDays,
                validFrom,
                validTo,
                isActive: true
            },
            message: 'Schedule created successfully'
        });
    } catch (error) {
        log.error('Failed to create schedule', { error, body: req.body });
        res.status(500).json({
            success: false,
            error: 'Failed to create schedule'
        });
    }
});

// =============================================================================
// PUT /api/schedules/:id - Update schedule
// =============================================================================

router.put('/:id', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const { id } = req.params;
        const { workStart, workEnd, lateTolerance, workDays, isActive } = req.body;

        // Check if schedule exists
        const existingStmt = db.prepare('SELECT id FROM work_schedules WHERE id = ?');
        const existing = existingStmt.get(id);

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: 'Schedule not found'
            });
        }

        // Build update query dynamically
        const updates: string[] = [];
        const params: (string | number)[] = [];

        if (workStart !== undefined) {
            updates.push('work_start = ?');
            params.push(workStart);
        }
        if (workEnd !== undefined) {
            updates.push('work_end = ?');
            params.push(workEnd);
        }
        if (lateTolerance !== undefined) {
            updates.push('late_tolerance = ?');
            params.push(lateTolerance);
        }
        if (workDays !== undefined) {
            updates.push('work_days = ?');
            params.push(JSON.stringify(workDays));
        }
        if (isActive !== undefined) {
            updates.push('is_active = ?');
            params.push(isActive ? 1 : 0);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No fields to update'
            });
        }

        updates.push("updated_at = datetime('now')");
        params.push(parseInt(id));

        const updateStmt = db.prepare(`
      UPDATE work_schedules 
      SET ${updates.join(', ')}
      WHERE id = ?
    `);

        updateStmt.run(...params);

        log.info('Schedule updated', { id, updates: req.body });

        res.json({
            success: true,
            message: 'Schedule updated successfully'
        });
    } catch (error) {
        log.error('Failed to update schedule', { error, id: req.params.id });
        res.status(500).json({
            success: false,
            error: 'Failed to update schedule'
        });
    }
});

// =============================================================================
// DELETE /api/schedules/:id - Delete schedule
// =============================================================================

router.delete('/:id', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const { id } = req.params;

        // Check if schedule exists
        const existingStmt = db.prepare('SELECT id, target_type FROM work_schedules WHERE id = ?');
        const existing = existingStmt.get(id) as { id: number; target_type: string } | undefined;

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: 'Schedule not found'
            });
        }

        // Don't allow deleting organization default schedule
        if (existing.target_type === 'organization') {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete organization default schedule'
            });
        }

        db.prepare('DELETE FROM work_schedules WHERE id = ?').run(id);

        log.info('Schedule deleted', { id });

        res.json({
            success: true,
            message: 'Schedule deleted successfully'
        });
    } catch (error) {
        log.error('Failed to delete schedule', { error, id: req.params.id });
        res.status(500).json({
            success: false,
            error: 'Failed to delete schedule'
        });
    }
});

// =============================================================================
// SCHEDULE EXCEPTIONS
// =============================================================================

// GET /api/schedules/exceptions - List all exceptions
router.get('/exceptions/list', (req: Request, res: Response) => {
    try {
        const db = getDatabase();

        const dateFrom = req.query.from as string;
        const dateTo = req.query.to as string;

        let whereClause = '';
        const params: string[] = [];

        if (dateFrom) {
            whereClause += ' WHERE date >= ?';
            params.push(dateFrom);
        }
        if (dateTo) {
            whereClause += whereClause ? ' AND' : ' WHERE';
            whereClause += ' date <= ?';
            params.push(dateTo);
        }

        const stmt = db.prepare(`
      SELECT * FROM schedule_exceptions
      ${whereClause}
      ORDER BY date DESC
    `);

        const rows = stmt.all(...params) as Record<string, unknown>[];

        const exceptions = rows.map(row => ({
            id: row.id,
            type: row.type,
            employeeIds: JSON.parse(row.employee_ids as string),
            date: row.date,
            workStart: row.work_start,
            workEnd: row.work_end,
            reason: row.reason,
            createdAt: row.created_at
        }));

        res.json({
            success: true,
            data: exceptions
        });
    } catch (error) {
        log.error('Failed to fetch exceptions', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch exceptions'
        });
    }
});

// POST /api/schedules/exceptions - Create exception
router.post('/exceptions', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const {
            type,
            employeeIds,
            date,
            workStart = null,
            workEnd = null,
            reason = ''
        } = req.body;

        // Validate required fields
        if (!type || !employeeIds || !date) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: type, employeeIds, date'
            });
        }

        // Validate type
        if (!['holiday', 'sick', 'special', 'off'].includes(type)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid type. Must be: holiday, sick, special, or off'
            });
        }

        const insertStmt = db.prepare(`
      INSERT INTO schedule_exceptions (type, employee_ids, date, work_start, work_end, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

        const result = insertStmt.run(
            type,
            JSON.stringify(employeeIds),
            date,
            workStart,
            workEnd,
            reason
        );

        log.info('Exception created', {
            id: result.lastInsertRowid,
            type,
            date,
            employeeCount: employeeIds.length
        });

        res.status(201).json({
            success: true,
            data: {
                id: result.lastInsertRowid,
                type,
                employeeIds,
                date,
                workStart,
                workEnd,
                reason
            },
            message: 'Exception created successfully'
        });
    } catch (error) {
        log.error('Failed to create exception', { error, body: req.body });
        res.status(500).json({
            success: false,
            error: 'Failed to create exception'
        });
    }
});

// DELETE /api/schedules/exceptions/:id - Delete exception
router.delete('/exceptions/:id', (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const { id } = req.params;

        const result = db.prepare('DELETE FROM schedule_exceptions WHERE id = ?').run(id);

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                error: 'Exception not found'
            });
        }

        log.info('Exception deleted', { id });

        res.json({
            success: true,
            message: 'Exception deleted successfully'
        });
    } catch (error) {
        log.error('Failed to delete exception', { error, id: req.params.id });
        res.status(500).json({
            success: false,
            error: 'Failed to delete exception'
        });
    }
});

export default router;
