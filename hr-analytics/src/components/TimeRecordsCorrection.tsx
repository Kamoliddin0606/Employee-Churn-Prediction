/**
 * =============================================================================
 * TimeRecordsCorrection Component
 * =============================================================================
 * 
 * Component for correcting time records via Excel import/export.
 * Allows bulk correction of check-in/check-out times.
 * 
 * @component TimeRecordsCorrection
 */

import { useState } from 'react';
import { Calendar, Download, Upload, AlertCircle, CheckCircle, Clock } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface CorrectionPreview {
    employeeId: number;
    externalId: string;
    employeeName: string;
    department: string;
    date: string;
    currentCheckIn: string | null;
    currentCheckOut: string | null;
    newCheckIn: string;
    newCheckOut: string;
    isWorkDay: boolean;
}

interface CorrectionWarning {
    employeeId: number;
    externalId: string;
    date: string;
    reason: string;
}

interface PreviewData {
    corrections: CorrectionPreview[];
    warnings: CorrectionWarning[];
    summary: {
        totalCorrections: number;
        totalWarnings: number;
    };
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function TimeRecordsCorrection() {
    // State
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [departmentId, setDepartmentId] = useState<number | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [previewData, setPreviewData] = useState<PreviewData | null>(null);
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // =============================================================================
    // HANDLERS
    // =============================================================================

    /**
     * Validate date range - must be within same month
     */
    function validateDateRange(start: string, end: string): boolean {
        const startD = new Date(start);
        const endD = new Date(end);
        return startD.getFullYear() === endD.getFullYear() && 
               startD.getMonth() === endD.getMonth();
    }

    /**
     * Export template
     */
    async function handleExport() {
        if (!startDate || !endDate) {
            showMessage('error', 'Boshlanish va tugash sanalarini tanlang');
            return;
        }

        if (!validateDateRange(startDate, endDate)) {
            showMessage('error', 'Faqat bir oy ichidagi kunlarni tanlash mumkin');
            return;
        }

        try {
            setLoading(true);
            const params = new URLSearchParams({
                startDate,
                endDate,
                ...(departmentId && { departmentId: departmentId.toString() })
            });

            const response = await fetch(`http://localhost:3001/api/time-records/export-template?${params}`);
            
            if (!response.ok) {
                throw new Error('Export xatolik');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `time_records_correction_${startDate}_${endDate}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            showMessage('success', 'Shablon muvaffaqiyatli yuklandi');
        } catch (error) {
            console.error('Export error:', error);
            showMessage('error', 'Export xatolik');
        } finally {
            setLoading(false);
        }
    }

    /**
     * Handle file selection
     */
    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setPreviewData(null);
        }
    }

    /**
     * Preview corrections
     */
    async function handlePreview() {
        if (!file) {
            showMessage('error', 'Faylni tanlang');
            return;
        }

        if (!startDate || !endDate) {
            showMessage('error', 'Boshlanish va tugash sanalarini tanlang');
            return;
        }

        try {
            setLoading(true);
            const formData = new FormData();
            formData.append('file', file);
            formData.append('startDate', startDate);
            formData.append('endDate', endDate);

            const response = await fetch('http://localhost:3001/api/time-records/preview-corrections', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Preview xatolik');
            }

            setPreviewData(result.data);
            showMessage('success', `${result.data.summary.totalCorrections} ta o'zgarish topildi`);
        } catch (error) {
            console.error('Preview error:', error);
            showMessage('error', error instanceof Error ? error.message : 'Preview xatolik');
        } finally {
            setLoading(false);
        }
    }

    /**
     * Apply corrections
     */
    async function handleApply() {
        if (!previewData || previewData.corrections.length === 0) {
            showMessage('error', 'O\'zgarishlar topilmadi');
            return;
        }

        try {
            setApplying(true);
            const response = await fetch('http://localhost:3001/api/time-records/apply-corrections', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    corrections: previewData.corrections,
                    recalculate: true
                })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Apply xatolik');
            }

            showMessage('success', 
                `${result.data.total} ta yozuv yangilandi. ` +
                `Violations: ${result.data.recalculationResults?.violations || 0}, ` +
                `Penalties: ${result.data.recalculationResults?.penalties || 0}`
            );

            // Reset
            setFile(null);
            setPreviewData(null);
        } catch (error) {
            console.error('Apply error:', error);
            showMessage('error', error instanceof Error ? error.message : 'Apply xatolik');
        } finally {
            setApplying(false);
        }
    }

