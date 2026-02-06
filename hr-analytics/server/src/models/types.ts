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
    isActive: boolean;       // Active/Inactive status
    deactivatedAt: string | null;    // When employee was deactivated
    deactivationReason: string | null; // Reason for deactivation
    createdAt: string;
    updatedAt: string;
}

/**
 * Work schedule target types
 * Determines which entity the schedule applies to
 */
export type ScheduleTargetType = 'organization' | 'department' | 'employee';

// =============================================================================
// MISSING TIME HANDLING TYPES
// =============================================================================

/**
 * Missing time type indicator
 * Tracks which time value was originally missing before auto-fill
 * 
 * @value 'check_in' - Kirish vaqti yo'q edi
 * @value 'check_out' - Chiqish vaqti yo'q edi
 * @value 'both' - Ikkala vaqt ham yo'q edi (ish joyida bo'lmagan)
 */
export type MissingType = 'check_in' | 'check_out' | 'both';

/**
 * Missing time handling type
 * Defines how missing check-in/check-out times should be processed
 * 
 * @value 1 - Yo'q vaqt = to'liq ishlanmagan kun (Full Absent)
 *            Kirish/chiqish yo'q bo'lsa, to'liq ish vaqti kech qolish sifatida yoziladi
 * @value 2 - Avtomatik to'ldirish (Auto-fill with penalty)
 *            Kirish yo'q: jadval + penalty minutes
 *            Chiqish yo'q: jadval - penalty minutes
 */
export type MissingTimeHandlingType = 1 | 2;

/**
 * MissingTimeSettings entity
 * Configures how missing check-in/check-out times are handled
 * 
 * Priority resolution: Employee > Department > Organization
 * Settings cascade down - employee settings override department,
 * department settings override organization
 * 
 * @property targetType - Level at which setting applies
 * @property targetId - ID of the target entity (org_id, dept_id, or employee_id)
 * @property handlingType - How to handle missing times (1 or 2)
 * @property missingCheckinPenaltyMinutes - Minutes to add when check_in missing (Type 2)
 * @property missingCheckoutPenaltyMinutes - Minutes to subtract when check_out missing (Type 2)
 */
export interface MissingTimeSettings {
    id: number;
    targetType: ScheduleTargetType;
    targetId: number;
    handlingType: MissingTimeHandlingType;
    missingCheckinPenaltyMinutes: number;  // Type 2: kirish yo'q bo'lsa qo'shiladigan minut
    missingCheckoutPenaltyMinutes: number; // Type 2: chiqish yo'q bo'lsa ayiriladigan minut
    isActive: boolean;
    validFrom: string | null;              // Sozlama qachondan boshlab amal qiladi (NULL = cheksiz o'tmishdan)
    createdAt: string;
    updatedAt: string;
}

/**
 * Resolved missing time result
 * Contains the processed time values after applying missing time rules
 * 
 * @property checkIn - Resolved check-in time (may be auto-filled)
 * @property checkOut - Resolved check-out time (may be auto-filled)
 * @property isAutoFilled - True if any time was auto-filled
 * @property missingType - Which time was originally missing (null if none)
 * @property lateMinutes - Calculated late minutes
 * @property earlyLeaveMinutes - Calculated early leave minutes
 * @property notAtWorkplaceMinutes - Minutes not at workplace (Type 2, both missing)
 */
export interface ResolvedMissingTime {
    checkIn: string | null;
    checkOut: string | null;
    isAutoFilled: boolean;
    missingType: MissingType | null;
    lateMinutes: number;
    earlyLeaveMinutes: number;
    notAtWorkplaceMinutes: number;
    totalWorkMinutes: number;
}

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
 * 
 * Extended fields for missing time handling:
 * - isAutoFilled: true if check_in or check_out was auto-filled based on settings
 * - missingType: which time was originally missing ('check_in', 'check_out', 'both', or null)
 * - originalCheckIn/Out: preserves the original NULL value before auto-fill
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
    // Missing time handling fields
    isAutoFilled: boolean;   // True if time was auto-filled by missing time rules
    missingType: MissingType | null; // Which time was originally missing
    originalCheckIn: string | null;  // Original check_in before auto-fill (preserves NULL)
    originalCheckOut: string | null; // Original check_out before auto-fill (preserves NULL)
}

/**
 * ViolationSummary entity
 * Monthly aggregated violation statistics per employee
 * 
 * Extended fields for not-at-workplace tracking:
 * - notAtWorkplaceCount: Number of days when both check_in and check_out were missing
 * - notAtWorkplaceMinutes: Total minutes of not-at-workplace time
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
    violationCount: number;  // Total violations (late + early + absent + notAtWorkplace)
    calculationLevel: CalculationLevel;
    calculatedAt: string;
    // Not-at-workplace tracking (Type 2 settings)
    notAtWorkplaceCount: number;   // Days when both check_in and check_out missing
    notAtWorkplaceMinutes: number; // Total minutes of not-at-workplace time
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
// PENALTY SYSTEM TYPES
// =============================================================================

/**
 * Penalty type enumeration
 * Defines the type of penalty applied based on violation count
 */
