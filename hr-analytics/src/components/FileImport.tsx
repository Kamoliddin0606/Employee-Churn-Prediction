import React, { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { useStore } from '../store/useStore';
import { parseExcelFile } from '../utils/excelParser';
import { processImportedEmployee } from '../utils/attendanceCalculator';
import type { ImportHistory } from '../types';
import { useLanguage } from '../i18n';

interface PreviewData {
  headers: string[];
  rows: Record<string, string | number>[];
  dateColumns: string[];
}

export function FileImport() {
  const { t } = useLanguage();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importStatus, setImportStatus] = useState<'idle' | 'parsing' | 'importing' | 'success' | 'error'>('idle');

  const {
    employees,
    attendance,
    addEmployee,
    upsertAttendanceRecord,
    addImportHistory,
    setIsImporting,
    setImportProgress,
    importProgress
  } = useStore();

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
    if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls') || droppedFile.name.endsWith('.csv'))) {
      setFile(droppedFile);
      handleFilePreview(droppedFile);
    } else {
      setErrors([t.import.onlyExcel]);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      handleFilePreview(selectedFile);
    }
  }, []);

  const handleFilePreview = async (file: File) => {
    setImportStatus('parsing');
    setErrors([]);
    setWarnings([]);
    setImportProgress(10);

    try {
      const result = await parseExcelFile(file);
      setImportProgress(50);

      if (result.errors.length > 0) {
        setErrors(result.errors);
        setImportStatus('error');
        return;
      }

      setWarnings(result.warnings);

      const headers = result.employees.length > 0 
        ? ['ID', 'Name', 'Department', ...result.dateColumns.slice(0, 5), result.dateColumns.length > 5 ? '...' : ''].filter(Boolean)
        : [];

      const rows = result.employees.slice(0, 5).map(emp => {
        const row: Record<string, string | number> = {
          ID: emp.id,
          Name: emp.name,
          Department: emp.department,
        };
        result.dateColumns.slice(0, 5).forEach(date => {
          const statusCode = emp.dailyAttendance[date];
          row[date] = statusCode || '-';
        });
        return row;
      });

      setPreview({
        headers,
        rows,
        dateColumns: result.dateColumns
      });

      setImportProgress(100);
      setImportStatus('idle');
    } catch (error) {
      setErrors([`${t.import.readError}: ${error instanceof Error ? error.message : t.import.unknownError}`]);
      setImportStatus('error');
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setImportStatus('importing');
    setIsImporting(true);
    setImportProgress(0);

    try {
      const result = await parseExcelFile(file);
      
      if (result.errors.length > 0) {
        setErrors(result.errors);
        setImportStatus('error');
        setIsImporting(false);
        return;
      }

      const snapshot = {
        employees: [...employees],
        attendance: [...attendance]
      };

      let newEmployeesCount = 0;
      let updatedRecordsCount = 0;
      const totalItems = result.employees.length;

      for (let i = 0; i < result.employees.length; i++) {
        const importedEmployee = result.employees[i];
        const { employee, records } = processImportedEmployee(importedEmployee, result.dateColumns);

        const existingEmployee = employees.find(e => e.id === employee.id);
        if (!existingEmployee) {
          newEmployeesCount++;
        }

        addEmployee(employee);

        for (const record of records) {
          const existingRecord = attendance.find(
            a => a.employeeId === record.employeeId && a.date === record.date
          );
          if (existingRecord) {
            updatedRecordsCount++;
          }
          upsertAttendanceRecord(record);
        }

        setImportProgress(Math.round(((i + 1) / totalItems) * 100));
      }

      const historyEntry: ImportHistory = {
        id: `import-${Date.now()}`,
        fileName: file.name,
        importDate: new Date().toISOString(),
        recordsCount: result.employees.length,
        newEmployees: newEmployeesCount,
        updatedRecords: updatedRecordsCount,
        errors: result.errors,
        snapshot
      };

      addImportHistory(historyEntry);

      setImportStatus('success');
      setWarnings(result.warnings);

      setTimeout(() => {
        setFile(null);
        setPreview(null);
        setImportStatus('idle');
        setImportProgress(0);
      }, 3000);

    } catch (error) {
      setErrors([`${t.import.importError}: ${error instanceof Error ? error.message : t.import.unknownError}`]);
      setImportStatus('error');
    } finally {
      setIsImporting(false);
    }
  };

  const resetImport = () => {
    setFile(null);
    setPreview(null);
    setErrors([]);
    setWarnings([]);
    setImportStatus('idle');
    setImportProgress(0);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          {t.import.title}
        </CardTitle>
        <CardDescription>
          {t.import.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!file ? (
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
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-1">
                {t.import.dropzone}
              </p>
              <p className="text-sm text-muted-foreground">
                {t.import.formats}
              </p>
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-8 w-8 text-primary" />
                <div>
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={resetImport}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {importStatus === 'parsing' && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{t.import.parsing}</p>
                <Progress value={importProgress} />
              </div>
            )}

            {importStatus === 'importing' && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{t.import.importing}</p>
                <Progress value={importProgress} />
              </div>
            )}

            {importStatus === 'success' && (
              <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg">
                <CheckCircle2 className="h-5 w-5" />
                <span>{t.import.success}</span>
              </div>
            )}

            {errors.length > 0 && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                  <AlertCircle className="h-5 w-5" />
                  <span className="font-medium">{t.import.errors}:</span>
                </div>
                <ul className="list-disc list-inside text-sm text-red-600 dark:text-red-400">
                  {errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                  <AlertCircle className="h-5 w-5" />
                  <span className="font-medium">{t.import.warnings}:</span>
                </div>
                <ul className="list-disc list-inside text-sm text-yellow-600 dark:text-yellow-400">
                  {warnings.slice(0, 5).map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                  {warnings.length > 5 && (
                    <li>{t.import.andMore.replace('{count}', String(warnings.length - 5))}</li>
                  )}
                </ul>
              </div>
            )}

            {preview && preview.rows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">{t.import.preview}</h4>
                  <Badge variant="secondary">
                    {t.import.daysEmployees.replace('{days}', String(preview.dateColumns.length)).replace('{employees}', String(preview.rows.length))}
                  </Badge>
                </div>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        {preview.headers.map((header, i) => (
                          <th key={i} className="px-3 py-2 text-left font-medium">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, i) => (
                        <tr key={i} className="border-t">
                          {preview.headers.map((header, j) => (
                            <td key={j} className="px-3 py-2">
                              {String(row[header] || '-')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {preview && importStatus !== 'success' && importStatus !== 'importing' && (
              <div className="flex gap-2">
                <Button onClick={handleImport} className="flex-1">
                  <Upload className="h-4 w-4 mr-2" />
                  {t.import.importBtn}
                </Button>
                <Button variant="outline" onClick={resetImport}>
                  {t.import.cancel}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
