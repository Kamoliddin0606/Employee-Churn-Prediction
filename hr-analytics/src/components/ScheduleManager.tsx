/**
 * =============================================================================
 * ScheduleManager Component
 * =============================================================================
 * 
 * UI for managing work schedules at organization, department, and employee levels.
 * Allows setting work hours, tolerance, work days.
 * 
 * @component ScheduleManager
 */

import { useState, useEffect } from 'react';
import { schedulesApi, departmentsApi, settingsApi, employeesApi } from '../services/api';
import type { WorkSchedule, Department, CalculationLevel, Employee, ScheduleException } from '../services/api';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface ScheduleFormData {
    workStart: string;
    workEnd: string;
    lateTolerance: number;
    workDays: number[];
}

/**
 * Per-day schedule configuration
 */
interface DaySchedule {
    enabled: boolean;
    workStart: string;
    workEnd: string;
}

/**
 * Employee schedule with per-day configuration
 */
interface EmployeeScheduleFormData {
    lateTolerance: number;
    days: Record<number, DaySchedule>; // 1-7 (Monday-Sunday)
}

const WEEKDAYS = [
    { value: 1, label: 'Du', fullLabel: 'Dushanba' },
    { value: 2, label: 'Se', fullLabel: 'Seshanba' },
    { value: 3, label: 'Ch', fullLabel: 'Chorshanba' },
    { value: 4, label: 'Pa', fullLabel: 'Payshanba' },
    { value: 5, label: 'Ju', fullLabel: 'Juma' },
    { value: 6, label: 'Sh', fullLabel: 'Shanba' },
    { value: 7, label: 'Ya', fullLabel: 'Yakshanba' },
];

/**
 * Create default per-day schedule (Mon-Fri enabled)
 */
function createDefaultDaySchedules(): Record<number, DaySchedule> {
    const days: Record<number, DaySchedule> = {};
    for (let i = 1; i <= 7; i++) {
        days[i] = {
            enabled: i >= 1 && i <= 5, // Mon-Fri enabled by default
            workStart: '09:00',
            workEnd: '18:00',
        };
    }
    return days;
}

const CALCULATION_LEVELS: { value: CalculationLevel; label: string; description: string }[] = [
    { value: 'organization', label: 'Tashkilot', description: 'Faqat tashkilot jadvali asosida' },
    { value: 'department', label: 'Bo\'lim', description: 'Bo\'lim jadvali + tashkilot' },
    { value: 'employee', label: 'Xodim', description: 'Xodim jadvali + bo\'lim + tashkilot' },
    { value: 'full', label: 'To\'liq', description: 'Istisnolar + xodim + bo\'lim + tashkilot' },
];

// =============================================================================
// COMPONENT
// =============================================================================

