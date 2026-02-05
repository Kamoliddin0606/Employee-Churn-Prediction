/**
 * =============================================================================
 * FileImportBackend Component
 * =============================================================================
 * 
 * New file import component that uses backend API with manual file type selection.
 * User must select file type (Check In&Out or Monthly Details) before uploading.
 * 
 * @component FileImportBackend
 */

import React, { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, Clock, FileText } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Progress } from './ui/progress';
import { useLanguage } from '../i18n';

// API configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// File type options
type FileType = 'checkinout' | 'details';

interface FileTypeOption {
    value: FileType;
    label: string;
    labelEn: string;
    description: string;
    icon: React.ReactNode;
}

const FILE_TYPE_OPTIONS: FileTypeOption[] = [
    {
        value: 'checkinout',
        label: 'Check In & Out',
        labelEn: 'Check In & Out',
        description: 'Kirish-chiqish vaqtlari (09:00-18:00)',
        icon: <Clock className="h-8 w-8" />,
    },
    {
        value: 'details',
        label: 'Monthly Details',
        labelEn: 'Monthly Details',
        description: 'Status kodlari (W, L, E, A, NS)',
        icon: <FileText className="h-8 w-8" />,
    },
];

interface ImportResult {
    importId: number;
    newEmployees: number;
    updatedRecords: number;
    totalEmployees: number;
    fileType: string;
    warnings?: string[];
}

