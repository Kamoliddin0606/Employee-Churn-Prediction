/**
 * =============================================================================
 * HR Analytics Frontend - API Client Service
 * =============================================================================
 * 
 * Centralized API client for backend communication.
 * Provides typed methods for all API endpoints.
 * 
 * @module services/api
 * @author HR Analytics Team
 * @version 1.0.0
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Backend API base URL
 * Uses environment variable or defaults to localhost
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
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

/**
 * Employee from API
 */
export interface Employee {
    id: number;
    externalId: string;
    name: string;
    departmentId: number;
    departmentName?: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * Department from API
 */
export interface Department {
    id: number;
    name: string;
    organizationId: number;
    employeeCount?: number;
    createdAt: string;
    updatedAt: string;
}

/**
 * Work schedule from API
 */
export interface WorkSchedule {
    id: number;
    targetType: 'organization' | 'department' | 'employee';
    targetId: number;
    workStart: string;
    workEnd: string;
    lateTolerance: number;
    workDays: number[];
    validFrom: string | null;
    validTo: string | null;
    isActive: boolean;
}

/**
 * Schedule exception from API
 */
export interface ScheduleException {
    id: number;
    type: 'holiday' | 'sick' | 'special' | 'off';
    employeeIds: number[];
    date: string;
    workStart: string | null;
    workEnd: string | null;
    reason: string;
}

/**
 * Time record from API
 */
export interface TimeRecord {
    id: number;
    employeeId: number;
    employeeName: string;
    externalId: string;
    department: string;
    date: string;
    checkIn: string | null;
    checkOut: string | null;
    lateMinutes: number;
    earlyLeaveMinutes: number;
    totalWorkMinutes: number;
}

/**
 * Violation summary from API
 */
export interface ViolationSummary {
    id: number;
    employeeId: number;
    employeeName?: string;
    externalId?: string;
    department?: string;
    year: number;
    month: number;
    totalLateMinutes: number;
    totalEarlyLeaveMinutes: number;
    lateCount: number;
    earlyLeaveCount: number;
    absentCount: number;
    violationCount: number;
    calculationLevel: string;
    calculatedAt: string;
    // Not-at-workplace tracking (Type 2 settings)
    notAtWorkplaceCount?: number;   // Days when employee was not at workplace
    notAtWorkplaceMinutes?: number; // Total minutes of not-at-workplace time
}

/**
 * Import result from API
 */
export interface ImportResult {
    importId: number;
    newEmployees: number;
    updatedRecords: number;
    totalEmployees: number;
    dateColumns: number;
    fileType: 'details' | 'checkinout';
    warnings?: string[];
}

/**
 * Calculation level type
 */
export type CalculationLevel = 'organization' | 'department' | 'employee' | 'full';

/**
 * Employee compensation from API
 * Monthly KPI and salary data
 */
export interface EmployeeCompensation {
    id: number;
    employeeId: number;
    employeeName?: string;
    employeeExternalId?: string;
    departmentName?: string;
    year: number;
    month: number;
    baseSalary: number;
    kpiAmount: number;
    totalSalary: number;
    bonus: number;
    deductions: number;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

// =============================================================================
// HTTP HELPER
// =============================================================================

/**
 * Make HTTP request to API
 */
async function request<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
        });

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: data.error || `HTTP Error: ${response.status}`,
            };
        }

        return data as ApiResponse<T>;
    } catch (error) {
        console.error('API request failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Network error',
        };
    }
}

// =============================================================================
// EMPLOYEES API
// =============================================================================

