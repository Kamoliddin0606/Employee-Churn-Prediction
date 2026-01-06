import type { AttendanceRecord, ImportedEmployee, Employee, EmployeeStats, DepartmentStats, AttendanceStatusCode } from '../types';

/**
 * Status Code Legend:
 * W  - Well (tartibli kelgan)
 * L  - Late (kech qolgan)
 * E  - Early leave (erta ketgan)
 * LE - Late + Early leave (ikkalasi)
 * A  - Absent (kelmagan)
 * NS - No Schedule (ish kuni emas)
 * H  - Holiday (bayram)
 */

// Convert status code to internal status
function statusCodeToStatus(code: AttendanceStatusCode): AttendanceRecord['status'] {
  switch (code) {
    case 'W': return 'present';
    case 'L': return 'late';
    case 'E': return 'early_leave';
    case 'LE': return 'late_and_early';
    case 'A': return 'absent';
    case 'NS': return 'no_schedule';
    case 'H': return 'holiday';
    default: return 'absent';
  }
}

// Check if status code represents a violation
function isViolationStatus(code: AttendanceStatusCode): boolean {
  return code === 'L' || code === 'E' || code === 'LE' || code === 'A';
}

// Check if status code represents a work day
function isWorkDay(code: AttendanceStatusCode): boolean {
  return code !== 'NS' && code !== 'H';
}

export function processImportedEmployee(
  imported: ImportedEmployee,
  dateColumns: string[]
): { employee: Employee; records: AttendanceRecord[] } {
  const employee: Employee = {
    id: imported.id,
    name: imported.name,
    department: imported.department
  };
  
  const records: AttendanceRecord[] = [];
  
  for (const dateCol of dateColumns) {
    const statusCode = imported.dailyAttendance[dateCol];
    if (!statusCode) continue;
    
    const status = statusCodeToStatus(statusCode);
    const isViolation = isViolationStatus(statusCode);
    const workDay = isWorkDay(statusCode);
    
    records.push({
      employeeId: imported.id,
      date: dateCol,
      statusCode,
      status,
      isViolation,
      isWorkDay: workDay
    });
  }
  
  return { employee, records };
}

export function calculateEmployeeStats(
  employee: Employee,
  attendance: AttendanceRecord[]
): EmployeeStats {
  const employeeRecords = attendance.filter(a => a.employeeId === employee.id);
  
  // Filter only work days (exclude NS and H)
  const workDayRecords = employeeRecords.filter(a => a.isWorkDay);
  
  const totalWorkDays = workDayRecords.length;
  const presentDays = employeeRecords.filter(a => a.statusCode === 'W').length;
  const absentDays = employeeRecords.filter(a => a.statusCode === 'A').length;
  const lateDays = employeeRecords.filter(a => a.statusCode === 'L').length;
  const earlyLeaveDays = employeeRecords.filter(a => a.statusCode === 'E').length;
  const lateAndEarlyDays = employeeRecords.filter(a => a.statusCode === 'LE').length;
  const holidayDays = employeeRecords.filter(a => a.statusCode === 'H').length;
  const noScheduleDays = employeeRecords.filter(a => a.statusCode === 'NS').length;
  
  const violationCount = employeeRecords.filter(a => a.isViolation).length;
  
  // Discipline score: 100 - (violations / workDays * 100)
  const disciplineScore = totalWorkDays > 0 
    ? Math.max(0, 100 - (violationCount / totalWorkDays) * 100)
    : 100;
  
  return {
    employeeId: employee.id,
    name: employee.name,
    department: employee.department,
    totalWorkDays,
    presentDays,
    absentDays,
    lateDays,
    earlyLeaveDays,
    lateAndEarlyDays,
    holidayDays,
    noScheduleDays,
    violationCount,
    disciplineScore: Math.round(disciplineScore * 10) / 10
  };
}

export function calculateDepartmentStats(
  department: string,
  employees: Employee[],
  attendance: AttendanceRecord[]
): DepartmentStats {
  const deptEmployees = employees.filter(e => e.department === department);
  const deptRecords = attendance.filter(a => 
    deptEmployees.some(e => e.id === a.employeeId)
  );
  
  // Filter only work days
  const workDayRecords = deptRecords.filter(a => a.isWorkDay);
  
  const employeeCount = deptEmployees.length;
  const totalWorkDays = workDayRecords.length;
  const presentDays = deptRecords.filter(a => a.statusCode === 'W').length;
  const absentDays = deptRecords.filter(a => a.statusCode === 'A').length;
  const lateDays = deptRecords.filter(a => a.statusCode === 'L').length;
  const earlyLeaveDays = deptRecords.filter(a => a.statusCode === 'E').length;
  const lateAndEarlyDays = deptRecords.filter(a => a.statusCode === 'LE').length;
  const violationCount = deptRecords.filter(a => a.isViolation).length;
  
  return {
    department,
    employeeCount,
    totalWorkDays,
    presentDays,
    absentDays,
    lateDays,
    earlyLeaveDays,
    lateAndEarlyDays,
    violationRate: totalWorkDays > 0 ? Math.round((violationCount / totalWorkDays) * 1000) / 10 : 0,
    avgDisciplineScore: employeeCount > 0 
      ? Math.round((100 - (violationCount / Math.max(1, totalWorkDays)) * 100) * 10) / 10 
      : 100
  };
}

export function getTopViolators(
  employees: Employee[],
  attendance: AttendanceRecord[],
  type: 'late' | 'early_leave' | 'absent' | 'all',
  limit: number = 10
): EmployeeStats[] {
  const stats = employees.map(e => calculateEmployeeStats(e, attendance));
  
  switch (type) {
    case 'late':
      // Sort by late days (L + LE)
      return stats.sort((a, b) => (b.lateDays + b.lateAndEarlyDays) - (a.lateDays + a.lateAndEarlyDays)).slice(0, limit);
    case 'early_leave':
      // Sort by early leave days (E + LE)
      return stats.sort((a, b) => (b.earlyLeaveDays + b.lateAndEarlyDays) - (a.earlyLeaveDays + a.lateAndEarlyDays)).slice(0, limit);
    case 'absent':
      return stats.sort((a, b) => b.absentDays - a.absentDays).slice(0, limit);
    case 'all':
    default:
      return stats.sort((a, b) => b.violationCount - a.violationCount).slice(0, limit);
  }
}

export function getTopDisciplined(
  employees: Employee[],
  attendance: AttendanceRecord[],
  limit: number = 10
): EmployeeStats[] {
  const stats = employees.map(e => calculateEmployeeStats(e, attendance));
  return stats.sort((a, b) => b.disciplineScore - a.disciplineScore).slice(0, limit);
}

export function getDepartmentComparison(
  employees: Employee[],
  attendance: AttendanceRecord[]
): DepartmentStats[] {
  const departments = [...new Set(employees.map(e => e.department))];
  return departments.map(dept => calculateDepartmentStats(dept, employees, attendance));
}
