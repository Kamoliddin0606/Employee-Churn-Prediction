/**
 * =============================================================================
 * Dashboard Service
 * =============================================================================
 * 
 * Provides optimized data aggregation and statistics for dashboard display.
 * Uses efficient SQL queries with aggregations to minimize data transfer.
 * 
 * Features:
 * - Pre-calculated statistics
 * - Department-level filtering
 * - Date range support
 * - Top performers/violators lists
 * 
 * @module services/dashboardService
 * @author HR Analytics Team
 * @version 1.0.0
 */

import { getDatabase } from '../database/connection';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Dashboard statistics summary
 */
export interface DashboardStats {
    totalEmployees: number;
    totalDepartments: number;
    attendanceDays: number;
    totalViolations: number;
    avgDisciplineScore: number;
    attendanceRate: number;
    lateCount: number;
    earlyLeaveCount: number;
    absentCount: number;
}

/**
 * Top violator/performer record
 */
export interface TopEmployee {
    employeeId: number;
    employeeName: string;
    departmentName: string;
    violationCount: number;
    lateCount: number;
    earlyLeaveCount: number;
    absentCount: number;
    disciplineScore: number;
}

/**
 * Department comparison data
 */
export interface DepartmentStats {
    departmentId: number;
    departmentName: string;
    employeeCount: number;
    attendanceRate: number;
    avgDisciplineScore: number;
    totalViolations: number;
    lateCount: number;
    earlyLeaveCount: number;
    absentCount: number;
}

/**
 * Complete dashboard data
 */
export interface DashboardData {
    stats: DashboardStats;
    topViolators: TopEmployee[];
    topDisciplined: TopEmployee[];
    departmentComparison: DepartmentStats[];
}

// =============================================================================
// DASHBOARD STATISTICS
// =============================================================================

/**
 * Get comprehensive dashboard statistics
 * 
 * @param dateFrom - Optional start date filter (YYYY-MM-DD)
 * @param dateTo - Optional end date filter (YYYY-MM-DD)
 * @param departmentId - Optional department filter
 * @returns Complete dashboard data with statistics and rankings
 * 
 * @example
 * const data = getDashboardData('2026-01-01', '2026-01-31', 5);
 */
