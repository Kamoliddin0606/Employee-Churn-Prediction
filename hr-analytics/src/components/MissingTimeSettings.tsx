/**
 * =============================================================================
 * HR Analytics Frontend - Missing Time Settings Component
 * =============================================================================
 * 
 * UI component for managing missing time handling settings.
 * Allows configuration at organization, department, and employee levels.
 * 
 * Settings Types:
 *   Type 1: Yo'q vaqt = to'liq ishlanmagan kun (Full Absent)
 *   Type 2: Avtomatik to'ldirish (Auto-fill with penalty minutes)
 * 
 * Priority: Employee > Department > Organization
 * 
 * @module components/MissingTimeSettings
 * @author HR Analytics Team
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Settings,
    Building2,
    Users,
    User,
    Save,
    Trash2,
    Plus,
    AlertCircle,
    CheckCircle,
    Clock,
    Info,
    ChevronDown,
    ChevronUp
} from 'lucide-react';

// =============================================================================
// API CONFIGURATION
// =============================================================================

const API_BASE_URL = 'http://localhost:3001/api';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Target type for settings level
 */
type TargetType = 'organization' | 'department' | 'employee';

/**
 * Handling type for missing times
 * 1 = Full Absent
 * 2 = Auto-fill with penalty
 */
type HandlingType = 1 | 2;

/**
 * Missing time settings interface
 */
interface MissingTimeSettingsData {
    id: number;
    targetType: TargetType;
    targetId: number;
    handlingType: HandlingType;
    missingCheckinPenaltyMinutes: number;
    missingCheckoutPenaltyMinutes: number;
    isActive: boolean;
    validFrom?: string | null;  // Boshlanish sanasi (YYYY-MM-DD)
    targetName?: string;
}

/**
 * Target entity for selection
 */
interface TargetEntity {
    id: number;
    name: string;
    hasSettings: boolean;
    settingsId: number | null;
    handlingType: number | null;
    departmentName?: string;
    organizationName?: string;
    externalId?: string;
}

/**
 * Available targets response
 */
interface AvailableTargets {
    organizations: TargetEntity[];
    departments: TargetEntity[];
    employees: TargetEntity[];
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * MissingTimeSettings Component
 * 
 * Provides a user interface for managing missing time handling settings
 * at organization, department, and employee levels.
 */
const MissingTimeSettings: React.FC = () => {
    // =========================================================================
    // STATE MANAGEMENT
    // =========================================================================
    
    /** All settings list */
    const [settings, setSettings] = useState<MissingTimeSettingsData[]>([]);
    
    /** Available targets for creating new settings */
    const [availableTargets, setAvailableTargets] = useState<AvailableTargets | null>(null);
    
    /** Loading state */
    const [loading, setLoading] = useState(true);
    
    /** Error message */
    const [error, setError] = useState<string | null>(null);
    
    /** Success message */
    const [success, setSuccess] = useState<string | null>(null);
    
    /** Current tab (level) */
    const [activeTab, setActiveTab] = useState<TargetType>('organization');
    
    /** New settings form state */
    const [showNewForm, setShowNewForm] = useState(false);
    const [newSettings, setNewSettings] = useState({
        targetType: 'organization' as TargetType,
        targetId: 0,
        handlingType: 1 as HandlingType,
        missingCheckinPenaltyMinutes: 60,
        missingCheckoutPenaltyMinutes: 120,
        validFrom: '' as string  // Boshlanish sanasi (YYYY-MM-DD)
    });
    
    /** Edit mode for existing settings */
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState({
        handlingType: 1 as HandlingType,
        missingCheckinPenaltyMinutes: 60,
        missingCheckoutPenaltyMinutes: 120,
        validFrom: '' as string  // Boshlanish sanasi (YYYY-MM-DD)
    });

    /** Expanded info panel */
    const [showInfo, setShowInfo] = useState(false);

    // =========================================================================
    // DATA FETCHING
    // =========================================================================

    /**
     * Fetch all settings with names
     */
    const fetchSettings = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/missing-time-settings?withNames=true`);
            const data = await response.json();
            
            if (data.success) {
                setSettings(data.data);
            } else {
                setError(data.error || 'Sozlamalarni yuklashda xatolik');
            }
        } catch (err) {
            setError('Server bilan bog\'lanishda xatolik');
            console.error('Error fetching settings:', err);
        }
    }, []);

    /**
     * Fetch available targets for creating new settings
     */
    const fetchAvailableTargets = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/missing-time-settings/targets/available`);
            const data = await response.json();
            
