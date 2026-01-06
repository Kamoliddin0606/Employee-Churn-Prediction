import * as XLSX from 'xlsx';
import type { ImportedEmployee, ParsedExcelRow, DailyAttendance, AttendanceStatusCode } from '../types';

export interface ParseResult {
  employees: ImportedEmployee[];
  dateColumns: string[];
  errors: string[];
  warnings: string[];
}

// Fixed columns that are not date columns
const FIXED_COLUMNS = ['Name', 'ID', 'Department'];

// Valid status codes from the attendance system
const VALID_STATUS_CODES = ['W', 'L', 'E', 'LE', 'A', 'NS', 'H'];

function isDateColumn(columnName: string): boolean {
  const datePatterns = [
    /^\d{2}-\d{2}$/,      // 12-01
    /^\d{2}\/\d{2}$/,     // 12/01
    /^\d{4}-\d{2}-\d{2}$/, // 2025-12-01
    /^\d{2}\.\d{2}$/,     // 01.12
    /^\d{2}\.\d{2}\.\d{4}$/, // 01.12.2025
  ];
  
  return datePatterns.some(pattern => pattern.test(columnName.trim()));
}

function normalizeColumnName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseStatusCode(value: string): AttendanceStatusCode {
  const normalized = value.trim().toUpperCase();
  if (VALID_STATUS_CODES.includes(normalized)) {
    return normalized as AttendanceStatusCode;
  }
  // Default to Absent if unknown
  return 'A';
}

function cleanDepartmentName(department: string): string {
  let cleaned = department;
  
  // Remove "All Departments>" prefix (case-insensitive)
  cleaned = cleaned.replace(/All\s*Departments\s*>\s*/gi, '');
  
  // Trim whitespace from both sides
  cleaned = cleaned.trim();
  
  // Convert to uppercase
  cleaned = cleaned.toUpperCase();
  
  return cleaned;
}

function findColumnMapping(headers: string[]): Map<string, string> {
  const mapping = new Map<string, string>();
  
  const columnAliases: Record<string, string[]> = {
    'Name': ['name', 'ism', 'f.i.sh', 'fio', 'xodim', 'employee', 'employee name'],
    'ID': ['id', 'xodim id', 'employee id', 'tabel', 'tabel raqami'],
    'Department': ['department', 'bo\'lim', 'bolim', 'dept', 'отдел'],
  };
  
  for (const header of headers) {
    const normalized = normalizeColumnName(header);
    
    for (const [standardName, aliases] of Object.entries(columnAliases)) {
      if (aliases.includes(normalized) || normalized === standardName.toLowerCase()) {
        mapping.set(standardName, header);
        break;
      }
    }
    
    if (isDateColumn(header)) {
      mapping.set(header, header);
    }
  }
  
  return mapping;
}

function findHeaderRow(worksheet: XLSX.WorkSheet): number {
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  
  for (let row = range.s.r; row <= Math.min(range.e.r, 15); row++) {
    const cellA = worksheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
    const cellB = worksheet[XLSX.utils.encode_cell({ r: row, c: 1 })];
    const cellC = worksheet[XLSX.utils.encode_cell({ r: row, c: 2 })];
    
    const valA = cellA?.v?.toString().toLowerCase() || '';
    const valB = cellB?.v?.toString().toLowerCase() || '';
    const valC = cellC?.v?.toString().toLowerCase() || '';
    
    // Check if this row contains header-like values
    if ((valA.includes('name') || valA.includes('ism')) &&
        (valB.includes('id') || valB.includes('tabel')) &&
        (valC.includes('department') || valC.includes('bo\'lim'))) {
      return row;
    }
  }
  
  return 0; // Default to first row
}

export async function parseExcelFile(file: File): Promise<ParseResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const employees: ImportedEmployee[] = [];
  const dateColumns: string[] = [];
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      errors.push('Excel faylda hech qanday varaq topilmadi');
      return { employees, dateColumns, errors, warnings };
    }
    
    const worksheet = workbook.Sheets[sheetName];
    
    // Find the header row (skip metadata rows)
    const headerRowIndex = findHeaderRow(worksheet);
    
    // Convert to JSON starting from header row
    const jsonData = XLSX.utils.sheet_to_json<ParsedExcelRow>(worksheet, { 
      defval: '',
      range: headerRowIndex
    });
    
    if (jsonData.length === 0) {
      errors.push('Excel faylda ma\'lumot topilmadi');
      return { employees, dateColumns, errors, warnings };
    }
    
    const headers = Object.keys(jsonData[0]);
    const columnMapping = findColumnMapping(headers);
    
    const requiredColumns = ['Name', 'ID', 'Department'];
    for (const col of requiredColumns) {
      if (!columnMapping.has(col)) {
        errors.push(`Majburiy ustun topilmadi: ${col}`);
      }
    }
    
    if (errors.length > 0) {
      return { employees, dateColumns, errors, warnings };
    }
    
    // Find date columns
    for (const header of headers) {
      if (isDateColumn(header) && !FIXED_COLUMNS.includes(header)) {
        dateColumns.push(header);
      }
    }
    
    if (dateColumns.length === 0) {
      warnings.push('Sana ustunlari topilmadi. Faqat xodim ma\'lumotlari import qilinadi.');
    }
    
    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      const rowNum = i + headerRowIndex + 2;
      
      const nameCol = columnMapping.get('Name') || 'Name';
      const idCol = columnMapping.get('ID') || 'ID';
      const deptCol = columnMapping.get('Department') || 'Department';
      
      const id = String(row[idCol] || '').trim();
      const name = String(row[nameCol] || '').trim();
      const department = cleanDepartmentName(String(row[deptCol] || ''));
      
      if (!id) {
        warnings.push(`${rowNum}-qator: ID bo'sh, o'tkazib yuborildi`);
        continue;
      }
      
      if (!name) {
        warnings.push(`${rowNum}-qator: Ism bo'sh, o'tkazib yuborildi`);
        continue;
      }
      
      const dailyAttendance: DailyAttendance = {};
      
      // Parse status codes for each date column
      for (const dateCol of dateColumns) {
        const cellValue = row[dateCol];
        const statusStr = cellValue !== undefined ? String(cellValue).trim() : '';
        
        // Parse the status code (W, L, E, LE, A, NS, H)
        const statusCode = parseStatusCode(statusStr);
        dailyAttendance[dateCol] = statusCode;
      }
      
      employees.push({
        id,
        name,
        department,
        dailyAttendance
      });
    }
    
    return { employees, dateColumns, errors, warnings };
    
  } catch (error) {
    errors.push(`Faylni o'qishda xatolik: ${error instanceof Error ? error.message : 'Noma\'lum xatolik'}`);
    return { employees, dateColumns, errors, warnings };
  }
}

export function generateExcelExport(
  data: Record<string, unknown>[],
  fileName: string
): void {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

export function generateCSVExport(
  data: Record<string, unknown>[],
  fileName: string
): void {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${fileName}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
