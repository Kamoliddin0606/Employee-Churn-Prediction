/**
 * =============================================================================
 * HR Analytics Backend - Missing Time Resolver Service
 * =============================================================================
 * 
 * Resolves and processes missing check-in/check-out times based on
 * configurable settings at organization, department, and employee levels.
 * 
 * Priority Order (highest to lowest):
 * 1. Employee Settings (xodim) - individual employee configuration
 * 2. Department Settings (bo'lim) - department-level configuration
 * 3. Organization Settings (tashkilot) - default organization configuration
 * 
 * Handling Types:
 * - Type 1: Yo'q vaqt = to'liq ishlanmagan kun (Full Absent)
 *           Missing time means full work day counted as late/absent
 * - Type 2: Avtomatik to'ldirish (Auto-fill with penalty)
 *           Missing time auto-filled with schedule ± penalty minutes
 * 
 * @module services/missingTimeResolver
 * @author HR Analytics Team
 * @version 1.0.0
 */

import { getDatabase } from '../database/connection';
import { createContextLogger } from '../utils/logger';
import type { 
    MissingTimeSettings, 
    MissingTimeHandlingType,
    MissingType,
    ResolvedMissingTime,
    ScheduleTargetType
} from '../models/types';

/**
 * Minimal schedule info required for missing time resolution
 * Compatible with both full ScheduleInfo and simplified schedule objects
 */
export interface ScheduleInfo {
    workStart: string;
    workEnd: string;
    lateTolerance: number;
    isWorkDay: boolean;
}

// =============================================================================
// LOGGER INITIALIZATION
// =============================================================================

/**
 * Context-specific logger for missing time resolution operations
 * Provides detailed logging for debugging and auditing
 */
const log = createContextLogger('MissingTimeResolver');

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Database row structure for missing_time_settings table
 * Maps directly to SQLite column names (snake_case)
 */
