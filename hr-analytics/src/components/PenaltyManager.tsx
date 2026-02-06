/**
 * =============================================================================
 * PenaltyManager Component
 * =============================================================================
 * 
 * Professional UI for managing employee penalties based on violations.
 * Features:
 * - Configurable penalty rules per month
 * - Penalty calculation and application
 * - Detailed penalty report per employee
 * - KPI zeroing tracking across months
 * 
 * @component PenaltyManager
 * @author HR Analytics Team
 * @version 1.0.0
 */

import { useState, useEffect, useCallback } from 'react';
import { 
    AlertTriangle, 
    Calculator, 
    Settings, 
    FileText, 
    DollarSign,
    XCircle,
    CheckCircle,
    ChevronDown,
    ChevronUp,
    Copy,
    Save,
    RefreshCw
} from 'lucide-react';

// =============================================================================
// CONSTANTS
// =============================================================================

const API_BASE_URL = 'http://localhost:3001/api';

/**
 * Month names in Uzbek
 */
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
    { value: 12, label: 'Dekabr' },
];

/**
 * Generate year options
 */
const YEARS = Array.from({ length: 5 }, (_, i) => {
    const year = new Date().getFullYear() - 2 + i;
    return { value: year, label: String(year) };
});

/**
 * Penalty type labels
 */
const PENALTY_TYPE_LABELS: Record<string, string> = {
    fine: 'Pul jarimasi',
    kpi_zero: 'KPI nollash',
    termination: 'Ishdan bo\'shatish',
};

// =============================================================================
// TYPES
// =============================================================================

interface PenaltyRule {
    id?: number;
    year: number;
    month: number;
    level: number;
    penaltyType: 'fine' | 'kpi_zero' | 'termination';
    fineAmount: number;
    kpiMonths: number;
    description: string | null;
    isActive: boolean;
}

interface EmployeePenalty {
    id: number;
    employeeId: number;
    year: number;
    month: number;
    lateCount: number;           // Kech kelish
    earlyLeaveCount: number;     // Erta ketish
    absentCount: number;         // Kelmagan
    absentTotalMinutes?: number; // Kelmagan umumiy daqiqalar
    totalViolations: number;     // Jami buzilishlar
    totalFine: number;
    kpiZeroed: boolean;
    kpiZeroedMonths: number;
    kpiCarriedFromPrev?: number; // O'tgan oydan ko'chirilgan KPI
    kpiResult?: number;          // KPI natijasi
    kpiAmount?: number;          // KPI miqdori
    terminationRecommended: boolean;
    employeeName: string;
    departmentName: string;
    calculatedAt: string;
}

interface PenaltySummary {
    totalEmployees: number;
    employeesWithFines: number;
    totalFineAmount: number;
    kpiZeroedCount: number;
    terminationCount: number;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function PenaltyManager() {
    // =========================================================================
    // STATE
    // =========================================================================

    const [activeTab, setActiveTab] = useState<'rules' | 'report'>('rules');
    const [loading, setLoading] = useState(false);
    const [calculating, setCalculating] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Period selection
    const currentDate = new Date();
    const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);

    // Rules state
    const [rules, setRules] = useState<PenaltyRule[]>([]);
    const [editingRules, setEditingRules] = useState<PenaltyRule[]>([]);
    const [hasChanges, setHasChanges] = useState(false);

    // Report state
    const [penalties, setPenalties] = useState<EmployeePenalty[]>([]);
    const [summary, setSummary] = useState<PenaltySummary | null>(null);
    const [expandedEmployee, setExpandedEmployee] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState<keyof EmployeePenalty>('totalFine');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    // Copy modal state
    const [showCopyModal, setShowCopyModal] = useState(false);
    const [copyTargetYear, setCopyTargetYear] = useState(currentDate.getFullYear());
    const [copyTargetMonth, setCopyTargetMonth] = useState(currentDate.getMonth() + 1);

    // =========================================================================
    // DATA LOADING
    // =========================================================================