            if (data.success) {
                setAvailableTargets(data.data);
            }
        } catch (err) {
            console.error('Error fetching available targets:', err);
        }
    }, []);

    /**
     * Initial data loading
     */
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await Promise.all([fetchSettings(), fetchAvailableTargets()]);
            setLoading(false);
        };
        loadData();
    }, [fetchSettings, fetchAvailableTargets]);

    // =========================================================================
    // EVENT HANDLERS
    // =========================================================================

    /**
     * Clear messages after timeout
     */
    useEffect(() => {
        if (success) {
            const timer = setTimeout(() => setSuccess(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [success]);

    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    /**
     * Handle creating new settings
     */
    const handleCreate = async () => {
        try {
            if (newSettings.targetId === 0) {
                setError('Target tanlang');
                return;
            }

            const response = await fetch(`${API_BASE_URL}/missing-time-settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSettings)
            });
            
            const data = await response.json();
            
            if (data.success) {
                setSuccess('Sozlamalar muvaffaqiyatli yaratildi');
                setShowNewForm(false);
                setNewSettings({
                    targetType: activeTab,
                    targetId: 0,
                    handlingType: 1,
                    missingCheckinPenaltyMinutes: 60,
                    missingCheckoutPenaltyMinutes: 120,
                    validFrom: ''
                });
                await Promise.all([fetchSettings(), fetchAvailableTargets()]);
            } else {
                setError(data.error || 'Sozlamalarni yaratishda xatolik');
            }
        } catch (err) {
            setError('Server bilan bog\'lanishda xatolik');
            console.error('Error creating settings:', err);
        }
    };

    /**
     * Handle updating existing settings
     */
    const handleUpdate = async (id: number) => {
        try {
            const response = await fetch(`${API_BASE_URL}/missing-time-settings/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm)
            });
            
            const data = await response.json();
            
            if (data.success) {
                setSuccess('Sozlamalar muvaffaqiyatli yangilandi');
                setEditingId(null);
                await fetchSettings();
            } else {
                setError(data.error || 'Sozlamalarni yangilashda xatolik');
            }
        } catch (err) {
            setError('Server bilan bog\'lanishda xatolik');
            console.error('Error updating settings:', err);
        }
    };

    /**
     * Handle deleting settings
     */
    const handleDelete = async (id: number) => {
        if (!confirm('Sozlamalarni o\'chirishni tasdiqlaysizmi?')) return;
        
        try {
            const response = await fetch(`${API_BASE_URL}/missing-time-settings/${id}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                setSuccess('Sozlamalar muvaffaqiyatli o\'chirildi');
                await Promise.all([fetchSettings(), fetchAvailableTargets()]);
            } else {
                setError(data.error || 'Sozlamalarni o\'chirishda xatolik');
            }
        } catch (err) {
            setError('Server bilan bog\'lanishda xatolik');
            console.error('Error deleting settings:', err);
        }
    };

    /**
     * Start editing a setting
     */
    const startEdit = (setting: MissingTimeSettingsData) => {
        setEditingId(setting.id);
        setEditForm({
            handlingType: setting.handlingType,
            missingCheckinPenaltyMinutes: setting.missingCheckinPenaltyMinutes,
            missingCheckoutPenaltyMinutes: setting.missingCheckoutPenaltyMinutes,
            validFrom: (setting as any).validFrom || ''
        });
    };

    // =========================================================================
    // HELPER FUNCTIONS
    // =========================================================================

    /**
     * Get filtered settings by target type
     */
    const getFilteredSettings = () => {
        return settings.filter(s => s.targetType === activeTab);
    };

    /**
     * Get available targets for current tab without existing settings
     */
    const getAvailableTargetsForTab = () => {
        if (!availableTargets) return [];
        
        switch (activeTab) {
            case 'organization':
                return availableTargets.organizations.filter(t => !t.hasSettings);
            case 'department':
                return availableTargets.departments.filter(t => !t.hasSettings);
            case 'employee':
                return availableTargets.employees.filter(t => !t.hasSettings);
            default:
                return [];
        }
    };

    /**
     * Get icon for target type
     */
    const getTargetIcon = (type: TargetType) => {
        switch (type) {
            case 'organization':
                return <Building2 className="w-5 h-5" />;
            case 'department':
                return <Users className="w-5 h-5" />;
            case 'employee':
                return <User className="w-5 h-5" />;
        }
    };

    /**
     * Get handling type label
     */
    const getHandlingTypeLabel = (type: HandlingType) => {
        return type === 1 
            ? 'Tur 1: To\'liq ishlanmagan kun' 
            : 'Tur 2: Avtomatik to\'ldirish';
    };

    /**
     * Get handling type description
     */
    const getHandlingTypeDescription = (type: HandlingType) => {
        return type === 1
            ? 'Kirish/chiqish yo\'q = kun ishlanmagan, to\'liq vaqt kech qolish sifatida hisoblanadi'
            : 'Yo\'q vaqtlar avtomatik to\'ldiriladi va jarima minutlar qo\'shiladi/ayiriladi';
    };

    // =========================================================================
    // RENDER
    // =========================================================================

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600">Yuklanmoqda...</span>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Clock className="w-8 h-8 text-blue-600" />
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800">
                                Yo'q Vaqt Sozlamalari
                            </h1>
                            <p className="text-sm text-gray-500">
                                Kirish/chiqish vaqtlari yo'q bo'lganda qanday hisoblanishini sozlang
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowInfo(!showInfo)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <Info className="w-4 h-4" />
                        Ma'lumot
                        {showInfo ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>

                {/* Info Panel */}
                {showInfo && (
                    <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
                        <h3 className="font-semibold text-blue-800 mb-2">Sozlamalar haqida</h3>
                        <div className="grid md:grid-cols-2 gap-4 text-sm text-blue-700">
                            <div>
                                <p className="font-medium mb-1">🔢 Tur 1: To'liq ishlanmagan kun</p>
                                <ul className="list-disc list-inside space-y-1 text-blue-600">
                                    <li>Kirish yo'q = butun kun kech qolish</li>
                                    <li>Chiqish yo'q = butun kun erta ketish</li>
                                    <li>Ikkalasi yo'q = kun ishlanmagan</li>
                                </ul>
                            </div>
                            <div>
                                <p className="font-medium mb-1">🔢 Tur 2: Avtomatik to'ldirish</p>
                                <ul className="list-disc list-inside space-y-1 text-blue-600">
                                    <li>Kirish yo'q = jadval + jarima minut</li>
                                    <li>Chiqish yo'q = jadval - jarima minut</li>
                                    <li>Ikkalasi yo'q = "ish joyida bo'lmagan"</li>
                                </ul>
                            </div>
                        </div>
                        <p className="mt-3 text-xs text-blue-600">
                            <strong>Prioritet:</strong> Xodim → Bo'lim → Tashkilot (yuqorisi ustunlik qiladi)
                        </p>
                    </div>
                )}
            </div>

            {/* Messages */}
            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                    <AlertCircle className="w-5 h-5" />
                    {error}
                </div>
            )}
            {success && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
                    <CheckCircle className="w-5 h-5" />
                    {success}
                </div>
            )}

            {/* Tabs */}
            <div className="mb-6 border-b border-gray-200">
                <nav className="flex gap-1">
                    {(['organization', 'department', 'employee'] as TargetType[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => {
                                setActiveTab(tab);
                                setShowNewForm(false);
                                setNewSettings(prev => ({ ...prev, targetType: tab, targetId: 0 }));
                            }}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === tab
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            {getTargetIcon(tab)}
                            {tab === 'organization' ? 'Tashkilot' : tab === 'department' ? 'Bo\'lim' : 'Xodim'}
                            <span className="ml-1 px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                                {settings.filter(s => s.targetType === tab).length}
                            </span>
                        </button>
                    ))}
                </nav>
            </div>

            {/* Add New Button */}
            {!showNewForm && getAvailableTargetsForTab().length > 0 && (
                <button
                    onClick={() => setShowNewForm(true)}
                    className="mb-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Yangi sozlama qo'shish
                </button>
            )}

            {/* New Settings Form */}
            {showNewForm && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 className="text-lg font-semibold mb-4">Yangi sozlama</h3>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                        {/* Target Selection */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {activeTab === 'organization' ? 'Tashkilot' : activeTab === 'department' ? 'Bo\'lim' : 'Xodim'}
                            </label>
                            <select
                                value={newSettings.targetId}
                                onChange={(e) => setNewSettings(prev => ({ ...prev, targetId: parseInt(e.target.value) }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value={0}>Tanlang...</option>
                                {getAvailableTargetsForTab().map((target) => (
                                    <option key={target.id} value={target.id}>
                                        {target.name}
                                        {target.departmentName && ` (${target.departmentName})`}
                                        {target.externalId && ` - ${target.externalId}`}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Handling Type */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Hisoblash turi
                            </label>
                            <select
                                value={newSettings.handlingType}
                                onChange={(e) => setNewSettings(prev => ({ ...prev, handlingType: parseInt(e.target.value) as HandlingType }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value={1}>Tur 1: To'liq ishlanmagan kun</option>
                                <option value={2}>Tur 2: Avtomatik to'ldirish</option>
                            </select>
                        </div>

                        {/* Valid From Date */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Boshlanish sanasi
                            </label>
                            <input
                                type="date"
                                value={newSettings.validFrom}
                                onChange={(e) => setNewSettings(prev => ({ ...prev, validFrom: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Bo'sh qoldirilsa, cheksiz o'tmishdan boshlab amal qiladi
                            </p>
                        </div>

                        {/* Penalty Minutes (only for Type 2) */}
                        {newSettings.handlingType === 2 && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Kirish yo'q bo'lsa qo'shiladigan minut
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="480"
                                        value={newSettings.missingCheckinPenaltyMinutes}
                                        onChange={(e) => setNewSettings(prev => ({ 
                                            ...prev, 
                                            missingCheckinPenaltyMinutes: parseInt(e.target.value) || 0 
                                        }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Masalan: 60 minut = jadval 9:00 bo'lsa, kirish 10:00 qilinadi
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Chiqish yo'q bo'lsa ayiriladigan minut
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="480"
                                        value={newSettings.missingCheckoutPenaltyMinutes}
                                        onChange={(e) => setNewSettings(prev => ({ 
                                            ...prev, 
                                            missingCheckoutPenaltyMinutes: parseInt(e.target.value) || 0 
                                        }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Masalan: 120 minut = jadval 18:00 bo'lsa, chiqish 16:00 qilinadi
                                    </p>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Form Actions */}
                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={handleCreate}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <Save className="w-4 h-4" />
                            Saqlash
                        </button>
                        <button
                            onClick={() => setShowNewForm(false)}
                            className="px-4 py-2 text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                        >
                            Bekor qilish
                        </button>
                    </div>
                </div>
            )}

            {/* Settings List */}
            <div className="space-y-3">
                {getFilteredSettings().length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <Settings className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>Bu daraja uchun sozlamalar mavjud emas</p>
                        {getAvailableTargetsForTab().length > 0 && (
                            <button
                                onClick={() => setShowNewForm(true)}
                                className="mt-3 text-blue-600 hover:text-blue-700"
                            >
                                + Yangi sozlama qo'shish
                            </button>
                        )}
                    </div>
                ) : (
                    getFilteredSettings().map((setting) => (
                        <div
                            key={setting.id}
                            className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                        >
                            {editingId === setting.id ? (
                                /* Edit Mode */
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-gray-700 font-medium">
                                        {getTargetIcon(setting.targetType)}
                                        {setting.targetName}
                                    </div>
                                    
                                    <div className="grid md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Hisoblash turi
                                            </label>
                                            <select
                                                value={editForm.handlingType}
                                                onChange={(e) => setEditForm(prev => ({ 
                                                    ...prev, 
                                                    handlingType: parseInt(e.target.value) as HandlingType 
                                                }))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value={1}>Tur 1: To'liq ishlanmagan</option>
                                                <option value={2}>Tur 2: Avtomatik to'ldirish</option>
                                            </select>
                                        </div>
                                        
                                        {/* Valid From Date */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Boshlanish sanasi
                                            </label>
                                            <input
                                                type="date"
                                                value={editForm.validFrom}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, validFrom: e.target.value }))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>

                                        {editForm.handlingType === 2 && (
                                            <>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Kirish jarimasi (min)
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="480"
                                                        value={editForm.missingCheckinPenaltyMinutes}
                                                        onChange={(e) => setEditForm(prev => ({ 
                                                            ...prev, 
                                                            missingCheckinPenaltyMinutes: parseInt(e.target.value) || 0 
                                                        }))}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Chiqish jarimasi (min)
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="480"
                                                        value={editForm.missingCheckoutPenaltyMinutes}
                                                        onChange={(e) => setEditForm(prev => ({ 
                                                            ...prev, 
                                                            missingCheckoutPenaltyMinutes: parseInt(e.target.value) || 0 
                                                        }))}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleUpdate(setting.id)}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                                        >
                                            <Save className="w-4 h-4" />
                                            Saqlash
                                        </button>
                                        <button
                                            onClick={() => setEditingId(null)}
                                            className="px-3 py-1.5 text-gray-600 bg-gray-200 text-sm rounded-lg hover:bg-gray-300"
                                        >
                                            Bekor qilish
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* View Mode */
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 text-gray-700">
                                            {getTargetIcon(setting.targetType)}
                                            <span className="font-medium">{setting.targetName}</span>
                                        </div>
                                        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                                            setting.handlingType === 1 
                                                ? 'bg-orange-100 text-orange-700' 
                                                : 'bg-green-100 text-green-700'
                                        }`}>
                                            {getHandlingTypeLabel(setting.handlingType)}
                                        </div>
                                        {setting.handlingType === 2 && (
                                            <div className="text-sm text-gray-500">
                                                <span className="mr-3">
                                                    Kirish: +{setting.missingCheckinPenaltyMinutes} min
                                                </span>
                                                <span>
                                                    Chiqish: -{setting.missingCheckoutPenaltyMinutes} min
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => startEdit(setting)}
                                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Tahrirlash"
                                        >
                                            <Settings className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(setting.id)}
                                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="O'chirish"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Legend */}
            <div className="mt-8 p-4 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Izoh</h4>
                <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-orange-400"></span>
                        Tur 1 = yo'q vaqt butun kun sifatida hisoblanadi
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-green-400"></span>
                        Tur 2 = yo'q vaqt avtomatik to'ldiriladi
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MissingTimeSettings;
