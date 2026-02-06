/**
 * =============================================================================
 * Employee Status Manager Component
 * =============================================================================
 * 
 * Manages employee active/inactive status with individual and bulk operations.
 * Allows activating/deactivating employees by:
 * - Individual toggle
 * - Bulk selection
 * - Department-wide
 */

import { useState, useEffect, useCallback } from 'react';
import { 
    Users, 
    UserCheck, 
    UserX, 
    Building2, 
    Search, 
    CheckCircle, 
    XCircle,
    AlertTriangle,
    RefreshCw
} from 'lucide-react';

// =============================================================================
// CONSTANTS
// =============================================================================

const API_BASE_URL = 'http://localhost:3001/api';

// =============================================================================
// INTERFACES
// =============================================================================

interface Employee {
    id: number;
    externalId: string;
    name: string;
    departmentId: number;
    departmentName: string;
    isActive: boolean;
    deactivatedAt: string | null;
    deactivationReason: string | null;
}

interface Department {
    id: number;
    name: string;
    employeeCount: number;
    activeCount: number;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function EmployeeStatusManager() {
    // =========================================================================
    // STATE
    // =========================================================================

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    
    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDepartment, setSelectedDepartment] = useState<number | null>(null);
    const [showInactive, setShowInactive] = useState(true);
    
    // Bulk selection
    const [selectedEmployees, setSelectedEmployees] = useState<number[]>([]);
    
    // Deactivation modal
    const [showDeactivateModal, setShowDeactivateModal] = useState(false);
    const [deactivationReason, setDeactivationReason] = useState('');
    const [deactivationTarget, setDeactivationTarget] = useState<'individual' | 'bulk' | 'department'>('individual');
    const [targetEmployeeId, setTargetEmployeeId] = useState<number | null>(null);
    const [targetDepartmentId, setTargetDepartmentId] = useState<number | null>(null);

    // =========================================================================
    // DATA LOADING
    // =========================================================================

    const loadEmployees = useCallback(async () => {
        setLoading(true);
        try {
            const url = new URL(`${API_BASE_URL}/employees`);
            url.searchParams.set('includeInactive', 'true');
            url.searchParams.set('limit', '1000');
            
            if (selectedDepartment) {
                url.searchParams.set('departmentId', selectedDepartment.toString());
            }
            
            const res = await fetch(url.toString());
            const data = await res.json();
            
            if (data.success) {
                setEmployees(data.data.items.map((e: Record<string, unknown>) => ({
                    ...e,
                    isActive: Boolean(e.isActive)
                })));
            }
        } catch (error) {
            showMessage('error', 'Xodimlarni yuklashda xatolik');
        } finally {
            setLoading(false);
        }
    }, [selectedDepartment]);

