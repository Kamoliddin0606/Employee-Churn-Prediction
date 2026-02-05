/**
 * =============================================================================
 * HR Analytics Backend - Type Definitions
 * =============================================================================
 * 
 * Central type definitions for all database entities and API responses.
 * These types ensure type safety across the entire backend application.
 * 
 * @module models/types
 * @author HR Analytics Team
 * @version 1.0.0
 */

// =============================================================================
// DATABASE ENTITIES
// =============================================================================

/**
 * Organization entity
 * Represents the top-level organization with default work schedule
 */
export interface Organization {
    id: number;
    name: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * Department entity
 * Organizational unit containing employees
 */
export interface Department {
    id: number;
    name: string;
    organizationId: number;
    createdAt: string;
    updatedAt: string;
}

/**
 * Employee entity
 * Individual worker with attendance and time records
 */
export interface Employee {
    id: number;
    externalId: string;      // ID from Excel file (e.g., "03765")
    name: string;
    departmentId: number;
    createdAt: string;
    updatedAt: string;
}

/**
 * Work schedule target types
 * Determines which entity the schedule applies to
 */
export type ScheduleTargetType = 'organization' | 'department' | 'employee';

/**
 * WorkSchedule entity
 * Defines work hours and work days for organization, department, or employee
 * 
 * Priority: Employee > Department > Organization
 * 
 * @property workDays - JSON array of ISO weekday numbers [1-7]
 *                      1=Monday, 2=Tuesday, ..., 7=Sunday
 *                      Example: [1,2,3,4,5] = Monday-Friday
 */
export interface WorkSchedule {
    id: number;
    targetType: ScheduleTargetType;
    targetId: number;        // ID of organization, department, or employee
    workStart: string;       // Format: "HH:MM" (e.g., "09:00")
    workEnd: string;         // Format: "HH:MM" (e.g., "18:00")
    lateTolerance: number;   // Minutes of grace period (e.g., 5)
    workDays: number[];      // Array of weekday numbers [1-7]
    validFrom: string | null; // ISO date or null for no start limit
    validTo: string | null;   // ISO date or null for no end limit
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

/**
 * Schedule exception types
 */
export type ExceptionType = 'holiday' | 'sick' | 'special' | 'off';

/**
 * ScheduleException entity
 * Temporary override for specific dates and employees
 * Takes highest priority in schedule resolution
 */
export interface ScheduleException {
    id: number;
    type: ExceptionType;
    employeeIds: number[];   // Array of employee IDs affected
    date: string;            // ISO date (YYYY-MM-DD)
    workStart: string | null; // null = day off
    workEnd: string | null;   // null = day off
    reason: string;
    createdAt: string;
}

/**
 * TimeRecord entity
 * Daily check-in/check-out record from terminal
 */
export interface TimeRecord {
    id: number;
    employeeId: number;
    date: string;            // ISO date (YYYY-MM-DD)
    checkIn: string | null;  // Format: "HH:MM" or null if not checked in
    checkOut: string | null; // Format: "HH:MM" or null if not checked out
    lateMinutes: number;     // Minutes late (0 if on time or early)
    earlyLeaveMinutes: number; // Minutes early (0 if on time or late)
    totalWorkMinutes: number; // Total minutes worked
    importId: number;        // Reference to import history
    createdAt: string;
}

/**
 * ViolationSummary entity
 * Monthly aggregated violation statistics per employee
 */
export interface ViolationSummary {
    id: number;
    employeeId: number;
    year: number;
    month: number;           // 1-12
    totalLateMinutes: number;
    totalEarlyLeaveMinutes: number;
    lateCount: number;       // Number of days late
    earlyLeaveCount: number; // Number of days left early
    absentCount: number;     // Number of absent days
    violationCount: number;  // Total violations (late + early + absent)
    calculationLevel: CalculationLevel;
    calculatedAt: string;
}

/**
 * Calculation level for violation statistics
 */
export type CalculationLevel = 'organization' | 'department' | 'employee' | 'full';

/**
 * AttendanceRecord entity (from Monthly Details Excel)
 * Daily attendance status code
 */
export interface AttendanceRecord {
    id: number;
    employeeId: number;
    date: string;            // ISO date (YYYY-MM-DD)
    statusCode: AttendanceStatusCode;
    isViolation: boolean;
    importId: number;
    createdAt: string;
}

/**
 * Valid attendance status codes
 * W = Well (on time)
 * L = Late
 * E = Early leave
 * LE = Late + Early leave
 * A = Absent
 * NS = No Schedule (not a work day)
 * H = Holiday
 */
export type AttendanceStatusCode = 'W' | 'L' | 'E' | 'LE' | 'A' | 'NS' | 'H';

/**
 * ImportHistory entity
 * Tracks all Excel file imports for auditing and rollback
 */
export interface ImportHistory {
    id: number;
    fileName: string;
    fileType: 'details' | 'checkinout';
    importDate: string;
    recordsCount: number;
    newEmployees: number;
    updatedRecords: number;
    errors: string[];
    createdAt: string;
}

/**
 * CalculationSettings entity
 * Stores user preference for violation calculation level
 */
export interface CalculationSettings {
    id: number;
    level: CalculationLevel;
    updatedAt: string;
}

/**
 * EmployeeCompensation entity
 * Monthly KPI and salary data for penalty calculations
 * 
 * Used to calculate final salary after deducting penalties based on violations.
 * Each employee can have one compensation record per month.
 * 
 * @property baseSalary - Fixed monthly salary without KPI
 * @property kpiAmount - Monthly KPI bonus amount
 * @property totalSalary - Auto-calculated: baseSalary + kpiAmount
 * @property bonus - Additional bonuses (optional)
 * @property deductions - Manual deductions (optional)
 */
export interface EmployeeCompensation {
    id: number;
    employeeId: number;
    year: number;
    month: number;           // 1-12
    baseSalary: number;      // KPIsiz maosh
    kpiAmount: number;       // KPI qiymati
    totalSalary: number;     // Auto-calculated: baseSalary + kpiAmount
    bonus: number;           // Qo'shimcha bonus
    deductions: number;      // Chegirmalar
    notes: string | null;    // Izohlar
    createdAt: string;
    updatedAt: string;
}

// =============================================================================
// API TYPES
// =============================================================================

/**
 * Effective schedule result
 * Returned by schedule resolver after applying priority logic
 */
export interface EffectiveSchedule {
    workStart: string;
    workEnd: string;
    lateTolerance: number;
    isWorkDay: boolean;
    source: ScheduleTargetType | 'exception';
    sourceId: number;
}

/**
 * Parsed time value from Excel Check In&Out
 */
export interface ParsedTimeValue {
    checkIn: string | null;
    checkOut: string | null;
    isValid: boolean;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
