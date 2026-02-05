/**
 * =============================================================================
 * HR Analytics Backend - Missing Time Settings API Routes
 * =============================================================================
 * 
 * API endpoints for managing missing time handling settings.
 * Supports CRUD operations at organization, department, and employee levels.
 * 
 * Settings Types:
 *   Type 1: Yo'q vaqt = to'liq ishlanmagan kun (Full Absent)
 *   Type 2: Avtomatik to'ldirish (Auto-fill with penalty minutes)
 * 
 * Priority: Employee > Department > Organization
 * 
 * @module routes/missingTimeSettings
 * @author HR Analytics Team
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import { createContextLogger } from '../utils/logger';
import {
    getSettingsByTarget,
    getEffectiveMissingTimeSettings,
    getAllMissingTimeSettings,
    getMissingTimeSettingsWithNames,
    createMissingTimeSettings,
    updateMissingTimeSettings,
    deleteMissingTimeSettings
} from '../services/missingTimeResolver';
import { getDatabase } from '../database/connection';
import type { ScheduleTargetType, MissingTimeHandlingType } from '../models/types';

// =============================================================================
// ROUTER INITIALIZATION
// =============================================================================

const router = Router();
const log = createContextLogger('MissingTimeSettingsAPI');

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Request body for creating/updating missing time settings
 */
interface MissingTimeSettingsBody {
    targetType: ScheduleTargetType;
    targetId: number;
    handlingType: MissingTimeHandlingType;
    missingCheckinPenaltyMinutes?: number;
    missingCheckoutPenaltyMinutes?: number;
    isActive?: boolean;
}

// =============================================================================
// API ENDPOINTS
// =============================================================================

/**
 * GET /api/missing-time-settings
 * 
 * Get all missing time settings with optional filtering
 * 
 * Query Parameters:
 *   - targetType: Filter by target type ('organization', 'department', 'employee')
 *   - withNames: If 'true', include entity names in response
 * 
 * @returns Array of missing time settings
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const { targetType, withNames } = req.query;
        
        log.debug('Getting all missing time settings', { targetType, withNames });

        // If withNames requested, return settings with entity names
        if (withNames === 'true') {
            const settings = getMissingTimeSettingsWithNames();
            return res.json({
                success: true,
                data: settings
            });
        }

        // Get all settings with optional type filter
        const settings = getAllMissingTimeSettings(
            targetType as ScheduleTargetType | undefined
        );

        return res.json({
            success: true,
            data: settings
        });

    } catch (error) {
        log.error('Error getting missing time settings', { error });
        return res.status(500).json({
            success: false,
            error: 'Sozlamalarni olishda xatolik yuz berdi'
        });
    }
});

/**
 * GET /api/missing-time-settings/effective/:employeeId
 * 
 * Get effective missing time settings for a specific employee
 * Resolves settings using priority: Employee > Department > Organization
 * 
 * @param employeeId - Employee ID
 * @returns Effective settings with source level
 */
router.get('/effective/:employeeId', async (req: Request, res: Response) => {
    try {
        const employeeId = parseInt(req.params.employeeId);

        if (isNaN(employeeId)) {
            return res.status(400).json({
                success: false,
                error: 'Xodim ID si noto\'g\'ri formatda'
            });
        }

        log.debug('Getting effective settings for employee', { employeeId });

        const effectiveSettings = getEffectiveMissingTimeSettings(employeeId);

        if (!effectiveSettings) {
            return res.status(404).json({
                success: false,
                error: 'Xodim uchun sozlamalar topilmadi'
            });
        }

        return res.json({
            success: true,
            data: effectiveSettings
        });

    } catch (error) {
        log.error('Error getting effective settings', { error });
        return res.status(500).json({
            success: false,
            error: 'Effektiv sozlamalarni olishda xatolik yuz berdi'
        });
    }
});

/**
 * GET /api/missing-time-settings/hierarchy/:employeeId
 * 
 * Get all settings in hierarchy for an employee
 * Returns settings at all three levels for comparison/display
 * 
 * @param employeeId - Employee ID
 * @returns Settings at organization, department, and employee levels
 */
router.get('/hierarchy/:employeeId', async (req: Request, res: Response) => {
    try {
        const employeeId = parseInt(req.params.employeeId);

        if (isNaN(employeeId)) {
            return res.status(400).json({
                success: false,
                error: 'Xodim ID si noto\'g\'ri formatda'
            });
        }

        log.debug('Getting settings hierarchy for employee', { employeeId });

        // Get employee info for department lookup
        const db = getDatabase();
        const employee = db.prepare(`
            SELECT e.id, e.name, e.department_id, d.name as department_name
            FROM employees e
            JOIN departments d ON e.department_id = d.id
            WHERE e.id = ?
        `).get(employeeId) as {
            id: number;
            name: string;
            department_id: number;
            department_name: string;
        } | undefined;

        if (!employee) {
            return res.status(404).json({
                success: false,
                error: 'Xodim topilmadi'
            });
        }

        // Get settings at all levels
        const organizationSettings = getSettingsByTarget('organization', 1);
        const departmentSettings = getSettingsByTarget('department', employee.department_id);
        const employeeSettings = getSettingsByTarget('employee', employeeId);

        // Get effective (resolved) settings
        const effective = getEffectiveMissingTimeSettings(employeeId);

        return res.json({
            success: true,
            data: {
                employee: {
                    id: employee.id,
                    name: employee.name,
                    departmentId: employee.department_id,
                    departmentName: employee.department_name
                },
                hierarchy: {
                    organization: organizationSettings,
                    department: departmentSettings,
                    employee: employeeSettings
                },
                effective: effective
            }
        });

    } catch (error) {
        log.error('Error getting settings hierarchy', { error });
        return res.status(500).json({
            success: false,
            error: 'Sozlamalar ierarxiyasini olishda xatolik yuz berdi'
        });
    }
});

