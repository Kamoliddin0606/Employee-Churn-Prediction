/**
 * =============================================================================
 * Database Manager Component
 * =============================================================================
 * 
 * Manages database tables with grouping and truncate functionality.
 * Tables are organized into logical groups for easier management.
 */

import { useState, useEffect, useCallback } from 'react';
import { 
    Database, 
    Trash2, 
    RefreshCw, 
    AlertTriangle,
    Users,
    Clock,
    Calendar,
    FileSpreadsheet,
    DollarSign,
    CheckCircle,
    XCircle,
    ChevronDown,
    ChevronRight
} from 'lucide-react';

// =============================================================================
// CONSTANTS
// =============================================================================

const API_BASE_URL = 'http://localhost:3001/api';

// Table groups configuration
const TABLE_GROUPS = [
    {
        id: 'core',
        name: 'Asosiy Ma\'lumotlar',
        icon: Users,
        color: 'blue',
        description: 'Tashkilot, bo\'limlar va xodimlar',
        tables: [
            { name: 'organizations', label: 'Tashkilotlar', canTruncate: false },
            { name: 'departments', label: 'Bo\'limlar', canTruncate: true },
            { name: 'employees', label: 'Xodimlar', canTruncate: true }
        ]
    },
    {
        id: 'attendance',
        name: 'Davomat Ma\'lumotlari',
        icon: Calendar,
        color: 'green',
        description: 'Vaqt yozuvlari va davomat',
        tables: [
            { name: 'time_records', label: 'Vaqt Yozuvlari', canTruncate: true },
            { name: 'attendance_records', label: 'Davomat Yozuvlari', canTruncate: true }
        ]
    },
    {
        id: 'schedules',
        name: 'Jadvallar',
        icon: Clock,
        color: 'purple',
        description: 'Ish jadvallari va istisnolar',
        tables: [
            { name: 'work_schedules', label: 'Ish Jadvallari', canTruncate: true },
            { name: 'schedule_exceptions', label: 'Jadval Istisnolari', canTruncate: true },
            { name: 'missing_time_settings', label: 'Yo\'q Vaqt Sozlamalari', canTruncate: true }
        ]
    },
    {
        id: 'violations',
        name: 'Buzilishlar va Jarimalar',
        icon: AlertTriangle,
        color: 'red',
        description: 'Buzilishlar hisoboti va jarimalar',
        tables: [
            { name: 'violation_summary', label: 'Buzilishlar Xulosasi', canTruncate: true },
            { name: 'employee_penalties', label: 'Xodim Jarimlari', canTruncate: true },
            { name: 'penalty_rules', label: 'Jarima Qoidalari', canTruncate: true },
            { name: 'penalty_details', label: 'Jarima Tafsilotlari', canTruncate: true },
            { name: 'kpi_zero_records', label: 'KPI Nollash Yozuvlari', canTruncate: true }
        ]
    },
    {
        id: 'compensation',
        name: 'Kompensatsiya',
        icon: DollarSign,
        color: 'yellow',
        description: 'Maosh va KPI sozlamalari',
        tables: [
            { name: 'employee_compensation', label: 'Xodim Kompensatsiyasi', canTruncate: true },
            { name: 'calculation_settings', label: 'Hisoblash Sozlamalari', canTruncate: false }
        ]
    },
    {
        id: 'import',
        name: 'Import Tarixi',
        icon: FileSpreadsheet,
        color: 'gray',
        description: 'Import operatsiyalari tarixi',
        tables: [
            { name: 'import_history', label: 'Import Tarixi', canTruncate: true }
        ]
    }
];

// =============================================================================
// COMPONENT
// =============================================================================

