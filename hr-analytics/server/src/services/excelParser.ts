/**
 * =============================================================================
 * HR Analytics Backend - Excel Parser Service
 * =============================================================================
 * 
 * Server-side Excel parsing for Monthly Details and Check In&Out files.
 * Handles both file formats and extracts employee attendance data.
 * 
 * @module services/excelParser
 * @author HR Analytics Team
 * @version 1.0.0
 */

import * as XLSX from 'xlsx';
import { createContextLogger } from '../utils/logger';
import type { ParsedTimeValue, AttendanceStatusCode } from '../models/types';

// Create context-specific logger
const log = createContextLogger('ExcelParser');

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Valid attendance status codes from Monthly Details
 */
const VALID_STATUS_CODES: AttendanceStatusCode[] = ['W', 'L', 'E', 'LE', 'A', 'NS', 'H'];

/**
 * Fixed columns that are not date columns
 */
const FIXED_COLUMNS = ['Name', 'ID', 'Department'];

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Parsed employee row from Excel
 */
export interface ParsedEmployeeRow {
    externalId: string;
    name: string;
    department: string;
    dailyData: Map<string, string>; // date -> status code or time value
}

/**
 * Time period info extracted from Excel
 */
export interface TimePeriodInfo {
    startYear: number;
    startMonth: number;
    endYear: number;
    endMonth: number;
}

/**
 * Excel parse result
 */
export interface ExcelParseResult {
    employees: ParsedEmployeeRow[];
    dateColumns: string[];
    timePeriod: TimePeriodInfo | null;
    fileType: 'details' | 'checkinout';
    errors: string[];
    warnings: string[];
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if column name is a date column
 * Supports formats: 01-01, 01/01, 01.01
 * 
 * @param columnName - Column header name
 * @returns True if column is a date column
 */
function isDateColumn(columnName: string): boolean {
    const datePatterns = [
        /^\d{2}-\d{2}$/,      // 01-01
        /^\d{2}\/\d{2}$/,     // 01/01
        /^\d{2}\.\d{2}$/,     // 01.01
    ];

    return datePatterns.some(pattern => pattern.test(columnName.trim()));
}

/**
 * Clean department name
 * Removes "All Departments>" prefix and converts to uppercase
 * 
 * @param department - Raw department name from Excel
 * @returns Cleaned department name
 */
function cleanDepartmentName(department: string): string {
    let cleaned = department;

    // Remove "All Departments>" prefix (case-insensitive)
    cleaned = cleaned.replace(/All\s*Departments\s*>\s*/gi, '');

    // Trim whitespace and convert to uppercase
    cleaned = cleaned.trim().toUpperCase();

    return cleaned;
}

/**
 * Find the header row in worksheet
 * Searches for row containing Name, ID, Department columns
 * 
 * @param worksheet - XLSX worksheet
 * @returns Header row index (0-based)
 */
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
            log.debug('Found header row', { row, valA, valB, valC });
            return row;
        }
    }

    log.warn('Header row not found, using default row 0');
    return 0;
}

/**
 * Extract time period from Excel metadata
 * Expected format in row 7: ":Time Period: 2026-01-01 - 2026-01-31:"
 * 
 * @param worksheet - XLSX worksheet
 * @returns Time period info or null if not found
 */
function findTimePeriod(worksheet: XLSX.WorkSheet): TimePeriodInfo | null {
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

    // Helper to extract dates from string
    const extractTimePeriod = (value: string): TimePeriodInfo | null => {
        // Try YYYY-MM-DD format
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

        return null;
    };

    // Check row 7 (index 6) first
    const row7 = 6;
    if (row7 <= range.e.r) {
        for (let col = range.s.c; col <= Math.min(range.e.c, 10); col++) {
            const cell = worksheet[XLSX.utils.encode_cell({ r: row7, c: col })];
            const value = cell?.v?.toString() || '';

            if (value.toLowerCase().includes('time period')) {
                const result = extractTimePeriod(value);
                if (result) {
                    log.info('Found time period in row 7', result);
                    return result;
                }
            }
        }
    }

    // Fallback: search first 10 rows
    for (let row = range.s.r; row <= Math.min(range.e.r, 10); row++) {
        for (let col = range.s.c; col <= Math.min(range.e.c, 10); col++) {
            const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })];
            const value = cell?.v?.toString() || '';

            if (value.toLowerCase().includes('time period')) {
                const result = extractTimePeriod(value);
                if (result) {
                    log.info('Found time period', { row, result });
                    return result;
                }
            }
        }
    }

    log.warn('Time period not found in Excel');
    return null;
}

