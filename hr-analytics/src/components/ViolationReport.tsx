/**
 * =============================================================================
 * ViolationReport Component
 * =============================================================================
 * 
 * UI for viewing monthly violation reports with filtering and sorting.
 * Shows employee statistics, totals, and allows calculation.
 * 
 * @component ViolationReport
 */

import { useState, useEffect } from 'react';
import { violationsApi, departmentsApi, importApi } from '../services/api';
import type { ViolationSummary, Department } from '../services/api';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format minutes as hours and minutes string
 */
function formatMinutes(minutes: number): string {
    if (minutes === 0) return '0 daq';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins} daq`;
    if (mins === 0) return `${hours} soat`;
    return `${hours} soat ${mins} daq`;
}

/**
 * Get month name in Uzbek
 */
function getMonthName(month: number): string {
    const months = [
        'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
        'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
    ];
    return months[month - 1] || '';
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ViolationReport() {
    // State
    const [loading, setLoading] = useState(true);
    const [calculating, setCalculating] = useState(false);
    const [recalculating, setRecalculating] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Filter state
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [departmentId, setDepartmentId] = useState<number | null>(null);
    const [sortBy, setSortBy] = useState('violation_count');
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

    // Data state
    const [departments, setDepartments] = useState<Department[]>([]);
    const [report, setReport] = useState<{
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
    } | null>(null);

    // =============================================================================
    // DATA LOADING
    // =============================================================================

    useEffect(() => {
        loadDepartments();
    }, []);

    useEffect(() => {
        loadReport();
    }, [year, month, departmentId, sortBy, sortOrder]);

    async function loadDepartments() {
        const res = await departmentsApi.getAll();
        if (res.success && res.data) {
            setDepartments(res.data);
        }
    }

    async function loadReport() {
        setLoading(true);
        try {
            const res = await violationsApi.getReport({
                year,
                month,
                departmentId: departmentId || undefined,
                sortBy,
                sortOrder,
            });

            if (res.success && res.data) {
                setReport(res.data);
            } else {
                setReport(null);
            }
        } finally {
            setLoading(false);
        }
    }

    // =============================================================================
    // ACTION HANDLERS
    // =============================================================================

    async function handleCalculate() {
        setCalculating(true);
        try {
            const res = await violationsApi.calculate({ year, month });
            if (res.success) {
                showMessage('success', `${res.data?.processedEmployees || 0} ta xodim uchun statistika hisoblandi`);
                loadReport();
            } else {
                showMessage('error', res.error || 'Hisoblashda xatolik');
            }
        } finally {
            setCalculating(false);
        }
    }

    async function handleRecalculate() {
        setRecalculating(true);
        try {
            // Calculate date range for the selected month
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

            const res = await importApi.recalculate({ dateFrom: startDate, dateTo: endDate });
            if (res.success) {
                showMessage('success', `${res.data?.updatedRecords || 0} ta yozuv qayta hisoblandi`);
                // After recalculating time records, recalculate violations
                await handleCalculate();
            } else {
                showMessage('error', res.error || 'Qayta hisoblashda xatolik');
            }
        } finally {
            setRecalculating(false);
        }
    }

    function showMessage(type: 'success' | 'error', text: string) {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 4000);
    }

    function handleSort(field: string) {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
        } else {
            setSortBy(field);
            setSortOrder('desc');
        }
    }

    // =============================================================================
    // RENDER
    // =============================================================================

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Buzilishlar Hisoboti</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                    Oylik kechikish va erta ketish statistikasi
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

            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
                <div className="flex flex-wrap gap-4 items-end">
                    {/* Year */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Yil
                        </label>
                        <select
                            value={year}
                            onChange={e => setYear(parseInt(e.target.value))}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            {[2024, 2025, 2026].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>

                    {/* Month */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Oy
                        </label>
                        <select
                            value={month}
                            onChange={e => setMonth(parseInt(e.target.value))}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            {Array.from({ length: 12 }, (_, i) => (
                                <option key={i + 1} value={i + 1}>{getMonthName(i + 1)}</option>
                            ))}
                        </select>
                    </div>

                    {/* Department */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Bo'lim
                        </label>
                        <select
                            value={departmentId || ''}
                            onChange={e => setDepartmentId(e.target.value ? parseInt(e.target.value) : null)}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-[150px]"
                        >
                            <option value="">Barchasi</option>
                            {departments.map(dept => (
                                <option key={dept.id} value={dept.id}>{dept.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Actions */}
                    <button
                        onClick={handleRecalculate}
                        disabled={recalculating || calculating}
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                    >
                        {recalculating ? 'Qayta hisoblanmoqda...' : 'Qayta hisoblash'}
                    </button>
                    <button
                        onClick={handleCalculate}
                        disabled={calculating || recalculating}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        {calculating ? 'Hisoblanmoqda...' : 'Hisoblash'}
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            {report && report.totals && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{report.employeeCount}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Jami xodim</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                        <div className="text-2xl font-bold text-red-600">{report.totals.violationCount}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Jami buzilish</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                        <div className="text-2xl font-bold text-orange-600">{report.totals.lateCount}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Kechikish soni</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                        <div className="text-2xl font-bold text-yellow-600">{report.totals.earlyLeaveCount}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Erta ketish</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                        <div className="text-lg font-bold text-orange-700">{formatMinutes(report.totals.totalLateMinutes)}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Kechikish vaqti</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                        <div className="text-lg font-bold text-yellow-700">{formatMinutes(report.totals.totalEarlyLeaveMinutes)}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Erta ketish vaqti</div>
                    </div>
                    {/* Not-at-workplace card - only show if there's data */}
                    {(report.totals.notAtWorkplaceCount ?? 0) > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-purple-500">
                            <div className="text-2xl font-bold text-purple-600">{report.totals.notAtWorkplaceCount}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">Ish joyida bo'lmagan</div>
                        </div>
                    )}
                </div>
            )}

            {/* Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Xodim
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Bo'lim
                                </th>
                                <th
                                    className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                                    onClick={() => handleSort('late_count')}
                                >
                                    Kechikish {sortBy === 'late_count' && (sortOrder === 'desc' ? '↓' : '↑')}
                                </th>
                                <th
                                    className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                                    onClick={() => handleSort('total_late_minutes')}
                                >
                                    Kechikish (daq) {sortBy === 'total_late_minutes' && (sortOrder === 'desc' ? '↓' : '↑')}
                                </th>
                                <th
                                    className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                                    onClick={() => handleSort('early_leave_count')}
                                >
                                    Erta ketish {sortBy === 'early_leave_count' && (sortOrder === 'desc' ? '↓' : '↑')}
                                </th>
                                <th
                                    className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                                    onClick={() => handleSort('total_early_leave_minutes')}
                                >
                                    Erta ketish (daq) {sortBy === 'total_early_leave_minutes' && (sortOrder === 'desc' ? '↓' : '↑')}
                                </th>
                                <th
                                    className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                                    onClick={() => handleSort('violation_count')}
                                >
                                    Jami {sortBy === 'violation_count' && (sortOrder === 'desc' ? '↓' : '↑')}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                                        <div className="flex items-center justify-center">
                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
                                            Yuklanmoqda...
                                        </div>
                                    </td>
                                </tr>
                            ) : !report || report.employees.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                                        Ma'lumot topilmadi. "Hisoblash" tugmasini bosing.
                                    </td>
                                </tr>
                            ) : (
                                report.employees.map((emp) => (
                                    <tr key={emp.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-900 dark:text-white">{emp.employeeName}</div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">{emp.externalId}</div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                            {emp.department}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {emp.lateCount > 0 ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                                                    {emp.lateCount}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm">
                                            {emp.totalLateMinutes > 0 ? (
                                                <span className="text-orange-600 dark:text-orange-400">{emp.totalLateMinutes}</span>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {emp.earlyLeaveCount > 0 ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                                                    {emp.earlyLeaveCount}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm">
                                            {emp.totalEarlyLeaveMinutes > 0 ? (
                                                <span className="text-yellow-600 dark:text-yellow-400">{emp.totalEarlyLeaveMinutes}</span>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {emp.violationCount > 0 ? (
                                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${emp.violationCount >= 10
                                                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                                        : emp.violationCount >= 5
                                                            ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
                                                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                                    }`}>
                                                    {emp.violationCount}
                                                </span>
                                            ) : (
                                                <span className="text-green-600">✓</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