    const loadDepartments = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/departments`);
            const data = await res.json();
            
            if (data.success) {
                setDepartments(data.data);
            }
        } catch (error) {
            console.error('Failed to load departments:', error);
        }
    }, []);

    useEffect(() => {
        loadEmployees();
        loadDepartments();
    }, [loadEmployees, loadDepartments]);

    // =========================================================================
    // HANDLERS
    // =========================================================================

    function showMessage(type: 'success' | 'error', text: string) {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 5000);
    }

    // Toggle individual employee status
    async function handleToggleStatus(employee: Employee) {
        if (employee.isActive) {
            // Deactivating - show modal for reason
            setTargetEmployeeId(employee.id);
            setDeactivationTarget('individual');
            setDeactivationReason('');
            setShowDeactivateModal(true);
        } else {
            // Activating - no reason needed
            try {
                const res = await fetch(`${API_BASE_URL}/employees/${employee.id}/status`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isActive: true })
                });
                
                const data = await res.json();
                
                if (data.success) {
                    showMessage('success', `${employee.name} faollashtirildi`);
                    loadEmployees();
                } else {
                    showMessage('error', data.error || 'Xatolik yuz berdi');
                }
            } catch (error) {
                showMessage('error', 'Server bilan bog\'lanishda xatolik');
            }
        }
    }

    // Confirm deactivation with reason
    async function handleConfirmDeactivation() {
        try {
            let res;
            
            if (deactivationTarget === 'individual' && targetEmployeeId) {
                res = await fetch(`${API_BASE_URL}/employees/${targetEmployeeId}/status`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        isActive: false, 
                        reason: deactivationReason || null 
                    })
                });
            } else if (deactivationTarget === 'bulk' && selectedEmployees.length > 0) {
                res = await fetch(`${API_BASE_URL}/employees/bulk-status`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        employeeIds: selectedEmployees,
                        isActive: false, 
                        reason: deactivationReason || null 
                    })
                });
            } else if (deactivationTarget === 'department' && targetDepartmentId) {
                res = await fetch(`${API_BASE_URL}/employees/department-status`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        departmentId: targetDepartmentId,
                        isActive: false, 
                        reason: deactivationReason || null 
                    })
                });
            }
            
            if (res) {
                const data = await res.json();
                
                if (data.success) {
                    showMessage('success', data.message);
                    setShowDeactivateModal(false);
                    setSelectedEmployees([]);
                    loadEmployees();
                } else {
                    showMessage('error', data.error || 'Xatolik yuz berdi');
                }
            }
        } catch (error) {
            showMessage('error', 'Server bilan bog\'lanishda xatolik');
        }
    }

    // Bulk activate selected employees
    async function handleBulkActivate() {
        if (selectedEmployees.length === 0) return;
        
        try {
            const res = await fetch(`${API_BASE_URL}/employees/bulk-status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    employeeIds: selectedEmployees,
                    isActive: true
                })
            });
            
            const data = await res.json();
            
            if (data.success) {
                showMessage('success', data.message);
                setSelectedEmployees([]);
                loadEmployees();
            } else {
                showMessage('error', data.error || 'Xatolik yuz berdi');
            }
        } catch (error) {
            showMessage('error', 'Server bilan bog\'lanishda xatolik');
        }
    }

    // Bulk deactivate selected employees
    function handleBulkDeactivate() {
        if (selectedEmployees.length === 0) return;
        
        setDeactivationTarget('bulk');
        setDeactivationReason('');
        setShowDeactivateModal(true);
    }

    // Department-wide deactivation
    function handleDepartmentDeactivate(departmentId: number) {
        setTargetDepartmentId(departmentId);
        setDeactivationTarget('department');
        setDeactivationReason('');
        setShowDeactivateModal(true);
    }

    // Department-wide activation
    async function handleDepartmentActivate(departmentId: number) {
        try {
            const res = await fetch(`${API_BASE_URL}/employees/department-status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    departmentId,
                    isActive: true
                })
            });
            
            const data = await res.json();
            
            if (data.success) {
                showMessage('success', data.message);
                loadEmployees();
            } else {
                showMessage('error', data.error || 'Xatolik yuz berdi');
            }
        } catch (error) {
            showMessage('error', 'Server bilan bog\'lanishda xatolik');
        }
    }

    // Toggle employee selection
    function toggleEmployeeSelection(employeeId: number) {
        setSelectedEmployees(prev => 
            prev.includes(employeeId)
                ? prev.filter(id => id !== employeeId)
                : [...prev, employeeId]
        );
    }

    // Select all visible employees
    function selectAllVisible() {
        const visibleIds = filteredEmployees.map(e => e.id);
        setSelectedEmployees(visibleIds);
    }

    // Clear selection
    function clearSelection() {
        setSelectedEmployees([]);
    }

    // =========================================================================
    // FILTERED DATA
    // =========================================================================

    const filteredEmployees = employees.filter(e => {
        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            if (!e.name.toLowerCase().includes(query) && 
                !e.externalId.toLowerCase().includes(query)) {
                return false;
            }
        }
        
        // Show/hide inactive
        if (!showInactive && !e.isActive) {
            return false;
        }
        
        return true;
    });

    // Department stats
    const departmentStats = departments.map(dept => {
        const deptEmployees = employees.filter(e => e.departmentId === dept.id);
        return {
            ...dept,
            employeeCount: deptEmployees.length,
            activeCount: deptEmployees.filter(e => e.isActive).length
        };
    });

    // Summary stats
    const totalEmployees = employees.length;
    const activeEmployees = employees.filter(e => e.isActive).length;
    const inactiveEmployees = totalEmployees - activeEmployees;

    // =========================================================================
    // RENDER
    // =========================================================================

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Xodimlar Holati
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                    Xodimlarni faollashtirish yoki o'chirish
                </p>
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

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                    <div className="flex items-center gap-3">
                        <Users className="w-8 h-8 text-blue-500" />
                        <div>
                            <div className="text-2xl font-bold">{totalEmployees}</div>
                            <div className="text-sm text-gray-500">Jami xodimlar</div>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                    <div className="flex items-center gap-3">
                        <UserCheck className="w-8 h-8 text-green-500" />
                        <div>
                            <div className="text-2xl font-bold text-green-600">{activeEmployees}</div>
                            <div className="text-sm text-gray-500">Faol xodimlar</div>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                    <div className="flex items-center gap-3">
                        <UserX className="w-8 h-8 text-red-500" />
                        <div>
                            <div className="text-2xl font-bold text-red-600">{inactiveEmployees}</div>
                            <div className="text-sm text-gray-500">O'chirilgan xodimlar</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Department Quick Actions */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
                <div className="p-4 border-b dark:border-gray-700">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Building2 className="w-5 h-5" />
                        Bo'limlar bo'yicha boshqarish
                    </h2>
                </div>
                <div className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {departmentStats.map(dept => (
                            <div 
                                key={dept.id} 
                                className="border dark:border-gray-700 rounded-lg p-3 flex items-center justify-between"
                            >
                                <div>
                                    <div className="font-medium">{dept.name}</div>
                                    <div className="text-sm text-gray-500">
                                        {dept.activeCount}/{dept.employeeCount} faol
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleDepartmentActivate(dept.id)}
                                        className="p-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                                        title="Barchasini faollashtirish"
                                    >
                                        <UserCheck className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDepartmentDeactivate(dept.id)}
                                        className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                                        title="Barchasini o'chirish"
                                    >
                                        <UserX className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Filters and Bulk Actions */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
                <div className="p-4 flex flex-wrap items-center gap-4">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Xodim qidirish..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                        />
                    </div>

                    {/* Department filter */}
                    <select
                        value={selectedDepartment || ''}
                        onChange={(e) => setSelectedDepartment(e.target.value ? parseInt(e.target.value) : null)}
                        className="px-4 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                    >
                        <option value="">Barcha bo'limlar</option>
                        {departments.map(dept => (
                            <option key={dept.id} value={dept.id}>{dept.name}</option>
                        ))}
                    </select>

                    {/* Show inactive toggle */}
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showInactive}
                            onChange={(e) => setShowInactive(e.target.checked)}
                            className="w-4 h-4 rounded"
                        />
                        <span className="text-sm">O'chirilganlarni ko'rsatish</span>
                    </label>

                    {/* Refresh */}
                    <button
                        onClick={loadEmployees}
                        disabled={loading}
                        className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {/* Bulk actions */}
                {selectedEmployees.length > 0 && (
                    <div className="px-4 pb-4 flex items-center gap-4 border-t dark:border-gray-700 pt-4">
                        <span className="text-sm text-gray-600">
                            {selectedEmployees.length} ta tanlangan
                        </span>
                        <button
                            onClick={handleBulkActivate}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                        >
                            <UserCheck className="w-4 h-4" />
                            Faollashtirish
                        </button>
                        <button
                            onClick={handleBulkDeactivate}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                        >
                            <UserX className="w-4 h-4" />
                            O'chirish
                        </button>
                        <button
                            onClick={clearSelection}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        >
                            Bekor qilish
                        </button>
                    </div>
                )}
            </div>

            {/* Employee List */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between">
                    <h2 className="text-lg font-semibold">
                        Xodimlar ro'yxati ({filteredEmployees.length})
                    </h2>
                    <button
                        onClick={selectAllVisible}
                        className="text-sm text-blue-600 hover:underline"
                    >
                        Barchasini tanlash
                    </button>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-900">
                            <tr>
                                <th className="px-4 py-3 text-left w-10">
                                    <input
                                        type="checkbox"
                                        checked={selectedEmployees.length === filteredEmployees.length && filteredEmployees.length > 0}
                                        onChange={(e) => e.target.checked ? selectAllVisible() : clearSelection()}
                                        className="w-4 h-4 rounded"
                                    />
                                </th>
                                <th className="px-4 py-3 text-left text-sm font-semibold">ID</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold">Xodim</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold">Bo'lim</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold">Holat</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold">O'chirilgan sana</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold">Sabab</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold">Amal</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y dark:divide-gray-700">
                            {filteredEmployees.map(employee => (
                                <tr 
                                    key={employee.id}
                                    className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                                        !employee.isActive ? 'bg-red-50 dark:bg-red-900/10' : ''
                                    }`}
                                >
                                    <td className="px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedEmployees.includes(employee.id)}
                                            onChange={() => toggleEmployeeSelection(employee.id)}
                                            className="w-4 h-4 rounded"
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                        {employee.externalId}
                                    </td>
                                    <td className="px-4 py-3 font-medium">
                                        {employee.name}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                                        {employee.departmentName}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {employee.isActive ? (
                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                                <CheckCircle className="w-3 h-3 mr-1" />
                                                Faol
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                                <XCircle className="w-3 h-3 mr-1" />
                                                O'chirilgan
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                        {employee.deactivatedAt 
                                            ? new Date(employee.deactivatedAt).toLocaleDateString('uz-UZ')
                                            : '-'
                                        }
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate">
                                        {employee.deactivationReason || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <button
                                            onClick={() => handleToggleStatus(employee)}
                                            className={`p-2 rounded-lg ${
                                                employee.isActive
                                                    ? 'text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30'
                                                    : 'text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30'
                                            }`}
                                            title={employee.isActive ? 'O\'chirish' : 'Faollashtirish'}
                                        >
                                            {employee.isActive ? <UserX className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredEmployees.length === 0 && (
                    <div className="p-8 text-center text-gray-500">
                        <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>Xodimlar topilmadi</p>
                    </div>
                )}
            </div>

            {/* Deactivation Modal */}
            {showDeactivateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
                        <div className="p-4 border-b dark:border-gray-700">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                                Xodimni o'chirish
                            </h3>
                        </div>
                        <div className="p-4">
                            <p className="text-gray-600 dark:text-gray-400 mb-4">
                                {deactivationTarget === 'individual' && 'Xodimni o\'chirishni tasdiqlang.'}
                                {deactivationTarget === 'bulk' && `${selectedEmployees.length} ta xodimni o'chirishni tasdiqlang.`}
                                {deactivationTarget === 'department' && 'Bo\'limdagi barcha xodimlarni o\'chirishni tasdiqlang.'}
                            </p>
                            <div className="mb-4">
                                <label className="block text-sm font-medium mb-2">
                                    Sabab (ixtiyoriy)
                                </label>
                                <textarea
                                    value={deactivationReason}
                                    onChange={(e) => setDeactivationReason(e.target.value)}
                                    placeholder="Masalan: Ishdan bo'shagan, Ta'tilga chiqqan..."
                                    className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 resize-none"
                                    rows={3}
                                />
                            </div>
                        </div>
                        <div className="p-4 border-t dark:border-gray-700 flex justify-end gap-3">
                            <button
                                onClick={() => setShowDeactivateModal(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                            >
                                Bekor qilish
                            </button>
                            <button
                                onClick={handleConfirmDeactivation}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                            >
                                O'chirish
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
