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

// Time Period info with start and end dates for cross-year support
interface TimePeriodInfo {
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
}

// Find Time Period from Excel metadata rows
// Expected format in row 7: ":Time Period: 2025-12-01 - 2026-01-31:"
function findTimePeriod(worksheet: XLSX.WorkSheet): TimePeriodInfo | null {
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  
  // Helper function to extract both dates from Time Period string
  const extractTimePeriod = (value: string): TimePeriodInfo | null => {
    // Try YYYY-MM-DD format: "2025-12-01 - 2026-01-31"
    const dateMatches = value.match(/(\d{4})-(\d{2})-(\d{2})/g);
    if (dateMatches && dateMatches.length >= 2) {
      const startMatch = dateMatches[0].match(/(\d{4})-(\d{2})-(\d{2})/);
      const endMatch = dateMatches[1].match(/(\d{4})-(\d{2})-(\d{2})/);
      if (startMatch && endMatch) {
        return {
          startYear: parseInt(startMatch[1], 10),
          startMonth: parseInt(startMatch[2], 10),
          endYear: parseInt(endMatch[1], 10),
          endMonth: parseInt(endMatch[2], 10)
        };
      }
    }
    
    // Single date fallback
    const singleMatch = value.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (singleMatch) {
      const year = parseInt(singleMatch[1], 10);
      const month = parseInt(singleMatch[2], 10);
      return { startYear: year, startMonth: month, endYear: year, endMonth: month };
    }
    
    // Try MM/DD/YYYY format
    const altMatches = value.match(/(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/g);
    if (altMatches && altMatches.length >= 2) {
      const startMatch = altMatches[0].match(/(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/);
      const endMatch = altMatches[1].match(/(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/);
      if (startMatch && endMatch) {
        return {
          startYear: parseInt(startMatch[3], 10),
          startMonth: parseInt(startMatch[1], 10),
          endYear: parseInt(endMatch[3], 10),
          endMonth: parseInt(endMatch[1], 10)
        };
      }
    }
    
    return null;
  };
  
  // First, check row 7 (index 6) specifically as per template
  const row7 = 6; // 0-indexed
  if (row7 <= range.e.r) {
    for (let col = range.s.c; col <= Math.min(range.e.c, 10); col++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row7, c: col })];
      const value = cell?.v?.toString() || '';
      
      if (value.toLowerCase().includes('time period')) {
        const result = extractTimePeriod(value);
        if (result) return result;
      }
    }
  }
  
  // Fallback: search first 10 rows
  for (let row = range.s.r; row <= Math.min(range.e.r, 10); row++) {
    for (let col = range.s.c; col <= Math.min(range.e.c, 10); col++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })];
      const value = cell?.v?.toString() || '';
      
      if (value.toLowerCase().includes('time period') || value.toLowerCase().includes('davr')) {
        const result = extractTimePeriod(value);
        if (result) return result;
      }
    }
  }
  
  return null;
}

// Convert short date format (12-01) to full date format (2025-12-01)
// Handles cross-year periods: if month < startMonth, use endYear
function normalizeDate(shortDate: string, timePeriod: TimePeriodInfo): string {
  // Handle different formats: 12-01, 12/01, 01.12
  const match = shortDate.match(/^(\d{2})[\/\-\.](\d{2})$/);
  if (match) {
    const part1 = parseInt(match[1], 10);
    const part2 = parseInt(match[2], 10);
    
    // Determine if format is MM-DD or DD.MM
    let month: number, day: number;
    if (shortDate.includes('.')) {
      // DD.MM format (European)
      day = part1;
      month = part2;
    } else {
      // MM-DD or MM/DD format (US)
      month = part1;
      day = part2;
    }
    
    // Determine which year to use based on month
    // If month >= startMonth, use startYear
    // If month < startMonth, use endYear (crossed into new year)
    let year: number;
    if (timePeriod.startYear === timePeriod.endYear) {
      // Same year period
      year = timePeriod.startYear;
    } else {
      // Cross-year period (e.g., Dec 2025 - Jan 2026)
      if (month >= timePeriod.startMonth) {
        year = timePeriod.startYear;
      } else {
        year = timePeriod.endYear;
      }
    }
    
    // Pad with zeros
    const monthStr = month.toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    
    return `${year}-${monthStr}-${dayStr}`;
  }
  
  // Already in full format or unrecognized
  return shortDate;
}

export async function parseExcelFile(file: File, manualYear?: number): Promise<ParseResult> {
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
    
    // Find Time Period to get the year(s)
    const detectedTimePeriod = findTimePeriod(worksheet);
    
    // Build effective time period info
    let effectiveTimePeriod: TimePeriodInfo;
    if (manualYear) {
      // Manual year - use same year for start and end
      effectiveTimePeriod = {
        startYear: manualYear,
        startMonth: 1,
        endYear: manualYear,
        endMonth: 12
      };
      warnings.push(`Qo'lda kiritilgan yil ishlatiladi: ${manualYear}`);
    } else if (detectedTimePeriod) {
      effectiveTimePeriod = detectedTimePeriod;
      if (detectedTimePeriod.startYear === detectedTimePeriod.endYear) {
        warnings.push(`Time Period topildi: ${detectedTimePeriod.startYear} yil`);
      } else {
        warnings.push(`Time Period topildi: ${detectedTimePeriod.startYear}-${detectedTimePeriod.endYear} yillar (${detectedTimePeriod.startMonth}-oydan ${detectedTimePeriod.endMonth}-oygacha)`);
      }
    } else {
      const currentYear = new Date().getFullYear();
      effectiveTimePeriod = {
        startYear: currentYear,
        startMonth: 1,
        endYear: currentYear,
        endMonth: 12
      };
      warnings.push(`Time Period topilmadi, joriy yil ishlatiladi: ${currentYear}`);
    }
    
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
    
    // Find date columns and normalize them to full format
    const dateColumnMapping = new Map<string, string>(); // original -> normalized
    for (const header of headers) {
      if (isDateColumn(header) && !FIXED_COLUMNS.includes(header)) {
        const normalizedDate = normalizeDate(header, effectiveTimePeriod);
        dateColumnMapping.set(header, normalizedDate);
        dateColumns.push(normalizedDate);
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
      // Use dateColumnMapping to get original column name and normalized date
      for (const [originalCol, normalizedDate] of dateColumnMapping.entries()) {
        const cellValue = row[originalCol];
        const statusStr = cellValue !== undefined ? String(cellValue).trim() : '';
        
        // Parse the status code (W, L, E, LE, A, NS, H)
        const statusCode = parseStatusCode(statusStr);
        dailyAttendance[normalizedDate] = statusCode;
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