/**
 * GET /api/missing-time-settings/:targetType/:targetId
 * 
 * Get missing time settings for a specific target
 * 
 * @param targetType - Target type ('organization', 'department', 'employee')
 * @param targetId - Target entity ID
 * @returns Settings for the specified target
 */
router.get('/:targetType/:targetId', async (req: Request, res: Response) => {
    try {
        const { targetType, targetId } = req.params;
        const id = parseInt(targetId);

        // Validate target type
        if (!['organization', 'department', 'employee'].includes(targetType)) {
            return res.status(400).json({
                success: false,
                error: 'Noto\'g\'ri target_type. organization, department yoki employee bo\'lishi kerak'
            });
        }

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: 'Target ID noto\'g\'ri formatda'
            });
        }

        log.debug('Getting settings by target', { targetType, targetId: id });

        const settings = getSettingsByTarget(targetType as ScheduleTargetType, id);

        if (!settings) {
            return res.status(404).json({
                success: false,
                error: 'Sozlamalar topilmadi'
            });
        }

        return res.json({
            success: true,
            data: settings
        });

    } catch (error) {
        log.error('Error getting settings by target', { error });
        return res.status(500).json({
            success: false,
            error: 'Sozlamalarni olishda xatolik yuz berdi'
        });
    }
});

/**
 * POST /api/missing-time-settings
 * 
 * Create new missing time settings
 * 
 * Request Body:
 *   - targetType: 'organization' | 'department' | 'employee'
 *   - targetId: number
 *   - handlingType: 1 | 2
 *   - missingCheckinPenaltyMinutes: number (optional, default 60)
 *   - missingCheckoutPenaltyMinutes: number (optional, default 120)
 *   - isActive: boolean (optional, default true)
 * 
 * @returns Created settings
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const body = req.body as MissingTimeSettingsBody;

        // Validate required fields
        if (!body.targetType || body.targetId === undefined || body.handlingType === undefined) {
            return res.status(400).json({
                success: false,
                error: 'targetType, targetId va handlingType majburiy maydonlar'
            });
        }

        // Validate target type
        if (!['organization', 'department', 'employee'].includes(body.targetType)) {
            return res.status(400).json({
                success: false,
                error: 'Noto\'g\'ri targetType. organization, department yoki employee bo\'lishi kerak'
            });
        }

        // Validate handling type
        if (![1, 2].includes(body.handlingType)) {
            return res.status(400).json({
                success: false,
                error: 'Noto\'g\'ri handlingType. 1 yoki 2 bo\'lishi kerak'
            });
        }

        log.info('Creating missing time settings', { body });

        // Check if settings already exist for this target
        const existing = getSettingsByTarget(body.targetType, body.targetId);
        if (existing) {
            return res.status(409).json({
                success: false,
                error: 'Bu target uchun sozlamalar allaqachon mavjud. Yangilash uchun PUT so\'rovidan foydalaning'
            });
        }

        // Create settings
        const settings = createMissingTimeSettings({
            targetType: body.targetType,
            targetId: body.targetId,
            handlingType: body.handlingType,
            missingCheckinPenaltyMinutes: body.missingCheckinPenaltyMinutes ?? 60,
            missingCheckoutPenaltyMinutes: body.missingCheckoutPenaltyMinutes ?? 120,
            isActive: body.isActive ?? true
        });

        if (!settings) {
            return res.status(500).json({
                success: false,
                error: 'Sozlamalarni yaratishda xatolik yuz berdi'
            });
        }

        return res.status(201).json({
            success: true,
            data: settings,
            message: 'Sozlamalar muvaffaqiyatli yaratildi'
        });

    } catch (error) {
        log.error('Error creating missing time settings', { error });
        return res.status(500).json({
            success: false,
            error: 'Sozlamalarni yaratishda xatolik yuz berdi'
        });
    }
});

/**
 * PUT /api/missing-time-settings/:id
 * 
 * Update existing missing time settings
 * 
 * @param id - Settings ID
 * @returns Updated settings
 */
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        const body = req.body as Partial<MissingTimeSettingsBody>;

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: 'ID noto\'g\'ri formatda'
            });
        }

        // Validate handling type if provided
        if (body.handlingType !== undefined && ![1, 2].includes(body.handlingType)) {
            return res.status(400).json({
                success: false,
                error: 'Noto\'g\'ri handlingType. 1 yoki 2 bo\'lishi kerak'
            });
        }

        log.info('Updating missing time settings', { id, body });

        const settings = updateMissingTimeSettings(id, {
            handlingType: body.handlingType,
            missingCheckinPenaltyMinutes: body.missingCheckinPenaltyMinutes,
            missingCheckoutPenaltyMinutes: body.missingCheckoutPenaltyMinutes,
            isActive: body.isActive
        });

        if (!settings) {
            return res.status(404).json({
                success: false,
                error: 'Sozlamalar topilmadi'
            });
        }

        return res.json({
            success: true,
            data: settings,
            message: 'Sozlamalar muvaffaqiyatli yangilandi'
        });

    } catch (error) {
        log.error('Error updating missing time settings', { error });
        return res.status(500).json({
            success: false,
            error: 'Sozlamalarni yangilashda xatolik yuz berdi'
        });
    }
});