export default function DatabaseManager() {
    // =========================================================================
    // STATE
    // =========================================================================

    const [tableStats, setTableStats] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);
    const [truncating, setTruncating] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<string[]>(['core', 'attendance', 'violations']);
    
    // Confirmation modal
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmTarget, setConfirmTarget] = useState<{ type: 'table' | 'group'; name: string; label: string } | null>(null);

    // =========================================================================
    // DATA LOADING
    // =========================================================================

    const loadTableStats = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/db-explorer/tables`);
            const data = await res.json();
            
            if (data.success) {
                const stats: Record<string, number> = {};
                for (const table of data.data) {
                    // Backend returns rowCount, not count
                    stats[table.name] = table.rowCount || table.count || 0;
                }
                setTableStats(stats);
            }
        } catch (error) {
            showMessage('error', 'Jadval statistikasini yuklashda xatolik');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadTableStats();
    }, [loadTableStats]);

    // =========================================================================
    // HANDLERS
    // =========================================================================

    function showMessage(type: 'success' | 'error', text: string) {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 5000);
    }

    function toggleGroup(groupId: string) {
        setExpandedGroups(prev => 
            prev.includes(groupId)
                ? prev.filter(id => id !== groupId)
                : [...prev, groupId]
        );
    }

    function requestTruncateTable(tableName: string, tableLabel: string) {
        setConfirmTarget({ type: 'table', name: tableName, label: tableLabel });
        setShowConfirmModal(true);
    }

    function requestTruncateGroup(groupId: string, groupName: string) {
        setConfirmTarget({ type: 'group', name: groupId, label: groupName });
        setShowConfirmModal(true);
    }

    async function handleConfirmTruncate() {
        if (!confirmTarget) return;

        setTruncating(confirmTarget.name);
        setShowConfirmModal(false);

        try {
            if (confirmTarget.type === 'table') {
                // Truncate single table
                const res = await fetch(`${API_BASE_URL}/db-explorer/truncate/${confirmTarget.name}`, {
                    method: 'POST'
                });
                const data = await res.json();
                
                if (data.success) {
                    showMessage('success', `"${confirmTarget.label}" jadvali tozalandi`);
                    loadTableStats();
                } else {
                    showMessage('error', data.error || 'Xatolik yuz berdi');
                }
            } else {
                // Truncate all tables in group
                const group = TABLE_GROUPS.find(g => g.id === confirmTarget.name);
                if (group) {
                    const tablesToTruncate = group.tables.filter(t => t.canTruncate);
                    let successCount = 0;
                    
                    for (const table of tablesToTruncate) {
                        const res = await fetch(`${API_BASE_URL}/db-explorer/truncate/${table.name}`, {
                            method: 'POST'
                        });
                        const data = await res.json();
                        if (data.success) successCount++;
                    }
                    
                    showMessage('success', `"${confirmTarget.label}" guruhidan ${successCount} ta jadval tozalandi`);
                    loadTableStats();
                }
            }
        } catch (error) {
            showMessage('error', 'Server bilan bog\'lanishda xatolik');
        } finally {
            setTruncating(null);
            setConfirmTarget(null);
        }
    }

    // =========================================================================
    // COMPUTED
    // =========================================================================

    function getGroupStats(groupId: string) {
        const group = TABLE_GROUPS.find(g => g.id === groupId);
        if (!group) return { totalRecords: 0, tableCount: 0 };
        
        const totalRecords = group.tables.reduce((sum, t) => sum + (tableStats[t.name] || 0), 0);
        return { totalRecords, tableCount: group.tables.length };
    }

    function getColorClasses(color: string) {
        const colors: Record<string, { bg: string; text: string; border: string }> = {
            blue: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600', border: 'border-blue-200 dark:border-blue-800' },
            green: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-600', border: 'border-green-200 dark:border-green-800' },
            purple: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-600', border: 'border-purple-200 dark:border-purple-800' },
            red: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-600', border: 'border-red-200 dark:border-red-800' },
            yellow: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-600', border: 'border-yellow-200 dark:border-yellow-800' },
            gray: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600', border: 'border-gray-200 dark:border-gray-700' }
        };
        return colors[color] || colors.gray;
    }

    // =========================================================================
    // RENDER
    // =========================================================================

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Database className="w-6 h-6" />
                        Ma'lumotlar Bazasi Boshqaruvi
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                        Jadvallarni ko'rish va tozalash
                    </p>
                </div>
                <button
                    onClick={loadTableStats}
                    disabled={loading}
                    className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Message */}
            {message && (
                <div className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${
                    message.type === 'success' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                    {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                    {message.text}
                </div>
            )}

            {/* Table Groups */}
            <div className="space-y-4">
                {TABLE_GROUPS.map(group => {
                    const isExpanded = expandedGroups.includes(group.id);
                    const stats = getGroupStats(group.id);
                    const colorClasses = getColorClasses(group.color);
                    const Icon = group.icon;

                    return (
                        <div 
                            key={group.id} 
                            className={`bg-white dark:bg-gray-800 rounded-lg shadow border ${colorClasses.border}`}
                        >
                            {/* Group Header */}
                            <div 
                                className={`p-4 flex items-center justify-between cursor-pointer ${colorClasses.bg} rounded-t-lg`}
                                onClick={() => toggleGroup(group.id)}
                            >
                                <div className="flex items-center gap-3">
                                    {isExpanded ? (
                                        <ChevronDown className="w-5 h-5 text-gray-500" />
                                    ) : (
                                        <ChevronRight className="w-5 h-5 text-gray-500" />
                                    )}
                                    <Icon className={`w-5 h-5 ${colorClasses.text}`} />
                                    <div>
                                        <h3 className="font-semibold">{group.name}</h3>
                                        <p className="text-sm text-gray-500">{group.description}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <div className="text-lg font-bold">{stats.totalRecords.toLocaleString()}</div>
                                        <div className="text-xs text-gray-500">{stats.tableCount} ta jadval</div>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            requestTruncateGroup(group.id, group.name);
                                        }}
                                        disabled={truncating === group.id || stats.totalRecords === 0}
                                        className={`p-2 rounded-lg ${
                                            stats.totalRecords > 0 
                                                ? 'text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30' 
                                                : 'text-gray-300 cursor-not-allowed'
                                        }`}
                                        title="Guruhni tozalash"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Group Tables */}
                            {isExpanded && (
                                <div className="divide-y dark:divide-gray-700">
                                    {group.tables.map(table => (
                                        <div 
                                            key={table.name}
                                            className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                        >
                                            <div className="flex items-center gap-3 pl-8">
                                                <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                                                <div>
                                                    <span className="font-medium">{table.label}</span>
                                                    <span className="text-sm text-gray-500 ml-2">({table.name})</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className={`font-mono text-sm min-w-[80px] text-right ${
                                                    (tableStats[table.name] || 0) > 0 
                                                        ? 'text-gray-900 dark:text-white' 
                                                        : 'text-gray-400'
                                                }`}>
                                                    {(tableStats[table.name] || 0).toLocaleString()} yozuv
                                                </span>
                                                {table.canTruncate ? (
                                                    <button
                                                        onClick={() => requestTruncateTable(table.name, table.label)}
                                                        disabled={truncating === table.name || (tableStats[table.name] || 0) === 0}
                                                        className={`p-1.5 rounded ${
                                                            (tableStats[table.name] || 0) > 0
                                                                ? 'text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30'
                                                                : 'text-gray-300 cursor-not-allowed'
                                                        }`}
                                                        title="Jadvalni tozalash"
                                                    >
                                                        {truncating === table.name ? (
                                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                ) : (
                                                    <span className="text-xs text-gray-400 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
                                                        Himoyalangan
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Confirmation Modal */}
            {showConfirmModal && confirmTarget && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
                        <div className="p-4 border-b dark:border-gray-700">
                            <h3 className="text-lg font-semibold flex items-center gap-2 text-red-600">
                                <AlertTriangle className="w-5 h-5" />
                                Tozalashni Tasdiqlash
                            </h3>
                        </div>
                        <div className="p-4">
                            <p className="text-gray-600 dark:text-gray-400 mb-4">
                                {confirmTarget.type === 'table' 
                                    ? `"${confirmTarget.label}" jadvalidagi barcha ma'lumotlar o'chiriladi.`
                                    : `"${confirmTarget.label}" guruhidagi barcha jadvallar tozalanadi.`
                                }
                            </p>
                            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                                <p className="text-sm text-red-700 dark:text-red-400">
                                    <strong>Diqqat:</strong> Bu amal qaytarib bo'lmaydi!
                                </p>
                            </div>
                        </div>
                        <div className="p-4 border-t dark:border-gray-700 flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowConfirmModal(false);
                                    setConfirmTarget(null);
                                }}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                            >
                                Bekor qilish
                            </button>
                            <button
                                onClick={handleConfirmTruncate}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                Tozalash
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
