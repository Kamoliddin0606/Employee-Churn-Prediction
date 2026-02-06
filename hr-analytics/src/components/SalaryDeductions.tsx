import { useState, useEffect, useMemo } from 'react';
import { Calculator, DollarSign, TrendingDown, Users } from 'lucide-react';
import { api, SalaryDeduction } from '../services/api';
import DataTable, { Column } from './ui/DataTable';

// =============================================================================
// CONSTANTS
// =============================================================================

const MONTHS = [
    { value: 1, label: 'Yanvar' },
    { value: 2, label: 'Fevral' },
    { value: 3, label: 'Mart' },
    { value: 4, label: 'Aprel' },
    { value: 5, label: 'May' },
    { value: 6, label: 'Iyun' },
    { value: 7, label: 'Iyul' },
    { value: 8, label: 'Avgust' },
    { value: 9, label: 'Sentabr' },
    { value: 10, label: 'Oktabr' },
    { value: 11, label: 'Noyabr' },
    { value: 12, label: 'Dekabr' }
];

const YEARS = Array.from({ length: 5 }, (_, i) => {
    const year = new Date().getFullYear() - 2 + i;
    return { value: year, label: year.toString() };
});

// =============================================================================
// COMPONENT
// =============================================================================

export default function SalaryDeductions() {
    const currentDate = new Date();
    const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
    const [loading, setLoading] = useState(false);
    const [calculating, setCalculating] = useState(false);
    const [deductions, setDeductions] = useState<SalaryDeduction[]>([]);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // =============================================================================
    // DATA LOADING
    // =============================================================================

    useEffect(() => {
        loadDeductions();
    }, [selectedYear, selectedMonth]);

    async function loadDeductions() {
        setLoading(true);
        try {
            const res = await api.salaryDeductions.getDeductions({
                year: selectedYear,
                month: selectedMonth
            });

            if (res.success && res.data) {
                setDeductions(res.data);
            } else {
                setDeductions([]);
            }
        } catch (error) {
            console.error('Error loading deductions:', error);
            setDeductions([]);
        } finally {
            setLoading(false);
        }
    }

    // =============================================================================
    // HANDLERS
    // =============================================================================

    async function handleCalculate() {
        setCalculating(true);
        setMessage(null);
        
        try {
            const res = await api.salaryDeductions.calculate({
                year: selectedYear,
                month: selectedMonth
            });

            if (res.success) {
                const data = res.data as any;
                let message = `✅ ${data?.processed || 0} ta xodim uchun hisoblandi`;
                
                // Show warnings if any
                if (data?.errors && data.errors.length > 0) {
                    message += `\n⚠️ ${data.errors.length} ta xodim uchun xatolik:`;
                    data.errors.slice(0, 3).forEach((err: any) => {
                        message += `\n- Xodim ID ${err.employeeId}: ${err.error}`;
                    });
                    if (data.errors.length > 3) {
                        message += `\n... va yana ${data.errors.length - 3} ta`;
                    }
                }
                
                showMessage('success', message);
                await loadDeductions();
            } else {
                showMessage('error', res.error || 'Hisoblashda xatolik yuz berdi');
            }
        } catch (error) {
            console.error('Calculate error:', error);
            
            // Parse error message
            let errorMessage = 'Server bilan bog\'lanishda xatolik';
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (typeof error === 'object' && error !== null && 'message' in error) {
                errorMessage = String((error as any).message);
            }
            
            showMessage('error', `❌ ${errorMessage}`);
        } finally {
            setCalculating(false);
        }
    }

    function showMessage(type: 'success' | 'error', text: string) {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 5000);
    }

    function formatCurrency(amount: number): string {
        return new Intl.NumberFormat('uz-UZ').format(Math.round(amount)) + ' so\'m';
    }

    // =============================================================================
    // SUMMARY CALCULATIONS
    // =============================================================================

    const summary = useMemo(() => {
        if (deductions.length === 0) return null;

        return {
            totalEmployees: deductions.length,
            totalBaseSalary: deductions.reduce((sum, d) => sum + d.baseSalary, 0),
            totalDeductions: deductions.reduce((sum, d) => sum + d.finalDeduction, 0),
            totalFinalSalary: deductions.reduce((sum, d) => sum + d.finalSalary, 0),
            totalKpiResult: deductions.reduce((sum, d) => sum + (d.kpiResult || 0), 0),
            totalWithKpi: deductions.reduce((sum, d) => sum + (d.totalWithKpi || 0), 0),
            avgDeductionPercent: deductions.reduce((sum, d) => 
                sum + (d.finalDeduction / d.baseSalary * 100), 0) / deductions.length,
            employeesWithDeductions: deductions.filter(d => d.finalDeduction > 0).length
        };
    }, [deductions]);

    // =============================================================================
    // TABLE COLUMNS
    // =============================================================================

    const columns: Column<SalaryDeduction>[] = useMemo(() => [
        {
            key: 'employeeName',
            header: 'Xodim',
            render: (_, row) => (
                <div className="font-medium text-gray-900">{row.employeeName}</div>
            )
        },
        {
            key: 'departmentName',
            header: 'Bo\'lim',
            render: (value) => <span className="text-gray-600">{value as string}</span>
        },
        {
            key: 'baseSalary',
            header: 'Oylik (bazaviy)',
            className: 'text-right',
            render: (value) => (
                <span className="font-medium text-blue-600">
                    {formatCurrency(value as number)}
                </span>
            )
        },
        {
            key: 'workDaysCount',
            header: 'Ish kunlari',
            className: 'text-center',
            render: (value) => <span className="text-gray-700">{value as number}</span>
        },
        {
            key: 'lateMinutes',
            header: 'Kech qolish (daq)',
            className: 'text-center',
            render: (value) => {
                const mins = value as number;
                return mins > 0 ? (
                    <span className="text-orange-600 font-medium">{mins}</span>
                ) : <span className="text-gray-400">-</span>;
            }
        },
        {
            key: 'earlyLeaveMinutes',
            header: 'Erta ketish (daq)',
            className: 'text-center',
            render: (value) => {
                const mins = value as number;
                return mins > 0 ? (
                    <span className="text-yellow-600 font-medium">{mins}</span>
                ) : <span className="text-gray-400">-</span>;
            }
        },
        {
            key: 'absentMinutes',
            header: 'Kelmagan (daq)',
            className: 'text-center',
            render: (value) => {
                const mins = value as number;
                return mins > 0 ? (
                    <span className="text-red-600 font-medium">{mins}</span>
                ) : <span className="text-gray-400">-</span>;
            }
        },
        {
            key: 'totalViolationMinutes',
            header: 'Jami (daq)',
            className: 'text-center',
            render: (value) => {
                const mins = value as number;
                return mins > 0 ? (
                    <span className="text-purple-600 font-bold">{mins}</span>
                ) : <span className="text-gray-400">-</span>;
            }
        },
        {
            key: 'minuteRate',
            header: '1 daq qiymati',
            className: 'text-right',
            render: (value) => (
                <span className="text-gray-600 text-sm">
                    {formatCurrency(value as number)}
                </span>
            )
        },
        {
            key: 'calculatedDeduction',
            header: 'Hisoblangan',
            className: 'text-right',
            render: (value) => (
                <span className="text-orange-600">
                    {formatCurrency(value as number)}
                </span>
            )
        },
        {
            key: 'maxDeductionAmount',
            header: 'Maksimal',
            className: 'text-right',
            render: (value) => (
                <span className="text-gray-500 text-sm">
                    {formatCurrency(value as number)}
                </span>
            )
        },
        {
            key: 'finalDeduction',
            header: 'Ushlab qolish',
            className: 'text-right',
            render: (value) => (
                <span className="text-red-600 font-bold">
                    {formatCurrency(value as number)}
                </span>
            )
        },
        {
            key: 'finalSalary',
            header: 'Yakuniy maosh',
            className: 'text-right',
            render: (value) => (
                <span className="text-green-600 font-bold">
                    {formatCurrency(value as number)}
                </span>
            )
        },
        {
            key: 'kpiAmount',
            header: 'KPI (reja)',
            className: 'text-right',
            render: (value) => (
                <span className="text-blue-500">
                    {formatCurrency(value as number)}
                </span>
            )
        },
        {
            key: 'kpiResult',
            header: 'KPI (natija)',
            className: 'text-right',
            render: (value) => {
                const kpi = value as number;
                return kpi > 0 ? (
                    <span className="text-emerald-600 font-medium">
                        +{formatCurrency(kpi)}
                    </span>
                ) : (
                    <span className="text-gray-400">-</span>
                );
            }
        },
        {
            key: 'totalWithKpi',
            header: 'Maosh + KPI',
            className: 'text-right',
            render: (value) => (
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-3 py-1.5 rounded-lg shadow-sm">
                    <span className="font-bold text-lg">
                        {formatCurrency(value as number)}
                    </span>
                </div>
            )
        }
    ], []);

    // =============================================================================
    // RENDER
    // =============================================================================

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <DollarSign className="w-7 h-7 text-green-500" />
                        Maosh Ushlab Qolish
                    </h1>
                    <p className="text-gray-500 mt-1">
                        Buzilishlar asosida oylikdan ushlab qolinadigan summalar
                    </p>
                </div>

                {/* Period Selection */}
                <div className="flex items-center gap-3">
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    >
                        {YEARS.map(y => (
                            <option key={y.value} value={y.value}>{y.label}</option>
                        ))}
                    </select>
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(Number(e.target.value))}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    >
                        {MONTHS.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Message */}
            {message && (
                <div className={`p-4 rounded-lg ${
                    message.type === 'success' 
                        ? 'bg-green-50 text-green-700 border border-green-200' 
                        : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                    <pre className="whitespace-pre-wrap font-sans text-sm">{message.text}</pre>
                </div>
            )}

            {/* Summary Cards */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                        <div className="flex items-center gap-2 text-gray-600 text-sm mb-1">
                            <Users className="w-4 h-4" />
                            Jami xodimlar
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{summary.totalEmployees}</div>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-blue-200">
                        <div className="text-blue-600 text-sm mb-1">Bazaviy maosh</div>
                        <div className="text-lg font-bold text-blue-700">
                            {formatCurrency(summary.totalBaseSalary)}
                        </div>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-red-200">
                        <div className="text-red-600 text-sm mb-1">Ushlab qolish</div>
                        <div className="text-lg font-bold text-red-700">
                            {formatCurrency(summary.totalDeductions)}
                        </div>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-green-200">
                        <div className="text-green-600 text-sm mb-1">Yakuniy maosh</div>
                        <div className="text-lg font-bold text-green-700">
                            {formatCurrency(summary.totalFinalSalary)}
                        </div>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-emerald-200">
                        <div className="text-emerald-600 text-sm mb-1">Jami KPI</div>
                        <div className="text-lg font-bold text-emerald-700">
                            +{formatCurrency(summary.totalKpiResult)}
                        </div>
                    </div>
                    <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-4 shadow-lg">
                        <div className="text-white text-sm mb-1 opacity-90">Maosh + KPI</div>
                        <div className="text-2xl font-bold text-white">
                            {formatCurrency(summary.totalWithKpi)}
                        </div>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-200">
                        <div className="text-purple-600 text-sm mb-1">Ushlab qolingan</div>
                        <div className="text-2xl font-bold text-purple-700">
                            {summary.employeesWithDeductions}
                        </div>
                    </div>
                </div>
            )}

            {/* Calculate Button */}
            <div className="flex justify-end">
                <button
                    onClick={handleCalculate}
                    disabled={calculating}
                    className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2 disabled:opacity-50"
                >
                    <Calculator className="w-5 h-5" />
                    {calculating ? 'Hisoblanmoqda...' : 'Hisoblash'}
                </button>
            </div>

            {/* Deductions Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                        <span className="ml-3 text-gray-600">Yuklanmoqda...</span>
                    </div>
                ) : (
                    <DataTable
                        data={deductions}
                        columns={columns}
                        searchPlaceholder="Xodim yoki bo'lim qidirish..."
                        emptyMessage="Bu oy uchun hisob-kitob hali amalga oshirilmagan. 'Hisoblash' tugmasini bosing."
                        emptyIcon={<TrendingDown className="w-12 h-12 opacity-30" />}
                        maxHeight="calc(100vh - 500px)"
                        getRowKey={(row) => `${row.employeeId}-${row.year}-${row.month}`}
                    />
                )}
            </div>
        </div>
    );
}
