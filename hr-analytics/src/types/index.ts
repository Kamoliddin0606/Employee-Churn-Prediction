export interface Employee {
  id: string;
  name: string;
  department: string;
}

// Status codes from the attendance system
export type AttendanceStatusCode = 'W' | 'L' | 'E' | 'LE' | 'A' | 'NS' | 'H';

export const STATUS_LABELS: Record<AttendanceStatusCode, string> = {
  W: 'Tartibli',
  L: 'Kech qolgan',
  E: 'Erta ketgan',
  LE: 'Kech + Erta',
  A: 'Kelmagan',
  NS: 'Ish kuni emas',
  H: 'Bayram'
};

export const STATUS_COLORS: Record<AttendanceStatusCode, string> = {
  W: 'bg-green-500',
  L: 'bg-yellow-500',
  E: 'bg-orange-500',
  LE: 'bg-red-400',
  A: 'bg-red-600',
  NS: 'bg-gray-400',
  H: 'bg-blue-400'
};

export interface AttendanceRecord {
  employeeId: string;
  date: string;
  statusCode: AttendanceStatusCode;
  status: 'present' | 'absent' | 'late' | 'early_leave' | 'late_and_early' | 'no_schedule' | 'holiday';
  isViolation: boolean;
  isWorkDay: boolean;
}

export interface DailyAttendance {
  [date: string]: AttendanceStatusCode;
}

export interface ImportedEmployee {
  id: string;
  name: string;
  department: string;
  dailyAttendance: DailyAttendance;
}

export interface ImportHistory {
  id: string;
  fileName: string;
  importDate: string;
  recordsCount: number;
  newEmployees: number;
  updatedRecords: number;
  errors: string[];
  snapshot: {
    employees: Employee[];
    attendance: AttendanceRecord[];
  };
}

export interface EmployeeStats {
  employeeId: string;
  name: string;
  department: string;
  totalWorkDays: number;      // Jami ish kunlari (NS va H bundan mustasno)
  presentDays: number;        // W - tartibli kelgan kunlar
  absentDays: number;         // A - kelmagan kunlar
  lateDays: number;           // L - kech qolgan kunlar
  earlyLeaveDays: number;     // E - erta ketgan kunlar
  lateAndEarlyDays: number;   // LE - ikkalasi
  holidayDays: number;        // H - bayram kunlari
  noScheduleDays: number;     // NS - ish kuni emas
  violationCount: number;     // L + E + LE + A
  disciplineScore: number;    // 100 - (violations / workDays * 100)
}

export interface DepartmentStats {
  department: string;
  employeeCount: number;
  totalWorkDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  earlyLeaveDays: number;
  lateAndEarlyDays: number;
  violationRate: number;
  avgDisciplineScore: number;
}

export interface ParsedExcelRow {
  Name: string;
  ID: string;
  Department: string;
  [key: string]: string | number | undefined; // Date columns like '12-01', '12-02', etc.
}

export type ThemeMode = 'light' | 'dark';

export interface FilterState {
  department: string;
  dateFrom: string;
  dateTo: string;
  searchQuery: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}