export type PenaltyType = 'fine' | 'kpi_zero' | 'termination';

/**
 * PenaltyRule entity
 * Configurable penalty rules per month
 * 
 * Rules are applied based on violation level (1st, 2nd, 3rd late, etc.)
 * Each month can have different penalty amounts and thresholds
 * 
 * @property level - Violation count threshold (1, 2, 3, 4, 5, 6+)
 * @property penaltyType - Type of penalty (fine, kpi_zero, termination)
 * @property fineAmount - Monetary penalty amount (for 'fine' type)
 * @property kpiMonths - Number of months KPI zeroed (for 'kpi_zero' type)
 */
export interface PenaltyRule {
    id: number;
    year: number;
    month: number;           // 1-12
    level: number;           // 1, 2, 3, 4, 5, 6+
    penaltyType: PenaltyType;
    fineAmount: number;      // Jarima summasi (so'm)
    kpiMonths: number;       // KPI nollanadigan oylar soni
    description: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

/**
 * EmployeePenalty entity
 * Applied penalties per employee per month
 * 
 * Calculated based on ViolationSummary.lateCount and PenaltyRules
 * 
 * @property lateCount - Number of times late this month
 * @property totalFine - Total monetary penalty amount
 * @property kpiZeroed - Whether KPI was zeroed this month
 * @property kpiZeroedMonths - Number of months KPI affected
 * @property terminationRecommended - Whether termination is recommended
 */
export interface EmployeePenalty {
    id: number;
    employeeId: number;
    year: number;
    month: number;           // 1-12
    lateCount: number;       // Kech qolishlar soni
    earlyLeaveCount: number; // Erta ketishlar soni
    absentCount: number;     // Kelmaganlar soni
    totalViolations: number; // Jami buzilishlar (late + early + absent)
    totalFine: number;       // Jami jarima summasi
    kpiZeroed: boolean;      // KPI nollandi-mi?
    kpiZeroedMonths: number; // Necha oylik KPI nollandi
    terminationRecommended: boolean; // Ishdan bo'shatish tavsiyasi
    notes: string | null;
    calculatedAt: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * KpiZeroRecord entity
 * Tracks KPI zeroing across months for cross-month penalties
 * 
 * When 5th late occurs in January, KPI is zeroed for Jan AND Feb.
 * This table tracks which months were affected and why.
 * 
 * @property targetYear/Month - The month where KPI is zeroed
 * @property sourceYear/Month - The month that caused the zeroing
 */
export interface KpiZeroRecord {
    id: number;
    employeeId: number;
    targetYear: number;      // KPI nollanadigan yil
    targetMonth: number;     // KPI nollanadigan oy
    sourceYear: number;      // Sabab bo'lgan yil
    sourceMonth: number;     // Sabab bo'lgan oy
    reason: string;          // Nollash sababi
    createdAt: string;
}

/**
 * PenaltyDetail entity
 * Itemized penalty breakdown per employee
 * 
 * Shows each individual penalty applied (1st late fine, 2nd late fine, etc.)
 */
export interface PenaltyDetail {
    id: number;
    penaltyId: number;       // Reference to employee_penalties
    level: number;           // Which violation level (1, 2, 3...)
    penaltyType: PenaltyType;
    amount: number;          // Fine amount or 0 for non-fine penalties
    description: string | null;
    createdAt: string;
}

/**
 * Penalty calculation result
 * Returned by PenaltyService after calculating penalties
 * 
 * Now includes breakdown of all violation types:
 * - lateCount: number of late arrivals
 * - earlyLeaveCount: number of early leaves
 * - absentCount: number of absences
 * - totalViolations: sum of all violations (used for penalty calculation)
 */
export interface PenaltyCalculationResult {
    employeeId: number;
    employeeName: string;
    year: number;
    month: number;
    lateCount: number;           // Kech kelishlar soni
    earlyLeaveCount: number;     // Erta ketishlar soni
    absentCount: number;         // Kelmaganlar soni
    totalViolations: number;     // Jami buzilishlar (late + early + absent)
    fines: Array<{ level: number; amount: number; description: string }>;
    totalFine: number;
    kpiZeroed: boolean;
    kpiZeroedMonths: number;
    terminationRecommended: boolean;
    preZeroedKpi: boolean;       // KPI was already zeroed from previous month
    kpiCarriedFromPrev: number;  // KPI months carried from previous month
    kpiAmount: number;           // Base KPI amount from employee_compensation
    kpiResult: number;           // Calculated KPI result after penalties
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