interface MissingTimeSettingsRow {
    id: number;
    target_type: ScheduleTargetType;
    target_id: number;
    handling_type: MissingTimeHandlingType;
    missing_checkin_penalty_minutes: number;
    missing_checkout_penalty_minutes: number;
    is_active: number;
    valid_from: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Employee information with department for priority resolution
 */
interface EmployeeInfo {
    id: number;
    department_id: number;
}

/**
 * Effective settings result after priority resolution
 * Includes the resolved settings and their source level
 */
export interface EffectiveMissingTimeSettings {
    settings: MissingTimeSettings;
    source: ScheduleTargetType;  // Which level the settings came from
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert database row to MissingTimeSettings object
 * Transforms snake_case database columns to camelCase TypeScript properties
 * 
 * @param row - Database row from missing_time_settings table
 * @returns Properly typed MissingTimeSettings object
 */
function rowToSettings(row: MissingTimeSettingsRow): MissingTimeSettings {
    return {
        id: row.id,
        targetType: row.target_type,
        targetId: row.target_id,
        handlingType: row.handling_type,
        missingCheckinPenaltyMinutes: row.missing_checkin_penalty_minutes,
        missingCheckoutPenaltyMinutes: row.missing_checkout_penalty_minutes,
        isActive: row.is_active === 1,
        validFrom: row.valid_from,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

/**
 * Parse time string to minutes from midnight
 * Converts "HH:MM" format to total minutes for calculations
 * 
 * @param time - Time string in "HH:MM" format
 * @returns Total minutes from midnight
 * 
 * @example
 * timeToMinutes("09:00") // Returns 540
 * timeToMinutes("18:30") // Returns 1110
 */
function timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Convert minutes from midnight to time string
 * Transforms total minutes back to "HH:MM" format
 * 
 * @param minutes - Total minutes from midnight
 * @returns Time string in "HH:MM" format
 * 
 * @example
 * minutesToTime(540) // Returns "09:00"
 * minutesToTime(1110) // Returns "18:30"
 */
function minutesToTime(minutes: number): string {
    // Ensure minutes is within valid range (0-1439)
    const normalizedMinutes = Math.max(0, Math.min(1439, minutes));
    const hours = Math.floor(normalizedMinutes / 60);
    const mins = normalizedMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Calculate total work minutes between check-in and check-out
 * Returns 0 if either time is missing
 * 
 * @param checkIn - Check-in time string or null
 * @param checkOut - Check-out time string or null
 * @returns Total work minutes (0 if invalid)
 */
function calculateWorkMinutes(checkIn: string | null, checkOut: string | null): number {
    if (!checkIn || !checkOut) return 0;
    
    const inMinutes = timeToMinutes(checkIn);
    const outMinutes = timeToMinutes(checkOut);
    
    // Handle case where check-out is after midnight (next day)
    // For simplicity, assume same-day check-out
    return Math.max(0, outMinutes - inMinutes);
}

// =============================================================================
// SETTINGS RETRIEVAL FUNCTIONS
// =============================================================================

/**
 * Get missing time settings for a specific target
 * Retrieves settings by target type and ID from database
 * Supports date-based filtering for settings with valid_from
 * 
 * @param targetType - Level of settings ('organization', 'department', 'employee')
 * @param targetId - ID of the target entity
 * @param date - Optional date string (YYYY-MM-DD) to filter by valid_from
 * @returns MissingTimeSettings if found and active, null otherwise
 */
export function getSettingsByTarget(
    targetType: ScheduleTargetType,
    targetId: number,
    date?: string
): MissingTimeSettings | null {
    try {
        const db = getDatabase();
        
        // Query with date filtering - get the most recent valid setting
        // valid_from IS NULL means setting applies from beginning of time
        // ORDER BY valid_from DESC NULLS LAST ensures we get the most specific setting
        const stmt = db.prepare(`
            SELECT * FROM missing_time_settings
            WHERE target_type = ? 
              AND target_id = ? 
              AND is_active = 1
              AND (valid_from IS NULL OR valid_from <= ?)
            ORDER BY valid_from DESC
            LIMIT 1
        `);
        
        // Use provided date or current date
        const effectiveDate = date || new Date().toISOString().split('T')[0];
        const row = stmt.get(targetType, targetId, effectiveDate) as MissingTimeSettingsRow | undefined;
        
        if (!row) {
            log.debug('No settings found', { targetType, targetId, date: effectiveDate });
            return null;
        }
        
        return rowToSettings(row);
    } catch (error) {
        log.error('Error getting settings by target', { targetType, targetId, date, error });
        return null;
    }
}

/**
 * Get employee information including department
 * Required for priority resolution chain
 * 
 * @param employeeId - Employee ID
 * @returns Employee info with department_id, null if not found
 */
function getEmployeeInfo(employeeId: number): EmployeeInfo | null {
    try {
        const db = getDatabase();
        
        const stmt = db.prepare(`
            SELECT id, department_id FROM employees WHERE id = ?
        `);
        
        return stmt.get(employeeId) as EmployeeInfo | null;
    } catch (error) {
        log.error('Error getting employee info', { employeeId, error });
        return null;
    }
}

/**
 * Get effective missing time settings for an employee on a specific date
 * Implements priority-based resolution: Employee > Department > Organization
 * Supports date-based filtering for settings with valid_from
 * 
 * Resolution chain:
 * 1. Check for employee-specific settings valid for the date
 * 2. If not found, check department settings valid for the date
 * 3. If not found, fall back to organization settings valid for the date
 * 
 * @param employeeId - Employee ID to get settings for
 * @param date - Optional date string (YYYY-MM-DD) to filter by valid_from
 * @returns Effective settings with source level, or null if no settings found
 */
export function getEffectiveMissingTimeSettings(
    employeeId: number,
    date?: string
): EffectiveMissingTimeSettings | null {
    try {
        // Step 1: Get employee info (needed for department lookup)
        const employee = getEmployeeInfo(employeeId);
        if (!employee) {
            log.warn('Employee not found for settings resolution', { employeeId });
            return null;
        }

        // Step 2: Check employee-level settings (highest priority)
        const employeeSettings = getSettingsByTarget('employee', employeeId, date);
        if (employeeSettings) {
            log.debug('Using employee-level settings', { employeeId, settingsId: employeeSettings.id, date });
            return {
                settings: employeeSettings,
                source: 'employee'
            };
        }

        // Step 3: Check department-level settings
        const departmentSettings = getSettingsByTarget('department', employee.department_id, date);
        if (departmentSettings) {
            log.debug('Using department-level settings', { 
                employeeId, 
                departmentId: employee.department_id,
                settingsId: departmentSettings.id,
                date
            });
            return {
                settings: departmentSettings,
                source: 'department'
            };
        }

        // Step 4: Fall back to organization-level settings
        // Note: Organization ID is typically 1 (default)
        const organizationSettings = getSettingsByTarget('organization', 1, date);
        if (organizationSettings) {
            log.debug('Using organization-level settings', { 
                employeeId, 
                settingsId: organizationSettings.id,
                date
            });
            return {
                settings: organizationSettings,
                source: 'organization'
            };
        }

        // No settings found at any level
        log.warn('No missing time settings found at any level', { employeeId, date });
        return null;

    } catch (error) {
        log.error('Error getting effective missing time settings', { employeeId, date, error });
        return null;
    }
}

// =============================================================================
// MISSING TIME RESOLUTION FUNCTIONS
// =============================================================================

/**
 * Handle Type 1 missing time: Full Absent
 * When check-in or check-out is missing, treat as full day absent
 * Full work time is counted as late minutes
 * 
 * @param checkIn - Original check-in time (may be null)
 * @param checkOut - Original check-out time (may be null)
 * @param schedule - Effective work schedule for the day
 * @returns Resolved missing time result
 */
function handleType1(
    checkIn: string | null,
    checkOut: string | null,
    schedule: ScheduleInfo
): ResolvedMissingTime {
    // Calculate full work day duration
    const workStartMinutes = timeToMinutes(schedule.workStart);
    const workEndMinutes = timeToMinutes(schedule.workEnd);
    const fullWorkDayMinutes = workEndMinutes - workStartMinutes;

    // Determine missing type
    let missingType: MissingType | null = null;
    let lateMinutes = 0;
    let earlyLeaveMinutes = 0;
    let notAtWorkplaceMinutes = 0;

    if (!checkIn && !checkOut) {
        // Both missing: entire day not worked
        missingType = 'both';
        lateMinutes = fullWorkDayMinutes; // Full day counted as late
        notAtWorkplaceMinutes = fullWorkDayMinutes;
        
        log.debug('Type 1: Both times missing - full day absent', { 
            fullWorkDayMinutes 
        });
    } else if (!checkIn) {
        // Only check-in missing: count from work start to check-out as late
        missingType = 'check_in';
        if (checkOut) {
            const checkOutMinutes = timeToMinutes(checkOut);
            // Late = from work start to when they checked out (entire morning absent)
            lateMinutes = Math.max(0, checkOutMinutes - workStartMinutes);
        } else {
            lateMinutes = fullWorkDayMinutes;
        }
        
        log.debug('Type 1: Check-in missing', { lateMinutes });
    } else if (!checkOut) {
        // Only check-out missing: count from check-in to work end as early leave
        missingType = 'check_out';
        const checkInMinutes = timeToMinutes(checkIn);
        // Early leave = from their check-in to work end (entire afternoon absent)
        earlyLeaveMinutes = Math.max(0, workEndMinutes - checkInMinutes);
        
        log.debug('Type 1: Check-out missing', { earlyLeaveMinutes });
    }

    return {
        checkIn,
        checkOut,
        isAutoFilled: false,
        missingType,
        lateMinutes,
        earlyLeaveMinutes,
        notAtWorkplaceMinutes,
        totalWorkMinutes: 0 // No work counted when using Type 1 with missing times
    };
}

/**
 * Handle Type 2 missing time: Auto-fill with penalty
 * Missing times are filled with schedule time ± penalty minutes
 * 
 * Auto-fill rules:
 * - Missing check-in: schedule.workStart + penaltyMinutes
 * - Missing check-out: schedule.workEnd - penaltyMinutes
 * - Both missing: full day marked as "not at workplace"
 * 
 * @param checkIn - Original check-in time (may be null)
 * @param checkOut - Original check-out time (may be null)
 * @param schedule - Effective work schedule for the day
 * @param settings - Missing time settings with penalty minutes
 * @returns Resolved missing time result with auto-filled values
 */
function handleType2(
    checkIn: string | null,
    checkOut: string | null,
    schedule: ScheduleInfo,
    settings: MissingTimeSettings
): ResolvedMissingTime {
    // Calculate schedule times
    const workStartMinutes = timeToMinutes(schedule.workStart);
    const workEndMinutes = timeToMinutes(schedule.workEnd);
    const fullWorkDayMinutes = workEndMinutes - workStartMinutes;

    // Initialize result
    let resolvedCheckIn = checkIn;
    let resolvedCheckOut = checkOut;
    let missingType: MissingType | null = null;
    let lateMinutes = 0;
    let earlyLeaveMinutes = 0;
    let notAtWorkplaceMinutes = 0;
    let isAutoFilled = false;

    if (!checkIn && !checkOut) {
        // Both missing: mark as "not at workplace" for full day
        missingType = 'both';
        notAtWorkplaceMinutes = fullWorkDayMinutes;
        isAutoFilled = true;
        
        // Auto-fill with penalized times
        resolvedCheckIn = minutesToTime(workStartMinutes + settings.missingCheckinPenaltyMinutes);
        resolvedCheckOut = minutesToTime(workEndMinutes - settings.missingCheckoutPenaltyMinutes);
        
        // Calculate violations based on auto-filled times
        lateMinutes = settings.missingCheckinPenaltyMinutes;
        earlyLeaveMinutes = settings.missingCheckoutPenaltyMinutes;
        
        log.debug('Type 2: Both times missing - not at workplace', { 
            resolvedCheckIn,
            resolvedCheckOut,
            notAtWorkplaceMinutes,
            lateMinutes,
            earlyLeaveMinutes
        });
    } else if (!checkIn) {
        // Only check-in missing: auto-fill with penalty
        missingType = 'check_in';
        isAutoFilled = true;
        
        // Check-in = work start + penalty minutes
        resolvedCheckIn = minutesToTime(workStartMinutes + settings.missingCheckinPenaltyMinutes);
        lateMinutes = settings.missingCheckinPenaltyMinutes;
        
        // Calculate early leave if checked out before work end
        if (checkOut) {
            const checkOutMinutes = timeToMinutes(checkOut);
            earlyLeaveMinutes = Math.max(0, workEndMinutes - checkOutMinutes);
        }
        
        log.debug('Type 2: Check-in missing - auto-filled', { 
            resolvedCheckIn, 
            lateMinutes 
        });
    } else if (!checkOut) {
        // Only check-out missing: auto-fill with penalty
        missingType = 'check_out';
        isAutoFilled = true;
        
        // Check-out = work end - penalty minutes
        resolvedCheckOut = minutesToTime(workEndMinutes - settings.missingCheckoutPenaltyMinutes);
        earlyLeaveMinutes = settings.missingCheckoutPenaltyMinutes;
        
        // Calculate late if checked in after work start
        const checkInMinutes = timeToMinutes(checkIn);
        const lateThreshold = workStartMinutes + schedule.lateTolerance;
        lateMinutes = Math.max(0, checkInMinutes - lateThreshold);
        
        log.debug('Type 2: Check-out missing - auto-filled', { 
            resolvedCheckOut, 
            earlyLeaveMinutes 
        });
    }

    // Calculate total work minutes from resolved times
    const totalWorkMinutes = calculateWorkMinutes(resolvedCheckIn, resolvedCheckOut);

    return {
        checkIn: resolvedCheckIn,
        checkOut: resolvedCheckOut,
        isAutoFilled,
        missingType,
        lateMinutes,
        earlyLeaveMinutes,
        notAtWorkplaceMinutes,
        totalWorkMinutes
    };
}

// =============================================================================
// MAIN RESOLUTION FUNCTION
// =============================================================================

/**
 * Resolve missing time for an employee based on their effective settings
 * Main entry point for missing time resolution
 * 
 * This function:
 * 1. Gets effective settings for the employee (priority-based)
 * 2. Determines if this is a work day
 * 3. Applies appropriate handling based on settings type
 * 4. Returns resolved times with all calculated values
 * 
 * @param employeeId - Employee ID
 * @param date - Date string (YYYY-MM-DD)
 * @param checkIn - Original check-in time (may be null)
 * @param checkOut - Original check-out time (may be null)
 * @param schedule - Effective schedule for the day
 * @returns Resolved missing time result
 */
export function resolveMissingTime(
    employeeId: number,
    date: string,
    checkIn: string | null,
    checkOut: string | null,
    schedule: ScheduleInfo
): ResolvedMissingTime {
    try {
        // If not a work day, no resolution needed
        if (!schedule.isWorkDay) {
            log.debug('Not a work day - no resolution needed', { employeeId, date });
            return {
                checkIn,
                checkOut,
                isAutoFilled: false,
                missingType: null,
                lateMinutes: 0,
                earlyLeaveMinutes: 0,
                notAtWorkplaceMinutes: 0,
                totalWorkMinutes: calculateWorkMinutes(checkIn, checkOut)
            };
        }

        // If both times are present, calculate normally
        if (checkIn && checkOut) {
            const checkInMinutes = timeToMinutes(checkIn);
            const checkOutMinutes = timeToMinutes(checkOut);
            const workStartMinutes = timeToMinutes(schedule.workStart);
            const workEndMinutes = timeToMinutes(schedule.workEnd);
            
            // Calculate late minutes (with tolerance)
            const lateThreshold = workStartMinutes + schedule.lateTolerance;
            const lateMinutes = Math.max(0, checkInMinutes - lateThreshold);
            
            // Calculate early leave minutes
            const earlyLeaveMinutes = Math.max(0, workEndMinutes - checkOutMinutes);
            
            return {
                checkIn,
                checkOut,
                isAutoFilled: false,
                missingType: null,
                lateMinutes,
                earlyLeaveMinutes,
                notAtWorkplaceMinutes: 0,
                totalWorkMinutes: calculateWorkMinutes(checkIn, checkOut)
            };
        }

        // Get effective settings for this employee on this date
        const effectiveSettings = getEffectiveMissingTimeSettings(employeeId, date);
        
        if (!effectiveSettings) {
            // No settings found - use default Type 1 behavior
            log.warn('No settings found - using default Type 1', { employeeId, date });
            return handleType1(checkIn, checkOut, schedule);
        }

        const { settings, source } = effectiveSettings;
        
        log.debug('Resolving missing time', {
            employeeId,
            date,
            checkIn,
            checkOut,
            handlingType: settings.handlingType,
            source
        });

        // Apply appropriate handling based on type
        if (settings.handlingType === 1) {
            return handleType1(checkIn, checkOut, schedule);
        } else {
            return handleType2(checkIn, checkOut, schedule, settings);
        }

    } catch (error) {
        log.error('Error resolving missing time', { employeeId, date, error });
        
        // Return safe default on error
        return {
            checkIn,
            checkOut,
            isAutoFilled: false,
            missingType: null,
            lateMinutes: 0,
            earlyLeaveMinutes: 0,
            notAtWorkplaceMinutes: 0,
            totalWorkMinutes: 0
        };
    }
}

// =============================================================================
// SETTINGS MANAGEMENT FUNCTIONS (CRUD)
// =============================================================================

/**
 * Create new missing time settings
 * 
 * @param settings - Settings to create (without id and timestamps)
 * @returns Created settings with id, or null on error
 */
export function createMissingTimeSettings(
    settings: Omit<MissingTimeSettings, 'id' | 'createdAt' | 'updatedAt'>
): MissingTimeSettings | null {
    try {
        const db = getDatabase();
        
        const stmt = db.prepare(`
            INSERT INTO missing_time_settings (
                target_type, target_id, handling_type,
                missing_checkin_penalty_minutes, missing_checkout_penalty_minutes,
                is_active, valid_from
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            settings.targetType,
            settings.targetId,
            settings.handlingType,
            settings.missingCheckinPenaltyMinutes,
            settings.missingCheckoutPenaltyMinutes,
            settings.isActive ? 1 : 0,
            settings.validFrom || null
        );
        
        log.info('Created missing time settings', { 
            id: result.lastInsertRowid, 
            targetType: settings.targetType,
            targetId: settings.targetId,
            validFrom: settings.validFrom
        });
        
        // Get the newly created settings by ID
        const getStmt = db.prepare('SELECT * FROM missing_time_settings WHERE id = ?');
        const row = getStmt.get(result.lastInsertRowid) as MissingTimeSettingsRow | undefined;
        return row ? rowToSettings(row) : null;
        
    } catch (error) {
        log.error('Error creating missing time settings', { settings, error });
        return null;
    }
}

/**
 * Update existing missing time settings
 * 
 * @param id - Settings ID to update
 * @param updates - Fields to update
 * @returns Updated settings, or null on error
 */
export function updateMissingTimeSettings(
    id: number,
    updates: Partial<Omit<MissingTimeSettings, 'id' | 'createdAt' | 'updatedAt'>>
): MissingTimeSettings | null {
    try {
        const db = getDatabase();
        
        // Build dynamic update query
        const updateFields: string[] = [];
        const values: (string | number)[] = [];
        
        if (updates.handlingType !== undefined) {
            updateFields.push('handling_type = ?');
            values.push(updates.handlingType);
        }
        if (updates.missingCheckinPenaltyMinutes !== undefined) {
            updateFields.push('missing_checkin_penalty_minutes = ?');
            values.push(updates.missingCheckinPenaltyMinutes);
        }
        if (updates.missingCheckoutPenaltyMinutes !== undefined) {
            updateFields.push('missing_checkout_penalty_minutes = ?');
            values.push(updates.missingCheckoutPenaltyMinutes);
        }
        if (updates.isActive !== undefined) {
            updateFields.push('is_active = ?');
            values.push(updates.isActive ? 1 : 0);
        }
        if (updates.validFrom !== undefined) {
            updateFields.push('valid_from = ?');
            values.push(updates.validFrom || '');
        }
        
        if (updateFields.length === 0) {
            log.warn('No fields to update', { id });
            return null;
        }
        
        // Add updated_at timestamp
        updateFields.push("updated_at = datetime('now')");
        
        // Add id to values
        values.push(id);
        
        const stmt = db.prepare(`
            UPDATE missing_time_settings
            SET ${updateFields.join(', ')}
            WHERE id = ?
        `);
        
        stmt.run(...values);
        
        log.info('Updated missing time settings', { id, updates });
        
        // Return updated settings
        const selectStmt = db.prepare('SELECT * FROM missing_time_settings WHERE id = ?');
        const row = selectStmt.get(id) as MissingTimeSettingsRow | undefined;
        
        return row ? rowToSettings(row) : null;
        
    } catch (error) {
        log.error('Error updating missing time settings', { id, updates, error });
        return null;
    }
}

/**
 * Delete missing time settings
 * 
 * @param id - Settings ID to delete
 * @returns true if deleted successfully, false otherwise
 */
export function deleteMissingTimeSettings(id: number): boolean {
    try {
        const db = getDatabase();
        
        const stmt = db.prepare('DELETE FROM missing_time_settings WHERE id = ?');
        const result = stmt.run(id);
        
        const deleted = result.changes > 0;
        
        if (deleted) {
            log.info('Deleted missing time settings', { id });
        } else {
            log.warn('Settings not found for deletion', { id });
        }
        
        return deleted;
        
    } catch (error) {
        log.error('Error deleting missing time settings', { id, error });
        return false;
    }
}

/**
 * Get all missing time settings
 * 
 * @param targetType - Optional filter by target type
 * @returns Array of all settings
 */
export function getAllMissingTimeSettings(
    targetType?: ScheduleTargetType
): MissingTimeSettings[] {
    try {
        const db = getDatabase();
        
        let query = 'SELECT * FROM missing_time_settings WHERE is_active = 1';
        const params: string[] = [];
        
        if (targetType) {
            query += ' AND target_type = ?';
            params.push(targetType);
        }
        
        query += ' ORDER BY target_type, target_id';
        
        const stmt = db.prepare(query);
        const rows = (targetType ? stmt.all(targetType) : stmt.all()) as MissingTimeSettingsRow[];
        
        return rows.map(rowToSettings);
        
    } catch (error) {
        log.error('Error getting all missing time settings', { targetType, error });
        return [];
    }
}

/**
 * Get missing time settings with entity names for display
 * Joins with employees/departments/organizations tables
 * 
 * @returns Settings with entity names
 */
export function getMissingTimeSettingsWithNames(): Array<MissingTimeSettings & { targetName: string }> {
    try {
        const db = getDatabase();
        
        const stmt = db.prepare(`
            SELECT 
                mts.*,
                CASE 
                    WHEN mts.target_type = 'employee' THEN e.name
                    WHEN mts.target_type = 'department' THEN d.name
                    WHEN mts.target_type = 'organization' THEN o.name
                    ELSE 'Unknown'
                END as target_name
            FROM missing_time_settings mts
            LEFT JOIN employees e ON mts.target_type = 'employee' AND mts.target_id = e.id
            LEFT JOIN departments d ON mts.target_type = 'department' AND mts.target_id = d.id
            LEFT JOIN organizations o ON mts.target_type = 'organization' AND mts.target_id = o.id
            WHERE mts.is_active = 1
            ORDER BY 
                CASE mts.target_type 
                    WHEN 'organization' THEN 1 
                    WHEN 'department' THEN 2 
                    WHEN 'employee' THEN 3 
                END,
                target_name
        `);
        
        const rows = stmt.all() as (MissingTimeSettingsRow & { target_name: string })[];
        
        return rows.map(row => ({
            ...rowToSettings(row),
            targetName: row.target_name
        }));
        
    } catch (error) {
        log.error('Error getting missing time settings with names', { error });
        return [];
    }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
    resolveMissingTime,
    getEffectiveMissingTimeSettings,
    getSettingsByTarget,
    createMissingTimeSettings,
    updateMissingTimeSettings,
    deleteMissingTimeSettings,
    getAllMissingTimeSettings,
    getMissingTimeSettingsWithNames
};