/**
 * DELETE /api/missing-time-settings/:id
 * 
 * Delete missing time settings
 * 
 * @param id - Settings ID
 * @returns Success status
 */
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: 'ID noto\'g\'ri formatda'
            });
        }

        log.info('Deleting missing time settings', { id });

        const deleted = deleteMissingTimeSettings(id);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: 'Sozlamalar topilmadi'
            });
        }

        return res.json({
            success: true,
            message: 'Sozlamalar muvaffaqiyatli o\'chirildi'
        });

    } catch (error) {
        log.error('Error deleting missing time settings', { error });
        return res.status(500).json({
            success: false,
            error: 'Sozlamalarni o\'chirishda xatolik yuz berdi'
        });
    }
});

/**
 * GET /api/missing-time-settings/targets/available
 * 
 * Get available targets for setting missing time rules
 * Returns lists of organizations, departments, and employees
 * with their current settings status
 * 
 * @returns Available targets grouped by type
 */
router.get('/targets/available', async (req: Request, res: Response) => {
    try {
        const db = getDatabase();

        log.debug('Getting available targets for missing time settings');

        // Get all organizations
        const organizations = db.prepare(`
            SELECT 
                o.id, 
                o.name,
                mts.id as settings_id,
                mts.handling_type
            FROM organizations o
            LEFT JOIN missing_time_settings mts 
                ON mts.target_type = 'organization' AND mts.target_id = o.id AND mts.is_active = 1
        `).all() as Array<{
            id: number;
            name: string;
            settings_id: number | null;
            handling_type: number | null;
        }>;

        // Get all departments
        const departments = db.prepare(`
            SELECT 
                d.id, 
                d.name,
                o.name as organization_name,
                mts.id as settings_id,
                mts.handling_type
            FROM departments d
            JOIN organizations o ON d.organization_id = o.id
            LEFT JOIN missing_time_settings mts 
                ON mts.target_type = 'department' AND mts.target_id = d.id AND mts.is_active = 1
            ORDER BY d.name
        `).all() as Array<{
            id: number;
            name: string;
            organization_name: string;
            settings_id: number | null;
            handling_type: number | null;
        }>;

        // Get all employees (limited to first 100 for performance)
        const employees = db.prepare(`
            SELECT 
                e.id, 
                e.name,
                e.external_id,
                d.name as department_name,
                mts.id as settings_id,
                mts.handling_type
            FROM employees e
            JOIN departments d ON e.department_id = d.id
            LEFT JOIN missing_time_settings mts 
                ON mts.target_type = 'employee' AND mts.target_id = e.id AND mts.is_active = 1
            ORDER BY e.name
            LIMIT 100
        `).all() as Array<{
            id: number;
            name: string;
            external_id: string;
            department_name: string;
            settings_id: number | null;
            handling_type: number | null;
        }>;

        return res.json({
            success: true,
            data: {
                organizations: organizations.map(o => ({
                    id: o.id,
                    name: o.name,
                    hasSettings: o.settings_id !== null,
                    settingsId: o.settings_id,
                    handlingType: o.handling_type
                })),
                departments: departments.map(d => ({
                    id: d.id,
                    name: d.name,
                    organizationName: d.organization_name,
                    hasSettings: d.settings_id !== null,
                    settingsId: d.settings_id,
                    handlingType: d.handling_type
                })),
                employees: employees.map(e => ({
                    id: e.id,
                    name: e.name,
                    externalId: e.external_id,
                    departmentName: e.department_name,
                    hasSettings: e.settings_id !== null,
                    settingsId: e.settings_id,
                    handlingType: e.handling_type
                }))
            }
        });

    } catch (error) {
        log.error('Error getting available targets', { error });
        return res.status(500).json({
            success: false,
            error: 'Mavjud targetlarni olishda xatolik yuz berdi'
        });
    }
});

// =============================================================================
// EXPORT
// =============================================================================

export default router;