/**
 * Convert short date format to full ISO date
 * Handles cross-year periods (e.g., Dec 2025 - Jan 2026)
 * 
 * @param shortDate - Short date like "01-15"
 * @param timePeriod - Time period info for year determination
 * @returns Full ISO date string (YYYY-MM-DD)
 */
function normalizeDate(shortDate: string, timePeriod: TimePeriodInfo): string {
    const match = shortDate.match(/^(\d{2})[-\/.](\d{2})$/);
    if (!match) return shortDate;

    const month = parseInt(match[1], 10);
    const day = parseInt(match[2], 10);

    // Determine year based on month and time period
    let year: number;
    if (timePeriod.startYear === timePeriod.endYear) {
        year = timePeriod.startYear;
    } else {
        // Cross-year: if month >= start month, use start year; otherwise end year
        year = month >= timePeriod.startMonth ? timePeriod.startYear : timePeriod.endYear;
    }

    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

/**
 * Detect file type based on file title and content
 * Monthly Details has status codes (W, L, E, etc.)
 * Check In&Out has time values (09:00-18:00)
 * 
 * @param worksheet - XLSX worksheet to check title
 * @param sampleValues - Sample data values from Excel
 * @returns 'details' or 'checkinout'
 */
function detectFileType(worksheet: XLSX.WorkSheet, sampleValues: string[]): 'details' | 'checkinout' {
    // First, check file title in first few rows
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

    for (let row = 0; row < Math.min(5, range.e.r); row++) {
        for (let col = 0; col < Math.min(5, range.e.c); col++) {
            const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })];
            const value = cell?.v?.toString()?.toLowerCase() || '';

            // Check for "Check In&Out" or "Check In" in title
            if (value.includes('check in') || value.includes('checkin') || value.includes('in&out')) {
                log.info('Detected file type from title: checkinout', { value });
                return 'checkinout';
            }

            // Check for "Monthly Details" in title
            if (value.includes('monthly details') || value.includes('details')) {
                log.info('Detected file type from title: details', { value });
                return 'details';
            }
        }
    }

    // Second, analyze sample values
    let timePatternCount = 0;
    let statusCodeCount = 0;

    for (const value of sampleValues) {
        const trimmed = value.trim();
        if (!trimmed || trimmed === '-' || trimmed === '--') continue;

        // Check if it's a time value (HH:MM-HH:MM or contains :)
        if (/\d{2}:\d{2}/.test(trimmed) || trimmed.toLowerCase().includes('none')) {
            timePatternCount++;
        }

        // Check if it's a pure status code
        const upper = trimmed.toUpperCase();
        if (VALID_STATUS_CODES.includes(upper as AttendanceStatusCode)) {
            statusCodeCount++;
        }
    }

    log.info('File type detection from content', { timePatternCount, statusCodeCount, samples: sampleValues.length });

    // If more time patterns than status codes, it's checkinout
    if (timePatternCount > statusCodeCount) {
        return 'checkinout';
    }

    // Default to details
    return 'details';
}

/**
 * Parse time value from Check In&Out cell
 * Formats: "09:17-18:00", "-", "None-18:00", "09:00-None"
 * 
 * @param value - Cell value
 * @returns Parsed time value
 */