export function getDashboardData(
    dateFrom?: string,
    dateTo?: string,
    departmentId?: number
): DashboardData {
    const db = getDatabase();

    // Build WHERE clause for filtering
    let whereConditions: string[] = ['e.is_active = 1'];
    const params: any[] = [];

    if (dateFrom) {
        whereConditions.push('a.date >= ?');
        params.push(dateFrom);
    }
    if (dateTo) {
        whereConditions.push('a.date <= ?');
        params.push(dateTo);
    }
    if (departmentId) {
        whereConditions.push('e.department_id = ?');
        params.push(departmentId);
    }

    const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

    // Get overall statistics
    const statsQuery = `
        SELECT 
            COUNT(DISTINCT e.id) as totalEmployees,
            COUNT(DISTINCT e.department_id) as totalDepartments,
            COUNT(DISTINCT a.date) as attendanceDays,
            SUM(CASE WHEN a.status_code IN ('L', 'E', 'LE', 'A') THEN 1 ELSE 0 END) as totalViolations,
            SUM(CASE WHEN a.status_code = 'L' OR a.status_code = 'LE' THEN 1 ELSE 0 END) as lateCount,
            SUM(CASE WHEN a.status_code = 'E' OR a.status_code = 'LE' THEN 1 ELSE 0 END) as earlyLeaveCount,
            SUM(CASE WHEN a.status_code = 'A' THEN 1 ELSE 0 END) as absentCount,
            COUNT(*) as totalRecords,
            SUM(CASE WHEN a.status_code = 'W' THEN 1 ELSE 0 END) as onTimeCount
        FROM employees e
        LEFT JOIN attendance a ON e.id = a.employee_id
        ${whereClause}
    `;

    const statsResult = db.prepare(statsQuery).get(...params) as any;

    // Calculate derived metrics
    const totalRecords = statsResult.totalRecords || 1;
    const onTimeCount = statsResult.onTimeCount || 0;
    const totalViolations = statsResult.totalViolations || 0;

    const attendanceRate = (onTimeCount / totalRecords) * 100;
    const avgDisciplineScore = Math.max(0, 100 - (totalViolations / totalRecords) * 100);

    const stats: DashboardStats = {
        totalEmployees: statsResult.totalEmployees || 0,
        totalDepartments: statsResult.totalDepartments || 0,
        attendanceDays: statsResult.attendanceDays || 0,
        totalViolations: totalViolations,
        avgDisciplineScore: Math.round(avgDisciplineScore * 10) / 10,
        attendanceRate: Math.round(attendanceRate * 10) / 10,
        lateCount: statsResult.lateCount || 0,
        earlyLeaveCount: statsResult.earlyLeaveCount || 0,
        absentCount: statsResult.absentCount || 0,
    };

    // Get top violators (worst performers)
    const topViolatorsQuery = `
        SELECT 
            e.id as employeeId,
            e.name as employeeName,
            d.name as departmentName,
            COUNT(CASE WHEN a.status_code IN ('L', 'E', 'LE', 'A') THEN 1 END) as violationCount,
            COUNT(CASE WHEN a.status_code = 'L' OR a.status_code = 'LE' THEN 1 END) as lateCount,
            COUNT(CASE WHEN a.status_code = 'E' OR a.status_code = 'LE' THEN 1 END) as earlyLeaveCount,
            COUNT(CASE WHEN a.status_code = 'A' THEN 1 END) as absentCount,
            (100 - (COUNT(CASE WHEN a.status_code IN ('L', 'E', 'LE', 'A') THEN 1 END) * 100.0 / COUNT(*))) as disciplineScore
        FROM employees e
        JOIN departments d ON e.department_id = d.id
        LEFT JOIN attendance a ON e.id = a.employee_id
        ${whereClause}
        GROUP BY e.id, e.name, d.name
        HAVING violationCount > 0
        ORDER BY violationCount DESC, disciplineScore ASC
        LIMIT 10
    `;

    const topViolators = db.prepare(topViolatorsQuery).all(...params).map((row: any) => ({
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        departmentName: row.departmentName,
        violationCount: row.violationCount,
        lateCount: row.lateCount,
        earlyLeaveCount: row.earlyLeaveCount,
        absentCount: row.absentCount,
        disciplineScore: Math.round(row.disciplineScore * 10) / 10,
    }));

    // Get top disciplined employees (best performers)
    const topDisciplinedQuery = `
        SELECT 
            e.id as employeeId,
            e.name as employeeName,
            d.name as departmentName,
            COUNT(CASE WHEN a.status_code IN ('L', 'E', 'LE', 'A') THEN 1 END) as violationCount,
            COUNT(CASE WHEN a.status_code = 'L' OR a.status_code = 'LE' THEN 1 END) as lateCount,
            COUNT(CASE WHEN a.status_code = 'E' OR a.status_code = 'LE' THEN 1 END) as earlyLeaveCount,
            COUNT(CASE WHEN a.status_code = 'A' THEN 1 END) as absentCount,
            (100 - (COUNT(CASE WHEN a.status_code IN ('L', 'E', 'LE', 'A') THEN 1 END) * 100.0 / COUNT(*))) as disciplineScore
        FROM employees e
        JOIN departments d ON e.department_id = d.id
        LEFT JOIN attendance a ON e.id = a.employee_id
        ${whereClause}
        GROUP BY e.id, e.name, d.name
        HAVING COUNT(*) >= 10
        ORDER BY disciplineScore DESC, violationCount ASC
        LIMIT 10
    `;

    const topDisciplined = db.prepare(topDisciplinedQuery).all(...params).map((row: any) => ({
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        departmentName: row.departmentName,
        violationCount: row.violationCount,
        lateCount: row.lateCount,
        earlyLeaveCount: row.earlyLeaveCount,
        absentCount: row.absentCount,
        disciplineScore: Math.round(row.disciplineScore * 10) / 10,
    }));

    // Get department comparison
    const deptComparisonQuery = `
        SELECT 
            d.id as departmentId,
            d.name as departmentName,
            COUNT(DISTINCT e.id) as employeeCount,
            COUNT(CASE WHEN a.status_code = 'W' THEN 1 END) * 100.0 / COUNT(*) as attendanceRate,
            (100 - (COUNT(CASE WHEN a.status_code IN ('L', 'E', 'LE', 'A') THEN 1 END) * 100.0 / COUNT(*))) as avgDisciplineScore,
            COUNT(CASE WHEN a.status_code IN ('L', 'E', 'LE', 'A') THEN 1 END) as totalViolations,
            COUNT(CASE WHEN a.status_code = 'L' OR a.status_code = 'LE' THEN 1 END) as lateCount,
            COUNT(CASE WHEN a.status_code = 'E' OR a.status_code = 'LE' THEN 1 END) as earlyLeaveCount,
            COUNT(CASE WHEN a.status_code = 'A' THEN 1 END) as absentCount
        FROM departments d
        JOIN employees e ON d.id = e.department_id AND e.is_active = 1
        LEFT JOIN attendance a ON e.id = a.employee_id
        ${dateFrom || dateTo ? `WHERE ${dateFrom ? 'a.date >= ?' : ''} ${dateFrom && dateTo ? 'AND' : ''} ${dateTo ? 'a.date <= ?' : ''}` : ''}
        GROUP BY d.id, d.name
        HAVING employeeCount > 0
        ORDER BY avgDisciplineScore DESC
    `;

    const deptParams = [];
    if (dateFrom) deptParams.push(dateFrom);
    if (dateTo) deptParams.push(dateTo);

    const departmentComparison = db.prepare(deptComparisonQuery).all(...deptParams).map((row: any) => ({
        departmentId: row.departmentId,
        departmentName: row.departmentName,
        employeeCount: row.employeeCount,
        attendanceRate: Math.round(row.attendanceRate * 10) / 10,
        avgDisciplineScore: Math.round(row.avgDisciplineScore * 10) / 10,
        totalViolations: row.totalViolations,
        lateCount: row.lateCount,
        earlyLeaveCount: row.earlyLeaveCount,
        absentCount: row.absentCount,
    }));

    return {
        stats,
        topViolators,
        topDisciplined,
        departmentComparison,
    };
}