export default function ScheduleManager() {
    // State
    const [activeTab, setActiveTab] = useState<'organization' | 'department' | 'employees' | 'exceptions'>('organization');
    const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [calculationLevel, setCalculationLevel] = useState<CalculationLevel>('full');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Organization schedule form
    const [orgSchedule, setOrgSchedule] = useState<ScheduleFormData>({
        workStart: '09:00',
        workEnd: '18:00',
        lateTolerance: 5,
        workDays: [1, 2, 3, 4, 5],
    });

    // Selected department for editing
    const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
    const [deptSchedule, setDeptSchedule] = useState<ScheduleFormData | null>(null);

    // Employee selection state
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<number>>(new Set());
    const [empSchedule, setEmpSchedule] = useState<EmployeeScheduleFormData>({
        lateTolerance: 5,
        days: createDefaultDaySchedules(),
    });

    // Schedule source indicator
    type ScheduleSource = {
        type: 'employee' | 'department' | 'organization' | 'mixed' | 'none';
        label: string;
        departmentName?: string;
    };
    const [scheduleSource, setScheduleSource] = useState<ScheduleSource>({ type: 'none', label: '' });

    // =============================================================================
    // EXCEPTIONS (ISTISNOLAR) STATE
    // =============================================================================

    interface ExceptionFormData {
        type: 'holiday' | 'sick' | 'special' | 'off';
        reason: string;
        isWorkDay: boolean;
        workStart: string;
        workEnd: string;
    }

    const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
    const [exceptionEmployeeIds, setExceptionEmployeeIds] = useState<Set<number>>(new Set());
    const [exceptionDates, setExceptionDates] = useState<string[]>([]);
    const [exceptionForm, setExceptionForm] = useState<ExceptionFormData>({
        type: 'holiday',
        reason: '',
        isWorkDay: false,
        workStart: '09:00',
        workEnd: '13:00',
    });

    // =============================================================================
    // DATA LOADING
    // =============================================================================

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            // Load schedules
            const schedulesRes = await schedulesApi.getAll();
            if (schedulesRes.success && schedulesRes.data) {
                setSchedules(schedulesRes.data);

                // Find organization schedule
                const orgSched = schedulesRes.data.find(s => s.targetType === 'organization');
                if (orgSched) {
                    setOrgSchedule({
                        workStart: orgSched.workStart,
                        workEnd: orgSched.workEnd,
                        lateTolerance: orgSched.lateTolerance,
                        workDays: orgSched.workDays,
                    });
                    // Set default employee schedule from org (per-day basis)
                    const days: Record<number, DaySchedule> = {};
                    for (let i = 1; i <= 7; i++) {
                        days[i] = {
                            enabled: orgSched.workDays.includes(i),
                            workStart: orgSched.workStart,
                            workEnd: orgSched.workEnd,
                        };
                    }
                    setEmpSchedule({
                        lateTolerance: orgSched.lateTolerance,
                        days,
                    });
                }
            }

            // Load departments
            const deptRes = await departmentsApi.getAll();
            if (deptRes.success && deptRes.data) {
                setDepartments(deptRes.data);
            }

            // Load employees
            const empRes = await employeesApi.getAll({ limit: 1000 });
            if (empRes.success && empRes.data) {
                setEmployees(empRes.data.items || []);
            }

            // Load exceptions
            const exceptionsRes = await schedulesApi.getExceptions();
            if (exceptionsRes.success && exceptionsRes.data) {
                setExceptions(exceptionsRes.data);
            }

            // Load calculation settings
            const settingsRes = await settingsApi.getCalculationSettings();
            if (settingsRes.success && settingsRes.data) {
                setCalculationLevel(settingsRes.data.level);
            }
        } catch (error) {
            showMessage('error', 'Ma\'lumotlarni yuklashda xatolik');
        } finally {
            setLoading(false);
        }
    }

    // =============================================================================
    // MESSAGE HELPER
    // =============================================================================

    function showMessage(type: 'success' | 'error', text: string) {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 3000);
    }

    // =============================================================================
    // ORGANIZATION SCHEDULE HANDLERS
    // =============================================================================

    async function handleSaveOrgSchedule() {
        setSaving(true);
        try {
            const orgSched = schedules.find(s => s.targetType === 'organization');

            if (orgSched) {
                // Update existing
                const res = await schedulesApi.update(orgSched.id, {
                    workStart: orgSchedule.workStart,
                    workEnd: orgSchedule.workEnd,
                    lateTolerance: orgSchedule.lateTolerance,
                    workDays: orgSchedule.workDays,
                });

                if (res.success) {
                    showMessage('success', 'Tashkilot jadvali saqlandi');
                    loadData();
                } else {
                    showMessage('error', res.error || 'Saqlashda xatolik');
                }
            } else {
                // Create new
                const res = await schedulesApi.create({
                    targetType: 'organization',
                    targetId: 1,
                    ...orgSchedule,
                });

                if (res.success) {
                    showMessage('success', 'Tashkilot jadvali yaratildi');
                    loadData();
                } else {
                    showMessage('error', res.error || 'Yaratishda xatolik');
                }
            }
        } finally {
            setSaving(false);
        }
    }

    // =============================================================================
    // DEPARTMENT SCHEDULE HANDLERS
    // =============================================================================

    function handleSelectDepartment(deptId: number) {
        setSelectedDeptId(deptId);

        // Find existing department schedule
        const existing = schedules.find(s => s.targetType === 'department' && s.targetId === deptId);

        if (existing) {
            setDeptSchedule({
                workStart: existing.workStart,
                workEnd: existing.workEnd,
                lateTolerance: existing.lateTolerance,
                workDays: existing.workDays,
            });
        } else {
            // Default to organization schedule
            setDeptSchedule({ ...orgSchedule });
        }
    }

    async function handleSaveDeptSchedule() {
        if (!selectedDeptId || !deptSchedule) return;

        setSaving(true);
        try {
            const existing = schedules.find(s => s.targetType === 'department' && s.targetId === selectedDeptId);

            if (existing) {
                const res = await schedulesApi.update(existing.id, deptSchedule);
                if (res.success) {
                    showMessage('success', 'Bo\'lim jadvali saqlandi');
                    loadData();
                } else {
                    showMessage('error', res.error || 'Saqlashda xatolik');
                }
            } else {
                const res = await schedulesApi.create({
                    targetType: 'department',
                    targetId: selectedDeptId,
                    ...deptSchedule,
                });
                if (res.success) {
                    showMessage('success', 'Bo\'lim jadvali yaratildi');
                    loadData();
                } else {
                    showMessage('error', res.error || 'Yaratishda xatolik');
                }
            }
        } finally {
            setSaving(false);
        }
    }

    async function handleDeleteDeptSchedule() {
        if (!selectedDeptId) return;

        const existing = schedules.find(s => s.targetType === 'department' && s.targetId === selectedDeptId);
        if (!existing) return;

        if (!confirm('Bo\'lim jadvalini o\'chirmoqchimisiz?')) return;

        setSaving(true);
        try {
            const res = await schedulesApi.delete(existing.id);
            if (res.success) {
                showMessage('success', 'Bo\'lim jadvali o\'chirildi');
                setSelectedDeptId(null);
                setDeptSchedule(null);
                loadData();
            } else {
                showMessage('error', res.error || 'O\'chirishda xatolik');
            }
        } finally {
            setSaving(false);
        }
    }

    // =============================================================================
    // CALCULATION LEVEL HANDLERS
    // =============================================================================

    async function handleSaveCalculationLevel() {
        setSaving(true);
        try {
            const res = await settingsApi.updateCalculationLevel(calculationLevel);
            if (res.success) {
                showMessage('success', 'Hisoblash darajasi saqlandi');
            } else {
                showMessage('error', res.error || 'Saqlashda xatolik');
            }
        } finally {
            setSaving(false);
        }
    }

    // =============================================================================
    // WORK DAYS TOGGLE
    // =============================================================================

    function toggleWorkDay(days: number[], day: number): number[] {
        if (days.includes(day)) {
            return days.filter(d => d !== day);
        }
        return [...days, day].sort();
    }

    // =============================================================================
    // AUTO-LOAD SCHEDULE BASED ON SELECTION
    // =============================================================================

    /**
     * Convert WorkSchedule to EmployeeScheduleFormData format
     */
    function workScheduleToFormData(schedule: WorkSchedule): EmployeeScheduleFormData {
        const days: Record<number, DaySchedule> = {};
        for (let i = 1; i <= 7; i++) {
            days[i] = {
                enabled: schedule.workDays.includes(i),
                workStart: schedule.workStart,
                workEnd: schedule.workEnd,
            };
        }
        return {
            lateTolerance: schedule.lateTolerance,
            days,
        };
    }

    /**
     * Check if two WorkSchedule objects have the same schedule data
     */
    function schedulesEqual(a: WorkSchedule, b: WorkSchedule): boolean {
        return (
            a.workStart === b.workStart &&
            a.workEnd === b.workEnd &&
            a.lateTolerance === b.lateTolerance &&
            JSON.stringify(a.workDays.sort()) === JSON.stringify(b.workDays.sort())
        );
    }

    /**
     * Auto-load schedule when employees are selected
     */
    useEffect(() => {
        if (selectedEmployeeIds.size === 0) {
            setScheduleSource({ type: 'none', label: '' });
            return;
        }

        const selectedIds = [...selectedEmployeeIds];

        // 1. Get all employee schedules for selected employees
        const employeeSchedules = selectedIds
            .map(empId => schedules.find(s => s.targetType === 'employee' && s.targetId === empId))
            .filter((s): s is WorkSchedule => s !== undefined);

        // 2. If ALL selected employees have schedules AND all are the same
        if (employeeSchedules.length === selectedIds.length && employeeSchedules.length > 0) {
            const first = employeeSchedules[0];
            const allSame = employeeSchedules.every(s => schedulesEqual(s, first));

            if (allSame) {
                setEmpSchedule(workScheduleToFormData(first));
                setScheduleSource({
                    type: 'employee',
                    label: `🟢 Xodimlarning shaxsiy jadvali (${selectedIds.length} ta)`,
                });
                return;
            }
        }

        // 3. Check if all selected employees are from the same department
        const selectedEmps = selectedIds.map(id => employees.find(e => e.id === id)).filter(Boolean);
        const deptIds = [...new Set(selectedEmps.map(e => e?.departmentId))];

        if (deptIds.length === 1 && deptIds[0] !== undefined) {
            // All from same department - try department schedule
            const deptSchedule = schedules.find(s => s.targetType === 'department' && s.targetId === deptIds[0]);
            const dept = departments.find(d => d.id === deptIds[0]);

            if (deptSchedule) {
                setEmpSchedule(workScheduleToFormData(deptSchedule));
                setScheduleSource({
                    type: 'department',
                    label: `🟡 Bo'lim jadvali: ${dept?.name || 'Noma\'lum'}`,
                    departmentName: dept?.name,
                });
                return;
            }
        }

        // 4. Fallback to organization schedule
        const orgSchedule = schedules.find(s => s.targetType === 'organization');
        if (orgSchedule) {
            setEmpSchedule(workScheduleToFormData(orgSchedule));
            setScheduleSource({
                type: 'organization',
                label: '🔵 Tashkilot jadvali',
            });
            return;
        }

        // 5. No schedule found - use default
        setScheduleSource({
            type: 'mixed',
            label: '⚪ Standart jadval',
        });
    }, [selectedEmployeeIds, schedules, employees, departments]);

    // =============================================================================
    // EMPLOYEE SCHEDULE HANDLERS
    // =============================================================================

    /**
     * Toggle single employee selection
     */
    function handleToggleEmployee(empId: number) {
        setSelectedEmployeeIds(prev => {
            const next = new Set(prev);
            if (next.has(empId)) {
                next.delete(empId);
            } else {
                next.add(empId);
            }
            return next;
        });
    }

    /**
     * Double-click on department - select/deselect all employees in that department
     */
    function handleDeptDoubleClick(deptId: number) {
        const deptEmployees = employees.filter(e => e.departmentId === deptId);
        const deptEmpIds = deptEmployees.map(e => e.id);

        // Check if all are already selected
        const allSelected = deptEmpIds.every(id => selectedEmployeeIds.has(id));

        setSelectedEmployeeIds(prev => {
            const next = new Set(prev);
            if (allSelected) {
                // Deselect all from this dept
                deptEmpIds.forEach(id => next.delete(id));
            } else {
                // Select all from this dept
                deptEmpIds.forEach(id => next.add(id));
            }
            return next;
        });
    }

    /**
     * Clear all employee selection
     */
    function handleClearSelection() {
        setSelectedEmployeeIds(new Set());
    }

    /**
     * Select all employees
     */
    function handleSelectAll() {
        setSelectedEmployeeIds(new Set(employees.map(e => e.id)));
    }

    /**
     * Save schedule for all selected employees
     * Converts per-day format to API format
     */
    async function handleSaveEmployeeSchedules() {
        if (selectedEmployeeIds.size === 0) {
            showMessage('error', 'Xodimlarni tanlang');
            return;
        }

        setSaving(true);
        let successCount = 0;
        let errorCount = 0;

        // Convert per-day schedule to API format
        // For now, use first enabled day's times as the main schedule
        // and collect enabled days as workDays array
        const workDays: number[] = [];
        let workStart = '09:00';
        let workEnd = '18:00';

        for (let i = 1; i <= 7; i++) {
            const day = empSchedule.days[i];
            if (day.enabled) {
                workDays.push(i);
                // Use the first enabled day's times
                if (workDays.length === 1) {
                    workStart = day.workStart;
                    workEnd = day.workEnd;
                }
            }
        }

        const scheduleData: ScheduleFormData = {
            workStart,
            workEnd,
            lateTolerance: empSchedule.lateTolerance,
            workDays,
        };

        try {
            for (const empId of selectedEmployeeIds) {
                // Check if schedule exists
                const existing = schedules.find(s => s.targetType === 'employee' && s.targetId === empId);

                if (existing) {
                    const res = await schedulesApi.update(existing.id, scheduleData);
                    if (res.success) successCount++;
                    else errorCount++;
                } else {
                    const res = await schedulesApi.create({
                        targetType: 'employee',
                        targetId: empId,
                        ...scheduleData,
                    });
                    if (res.success) successCount++;
                    else errorCount++;
                }
            }

            if (errorCount === 0) {
                showMessage('success', `${successCount} ta xodim uchun jadval saqlandi`);
            } else {
                showMessage('error', `${successCount} muvaffaqiyat, ${errorCount} xatolik`);
            }

            loadData();
            setSelectedEmployeeIds(new Set());
        } finally {
            setSaving(false);
        }
    }

    /**
     * Delete schedules for selected employees
     */
    async function handleDeleteEmployeeSchedules() {
        if (selectedEmployeeIds.size === 0) return;

        if (!confirm(`${selectedEmployeeIds.size} ta xodim jadvalini o'chirmoqchimisiz?`)) return;

        setSaving(true);
        let deleted = 0;

        try {
            for (const empId of selectedEmployeeIds) {
                const existing = schedules.find(s => s.targetType === 'employee' && s.targetId === empId);
                if (existing) {
                    const res = await schedulesApi.delete(existing.id);
                    if (res.success) deleted++;
                }
            }

            showMessage('success', `${deleted} ta jadval o'chirildi`);
            loadData();
            setSelectedEmployeeIds(new Set());
        } finally {
            setSaving(false);
        }
    }

    // =============================================================================
    // EXCEPTION HANDLERS
    // =============================================================================

    /**
     * Toggle single employee selection for exception
     */
    function handleToggleExceptionEmployee(empId: number) {
        setExceptionEmployeeIds(prev => {
            const next = new Set(prev);
            if (next.has(empId)) {
                next.delete(empId);
            } else {
                next.add(empId);
            }
            return next;
        });
    }

    /**
     * Click on department - select/deselect all employees for exception
     */
    function handleExceptionDeptClick(deptId: number) {
        const deptEmpIds = employees.filter(e => e.departmentId === deptId).map(e => e.id);
        const allSelected = deptEmpIds.every(id => exceptionEmployeeIds.has(id));

        setExceptionEmployeeIds(prev => {
            const next = new Set(prev);
            if (allSelected) {
                deptEmpIds.forEach(id => next.delete(id));
            } else {
                deptEmpIds.forEach(id => next.add(id));
            }
            return next;
        });
    }

    /**
     * Select all employees for exception
     */
    function handleExceptionSelectAll() {
        setExceptionEmployeeIds(new Set(employees.map(e => e.id)));
    }

    /**
     * Clear exception employee selection
     */
    function handleExceptionClearSelection() {
        setExceptionEmployeeIds(new Set());
    }

    /**
     * Create exception for selected employees and dates
     */
    async function handleCreateException() {
        if (exceptionEmployeeIds.size === 0) {
            showMessage('error', 'Xodimlarni tanlang');
            return;
        }
        if (exceptionDates.length === 0) {
            showMessage('error', 'Sanani tanlang');
            return;
        }

        setSaving(true);
        try {
            // Create exception for each date
            for (const date of exceptionDates) {
                await schedulesApi.createException({
                    type: exceptionForm.type,
                    employeeIds: [...exceptionEmployeeIds],
                    date,
                    workStart: exceptionForm.isWorkDay ? exceptionForm.workStart : undefined,
                    workEnd: exceptionForm.isWorkDay ? exceptionForm.workEnd : undefined,
                    reason: exceptionForm.reason,
                });
            }

            showMessage('success', `${exceptionDates.length} ta sana uchun istisno yaratildi`);
            loadData();
            setExceptionEmployeeIds(new Set());
            setExceptionDates([]);
        } catch {
            showMessage('error', 'Istisno yaratishda xatolik');
        } finally {
            setSaving(false);
        }
    }

    /**
     * Delete an exception
     */
    async function handleDeleteException(id: number) {
        if (!confirm('Istisnoni o\'chirmoqchimisiz?')) return;

        setSaving(true);
        try {
            const res = await schedulesApi.deleteException(id);
            if (res.success) {
                showMessage('success', 'Istisno o\'chirildi');
                loadData();
            } else {
                showMessage('error', res.error || 'O\'chirishda xatolik');
            }
        } finally {
            setSaving(false);
        }
    }

    // =============================================================================
    // RENDER
    // =============================================================================

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ish Jadvali Sozlamalari</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                    Tashkilot, bo'lim va xodimlar uchun ish vaqtini belgilang
                </p>
            </div>

            {/* Message */}
            {message && (
                <div className={`mb-4 p-3 rounded-lg ${message.type === 'success'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                    : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                    }`}>
                    {message.text}
                </div>
            )}

            {/* Calculation Level Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Hisoblash Darajasi
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {CALCULATION_LEVELS.map(level => (
                        <button
                            key={level.value}
                            onClick={() => setCalculationLevel(level.value)}
                            className={`p-3 rounded-lg border-2 text-left transition-colors ${calculationLevel === level.value
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                                }`}
                        >
                            <div className="font-medium text-gray-900 dark:text-white">{level.label}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{level.description}</div>
                        </button>
                    ))}
                </div>
                <button
                    onClick={handleSaveCalculationLevel}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                    {saving ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                <nav className="flex space-x-4">
                    <button
                        onClick={() => setActiveTab('organization')}
                        className={`py-2 px-4 border-b-2 font-medium text-sm transition-colors ${activeTab === 'organization'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Tashkilot
                    </button>
                    <button
                        onClick={() => setActiveTab('department')}
                        className={`py-2 px-4 border-b-2 font-medium text-sm transition-colors ${activeTab === 'department'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Bo'limlar ({departments.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('employees')}
                        className={`py-2 px-4 border-b-2 font-medium text-sm transition-colors ${activeTab === 'employees'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Xodimlar ({employees.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('exceptions')}
                        className={`py-2 px-4 border-b-2 font-medium text-sm transition-colors ${activeTab === 'exceptions'
                            ? 'border-orange-500 text-orange-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Istisnolar ({exceptions.length})
                    </button>
                </nav>
            </div>

            {/* Organization Tab */}
            {activeTab === 'organization' && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Tashkilot Jadvali (Default)
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Ish boshlanishi
                            </label>
                            <input
                                type="time"
                                value={orgSchedule.workStart}
                                onChange={e => setOrgSchedule({ ...orgSchedule, workStart: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Ish tugashi
                            </label>
                            <input
                                type="time"
                                value={orgSchedule.workEnd}
                                onChange={e => setOrgSchedule({ ...orgSchedule, workEnd: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Kechikish toleransi (daqiqa)
                        </label>
                        <input
                            type="number"
                            min="0"
                            max="60"
                            value={orgSchedule.lateTolerance}
                            onChange={e => setOrgSchedule({ ...orgSchedule, lateTolerance: parseInt(e.target.value) || 0 })}
                            className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Ish kunlari
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {WEEKDAYS.map(day => (
                                <button
                                    key={day.value}
                                    onClick={() => setOrgSchedule({
                                        ...orgSchedule,
                                        workDays: toggleWorkDay(orgSchedule.workDays, day.value)
                                    })}
                                    title={day.fullLabel}
                                    className={`w-10 h-10 rounded-lg font-medium transition-colors ${orgSchedule.workDays.includes(day.value)
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                        }`}
                                >
                                    {day.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={handleSaveOrgSchedule}
                        disabled={saving}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        {saving ? 'Saqlanmoqda...' : 'Saqlash'}
                    </button>
                </div>
            )}

            {/* Department Tab */}
            {activeTab === 'department' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Department List */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                        <h3 className="font-medium text-gray-900 dark:text-white mb-3">Bo'limlar</h3>
                        <div className="space-y-2">
                            {departments.map(dept => {
                                const hasSchedule = schedules.some(s => s.targetType === 'department' && s.targetId === dept.id);
                                return (
                                    <button
                                        key={dept.id}
                                        onClick={() => handleSelectDepartment(dept.id)}
                                        className={`w-full text-left p-3 rounded-lg transition-colors ${selectedDeptId === dept.id
                                            ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-500'
                                            : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700'
                                            } border ${hasSchedule ? 'border-green-400' : 'border-transparent'}`}
                                    >
                                        <div className="font-medium text-gray-900 dark:text-white">{dept.name}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                            {dept.employeeCount || 0} xodim
                                            {hasSchedule && <span className="ml-2 text-green-600">• Maxsus jadval</span>}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Department Schedule Form */}
                    <div className="md:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        {selectedDeptId && deptSchedule ? (
                            <>
                                <h3 className="font-medium text-gray-900 dark:text-white mb-4">
                                    {departments.find(d => d.id === selectedDeptId)?.name} - Jadval
                                </h3>

                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Ish boshlanishi
                                        </label>
                                        <input
                                            type="time"
                                            value={deptSchedule.workStart}
                                            onChange={e => setDeptSchedule({ ...deptSchedule, workStart: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Ish tugashi
                                        </label>
                                        <input
                                            type="time"
                                            value={deptSchedule.workEnd}
                                            onChange={e => setDeptSchedule({ ...deptSchedule, workEnd: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Kechikish toleransi (daqiqa)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="60"
                                        value={deptSchedule.lateTolerance}
                                        onChange={e => setDeptSchedule({ ...deptSchedule, lateTolerance: parseInt(e.target.value) || 0 })}
                                        className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>

                                <div className="mb-6">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Ish kunlari
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {WEEKDAYS.map(day => (
                                            <button
                                                key={day.value}
                                                onClick={() => setDeptSchedule({
                                                    ...deptSchedule,
                                                    workDays: toggleWorkDay(deptSchedule.workDays, day.value)
                                                })}
                                                title={day.fullLabel}
                                                className={`w-10 h-10 rounded-lg font-medium transition-colors ${deptSchedule.workDays.includes(day.value)
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                                    }`}
                                            >
                                                {day.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSaveDeptSchedule}
                                        disabled={saving}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        {saving ? 'Saqlanmoqda...' : 'Saqlash'}
                                    </button>
                                    {schedules.some(s => s.targetType === 'department' && s.targetId === selectedDeptId) && (
                                        <button
                                            onClick={handleDeleteDeptSchedule}
                                            disabled={saving}
                                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                                        >
                                            O'chirish
                                        </button>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="text-center text-gray-500 dark:text-gray-400 py-12">
                                Bo'limni tanlang
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Employees Tab */}
            {activeTab === 'employees' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Panel - Department List + Employee List */}
                    <div className="lg:col-span-2 space-y-4">
                        {/* Selection Header */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-medium text-gray-900 dark:text-white">
                                    Tanlangan xodimlar: <span className="text-blue-600">{selectedEmployeeIds.size}</span>
                                </h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSelectAll}
                                        className="text-sm px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                                    >
                                        Hammasini tanlash
                                    </button>
                                    <button
                                        onClick={handleClearSelection}
                                        className="text-sm px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                                    >
                                        Tozalash
                                    </button>
                                </div>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                💡 Bo'limga ikki marta bosing - bo'limdagi barcha xodimlar tanlanadi
                            </p>
                        </div>

                        {/* Departments with Employees */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 max-h-[500px] overflow-y-auto">
                            {departments.map(dept => {
                                const deptEmployees = employees.filter(e => e.departmentId === dept.id);
                                const selectedInDept = deptEmployees.filter(e => selectedEmployeeIds.has(e.id)).length;
                                const hasCustomSchedule = schedules.some(s => s.targetType === 'department' && s.targetId === dept.id);

                                return (
                                    <div key={dept.id} className="mb-4">
                                        {/* Department Header - Double Click to select all */}
                                        <button
                                            onDoubleClick={() => handleDeptDoubleClick(dept.id)}
                                            className={`w-full text-left p-3 rounded-lg transition-colors mb-2 ${selectedInDept === deptEmployees.length && deptEmployees.length > 0
                                                ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500'
                                                : selectedInDept > 0
                                                    ? 'bg-blue-50 dark:bg-blue-900/10 border-2 border-blue-300'
                                                    : 'bg-gray-100 dark:bg-gray-700 border-2 border-transparent hover:bg-gray-200 dark:hover:bg-gray-600'
                                                }`}
                                        >
                                            <div className="flex justify-between items-center">
                                                <div className="font-semibold text-gray-900 dark:text-white">
                                                    📁 {dept.name}
                                                </div>
                                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                                    {selectedInDept}/{deptEmployees.length} tanlangan
                                                    {hasCustomSchedule && <span className="ml-2 text-green-600">• Maxsus jadval</span>}
                                                </div>
                                            </div>
                                        </button>

                                        {/* Employees in Department */}
                                        <div className="ml-4 grid grid-cols-2 md:grid-cols-3 gap-2">
                                            {deptEmployees.map(emp => {
                                                const isSelected = selectedEmployeeIds.has(emp.id);
                                                const hasEmpSchedule = schedules.some(s => s.targetType === 'employee' && s.targetId === emp.id);

                                                return (
                                                    <button
                                                        key={emp.id}
                                                        onClick={() => handleToggleEmployee(emp.id)}
                                                        className={`text-left p-2 rounded text-sm transition-colors ${isSelected
                                                            ? 'bg-blue-500 text-white'
                                                            : 'bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                                            }`}
                                                    >
                                                        <div className="font-medium truncate">{emp.name}</div>
                                                        <div className={`text-xs ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>
                                                            ID: {emp.externalId}
                                                            {hasEmpSchedule && <span className="ml-1 text-green-400">★</span>}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Panel - Schedule Form */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <h3 className="font-medium text-gray-900 dark:text-white mb-4">
                            Jadval sozlamalari
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                            Tanlangan {selectedEmployeeIds.size} ta xodim uchun jadval
                        </p>

                        {/* Schedule Source Indicator */}
                        {scheduleSource.label && (
                            <div className={`text-sm px-3 py-2 rounded-lg mb-4 ${scheduleSource.type === 'employee'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : scheduleSource.type === 'department'
                                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                    : scheduleSource.type === 'organization'
                                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                                }`}>
                                {scheduleSource.label}
                            </div>
                        )}

                        {/* Per-Day Work Hours Configuration */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                Hafta kunlari bo'yicha ish vaqti
                            </label>
                            <div className="space-y-2">
                                {WEEKDAYS.map(day => {
                                    const daySchedule = empSchedule.days[day.value];
                                    return (
                                        <div
                                            key={day.value}
                                            className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${daySchedule.enabled
                                                ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                                                : 'bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600'
                                                }`}
                                        >
                                            {/* Day Toggle */}
                                            <button
                                                onClick={() => {
                                                    const newDays = { ...empSchedule.days };
                                                    newDays[day.value] = {
                                                        ...newDays[day.value],
                                                        enabled: !newDays[day.value].enabled,
                                                    };
                                                    setEmpSchedule({ ...empSchedule, days: newDays });
                                                }}
                                                className={`w-10 h-10 rounded-lg font-semibold text-sm transition-colors flex-shrink-0 ${daySchedule.enabled
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                                                    }`}
                                                title={daySchedule.enabled ? 'Ish kuni' : 'Dam olish'}
                                            >
                                                {day.label}
                                            </button>

                                            {/* Day Name */}
                                            <span className={`w-24 text-sm font-medium ${daySchedule.enabled
                                                ? 'text-gray-900 dark:text-white'
                                                : 'text-gray-400 dark:text-gray-500'
                                                }`}>
                                                {day.fullLabel}
                                            </span>

                                            {/* Time Inputs - only for enabled days */}
                                            {daySchedule.enabled ? (
                                                <div className="flex items-center gap-2 flex-1">
                                                    <input
                                                        type="time"
                                                        value={daySchedule.workStart}
                                                        onChange={e => {
                                                            const newDays = { ...empSchedule.days };
                                                            newDays[day.value] = {
                                                                ...newDays[day.value],
                                                                workStart: e.target.value,
                                                            };
                                                            setEmpSchedule({ ...empSchedule, days: newDays });
                                                        }}
                                                        className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                    />
                                                    <span className="text-gray-400">—</span>
                                                    <input
                                                        type="time"
                                                        value={daySchedule.workEnd}
                                                        onChange={e => {
                                                            const newDays = { ...empSchedule.days };
                                                            newDays[day.value] = {
                                                                ...newDays[day.value],
                                                                workEnd: e.target.value,
                                                            };
                                                            setEmpSchedule({ ...empSchedule, days: newDays });
                                                        }}
                                                        className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                    />
                                                </div>
                                            ) : (
                                                <span className="text-sm text-gray-400 dark:text-gray-500 flex-1">
                                                    Dam olish kuni
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Tolerance */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Kechikish toleransi (daqiqa)
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="60"
                                value={empSchedule.lateTolerance}
                                onChange={e => setEmpSchedule({ ...empSchedule, lateTolerance: parseInt(e.target.value) || 0 })}
                                className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={handleSaveEmployeeSchedules}
                                disabled={saving || selectedEmployeeIds.size === 0}
                                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {saving ? 'Saqlanmoqda...' : `${selectedEmployeeIds.size} ta xodim uchun saqlash`}
                            </button>
                            {selectedEmployeeIds.size > 0 && schedules.some(s => s.targetType === 'employee' && selectedEmployeeIds.has(s.targetId)) && (
                                <button
                                    onClick={handleDeleteEmployeeSchedules}
                                    disabled={saving}
                                    className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                                >
                                    Jadvallarni o'chirish
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Exceptions Tab */}
            {activeTab === 'exceptions' && (
                <div className="space-y-6">
                    {/* Employee Selection + Form */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left: Employee Selection */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-medium text-gray-900 dark:text-white">
                                    Xodimlar: <span className="text-orange-600">{exceptionEmployeeIds.size} tanlangan</span>
                                </h3>
                                <div className="flex gap-2">
                                    <button onClick={handleExceptionSelectAll} className="text-sm px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">Hammasi</button>
                                    <button onClick={handleExceptionClearSelection} className="text-sm px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">Tozalash</button>
                                </div>
                            </div>

                            <div className="max-h-96 overflow-y-auto space-y-2">
                                {departments.map(dept => {
                                    const deptEmps = employees.filter(e => e.departmentId === dept.id);
                                    const selectedCount = deptEmps.filter(e => exceptionEmployeeIds.has(e.id)).length;
                                    return (
                                        <div key={dept.id}>
                                            <button
                                                onClick={() => handleExceptionDeptClick(dept.id)}
                                                className={`w-full text-left p-2 rounded mb-1 ${selectedCount === deptEmps.length && deptEmps.length > 0 ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}
                                            >
                                                📁 {dept.name} ({selectedCount}/{deptEmps.length})
                                            </button>
                                            <div className="ml-4 grid grid-cols-2 gap-1">
                                                {deptEmps.map(emp => (
                                                    <button
                                                        key={emp.id}
                                                        onClick={() => handleToggleExceptionEmployee(emp.id)}
                                                        className={`text-left text-sm p-1 rounded ${exceptionEmployeeIds.has(emp.id) ? 'bg-orange-500 text-white' : 'bg-gray-50 dark:bg-gray-700/50'}`}
                                                    >
                                                        {emp.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Right: Exception Form */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                            <h3 className="font-medium text-gray-900 dark:text-white mb-3">Istisno Sozlamalari</h3>

                            {/* Date Input */}
                            <div className="mb-3">
                                <label className="block text-sm font-medium mb-1">Sana</label>
                                <input
                                    type="date"
                                    value={exceptionDates[0] || ''}
                                    onChange={e => setExceptionDates(e.target.value ? [e.target.value] : [])}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                                />
                            </div>

                            {/* Type */}
                            <div className="mb-3">
                                <label className="block text-sm font-medium mb-1">Turi</label>
                                <select
                                    value={exceptionForm.type}
                                    onChange={e => setExceptionForm({ ...exceptionForm, type: e.target.value as any })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                                >
                                    <option value="holiday">Bayram</option>
                                    <option value="sick">Kasallik</option>
                                    <option value="special">Maxsus</option>
                                    <option value="off">Dam olish</option>
                                </select>
                            </div>

                            {/* Reason */}
                            <div className="mb-3">
                                <label className="block text-sm font-medium mb-1">Sabab</label>
                                <input
                                    type="text"
                                    value={exceptionForm.reason}
                                    onChange={e => setExceptionForm({ ...exceptionForm, reason: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                                    placeholder="Navruz bayrami"
                                />
                            </div>

                            {/* Work Day Toggle */}
                            <div className="mb-3">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={exceptionForm.isWorkDay}
                                        onChange={e => setExceptionForm({ ...exceptionForm, isWorkDay: e.target.checked })}
                                    />
                                    <span className="text-sm">Maxsus ish vaqti bilan</span>
                                </label>
                            </div>

                            {/* Work Hours (if enabled) */}
                            {exceptionForm.isWorkDay && (
                                <div className="grid grid-cols-2 gap-2 mb-3">
                                    <div>
                                        <label className="block text-xs mb-1">Boshlanish</label>
                                        <input
                                            type="time"
                                            value={exceptionForm.workStart}
                                            onChange={e => setExceptionForm({ ...exceptionForm, workStart: e.target.value })}
                                            className="w-full px-2 py-1 border rounded dark:bg-gray-700"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs mb-1">Tugash</label>
                                        <input
                                            type="time"
                                            value={exceptionForm.workEnd}
                                            onChange={e => setExceptionForm({ ...exceptionForm, workEnd: e.target.value })}
                                            className="w-full px-2 py-1 border rounded dark:bg-gray-700"
                                        />
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={handleCreateException}
                                disabled={saving || exceptionEmployeeIds.size === 0 || exceptionDates.length === 0}
                                className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                            >
                                {saving ? 'Saqlanmoqda...' : 'Istisno Yaratish'}
                            </button>
                        </div>
                    </div>

                    {/* Exceptions List */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                        <h3 className="font-medium text-gray-900 dark:text-white mb-3">Mavjud Istisnolar</h3>
                        {exceptions.length === 0 ? (
                            <p className="text-gray-500 text-center py-4">Istisnolar yo'q</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 dark:bg-gray-700">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Sana</th>
                                            <th className="px-3 py-2 text-left">Turi</th>
                                            <th className="px-3 py-2 text-left">Xodimlar</th>
                                            <th className="px-3 py-2 text-left">Vaqt</th>
                                            <th className="px-3 py-2 text-left">Sabab</th>
                                            <th className="px-3 py-2"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {exceptions.map(exc => (
                                            <tr key={exc.id} className="border-t dark:border-gray-700">
                                                <td className="px-3 py-2">{exc.date}</td>
                                                <td className="px-3 py-2">{exc.type}</td>
                                                <td className="px-3 py-2">{exc.employeeIds.length} ta</td>
                                                <td className="px-3 py-2">{exc.workStart ? `${exc.workStart}-${exc.workEnd}` : 'Dam olish'}</td>
                                                <td className="px-3 py-2">{exc.reason}</td>
                                                <td className="px-3 py-2">
                                                    <button
                                                        onClick={() => handleDeleteException(exc.id)}
                                                        className="text-red-600 hover:text-red-800"
                                                    >
                                                        ×
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
