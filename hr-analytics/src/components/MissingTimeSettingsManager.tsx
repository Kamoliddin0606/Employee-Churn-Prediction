/**
 * =============================================================================
 * MissingTimeSettingsManager Component
 * =============================================================================
 * 
 * UI for managing missing time handling settings at organization, department,
 * and employee levels. Each target can have only one active setting.
 * 
 * Settings Types:
 *   Type 1: Yo'q vaqt = to'liq ishlanmagan kun (Full Absent)
 *   Type 2: Avtomatik to'ldirish (Auto-fill with penalty minutes)
 * 
 * Priority: Employee > Department > Organization
 * 
 * @component MissingTimeSettingsManager
 */

import { useState, useEffect } from 'react';
import { 
    missingTimeSettingsApi,
    type MissingTimeSettings,
    type MissingTimeTarget,
    type MissingTimeTargetType,
    type MissingTimeHandlingType,
    type AvailableTargetsResponse
} from '../services/api';
import { 
    Building2, 
    Users, 
    User, 
    Plus, 
    Pencil, 
    Trash2, 
    Clock, 
    AlertCircle,
    Check,
    X,
    Loader2,
    Info
} from 'lucide-react';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface SettingsFormData {
    targetType: MissingTimeTargetType;
    targetId: number;
    handlingType: MissingTimeHandlingType;
    missingCheckinPenaltyMinutes: number;
    missingCheckoutPenaltyMinutes: number;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function MissingTimeSettingsManager() {
    // State
    const [activeTab, setActiveTab] = useState<MissingTimeTargetType>('organization');
    const [targets, setTargets] = useState<AvailableTargetsResponse | null>(null);
    const [settings, setSettings] = useState<MissingTimeSettings[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    
    // Form state
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formData, setFormData] = useState<SettingsFormData>({
        targetType: 'organization',
        targetId: 0,
        handlingType: 2,
        missingCheckinPenaltyMinutes: 120,
        missingCheckoutPenaltyMinutes: 120,
    });

    // =============================================================================
    // DATA LOADING
    // =============================================================================

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [targetsRes, settingsRes] = await Promise.all([
                missingTimeSettingsApi.getAvailableTargets(),
                missingTimeSettingsApi.getAll(),
            ]);

            if (targetsRes.success && targetsRes.data) {
                setTargets(targetsRes.data);
            }
            if (settingsRes.success && settingsRes.data) {
                setSettings(settingsRes.data);
            }
        } catch (error) {
            console.error('Failed to load data:', error);
            setMessage({ type: 'error', text: 'Ma\'lumotlarni yuklashda xatolik' });
        } finally {
            setLoading(false);
        }
    };

    // =============================================================================
    // HANDLERS
    // =============================================================================

    const handleCreate = (targetType: MissingTimeTargetType, targetId: number) => {
        setFormData({
            targetType,
            targetId,
            handlingType: 2,
            missingCheckinPenaltyMinutes: 120,
            missingCheckoutPenaltyMinutes: 120,
        });
        setEditingId(null);
        setShowForm(true);
    };

    const handleEdit = (setting: MissingTimeSettings) => {
        setFormData({
            targetType: setting.targetType,
            targetId: setting.targetId,
            handlingType: setting.handlingType,
            missingCheckinPenaltyMinutes: setting.missingCheckinPenaltyMinutes,
            missingCheckoutPenaltyMinutes: setting.missingCheckoutPenaltyMinutes,
        });
        setEditingId(setting.id);
        setShowForm(true);
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Sozlamalarni o\'chirishni tasdiqlaysizmi?')) return;

        setSaving(true);
        try {
            const res = await missingTimeSettingsApi.delete(id);
            if (res.success) {
                setMessage({ type: 'success', text: 'Sozlamalar o\'chirildi' });
                await loadData();
            } else {
                setMessage({ type: 'error', text: res.error || 'Xatolik yuz berdi' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Xatolik yuz berdi' });
        } finally {
            setSaving(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            let res;
            if (editingId) {
                res = await missingTimeSettingsApi.update(editingId, {
                    handlingType: formData.handlingType,
                    missingCheckinPenaltyMinutes: formData.missingCheckinPenaltyMinutes,
                    missingCheckoutPenaltyMinutes: formData.missingCheckoutPenaltyMinutes,
                });
            } else {
                res = await missingTimeSettingsApi.create(formData);
            }

            if (res.success) {
                setMessage({ type: 'success', text: editingId ? 'Sozlamalar yangilandi' : 'Sozlamalar yaratildi' });
                setShowForm(false);
                await loadData();
            } else {
                setMessage({ type: 'error', text: res.error || 'Xatolik yuz berdi' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Xatolik yuz berdi' });
        } finally {
            setSaving(false);
        }
    };

    // =============================================================================
    // HELPERS
    // =============================================================================

    const getTargetName = (targetType: MissingTimeTargetType, targetId: number): string => {
        if (!targets) return `ID: ${targetId}`;
        
        switch (targetType) {
            case 'organization':
                return targets.organizations.find(o => o.id === targetId)?.name || `Tashkilot #${targetId}`;
            case 'department':
                return targets.departments.find(d => d.id === targetId)?.name || `Bo'lim #${targetId}`;
            case 'employee':
                const emp = targets.employees.find(e => e.id === targetId);
                return emp ? `${emp.name} (${emp.externalId})` : `Xodim #${targetId}`;
            default:
                return `ID: ${targetId}`;
        }
    };

    const getCurrentTargets = (): MissingTimeTarget[] => {
        if (!targets) return [];
        switch (activeTab) {
            case 'organization': return targets.organizations;
            case 'department': return targets.departments;
            case 'employee': return targets.employees;
            default: return [];
        }
    };

    // =============================================================================
    // RENDER
    // =============================================================================

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-center gap-3 mb-4">
                    <Clock className="h-6 w-6 text-blue-500" />
                    <h2 className="text-xl font-semibold">Yo'q Vaqt Sozlamalari</h2>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    Check-in yoki check-out vaqti yo'q bo'lganda qanday hisoblash kerakligini sozlang.
                    Har bir tashkilot, bo'lim yoki xodim uchun faqat bitta sozlama yaratish mumkin.
                </p>

                {/* Info box */}
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="flex items-start gap-3">
                        <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                        <div className="text-sm">
                            <p className="font-medium text-blue-800 dark:text-blue-200">Ustuvorlik tartibi:</p>
                            <p className="text-blue-700 dark:text-blue-300">
                                Xodim sozlamasi &gt; Bo'lim sozlamasi &gt; Tashkilot sozlamasi
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Message */}
            {message && (
                <div className={`p-4 rounded-lg flex items-center gap-2 ${
                    message.type === 'success' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' 
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
                }`}>
                    {message.type === 'success' ? <Check className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                    {message.text}
                    <button 
                        onClick={() => setMessage(null)} 
                        className="ml-auto hover:opacity-70"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            {/* Tabs */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="flex -mb-px">
                        <button
                            onClick={() => setActiveTab('organization')}
                            className={`flex items-center gap-2 px-6 py-4 border-b-2 font-medium text-sm ${
                                activeTab === 'organization'
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            <Building2 className="h-4 w-4" />
                            Tashkilot
                        </button>
                        <button
                            onClick={() => setActiveTab('department')}
                            className={`flex items-center gap-2 px-6 py-4 border-b-2 font-medium text-sm ${
                                activeTab === 'department'
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            <Users className="h-4 w-4" />
                            Bo'limlar
                        </button>
                        <button
                            onClick={() => setActiveTab('employee')}
                            className={`flex items-center gap-2 px-6 py-4 border-b-2 font-medium text-sm ${
                                activeTab === 'employee'
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            <User className="h-4 w-4" />
                            Xodimlar
                        </button>
                    </nav>
                </div>

                {/* Content */}
                <div className="p-6">
                    <div className="space-y-3">
                        {getCurrentTargets().map((target) => (
                            <div
                                key={target.id}
                                className={`p-4 rounded-lg border ${
                                    target.hasSettings
                                        ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                                        : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        {activeTab === 'organization' && <Building2 className="h-5 w-5 text-gray-400" />}
                                        {activeTab === 'department' && <Users className="h-5 w-5 text-gray-400" />}
                                        {activeTab === 'employee' && <User className="h-5 w-5 text-gray-400" />}
                                        <div>
                                            <p className="font-medium">{target.name}</p>
                                            {target.departmentName && (
                                                <p className="text-sm text-gray-500">{target.departmentName}</p>
                                            )}
                                            {target.externalId && (
                                                <p className="text-sm text-gray-500">ID: {target.externalId}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {target.hasSettings ? (
                                            <>
                                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                                    target.handlingType === 1
                                                        ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200'
                                                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                                                }`}>
                                                    {target.handlingType === 1 ? 'To\'liq ishlanmagan' : 'Avtomatik to\'ldirish'}
                                                </span>
                                                <button
                                                    onClick={() => {
                                                        const setting = settings.find(s => 
                                                            s.targetType === activeTab && s.targetId === target.id
                                                        );
                                                        if (setting) handleEdit(setting);
                                                    }}
                                                    className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Tahrirlash"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => target.settingsId && handleDelete(target.settingsId)}
                                                    className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="O'chirish"
                                                    disabled={saving}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => handleCreate(activeTab, target.id)}
                                                className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                                            >
                                                <Plus className="h-4 w-4" />
                                                Sozlama qo'shish
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {getCurrentTargets().length === 0 && (
                            <div className="text-center py-8 text-gray-500">
                                <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                <p>Hech qanday {activeTab === 'organization' ? 'tashkilot' : activeTab === 'department' ? 'bo\'lim' : 'xodim'} topilmadi</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
                        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="text-lg font-semibold">
                                {editingId ? 'Sozlamalarni tahrirlash' : 'Yangi sozlama yaratish'}
                            </h3>
                            <p className="text-sm text-gray-500 mt-1">
                                {getTargetName(formData.targetType, formData.targetId)}
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {/* Handling Type */}
                            <div>
                                <label className="block text-sm font-medium mb-2">
                                    Hisoblash turi
                                </label>
                                <div className="space-y-2">
                                    <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                        formData.handlingType === 1
                                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                    }`}>
                                        <input
                                            type="radio"
                                            name="handlingType"
                                            value={1}
                                            checked={formData.handlingType === 1}
                                            onChange={() => setFormData({ ...formData, handlingType: 1 })}
                                            className="mt-1"
                                        />
                                        <div>
                                            <p className="font-medium">1-tur: To'liq ishlanmagan kun</p>
                                            <p className="text-sm text-gray-500">
                                                Yo'q vaqt to'liq ishlanmagan kun sifatida hisoblanadi
                                            </p>
                                        </div>
                                    </label>
                                    <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                        formData.handlingType === 2
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                    }`}>
                                        <input
                                            type="radio"
                                            name="handlingType"
                                            value={2}
                                            checked={formData.handlingType === 2}
                                            onChange={() => setFormData({ ...formData, handlingType: 2 })}
                                            className="mt-1"
                                        />
                                        <div>
                                            <p className="font-medium">2-tur: Avtomatik to'ldirish</p>
                                            <p className="text-sm text-gray-500">
                                                Yo'q vaqt avtomatik to'ldiriladi va jarima daqiqalari qo'shiladi
                                            </p>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* Penalty Minutes (only for type 2) */}
                            {formData.handlingType === 2 && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium mb-2">
                                            Check-in yo'q bo'lganda jarima (daqiqa)
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            max={480}
                                            value={formData.missingCheckinPenaltyMinutes}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                missingCheckinPenaltyMinutes: parseInt(e.target.value) || 0
                                            })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Check-in vaqti yo'q bo'lganda qo'shiladigan kechikish daqiqalari
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-2">
                                            Check-out yo'q bo'lganda jarima (daqiqa)
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            max={480}
                                            value={formData.missingCheckoutPenaltyMinutes}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                missingCheckoutPenaltyMinutes: parseInt(e.target.value) || 0
                                            })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Check-out vaqti yo'q bo'lganda qo'shiladigan erta ketish daqiqalari
                                        </p>
                                    </div>
                                </>
                            )}

                            {/* Actions */}
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowForm(false)}
                                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                    disabled={saving}
                                >
                                    Bekor qilish
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                                >
                                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {editingId ? 'Saqlash' : 'Yaratish'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
