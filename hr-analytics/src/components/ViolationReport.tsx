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

import { useState, useEffect, useMemo } from 'react';
import { violationsApi, departmentsApi, importApi } from '../services/api';
import type { ViolationSummary, Department } from '../services/api';
import { DataTable, Column } from './ui/DataTable';
import { CollapsibleSection } from './ui/CollapsibleSection';
import { Users } from 'lucide-react';

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
    const sortBy = 'violation_count';
    const sortOrder = 'desc';

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
            absentTotalMinutes: number;
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

    // =============================================================================
    // TABLE COLUMNS
    // =============================================================================

    const columns: Column<ViolationSummary>[] = useMemo(() => [
        {
            key: 'employeeName',
            header: 'Xodim',
            render: (_, row) => (
                <div>
                    <div className="font-medium text-gray-900 dark:text-white">{row.employeeName}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{row.externalId}</div>
                </div>
            )
        },
        {
            key: 'department',
            header: 'Bo\'lim'
        },
        {
            key: 'lateCount',
            header: 'Kechikish',
            className: 'text-center',
            render: (value) => {
                const count = value as number;
                return count > 0 ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                        {count}
                    </span>
                ) : <span className="text-gray-400">-</span>;
            }
        },
        {
            key: 'totalLateMinutes',
            header: 'Kechikish (daq)',
            className: 'text-center',
            render: (value) => {
                const mins = value as number;
                return mins > 0 ? (
                    <span className="text-orange-600 dark:text-orange-400">{mins}</span>
                ) : <span className="text-gray-400">-</span>;
            }
        },
        {
            key: 'earlyLeaveCount',
            header: 'Erta ketish',
            className: 'text-center',
            render: (value) => {
                const count = value as number;
                return count > 0 ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                        {count}
                    </span>
                ) : <span className="text-gray-400">-</span>;
            }
        },
        {
            key: 'totalEarlyLeaveMinutes',
            header: 'Erta ketish (daq)',
            className: 'text-center',
            render: (value) => {
                const mins = value as number;
                return mins > 0 ? (
                    <span className="text-yellow-600 dark:text-yellow-400">{mins}</span>
                ) : <span className="text-gray-400">-</span>;
            }
        },
        {
            key: 'absentCount',
            header: 'Kelmagan',
            className: 'text-center',
            render: (value) => {
                const count = value as number;
                return count > 0 ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                        {count}
                    </span>
                ) : <span className="text-gray-400">-</span>;
            }
        },
        {
            key: 'absentTotalMinutes',
            header: 'Kelmagan (daq)',
            className: 'text-center',
            render: (value) => {
                const mins = value as number;
                return mins > 0 ? (
                    <span className="text-red-600 dark:text-red-400 font-medium">{mins}</span>
                ) : <span className="text-gray-400">-</span>;
            }
        },
        {
            key: 'violationCount',
            header: 'Jami',
            className: 'text-center',
            render: (value) => {
                const count = value as number;
                if (count === 0) return <span className="text-green-600">✓</span>;
                const colorClass = count >= 10
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    : count >= 5
                        ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
                return (
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}>
                        {count}
                    </span>
                );
            }
        },
        {
            key: 'totalMinutes',
            header: 'Jami (daq)',
            className: 'text-center',
            render: (_, row) => {
                const totalMinutes = (row.totalLateMinutes || 0) + 
                                    (row.totalEarlyLeaveMinutes || 0) + 
                                    (row.absentTotalMinutes || 0);
                return totalMinutes > 0 ? (
                    <span className="text-purple-600 dark:text-purple-400 font-bold">{totalMinutes}</span>
                ) : <span className="text-gray-400">-</span>;
            }
        },
    ], []);

    // =============================================================================
    // RENDER
    // =============================================================================

    return (
        <div className="h-full flex flex-col">
            {/* Message */}
            {message && (
                <div className={`mb-4 p-3 rounded-lg flex-shrink-0 ${message.type === 'success'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                    }`}>
                    {message.text}
                </div>
            )}

            {/* Collapsible Filters & Summary */}
            <CollapsibleSection title="Filtrlar va Statistika" className="mb-4 flex-shrink-0">
                {/* Filters */}
                <div className="flex flex-wrap gap-4 items-end pt-3">
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

                {/* Summary Cards */}
                {report && report.totals && (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mt-4">
                        <div className="bg-muted/50 rounded-lg p-3">
                            <div className="text-xl font-bold">{report.employeeCount}</div>
                            <div className="text-xs text-muted-foreground">Jami xodim</div>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3">
                            <div className="text-xl font-bold text-red-600">{report.totals.violationCount}</div>
                            <div className="text-xs text-muted-foreground">Jami buzilish</div>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3">
                            <div className="text-xl font-bold text-orange-600">{report.totals.lateCount}</div>
                            <div className="text-xs text-muted-foreground">Kechikish</div>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3">
                            <div className="text-xl font-bold text-yellow-600">{report.totals.earlyLeaveCount}</div>
                            <div className="text-xs text-muted-foreground">Erta ketish</div>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3">
                            <div className="text-xl font-bold text-red-700">{report.totals.absentCount}</div>
                            <div className="text-xs text-muted-foreground">Kelmagan</div>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3">
                            <div className="text-lg font-bold text-orange-700">{formatMinutes(report.totals.totalLateMinutes)}</div>
                            <div className="text-xs text-muted-foreground">Kechikish vaqti</div>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3">
                            <div className="text-lg font-bold text-yellow-700">{formatMinutes(report.totals.totalEarlyLeaveMinutes)}</div>
                            <div className="text-xs text-muted-foreground">Erta ketish vaqti</div>
                        </div>
                    </div>
                )}
            </CollapsibleSection>

            {/* Table with DataTable component */}
            <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        <span className="ml-3 text-muted-foreground">Yuklanmoqda...</span>
                    </div>
                ) : (
                    <DataTable
                        data={report?.employees || []}
                        columns={columns}
                        searchPlaceholder="Xodim qidirish..."
                        emptyMessage="Ma'lumot topilmadi. 'Hisoblash' tugmasini bosing."
                        emptyIcon={<Users className="w-12 h-12 opacity-30" />}
                        maxHeight="calc(100vh - 400px)"
                        collapsibleHeader={false}
                        getRowKey={(row) => row.id}
                    />
                )}
            </div>
        </div>
    );
}