    /**
     * Load penalty rules for selected period
     */
    const loadRules = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(
                `${API_BASE_URL}/penalties/rules?year=${selectedYear}&month=${selectedMonth}`
            );
            const data = await res.json();

            if (data.success) {
                setRules(data.data);
                // Initialize editing rules with default structure
                initializeEditingRules(data.data);
            } else {
                showMessage('error', data.error || 'Qoidalarni yuklashda xatolik');
            }
        } catch (error) {
            showMessage('error', 'Server bilan bog\'lanishda xatolik');
        } finally {
            setLoading(false);
        }
    }, [selectedYear, selectedMonth]);

    /**
     * Initialize editing rules with defaults if empty
     */
    function initializeEditingRules(existingRules: PenaltyRule[]) {
        // Default rules structure
        const defaultRules: PenaltyRule[] = [
            { year: selectedYear, month: selectedMonth, level: 1, penaltyType: 'fine', fineAmount: 100000, kpiMonths: 0, description: '1-marta kech qolish jarimasi', isActive: true },
            { year: selectedYear, month: selectedMonth, level: 2, penaltyType: 'fine', fineAmount: 150000, kpiMonths: 0, description: '2-marta kech qolish jarimasi', isActive: true },
            { year: selectedYear, month: selectedMonth, level: 3, penaltyType: 'fine', fineAmount: 200000, kpiMonths: 0, description: '3-marta kech qolish jarimasi', isActive: true },
            { year: selectedYear, month: selectedMonth, level: 4, penaltyType: 'kpi_zero', fineAmount: 0, kpiMonths: 1, description: '4-marta kech qolish - joriy oy KPI nollanadi', isActive: true },
            { year: selectedYear, month: selectedMonth, level: 5, penaltyType: 'kpi_zero', fineAmount: 0, kpiMonths: 2, description: '5-marta kech qolish - 2 oylik KPI nollanadi', isActive: true },
            { year: selectedYear, month: selectedMonth, level: 6, penaltyType: 'termination', fineAmount: 0, kpiMonths: 0, description: '6+ marta kech qolish - ishdan bo\'shatish tavsiyasi', isActive: true },
        ];

        if (existingRules.length === 0) {
            setEditingRules(defaultRules);
        } else {
            // Merge existing rules with defaults for missing levels
            const mergedRules = defaultRules.map(defaultRule => {
                const existing = existingRules.find(r => r.level === defaultRule.level);
                return existing ? { ...existing } : defaultRule;
            });
            setEditingRules(mergedRules);
        }
        setHasChanges(false);
    }

    /**
     * Load applied penalties for selected period
     */
    const loadPenalties = useCallback(async () => {
        setLoading(true);
        try {
            const [penaltiesRes, summaryRes] = await Promise.all([
                fetch(`${API_BASE_URL}/penalties?year=${selectedYear}&month=${selectedMonth}`),
                fetch(`${API_BASE_URL}/penalties/summary?year=${selectedYear}&month=${selectedMonth}`)
            ]);

            const penaltiesData = await penaltiesRes.json();
            const summaryData = await summaryRes.json();

            if (penaltiesData.success) {
                setPenalties(penaltiesData.data);
            }
            if (summaryData.success) {
                setSummary(summaryData.data);
            }
        } catch (error) {
            showMessage('error', 'Server bilan bog\'lanishda xatolik');
        } finally {
            setLoading(false);
        }
    }, [selectedYear, selectedMonth]);

    // Load data when period or tab changes
    useEffect(() => {
        if (activeTab === 'rules') {
            loadRules();
        } else {
            loadPenalties();
        }
    }, [activeTab, selectedYear, selectedMonth, loadRules, loadPenalties]);

    // =========================================================================
    // HANDLERS
    // =========================================================================

    /**
     * Show message with auto-hide
     */
    function showMessage(type: 'success' | 'error', text: string) {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 5000);
    }

    /**
     * Handle rule field change
     */
    function handleRuleChange(level: number, field: keyof PenaltyRule, value: unknown) {
        setEditingRules(prev => prev.map(rule => 
            rule.level === level ? { ...rule, [field]: value } : rule
        ));
        setHasChanges(true);
    }

    /**
     * Save all rules
     */
    async function handleSaveRules() {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/penalties/rules/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    year: selectedYear,
                    month: selectedMonth,
                    rules: editingRules,
                }),
            });

            const data = await res.json();

            if (data.success) {
                showMessage('success', data.message || 'Qoidalar saqlandi');
                setHasChanges(false);
                loadRules();
            } else {
                showMessage('error', data.error || 'Saqlashda xatolik');
            }
        } catch (error) {
            showMessage('error', 'Server bilan bog\'lanishda xatolik');
        } finally {
            setLoading(false);
        }
    }

    /**
     * Copy rules to another month
     */
    async function handleCopyRules() {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/penalties/rules/copy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceYear: selectedYear,
                    sourceMonth: selectedMonth,
                    targetYear: copyTargetYear,
                    targetMonth: copyTargetMonth,
                }),
            });

            const data = await res.json();

            if (data.success) {
                showMessage('success', data.message || 'Qoidalar nusxalandi');
                setShowCopyModal(false);
            } else {
                showMessage('error', data.error || 'Nusxalashda xatolik');
            }
        } catch (error) {
            showMessage('error', 'Server bilan bog\'lanishda xatolik');
        } finally {
            setLoading(false);
        }
    }

    /**
     * Calculate penalties for all employees
     */
    async function handleCalculatePenalties() {
        setCalculating(true);
        try {
            const res = await fetch(`${API_BASE_URL}/penalties/calculate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    year: selectedYear,
                    month: selectedMonth,
                }),
            });

            const data = await res.json();

            if (data.success) {
                showMessage('success', data.message || 'Jarimalar hisoblandi');
                loadPenalties();
            } else {
                showMessage('error', data.error || 'Hisoblashda xatolik');
            }
        } catch (error) {
            showMessage('error', 'Server bilan bog\'lanishda xatolik');
        } finally {
            setCalculating(false);
        }
    }

    /**
     * Format currency
     */
    function formatCurrency(amount: number): string {
        return new Intl.NumberFormat('uz-UZ').format(amount) + ' so\'m';
    }

    // =========================================================================
    // FILTERING AND SORTING
    // =========================================================================

    // Filter penalties based on search query
    const filteredPenalties = penalties.filter(penalty => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            penalty.employeeName.toLowerCase().includes(query) ||
            penalty.departmentName.toLowerCase().includes(query) ||
            penalty.totalFine.toString().includes(query) ||
            penalty.totalViolations.toString().includes(query) ||
            (penalty.kpiAmount?.toString() || '').includes(query) ||
            (penalty.kpiResult?.toString() || '').includes(query)
        );
    });

    // Sort penalties
    const sortedPenalties = [...filteredPenalties].sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        
        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;
        
        if (typeof aVal === 'string' && typeof bVal === 'string') {
            return sortOrder === 'asc' 
                ? aVal.localeCompare(bVal)
                : bVal.localeCompare(aVal);
        }
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        return 0;
    });

    // Handle sort
    const handleSort = (field: keyof EmployeePenalty) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    // =========================================================================
    // RENDER
    // =========================================================================

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <AlertTriangle className="w-7 h-7 text-orange-500" />
                        Jarimalar Boshqaruvi
                    </h1>
                    <p className="text-gray-500 mt-1">
                        Kech qolish jarimalarini sozlash va hisoblash
                    </p>
                </div>

                {/* Period Selection */}
                <div className="flex items-center gap-3">
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                        {YEARS.map(y => (
                            <option key={y.value} value={y.value}>{y.label}</option>
                        ))}
                    </select>
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(Number(e.target.value))}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                        {MONTHS.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Message */}
            {message && (
                <div className={`p-4 rounded-lg flex items-center gap-2 ${
                    message.type === 'success' 
                        ? 'bg-green-50 text-green-700 border border-green-200' 
                        : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                    {message.type === 'success' ? (
                        <CheckCircle className="w-5 h-5" />
                    ) : (
                        <XCircle className="w-5 h-5" />
                    )}
                    {message.text}
                </div>
            )}

            {/* Tabs */}
            <div className="border-b border-gray-200">
                <nav className="flex gap-4">
                    <button
                        onClick={() => setActiveTab('rules')}
                        className={`px-4 py-3 font-medium border-b-2 transition-colors flex items-center gap-2 ${
                            activeTab === 'rules'
                                ? 'border-orange-500 text-orange-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <Settings className="w-4 h-4" />
                        Qoidalar Sozlash
                    </button>
                    <button
                        onClick={() => setActiveTab('report')}
                        className={`px-4 py-3 font-medium border-b-2 transition-colors flex items-center gap-2 ${
                            activeTab === 'report'
                                ? 'border-orange-500 text-orange-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <FileText className="w-4 h-4" />
                        Jarimalar Hisoboti
                    </button>
                </nav>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
                </div>
            ) : activeTab === 'rules' ? (
                /* Rules Configuration Tab */
                <div className="space-y-6">
                    {/* Action Buttons */}
                    <div className="flex items-center justify-between">
                        <p className="text-gray-600">
                            {MONTHS.find(m => m.value === selectedMonth)?.label} {selectedYear} uchun jarima qoidalari
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowCopyModal(true)}
                                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 flex items-center gap-2"
                            >
                                <Copy className="w-4 h-4" />
                                Boshqa oyga nusxalash
                            </button>
                            <button
                                onClick={handleSaveRules}
                                disabled={!hasChanges || loading}
                                className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                                    hasChanges
                                        ? 'bg-orange-500 text-white hover:bg-orange-600'
                                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                }`}
                            >
                                <Save className="w-4 h-4" />
                                Saqlash
                            </button>
                        </div>
                    </div>

                    {/* Rules Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Bosqich</th>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Jarima Turi</th>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Summa</th>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">KPI Oylari</th>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Tavsif</th>
                                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Faol</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {editingRules.map((rule) => (
                                    <tr key={rule.level} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                                                rule.level <= 3 ? 'bg-yellow-100 text-yellow-700' :
                                                rule.level <= 5 ? 'bg-orange-100 text-orange-700' :
                                                'bg-red-100 text-red-700'
                                            }`}>
                                                {rule.level}{rule.level >= 6 ? '+' : ''}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <select
                                                value={rule.penaltyType}
                                                onChange={(e) => handleRuleChange(rule.level, 'penaltyType', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                            >
                                                <option value="fine">Pul jarimasi</option>
                                                <option value="kpi_zero">KPI nollash</option>
                                                <option value="termination">Ishdan bo'shatish</option>
                                            </select>
                                        </td>
                                        <td className="px-4 py-3">
                                            <input
                                                type="number"
                                                value={rule.fineAmount}
                                                onChange={(e) => handleRuleChange(rule.level, 'fineAmount', Number(e.target.value))}
                                                disabled={rule.penaltyType !== 'fine'}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
                                                placeholder="0"
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input
                                                type="number"
                                                value={rule.kpiMonths}
                                                onChange={(e) => handleRuleChange(rule.level, 'kpiMonths', Number(e.target.value))}
                                                disabled={rule.penaltyType !== 'kpi_zero'}
                                                min={0}
                                                max={12}
                                                className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input
                                                type="text"
                                                value={rule.description || ''}
                                                onChange={(e) => handleRuleChange(rule.level, 'description', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                                placeholder="Tavsif kiriting..."
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <input
                                                type="checkbox"
                                                checked={rule.isActive}
                                                onChange={(e) => handleRuleChange(rule.level, 'isActive', e.target.checked)}
                                                className="w-5 h-5 text-orange-500 rounded focus:ring-orange-500"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Legend */}
                    <div className="bg-gray-50 rounded-lg p-4">
                        <h3 className="font-medium text-gray-700 mb-2">Jarima turlari:</h3>
                        <div className="flex flex-wrap gap-4 text-sm">
                            <div className="flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-yellow-600" />
                                <span><strong>Pul jarimasi</strong> - belgilangan summa ushlanadi</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <XCircle className="w-4 h-4 text-orange-600" />
                                <span><strong>KPI nollash</strong> - belgilangan oylar uchun KPI 0 ga tenglashtiriladi</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-600" />
                                <span><strong>Ishdan bo'shatish</strong> - buyruq chiqarish tavsiyasi</span>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                /* Penalties Report Tab */
                <div className="space-y-6">
                    {/* Summary Cards */}
                    {summary && (
                        <div className="grid grid-cols-5 gap-4">
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                                <p className="text-sm text-gray-500">Jami xodimlar</p>
                                <p className="text-2xl font-bold text-gray-900">{summary.totalEmployees}</p>
                            </div>
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-yellow-200">
                                <p className="text-sm text-yellow-600">Jarimali xodimlar</p>
                                <p className="text-2xl font-bold text-yellow-700">{summary.employeesWithFines}</p>
                            </div>
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-orange-200">
                                <p className="text-sm text-orange-600">Jami jarima</p>
                                <p className="text-xl font-bold text-orange-700">{formatCurrency(summary.totalFineAmount)}</p>
                            </div>
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-200">
                                <p className="text-sm text-purple-600">KPI nollangan</p>
                                <p className="text-2xl font-bold text-purple-700">{summary.kpiZeroedCount}</p>
                            </div>
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-red-200">
                                <p className="text-sm text-red-600">Bo'shatish tavsiyasi</p>
                                <p className="text-2xl font-bold text-red-700">{summary.terminationCount}</p>
                            </div>
                        </div>
                    )}

                    {/* Calculate Button and Search */}
                    <div className="flex justify-between items-center gap-4">
                        <input
                            type="text"
                            placeholder="Qidirish (xodim, bo'lim, jarima...)"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        />
                        <button
                            onClick={handleCalculatePenalties}
                            disabled={calculating}
                            className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 flex items-center gap-2 disabled:opacity-50"
                        >
                            {calculating ? (
                                <RefreshCw className="w-5 h-5 animate-spin" />
                            ) : (
                                <Calculator className="w-5 h-5" />
                            )}
                            {calculating ? 'Hisoblanmoqda...' : 'Jarimalarni Hisoblash'}
                        </button>
                    </div>

                    {/* Penalties Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th onClick={() => handleSort('employeeName')} className="px-4 py-3 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100">
                                        Xodim {sortField === 'employeeName' && (sortOrder === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th onClick={() => handleSort('departmentName')} className="px-4 py-3 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100">
                                        Bo'lim {sortField === 'departmentName' && (sortOrder === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th onClick={() => handleSort('absentTotalMinutes')} className="px-4 py-3 text-center text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100">
                                        Kelmagan (daq) {sortField === 'absentTotalMinutes' && (sortOrder === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th onClick={() => handleSort('kpiAmount')} className="px-4 py-3 text-center text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100">
                                        KPI Miqdori {sortField === 'kpiAmount' && (sortOrder === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th onClick={() => handleSort('kpiResult')} className="px-4 py-3 text-center text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100">
                                        KPI Natija {sortField === 'kpiResult' && (sortOrder === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th onClick={() => handleSort('totalViolations')} className="px-4 py-3 text-center text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100">
                                        Buzilishlar {sortField === 'totalViolations' && (sortOrder === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th onClick={() => handleSort('totalFine')} className="px-4 py-3 text-right text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100">
                                        Jarima {sortField === 'totalFine' && (sortOrder === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th onClick={() => handleSort('kpiZeroedMonths')} className="px-4 py-3 text-center text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100">
                                        KPI {sortField === 'kpiZeroedMonths' && (sortOrder === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Status</th>
                                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {sortedPenalties.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                                            {penalties.length === 0 
                                                ? "Bu oy uchun jarimalar hali hisoblanmagan. 'Jarimalarni Hisoblash' tugmasini bosing."
                                                : "Qidiruv natijasi topilmadi."
                                            }
                                        </td>
                                    </tr>
                                ) : (
                                    sortedPenalties.map((penalty) => (
                                        <tr 
                                            key={penalty.id} 
                                            className={`hover:bg-gray-50 ${
                                                penalty.terminationRecommended ? 'bg-red-50' : 
                                                penalty.kpiZeroed ? 'bg-orange-50' : ''
                                            }`}
                                        >
                                            <td className="px-4 py-3 font-medium">{penalty.employeeName}</td>
                                            <td className="px-4 py-3 text-gray-600">{penalty.departmentName}</td>
                                            <td className="px-4 py-3 text-center">
                                                {penalty.absentTotalMinutes ? (
                                                    <span className="text-red-600 font-medium">
                                                        {penalty.absentTotalMinutes}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {penalty.kpiAmount ? (
                                                    <span className="text-blue-600 font-medium">
                                                        {formatCurrency(penalty.kpiAmount)}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {penalty.kpiResult !== undefined && penalty.kpiResult !== null ? (
                                                    <span className={`font-medium ${penalty.kpiResult === 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                        {formatCurrency(penalty.kpiResult)}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex flex-col items-center" title={`Kech: ${penalty.lateCount || 0}, Erta: ${penalty.earlyLeaveCount || 0}, Kelmagan: ${penalty.absentCount || 0}`}>
                                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                                                        (penalty.totalViolations || penalty.lateCount) === 0 ? 'bg-green-100 text-green-700' :
                                                        (penalty.totalViolations || penalty.lateCount) <= 3 ? 'bg-yellow-100 text-yellow-700' :
                                                        (penalty.totalViolations || penalty.lateCount) <= 5 ? 'bg-orange-100 text-orange-700' :
                                                        'bg-red-100 text-red-700'
                                                    }`}>
                                                        {penalty.totalViolations || penalty.lateCount}
                                                    </span>
                                                    <span className="text-xs text-gray-400 mt-1">
                                                        K:{penalty.lateCount || 0} E:{penalty.earlyLeaveCount || 0} A:{penalty.absentCount || 0}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-medium">
                                                {penalty.totalFine > 0 ? formatCurrency(penalty.totalFine) : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {penalty.kpiZeroed ? (
                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                                        {penalty.kpiZeroedMonths} oy
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {penalty.terminationRecommended ? (
                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                                        <AlertTriangle className="w-3 h-3 mr-1" />
                                                        Bo'shatish
                                                    </span>
                                                ) : (penalty.totalViolations || penalty.lateCount) === 0 ? (
                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                                        <CheckCircle className="w-3 h-3 mr-1" />
                                                        Yaxshi
                                                    </span>
                                                ) : null}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => setExpandedEmployee(
                                                        expandedEmployee === penalty.employeeId ? null : penalty.employeeId
                                                    )}
                                                    className="p-1 text-gray-400 hover:text-gray-600"
                                                >
                                                    {expandedEmployee === penalty.employeeId ? (
                                                        <ChevronUp className="w-5 h-5" />
                                                    ) : (
                                                        <ChevronDown className="w-5 h-5" />
                                                    )}
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Copy Rules Modal */}
            {showCopyModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
                        <h2 className="text-lg font-semibold mb-4">Qoidalarni Nusxalash</h2>
                        <p className="text-sm text-gray-600 mb-4">
                            {MONTHS.find(m => m.value === selectedMonth)?.label} {selectedYear} qoidalarini boshqa oyga nusxalash:
                        </p>
                        <div className="flex gap-3 mb-6">
                            <select
                                value={copyTargetYear}
                                onChange={(e) => setCopyTargetYear(Number(e.target.value))}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                            >
                                {YEARS.map(y => (
                                    <option key={y.value} value={y.value}>{y.label}</option>
                                ))}
                            </select>
                            <select
                                value={copyTargetMonth}
                                onChange={(e) => setCopyTargetMonth(Number(e.target.value))}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                            >
                                {MONTHS.map(m => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowCopyModal(false)}
                                className="px-4 py-2 text-gray-600 hover:text-gray-800"
                            >
                                Bekor qilish
                            </button>
                            <button
                                onClick={handleCopyRules}
                                disabled={loading}
                                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
                            >
                                Nusxalash
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