// =============================================================================
// CHARTS DATA
// =============================================================================

/**
 * Status distribution for pie chart
 */
export interface StatusDistribution {
    status: string;
    count: number;
    percentage: number;
}

/**
 * Daily trend data for line/area chart
 */
export interface DailyTrend {
    date: string;
    present: number;
    late: number;
    absent: number;
    total: number;
}

/**
 * Get status distribution data for charts
 * 
 * @param dateFrom - Optional start date
 * @param dateTo - Optional end date
 * @returns Array of status counts and percentages
 */
export function getStatusDistribution(
    dateFrom?: string,
    dateTo?: string
): StatusDistribution[] {
    const db = getDatabase();

    let whereConditions: string[] = [];
    const params: any[] = [];

    if (dateFrom) {
        whereConditions.push('date >= ?');
        params.push(dateFrom);
    }
    if (dateTo) {
        whereConditions.push('date <= ?');
        params.push(dateTo);
    }

    const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

    const query = `
        SELECT 
            status_code as status,
            COUNT(*) as count,
            (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM attendance ${whereClause})) as percentage
        FROM attendance
        ${whereClause}
        GROUP BY status_code
        ORDER BY count DESC
    `;

    return db.prepare(query).all(...params).map((row: any) => ({
        status: row.status,
        count: row.count,
        percentage: Math.round(row.percentage * 10) / 10,
    }));
}

/**
 * Get daily attendance trend
 * 
 * @param dateFrom - Start date
 * @param dateTo - End date
 * @returns Daily aggregated attendance data
 */
export function getDailyTrend(
    dateFrom: string,
    dateTo: string
): DailyTrend[] {
    const db = getDatabase();

    const query = `
        SELECT 
            date,
            COUNT(CASE WHEN status_code = 'W' THEN 1 END) as present,
            COUNT(CASE WHEN status_code IN ('L', 'E', 'LE') THEN 1 END) as late,
            COUNT(CASE WHEN status_code = 'A' THEN 1 END) as absent,
            COUNT(*) as total
        FROM attendance
        WHERE date >= ? AND date <= ? AND is_work_day = 1
        GROUP BY date
        ORDER BY date ASC
    `;

    return db.prepare(query).all(dateFrom, dateTo).map((row: any) => ({
        date: row.date,
        present: row.present,
        late: row.late,
        absent: row.absent,
        total: row.total,
    }));
}
