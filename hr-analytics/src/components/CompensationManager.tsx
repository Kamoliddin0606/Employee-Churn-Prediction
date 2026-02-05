/**
 * =============================================================================
 * CompensationManager Component
 * =============================================================================
 * 
 * Professional UI for managing employee KPI and salary data.
 * Features:
 * - Excel template download
 * - Excel import with year/month selection
 * - Data table with filtering
 * - CRUD operations
 * 
 * @component CompensationManager
 * @author HR Analytics Team
 * @version 1.0.0
 */

import { useState, useEffect } from 'react';
import { compensationApi } from '../services/api';
import type { EmployeeCompensation } from '../services/api';

// =============================================================================
// CONSTANTS
// =============================================================================

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
 * Generate year options (current year ± 2)
 */
const YEARS = Array.from({ length: 5 }, (_, i) => {
    const year = new Date().getFullYear() - 2 + i;
    return { value: year, label: String(year) };
});

// =============================================================================
// COMPONENT
// =============================================================================

export default function CompensationManager() {
    // =========================================================================
    // STATE
    // =========================================================================

    const [compensations, setCompensations] = useState<EmployeeCompensation[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Filter state
    const currentDate = new Date();
    const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);

    // Import modal state
    const [showImportModal, setShowImportModal] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importYear, setImportYear] = useState(currentDate.getFullYear());
    const [importMonth, setImportMonth] = useState(currentDate.getMonth() + 1);

    // =========================================================================
    // DATA LOADING
    // =========================================================================

    /**
     * Load compensation data based on selected filters
     */
    useEffect(() => {
        loadData();
    }, [selectedYear, selectedMonth]);

    async function loadData() {
        setLoading(true);
        try {
            const res = await compensationApi.getAll({
                year: selectedYear,
                month: selectedMonth,
            });

            if (res.success && res.data) {
                setCompensations(res.data);
            } else {
                showMessage('error', res.error || 'Ma\'lumotlarni yuklashda xatolik');
            }
        } catch (error) {
            showMessage('error', 'Ma\'lumotlarni yuklashda xatolik');
        } finally {
            setLoading(false);
        }
    }

    // =========================================================================
    // MESSAGE HELPER
    // =========================================================================

    /**
     * Show temporary message to user
     */
    function showMessage(type: 'success' | 'error', text: string) {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 3000);
    }

    // =========================================================================
    // HANDLERS
    // =========================================================================

    /**
     * Download Excel template
     */
    async function handleDownloadTemplate() {
        try {
            await compensationApi.downloadTemplate();
            showMessage('success', 'Shablon yuklandi');
        } catch (error) {
            showMessage('error', 'Shablon yuklashda xatolik');
        }
    }

    /**
     * Handle import file selection
     */
    function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) {
            setImportFile(file);
        }
    }

    /**
     * Import compensation data from Excel
     */
    async function handleImport() {
        if (!importFile) {
            showMessage('error', 'Faylni tanlang');
            return;
        }

        setSaving(true);
        try {
            const res = await compensationApi.import(importFile, importYear, importMonth);

            if (res.success && res.data) {
                const { imported, updated, errors } = res.data;

                if (errors.length > 0) {
                    showMessage('error', `${imported} yangi, ${updated} yangilandi. ${errors.length} ta xatolik`);
                } else {
                    showMessage('success', `${imported} yangi, ${updated} yangilandi`);
                }

                setShowImportModal(false);
                setImportFile(null);
                loadData();
            } else {
                showMessage('error', res.error || 'Import xatolik');
            }
        } catch (error) {
            showMessage('error', 'Import xatolik');
        } finally {
            setSaving(false);
        }
    }

    /**
     * Delete compensation record
     */
    async function handleDelete(id: number) {
        if (!confirm('O\'chirmoqchimisiz?')) return;

        setSaving(true);
        try {
            const res = await compensationApi.delete(id);

            if (res.success) {
                showMessage('success', 'O\'chirildi');
                loadData();
            } else {
                showMessage('error', res.error || 'O\'chirishda xatolik');
            }
        } catch (error) {
            showMessage('error', 'O\'chirishda xatolik');
        } finally {
            setSaving(false);
        }
    }

    // =========================================================================
    // RENDER
    // =========================================================================

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">KPI va Maosh Boshqaruvi</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                    Xodimlarning oylik KPI va maosh ma'lumotlarini boshqarish
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

            {/* Controls */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
                <div className="flex flex-wrap gap-4 items-end">
                    {/* Year Selector */}
                    <div className="flex-1 min-w-[120px]">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Yil
                        </label>
                        <select
                            value={selectedYear}
                            onChange={e => setSelectedYear(parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            {YEARS.map(year => (
                                <option key={year.value} value={year.value}>{year.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Month Selector */}
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Oy
                        </label>
                        <select
                            value={selectedMonth}
                            onChange={e => setSelectedMonth(parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            {MONTHS.map(month => (
                                <option key={month.value} value={month.value}>{month.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                        <button
                            onClick={handleDownloadTemplate}
                            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                        >
                            📥 Shablon
                        </button>
                        <button
                            onClick={() => setShowImportModal(true)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            📤 Import
                        </button>
                    </div>
                </div>
            </div>

            {/* Data Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                {compensations.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        Ma'lumotlar yo'q. Import qiling.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">ID</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Xodim</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Bo'lim</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">KPI</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Maosh</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Jami</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Amallar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {compensations.map(comp => (
                                    <tr key={comp.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{comp.employeeExternalId}</td>
                                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{comp.employeeName}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{comp.departmentName}</td>
                                        <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                                            {comp.kpiAmount.toLocaleString('uz-UZ')}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                                            {comp.baseSalary.toLocaleString('uz-UZ')}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900 dark:text-white">
                                            {comp.totalSalary.toLocaleString('uz-UZ')}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => handleDelete(comp.id)}
                                                disabled={saving}
                                                className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                            >
                                                🗑️
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                            Ma'lumotlarni Import Qilish
                        </h2>

                        {/* Year */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Yil
                            </label>
                            <select
                                value={importYear}
                                onChange={e => setImportYear(parseInt(e.target.value))}
                                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                            >
                                {YEARS.map(year => (
                                    <option key={year.value} value={year.value}>{year.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Month */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Oy
                            </label>
                            <select
                                value={importMonth}
                                onChange={e => setImportMonth(parseInt(e.target.value))}
                                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                            >
                                {MONTHS.map(month => (
                                    <option key={month.value} value={month.value}>{month.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* File */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Excel Fayl
                            </label>
                            <input
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleFileSelect}
                                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                            />
                            {importFile && (
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                    {importFile.name}
                                </p>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => {
                                    setShowImportModal(false);
                                    setImportFile(null);
                                }}
                                disabled={saving}
                                className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-white rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 disabled:opacity-50"
                            >
                                Bekor qilish
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={saving || !importFile}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {saving ? 'Yuklanmoqda...' : 'Import'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