export function parseTimeValue(value: string): ParsedTimeValue {
    const trimmed = value.trim();

    // Empty or dash means no data
    if (!trimmed || trimmed === '-' || trimmed === '--') {
        return { checkIn: null, checkOut: null, isValid: true };
    }

    // Try to parse HH:MM-HH:MM format
    const match = trimmed.match(/^(\d{2}:\d{2}|None|none|-)[-\s]+(\d{2}:\d{2}|None|none|-)$/);

    if (match) {
        const checkIn = match[1].toLowerCase() === 'none' || match[1] === '-' ? null : match[1];
        const checkOut = match[2].toLowerCase() === 'none' || match[2] === '-' ? null : match[2];

        return { checkIn, checkOut, isValid: true };
    }

    // Single time value (just check-in or just check-out)
    const singleMatch = trimmed.match(/^(\d{2}:\d{2})$/);
    if (singleMatch) {
        return { checkIn: singleMatch[1], checkOut: null, isValid: true };
    }

    log.warn('Unable to parse time value', { value });
    return { checkIn: null, checkOut: null, isValid: false };
}

/**
 * Calculate late minutes
 * 
 * @param checkIn - Check-in time (HH:MM)
 * @param workStart - Work start time (HH:MM)
 * @param tolerance - Grace period in minutes
 * @returns Minutes late (0 if on time)
 */
export function calculateLateMinutes(
    checkIn: string | null,
    workStart: string,
    tolerance: number = 0
): number {
    if (!checkIn) return 0;

    const [checkHour, checkMinute] = checkIn.split(':').map(Number);
    const [startHour, startMinute] = workStart.split(':').map(Number);

    const checkInMinutes = checkHour * 60 + checkMinute;
    const workStartMinutes = startHour * 60 + startMinute + tolerance;

    return Math.max(0, checkInMinutes - workStartMinutes);
}

/**
 * Calculate early leave minutes
 * 
 * @param checkOut - Check-out time (HH:MM)
 * @param workEnd - Work end time (HH:MM)
 * @returns Minutes early (0 if on time or late)
 */
export function calculateEarlyLeaveMinutes(
    checkOut: string | null,
    workEnd: string
): number {
    if (!checkOut) return 0;

    const [checkHour, checkMinute] = checkOut.split(':').map(Number);
    const [endHour, endMinute] = workEnd.split(':').map(Number);

    const checkOutMinutes = checkHour * 60 + checkMinute;
    const workEndMinutes = endHour * 60 + endMinute;

    return Math.max(0, workEndMinutes - checkOutMinutes);
}

/**
 * Calculate total work minutes
 * 
 * @param checkIn - Check-in time (HH:MM)
 * @param checkOut - Check-out time (HH:MM)
 * @returns Total minutes worked
 */
export function calculateTotalWorkMinutes(
    checkIn: string | null,
    checkOut: string | null
): number {
    if (!checkIn || !checkOut) return 0;

    const [inHour, inMinute] = checkIn.split(':').map(Number);
    const [outHour, outMinute] = checkOut.split(':').map(Number);

    const checkInMinutes = inHour * 60 + inMinute;
    const checkOutMinutes = outHour * 60 + outMinute;

    return Math.max(0, checkOutMinutes - checkInMinutes);
}

// =============================================================================
// MAIN PARSE FUNCTION
// =============================================================================

/**
 * Parse Excel file (both Monthly Details and Check In&Out)
 * 
 * @param buffer - File buffer
 * @returns Parse result with employees, dates, and metadata
 */