export function FileImportBackend() {
    const { t } = useLanguage();

    // State
    const [selectedFileType, setSelectedFileType] = useState<FileType | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [errors, setErrors] = useState<string[]>([]);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [importStatus, setImportStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
    const [importProgress, setImportProgress] = useState(0);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);

    // Drag handlers
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls'))) {
            setFile(droppedFile);
            setErrors([]);
        } else {
            setErrors(['Faqat Excel fayllar (.xlsx, .xls) qabul qilinadi']);
        }
    }, []);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setErrors([]);
        }
    }, []);

    // Upload file to backend
    const handleUpload = async () => {
        if (!file || !selectedFileType) return;

        setImportStatus('uploading');
        setImportProgress(10);
        setErrors([]);
        setWarnings([]);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('fileType', selectedFileType);

            setImportProgress(30);

            const response = await fetch(`${API_BASE_URL}/import/upload`, {
                method: 'POST',
                body: formData,
            });

            setImportProgress(80);

            const data = await response.json();

            if (!data.success) {
                setErrors([data.error || 'Import xatosi']);
                setImportStatus('error');
                return;
            }

            setImportProgress(100);
            setImportResult(data.data);
            setWarnings(data.data?.warnings || []);
            setImportStatus('success');

            // Auto-reset after 5 seconds
            setTimeout(() => {
                resetImport();
            }, 5000);

        } catch (error) {
            console.error('Upload error:', error);
            setErrors([error instanceof Error ? error.message : 'Tarmoq xatosi']);
            setImportStatus('error');
        }
    };

    // Reset state
    const resetImport = () => {
        setSelectedFileType(null);
        setFile(null);
        setErrors([]);
        setWarnings([]);
        setImportStatus('idle');
        setImportProgress(0);
        setImportResult(null);
    };

    // Go back to file type selection
    const goBackToTypeSelection = () => {
        setFile(null);
        setErrors([]);
    };

    return (
        <Card className="w-full max-w-2xl mx-auto">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5" />
                    {t.import?.title || 'Excel Import'}
                </CardTitle>
                <CardDescription>
                    Excel faylni backend serverga yuklash
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

                {/* Step 1: File Type Selection */}
                {!selectedFileType && (
                    <div className="space-y-4">
                        <div className="text-center mb-4">
                            <h3 className="text-lg font-semibold text-foreground">1. Fayl turini tanlang</h3>
                            <p className="text-sm text-muted-foreground">Yuklamoqchi bo'lgan Excel fayl qaysi formatda?</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {FILE_TYPE_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    onClick={() => setSelectedFileType(option.value)}
                                    className="flex flex-col items-center p-6 border-2 rounded-xl transition-all hover:border-primary hover:bg-primary/5 group"
                                >
                                    <div className="text-muted-foreground group-hover:text-primary transition-colors">
                                        {option.icon}
                                    </div>
                                    <h4 className="mt-3 font-semibold text-foreground">{option.label}</h4>
                                    <p className="mt-1 text-sm text-muted-foreground text-center">{option.description}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 2: File Upload */}
                {selectedFileType && !file && importStatus === 'idle' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold">2. Faylni yuklang</h3>
                                <p className="text-sm text-muted-foreground">
                                    Tanlangan format: <span className="font-medium text-primary">
                                        {FILE_TYPE_OPTIONS.find(o => o.value === selectedFileType)?.label}
                                    </span>
                                </p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedFileType(null)}>
                                ← Ortga
                            </Button>
                        </div>

                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            className={`
                border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
                ${isDragging
                                    ? 'border-primary bg-primary/5'
                                    : 'border-muted-foreground/25 hover:border-primary/50'
                                }
              `}
                        >
                            <input
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleFileSelect}
                                className="hidden"
                                id="file-upload-backend"
                            />
                            <label htmlFor="file-upload-backend" className="cursor-pointer">
                                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                                <p className="text-lg font-medium mb-1">
                                    Faylni shu yerga tashlang yoki tanlang
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Excel (.xlsx, .xls)
                                </p>
                            </label>
                        </div>

                        {errors.length > 0 && (
                            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg space-y-2">
                                <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                                    <AlertCircle className="h-5 w-5" />
                                    <span className="font-medium">Xatolik:</span>
                                </div>
                                <ul className="list-disc list-inside text-sm text-red-600 dark:text-red-400">
                                    {errors.map((error, i) => (
                                        <li key={i}>{error}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 3: Confirm and Upload */}
                {selectedFileType && file && importStatus === 'idle' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">3. Tasdiqlang va yuklang</h3>
                            <Button variant="ghost" size="sm" onClick={goBackToTypeSelection}>
                                ← Ortga
                            </Button>
                        </div>

                        <div className="p-4 bg-muted rounded-lg">
                            <div className="flex items-center gap-4">
                                <FileSpreadsheet className="h-10 w-10 text-primary" />
                                <div className="flex-1">
                                    <p className="font-medium">{file.name}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {(file.size / 1024).toFixed(1)} KB • {FILE_TYPE_OPTIONS.find(o => o.value === selectedFileType)?.label}
                                    </p>
                                </div>
                                <Button variant="ghost" size="icon" onClick={goBackToTypeSelection}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <Button onClick={handleUpload} className="flex-1">
                                <Upload className="h-4 w-4 mr-2" />
                                Serverga yuklash
                            </Button>
                            <Button variant="outline" onClick={resetImport}>
                                Bekor qilish
                            </Button>
                        </div>
                    </div>
                )}

                {/* Uploading State */}
                {importStatus === 'uploading' && (
                    <div className="space-y-4">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                            <p className="font-medium">Yuklanmoqda...</p>
                            <p className="text-sm text-muted-foreground">Iltimos, kuting</p>
                        </div>
                        <Progress value={importProgress} />
                    </div>
                )}

                {/* Success State */}
                {importStatus === 'success' && importResult && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg">
                            <CheckCircle2 className="h-6 w-6" />
                            <div>
                                <p className="font-semibold">Muvaffaqiyatli yuklandi!</p>
                                <p className="text-sm">
                                    {importResult.newEmployees} yangi xodim, {importResult.updatedRecords} yozuv yangilandi
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div className="p-3 bg-muted rounded-lg">
                                <div className="text-2xl font-bold">{importResult.totalEmployees}</div>
                                <div className="text-xs text-muted-foreground">Jami xodim</div>
                            </div>
                            <div className="p-3 bg-muted rounded-lg">
                                <div className="text-2xl font-bold text-green-600">{importResult.newEmployees}</div>
                                <div className="text-xs text-muted-foreground">Yangi</div>
                            </div>
                            <div className="p-3 bg-muted rounded-lg">
                                <div className="text-2xl font-bold text-blue-600">{importResult.updatedRecords}</div>
                                <div className="text-xs text-muted-foreground">Yangilangan</div>
                            </div>
                        </div>

                        {warnings.length > 0 && (
                            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg space-y-2">
                                <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                                    <AlertCircle className="h-5 w-5" />
                                    <span className="font-medium">Ogohlantirishlar:</span>
                                </div>
                                <ul className="list-disc list-inside text-sm text-yellow-600 dark:text-yellow-400">
                                    {warnings.slice(0, 5).map((warning, i) => (
                                        <li key={i}>{warning}</li>
                                    ))}
                                    {warnings.length > 5 && (
                                        <li>...va yana {warnings.length - 5} ta</li>
                                    )}
                                </ul>
                            </div>
                        )}

                        <Button onClick={resetImport} className="w-full">
                            Yana yuklash
                        </Button>
                    </div>
                )}

                {/* Error State */}
                {importStatus === 'error' && (
                    <div className="space-y-4">
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg space-y-2">
                            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                                <AlertCircle className="h-5 w-5" />
                                <span className="font-medium">Yuklashda xatolik:</span>
                            </div>
                            <ul className="list-disc list-inside text-sm text-red-600 dark:text-red-400">
                                {errors.map((error, i) => (
                                    <li key={i}>{error}</li>
                                ))}
                            </ul>
                        </div>

                        <Button onClick={resetImport} className="w-full" variant="outline">
                            Qaytadan urinish
                        </Button>
                    </div>
                )}

            </CardContent>
        </Card>
    );
}

export default FileImportBackend;