export const employeesApi = {
    /**
     * Get all employees with pagination
     */
    async getAll(params?: {
        page?: number;
        limit?: number;
        departmentId?: number;
        search?: string;
    }): Promise<ApiResponse<PaginatedResponse<Employee>>> {
        const searchParams = new URLSearchParams();
        if (params?.page) searchParams.set('page', String(params.page));
        if (params?.limit) searchParams.set('limit', String(params.limit));
        if (params?.departmentId) searchParams.set('departmentId', String(params.departmentId));
        if (params?.search) searchParams.set('search', params.search);

        const query = searchParams.toString();
        return request(`/employees${query ? `?${query}` : ''}`);
    },

    /**
     * Get single employee by ID
     */
    async getById(id: number): Promise<ApiResponse<Employee>> {
        return request(`/employees/${id}`);
    },

    /**
     * Create new employee
     */
    async create(data: {
        externalId: string;
        name: string;
        departmentId: number;
    }): Promise<ApiResponse<Employee>> {
        return request('/employees', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    /**
     * Update employee
     */
    async update(id: number, data: {
        name?: string;
        departmentId?: number;
    }): Promise<ApiResponse<void>> {
        return request(`/employees/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    /**
     * Delete employee
     */
    async delete(id: number): Promise<ApiResponse<void>> {
        return request(`/employees/${id}`, {
            method: 'DELETE',
        });
    },
};

// =============================================================================
// DEPARTMENTS API
// =============================================================================

export const departmentsApi = {
    /**
     * Get all departments
     */
    async getAll(): Promise<ApiResponse<Department[]>> {
        return request('/departments');
    },

    /**
     * Get department by ID
     */
    async getById(id: number): Promise<ApiResponse<Department>> {
        return request(`/departments/${id}`);
    },

    /**
     * Create department
     */
    async create(data: { name: string }): Promise<ApiResponse<Department>> {
        return request('/departments', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    /**
     * Update department
     */
    async update(id: number, data: { name: string }): Promise<ApiResponse<void>> {
        return request(`/departments/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    /**
     * Delete department
     */
    async delete(id: number): Promise<ApiResponse<void>> {
        return request(`/departments/${id}`, {
            method: 'DELETE',
        });
    },
};

// =============================================================================
// SCHEDULES API
// =============================================================================

export const schedulesApi = {
    /**
     * Get all schedules
     */
    async getAll(params?: {
        targetType?: string;
        targetId?: number;
        active?: boolean;
    }): Promise<ApiResponse<WorkSchedule[]>> {
        const searchParams = new URLSearchParams();
        if (params?.targetType) searchParams.set('targetType', params.targetType);
        if (params?.targetId) searchParams.set('targetId', String(params.targetId));
        if (params?.active !== undefined) searchParams.set('active', String(params.active));

        const query = searchParams.toString();
        return request(`/schedules${query ? `?${query}` : ''}`);
    },

    /**
     * Get schedule by ID
     */
    async getById(id: number): Promise<ApiResponse<WorkSchedule>> {
        return request(`/schedules/${id}`);
    },

    /**
     * Create schedule
     */
    async create(data: {
        targetType: 'organization' | 'department' | 'employee';
        targetId: number;
        workStart?: string;
        workEnd?: string;
        lateTolerance?: number;
        workDays?: number[];
        validFrom?: string;
        validTo?: string;
    }): Promise<ApiResponse<WorkSchedule>> {
        return request('/schedules', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    /**
     * Update schedule
     */
    async update(id: number, data: {
        workStart?: string;
        workEnd?: string;
        lateTolerance?: number;
        workDays?: number[];
        isActive?: boolean;
        validFrom?: string;
        validTo?: string;
    }): Promise<ApiResponse<void>> {
        return request(`/schedules/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    /**
     * Delete schedule
     */
    async delete(id: number): Promise<ApiResponse<void>> {
        return request(`/schedules/${id}`, {
            method: 'DELETE',
        });
    },

    /**
     * Get exceptions
     */
    async getExceptions(params?: {
        from?: string;
        to?: string;
    }): Promise<ApiResponse<ScheduleException[]>> {
        const searchParams = new URLSearchParams();
        if (params?.from) searchParams.set('from', params.from);
        if (params?.to) searchParams.set('to', params.to);

        const query = searchParams.toString();
        return request(`/schedules/exceptions/list${query ? `?${query}` : ''}`);
    },

    /**
     * Create exception
     */
    async createException(data: {
        type: 'holiday' | 'sick' | 'special' | 'off';
        employeeIds: number[];
        date: string;
        workStart?: string;
        workEnd?: string;
        reason?: string;
    }): Promise<ApiResponse<ScheduleException>> {
        return request('/schedules/exceptions', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    /**
     * Delete exception
     */
    async deleteException(id: number): Promise<ApiResponse<void>> {
        return request(`/schedules/exceptions/${id}`, {
            method: 'DELETE',
        });
    },
};

// =============================================================================
// IMPORT API
// =============================================================================

export const importApi = {
    /**
     * Upload and import Excel file
     */
    async uploadFile(file: File): Promise<ApiResponse<ImportResult>> {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${API_BASE_URL}/import/upload`, {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();
            return data as ApiResponse<ImportResult>;
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Upload failed',
            };
        }
    },

    /**
     * Get import history
     */
    async getHistory(limit?: number): Promise<ApiResponse<unknown[]>> {
        const query = limit ? `?limit=${limit}` : '';
        return request(`/import/history${query}`);
    },

    /**
     * Get time records
     */
    async getTimeRecords(params?: {
        employeeId?: number;
        from?: string;
        to?: string;
    }): Promise<ApiResponse<TimeRecord[]>> {
        const searchParams = new URLSearchParams();
        if (params?.employeeId) searchParams.set('employeeId', String(params.employeeId));
        if (params?.from) searchParams.set('from', params.from);
        if (params?.to) searchParams.set('to', params.to);

        const query = searchParams.toString();
        return request(`/import/time-records${query ? `?${query}` : ''}`);
    },

    /**
     * Recalculate time records based on current schedules
     */
    async recalculate(params?: {
        dateFrom?: string;
        dateTo?: string;
    }): Promise<ApiResponse<{ updatedRecords: number }>> {
        return request('/import/recalculate', {
            method: 'POST',
            body: JSON.stringify(params || {}),
        });
    },
};

// =============================================================================
// SETTINGS API
// =============================================================================

export const settingsApi = {
    /**
     * Get calculation settings
     */
    async getCalculationSettings(): Promise<ApiResponse<{
        id: number;
        level: CalculationLevel;
        updatedAt: string;
    }>> {
        return request('/settings/calculation');
    },

    /**
     * Update calculation level
     */
    async updateCalculationLevel(level: CalculationLevel): Promise<ApiResponse<void>> {
        return request('/settings/calculation', {
            method: 'PUT',
            body: JSON.stringify({ level }),
        });
    },

    /**
     * Get organization info
     */
    async getOrganization(): Promise<ApiResponse<{
        id: number;
        name: string;
        schedule: {
            workStart: string;
            workEnd: string;
            lateTolerance: number;
            workDays: number[];
        };
    }>> {
        return request('/settings/organization');
    },

    /**
     * Update organization
     */
    async updateOrganization(data: { name: string }): Promise<ApiResponse<void>> {
        return request('/settings/organization', {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
};

// =============================================================================
// VIOLATIONS API
// =============================================================================

export const violationsApi = {
    /**
     * Get monthly violation summary
     */
    async getSummary(params?: {
        year?: number;
        month?: number;
    }): Promise<ApiResponse<{
        year: number;
        month: number;
        items: ViolationSummary[];
        total: number;
    }>> {
        const searchParams = new URLSearchParams();
        if (params?.year) searchParams.set('year', String(params.year));
        if (params?.month) searchParams.set('month', String(params.month));

        const query = searchParams.toString();
        return request(`/violations/summary${query ? `?${query}` : ''}`);
    },

    /**
     * Get employee violation summary
     */
    async getEmployeeSummary(
        employeeId: number,
        params?: { year?: number; month?: number }
    ): Promise<ApiResponse<ViolationSummary>> {
        const searchParams = new URLSearchParams();
        if (params?.year) searchParams.set('year', String(params.year));
        if (params?.month) searchParams.set('month', String(params.month));

        const query = searchParams.toString();
        return request(`/violations/employee/${employeeId}${query ? `?${query}` : ''}`);
    },

    /**
     * Calculate violations for a month
     */
    async calculate(params?: {
        year?: number;
        month?: number;
        level?: CalculationLevel;
    }): Promise<ApiResponse<{
        year: number;
        month: number;
        level: CalculationLevel;
        processedEmployees: number;
    }>> {
        return request('/violations/calculate', {
            method: 'POST',
            body: JSON.stringify(params || {}),
        });
    },

    /**
     * Get detailed violation report
     */
    async getReport(params?: {
        year?: number;
        month?: number;
        departmentId?: number;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
    }): Promise<ApiResponse<{
        year: number;
        month: number;
        employees: ViolationSummary[];
        totals: {
            totalLateMinutes: number;
            totalEarlyLeaveMinutes: number;
            lateCount: number;
            earlyLeaveCount: number;
            absentCount: number;
            violationCount: number;
            notAtWorkplaceCount?: number;
            notAtWorkplaceMinutes?: number;
        };
        employeeCount: number;
    }>> {
        const searchParams = new URLSearchParams();
        if (params?.year) searchParams.set('year', String(params.year));
        if (params?.month) searchParams.set('month', String(params.month));
        if (params?.departmentId) searchParams.set('departmentId', String(params.departmentId));
        if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
        if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);

        const query = searchParams.toString();
        return request(`/violations/report${query ? `?${query}` : ''}`);
    },
};

// =============================================================================
// COMPENSATION API
// =============================================================================

/**
 * Compensation API client
 * Handles employee KPI and salary data management
 */
export const compensationApi = {
    /**
     * Download Excel template for compensation import
     */
    async downloadTemplate(): Promise<void> {
        try {
            const response = await fetch(`${API_BASE_URL}/compensation/template`);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'KPI_Maosh_Shablon.xlsx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to download template:', error);
            throw error;
        }
    },

    /**
     * Import compensation data from Excel file
     * 
     * @param file - Excel file
     * @param year - Target year
     * @param month - Target month (1-12)
     */
    async import(file: File, year: number, month: number): Promise<ApiResponse<{
        imported: number;
        updated: number;
        errors: string[];
    }>> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('year', String(year));
        formData.append('month', String(month));

        try {
            const response = await fetch(`${API_BASE_URL}/compensation/import`, {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    error: data.error || `HTTP Error: ${response.status}`,
                };
            }

            return data;
        } catch (error) {
            console.error('Import failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Network error',
            };
        }
    },

    /**
     * Get compensation records with optional filtering
     * 
     * @param params - Filter parameters (year, month)
     */
    async getAll(params?: {
        year?: number;
        month?: number;
    }): Promise<ApiResponse<EmployeeCompensation[]>> {
        const searchParams = new URLSearchParams();
        if (params?.year) searchParams.set('year', String(params.year));
        if (params?.month) searchParams.set('month', String(params.month));

        const query = searchParams.toString();
        return request(`/compensation${query ? `?${query}` : ''}`);
    },

    /**
     * Update a compensation record
     * 
     * @param id - Compensation record ID
     * @param data - Updated data
     */
    async update(id: number, data: {
        baseSalary: number;
        kpiAmount: number;
        notes?: string;
    }): Promise<ApiResponse<void>> {
        return request(`/compensation/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    /**
     * Delete a compensation record
     * 
     * @param id - Compensation record ID
     */
    async delete(id: number): Promise<ApiResponse<void>> {
        return request(`/compensation/${id}`, {
            method: 'DELETE',
        });
    },
};

// =============================================================================
// MISSING TIME SETTINGS API
// =============================================================================

/**
 * Missing time settings target type
 */
export type MissingTimeTargetType = 'organization' | 'department' | 'employee';

/**
 * Missing time handling type
 * 1 = Full absent (yo'q vaqt = to'liq ishlanmagan kun)
 * 2 = Auto-fill with penalty (avtomatik to'ldirish)
 */
export type MissingTimeHandlingType = 1 | 2;

/**
 * Missing time settings from API
 */
export interface MissingTimeSettings {
    id: number;
    targetType: MissingTimeTargetType;
    targetId: number;
    handlingType: MissingTimeHandlingType;
    missingCheckinPenaltyMinutes: number;
    missingCheckoutPenaltyMinutes: number;
    isActive: boolean;
    validFrom: string | null;  // Sozlama qachondan boshlab amal qiladi (YYYY-MM-DD)
    createdAt: string;
    updatedAt: string;
}

/**
 * Available target for missing time settings
 */
export interface MissingTimeTarget {
    id: number;
    name: string;
    hasSettings: boolean;
    settingsId: number | null;
    handlingType: number | null;
    organizationName?: string;
    departmentName?: string;
    externalId?: string;
}

/**
 * Available targets response
 */
export interface AvailableTargetsResponse {
    organizations: MissingTimeTarget[];
    departments: MissingTimeTarget[];
    employees: MissingTimeTarget[];
}

/**
 * Missing Time Settings API
 */
export const missingTimeSettingsApi = {
    /**
     * Get all missing time settings
     */
    async getAll(targetType?: MissingTimeTargetType): Promise<ApiResponse<MissingTimeSettings[]>> {
        const params = targetType ? `?targetType=${targetType}` : '';
        return request(`/missing-time-settings${params}`);
    },

    /**
     * Get available targets for creating settings
     */
    async getAvailableTargets(): Promise<ApiResponse<AvailableTargetsResponse>> {
        return request('/missing-time-settings/targets/available');
    },

    /**
     * Get settings by target
     */
    async getByTarget(targetType: MissingTimeTargetType, targetId: number): Promise<ApiResponse<MissingTimeSettings>> {
        return request(`/missing-time-settings/${targetType}/${targetId}`);
    },

    /**
     * Create new missing time settings
     */
    async create(data: {
        targetType: MissingTimeTargetType;
        targetId: number;
        handlingType: MissingTimeHandlingType;
        missingCheckinPenaltyMinutes?: number;
        missingCheckoutPenaltyMinutes?: number;
        isActive?: boolean;
        validFrom?: string | null;
    }): Promise<ApiResponse<MissingTimeSettings>> {
        return request('/missing-time-settings', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    /**
     * Update existing settings
     */
    async update(id: number, data: {
        handlingType?: MissingTimeHandlingType;
        missingCheckinPenaltyMinutes?: number;
        missingCheckoutPenaltyMinutes?: number;
        isActive?: boolean;
        validFrom?: string | null;
    }): Promise<ApiResponse<MissingTimeSettings>> {
        return request(`/missing-time-settings/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    /**
     * Delete settings
     */
    async delete(id: number): Promise<ApiResponse<void>> {
        return request(`/missing-time-settings/${id}`, {
            method: 'DELETE',
        });
    },
};

// =============================================================================
// EXPORT ALL APIs
// =============================================================================

export const api = {
    employees: employeesApi,
    departments: departmentsApi,
    schedules: schedulesApi,
    import: importApi,
    settings: settingsApi,
    violations: violationsApi,
    compensation: compensationApi,
    missingTimeSettings: missingTimeSettingsApi,
};

export default api;