export function parseExcelBuffer(buffer: Buffer): ExcelParseResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const employees: ParsedEmployeeRow[] = [];
    const dateColumns: string[] = [];

    try {
        log.info('Starting Excel parse');

        // Read workbook
        const workbook = XLSX.read(buffer, { type: 'buffer' });

        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            errors.push('Excel faylda hech qanday varaq topilmadi');
            return { employees, dateColumns, timePeriod: null, fileType: 'details', errors, warnings };
        }

        const worksheet = workbook.Sheets[sheetName];

        // Find time period
        const timePeriod = findTimePeriod(worksheet);
        if (!timePeriod) {
            const currentYear = new Date().getFullYear();
            warnings.push(`Time Period topilmadi, joriy yil ishlatiladi: ${currentYear}`);
        }

        // Effective time period
        const effectiveTimePeriod: TimePeriodInfo = timePeriod || {
            startYear: new Date().getFullYear(),
            startMonth: 1,
            endYear: new Date().getFullYear(),
            endMonth: 12
        };

        // Find header row
        const headerRowIndex = findHeaderRow(worksheet);
        log.info('Header row found', { headerRowIndex });

        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
            defval: '',
            range: headerRowIndex
        });

        if (jsonData.length === 0) {
            errors.push("Excel faylda ma'lumot topilmadi");
            return { employees, dateColumns, timePeriod, fileType: 'details', errors, warnings };
        }

        // Get headers
        const headers = Object.keys(jsonData[0]);

        // Find date columns
        const dateColumnMapping = new Map<string, string>();
        for (const header of headers) {
            if (isDateColumn(header) && !FIXED_COLUMNS.includes(header)) {
                const normalizedDate = normalizeDate(header, effectiveTimePeriod);
                dateColumnMapping.set(header, normalizedDate);
                dateColumns.push(normalizedDate);
            }
        }

        if (dateColumns.length === 0) {
            warnings.push("Sana ustunlari topilmadi");
        }

        // Collect sample values from first 10 rows for file type detection
        const sampleValues: string[] = [];
        const dateColKeys = Array.from(dateColumnMapping.keys());
        for (let i = 0; i < Math.min(10, jsonData.length); i++) {
            for (const col of dateColKeys.slice(0, 5)) { // Check first 5 date columns
                const value = String(jsonData[i][col] || '').trim();
                if (value) sampleValues.push(value);
            }
        }

        // Detect file type from title and sample values
        let fileType: 'details' | 'checkinout' = 'details';
        fileType = detectFileType(worksheet, sampleValues);
        log.info('Detected file type', { fileType, sampleCount: sampleValues.length });

        // Parse each row
        for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            const rowNum = i + headerRowIndex + 2;

            // Find column values (case-insensitive)
            const findColumn = (names: string[]): string => {
                for (const name of names) {
                    for (const header of headers) {
                        if (header.toLowerCase() === name.toLowerCase()) {
                            return String(row[header] || '').trim();
                        }
                    }
                }
                return '';
            };

            const externalId = findColumn(['ID', 'id', 'tabel']);
            const name = findColumn(['Name', 'name', 'ism']);
            const department = cleanDepartmentName(findColumn(['Department', 'department', "bo'lim"]));

            // Skip rows without required data
            if (!externalId) {
                if (name) warnings.push(`${rowNum}-qator: ID bo'sh, o'tkazib yuborildi`);
                continue;
            }

            if (!name) {
                warnings.push(`${rowNum}-qator: Ism bo'sh, o'tkazib yuborildi`);
                continue;
            }

            // Parse daily data
            const dailyData = new Map<string, string>();
            for (const [originalCol, normalizedDate] of dateColumnMapping.entries()) {
                const value = String(row[originalCol] || '').trim();
                dailyData.set(normalizedDate, value);
            }

            employees.push({
                externalId,
                name,
                department,
                dailyData
            });
        }

        log.info('Excel parse completed', {
            employeeCount: employees.length,
            dateColumns: dateColumns.length,
            fileType,
            errors: errors.length,
            warnings: warnings.length
        });

        return { employees, dateColumns, timePeriod, fileType, errors, warnings };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log.error('Excel parse failed', { error: errorMessage });
        errors.push(`Faylni o'qishda xatolik: ${errorMessage}`);

        return { employees, dateColumns, timePeriod: null, fileType: 'details', errors, warnings };
    }
}

export default {
    parseExcelBuffer,
    parseTimeValue,
    calculateLateMinutes,
    calculateEarlyLeaveMinutes,
    calculateTotalWorkMinutes
};