    /**
     * Show message
     */
    function showMessage(type: 'success' | 'error', text: string) {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 5000);
    }

    /**
     * Reset all
     */
    function handleReset() {
        setFile(null);
        setPreviewData(null);
        setMessage(null);
    }

    // =============================================================================
    // RENDER
    // =============================================================================

    return (
        <div className="h-full flex flex-col p-6 space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <Clock className="w-6 h-6" />
                    Time Records Correction
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Xodimlarning kirish-chiqish vaqtlarini Excel orqali tuzatish
                </p>
            </div>

            {/* Message */}
            {message && (
                <div className={`p-4 rounded-lg flex items-center gap-2 ${
                    message.type === 'success' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                }`}>
                    {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                    {message.text}
                </div>
            )}

            {/* Step 1: Period Selection & Export */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
                <div className="flex items-center gap-2 text-lg font-semibold">
                    <Calendar className="w-5 h-5" />
                    1. Period tanlash va shablon yuklab olish
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Boshlanish sanasi
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Tugash sanasi
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>

                    <div className="flex items-end">
                        <button
                            onClick={handleExport}
                            disabled={loading || !startDate || !endDate}
                            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            {loading ? 'Yuklanmoqda...' : 'Shablon yuklab olish'}
                        </button>
                    </div>
                </div>

                <div className="text-sm text-muted-foreground bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                    <strong>Eslatma:</strong> Faqat bir oy ichidagi kunlarni tanlash mumkin. 
                    Shablonda 1 = tuzatish kerak, 0 = o'zgarmaydi.
                </div>
            </div>

            {/* Step 2: File Upload & Preview */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
                <div className="flex items-center gap-2 text-lg font-semibold">
                    <Upload className="w-5 h-5" />
                    2. To'ldirilgan faylni yuklash
                </div>

                <div className="flex gap-4">
                    <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleFileChange}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <button
                        onClick={handlePreview}
                        disabled={loading || !file}
                        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                        {loading ? 'Yuklanmoqda...' : 'Preview'}
                    </button>
                    {previewData && (
                        <button
                            onClick={handleReset}
                            className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                        >
                            Bekor qilish
                        </button>
                    )}
                </div>
            </div>

            {/* Step 3: Preview & Apply */}
            {previewData && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4 flex-1 overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between">
                        <div className="text-lg font-semibold">
                            3. O'zgarishlarni ko'rish va saqlash
                        </div>
                        <button
                            onClick={handleApply}
                            disabled={applying || previewData.corrections.length === 0}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            {applying ? 'Saqlanmoqda...' : 'Saqlash va qayta hisoblash'}
                        </button>
                    </div>

                    {/* Summary */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                            <div className="text-2xl font-bold text-green-600">
                                {previewData.summary.totalCorrections}
                            </div>
                            <div className="text-sm text-muted-foreground">O'zgarishlar</div>
                        </div>
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                            <div className="text-2xl font-bold text-yellow-600">
                                {previewData.summary.totalWarnings}
                            </div>
                            <div className="text-sm text-muted-foreground">Ogohlantirishlar</div>
                        </div>
                    </div>

                    {/* Warnings */}
                    {previewData.warnings.length > 0 && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                            <div className="font-semibold text-yellow-800 dark:text-yellow-400 mb-2">
                                Ogohlantirishlar:
                            </div>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                                {previewData.warnings.map((w, i) => (
                                    <div key={i} className="text-sm text-yellow-700 dark:text-yellow-300">
                                        {w.externalId} - {w.date}: {w.reason}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Corrections Table */}
                    <div className="flex-1 overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 text-left">ID</th>
                                    <th className="px-4 py-2 text-left">Xodim</th>
                                    <th className="px-4 py-2 text-left">Bo'lim</th>
                                    <th className="px-4 py-2 text-left">Sana</th>
                                    <th className="px-4 py-2 text-left">Eski Check-In</th>
                                    <th className="px-4 py-2 text-left">Eski Check-Out</th>
                                    <th className="px-4 py-2 text-left">Yangi Check-In</th>
                                    <th className="px-4 py-2 text-left">Yangi Check-Out</th>
                                </tr>
                            </thead>
                            <tbody>
                                {previewData.corrections.map((c, i) => (
                                    <tr key={i} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                                        <td className="px-4 py-2">{c.externalId}</td>
                                        <td className="px-4 py-2">{c.employeeName}</td>
                                        <td className="px-4 py-2">{c.department}</td>
                                        <td className="px-4 py-2">{c.date}</td>
                                        <td className="px-4 py-2 text-red-600">{c.currentCheckIn || '-'}</td>
                                        <td className="px-4 py-2 text-red-600">{c.currentCheckOut || '-'}</td>
                                        <td className="px-4 py-2 text-green-600 font-semibold">{c.newCheckIn}</td>
                                        <td className="px-4 py-2 text-green-600 font-semibold">{c.newCheckOut}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
