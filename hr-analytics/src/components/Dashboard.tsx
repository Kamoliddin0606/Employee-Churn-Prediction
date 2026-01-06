import { useMemo, useState } from 'react';
import { 
  Users, 
  Clock, 
  AlertTriangle, 
  TrendingUp,
  Calendar,
  Award,
  UserX,
  Timer,
  Filter,
  X,
  Check,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { useStore } from '../store/useStore';
import { 
  calculateEmployeeStats, 
  getTopViolators, 
  getTopDisciplined,
  getDepartmentComparison 
} from '../utils/attendanceCalculator';
import { useLanguage } from '../i18n';

export function Dashboard() {
  const { employees, attendance } = useStore();
  const { t } = useLanguage();
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [isFilterExpanded, setIsFilterExpanded] = useState(true);
  const [topListLimit, setTopListLimit] = useState(5);
  
  // Department table sorting
  type DeptSortField = 'department' | 'employeeCount' | 'attendance' | 'absent' | 'late' | 'violations' | 'discipline';
  const [deptSortField, setDeptSortField] = useState<DeptSortField>('department');
  const [deptSortOrder, setDeptSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleDeptSort = (field: DeptSortField) => {
    if (deptSortField === field) {
      setDeptSortOrder(deptSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setDeptSortField(field);
      setDeptSortOrder('asc');
    }
  };

  // Get unique departments
  const allDepartments = useMemo(() => {
    return [...new Set(employees.map(e => e.department))].sort();
  }, [employees]);

  // Filter employees and attendance by selected departments
  const filteredEmployees = useMemo(() => {
    if (selectedDepartments.length === 0) return employees;
    return employees.filter(e => selectedDepartments.includes(e.department));
  }, [employees, selectedDepartments]);

  const filteredAttendance = useMemo(() => {
    if (selectedDepartments.length === 0) return attendance;
    const filteredEmployeeIds = new Set(filteredEmployees.map(e => e.id));
    return attendance.filter(a => filteredEmployeeIds.has(a.employeeId));
  }, [attendance, filteredEmployees, selectedDepartments]);

  const toggleDepartment = (dept: string) => {
    setSelectedDepartments(prev => 
      prev.includes(dept) 
        ? prev.filter(d => d !== dept)
        : [...prev, dept]
    );
  };

  const clearFilters = () => {
    setSelectedDepartments([]);
  };

  const selectAllDepartments = () => {
    setSelectedDepartments([...allDepartments]);
  };

  const stats = useMemo(() => {
    if (filteredEmployees.length === 0) return null;

    const employeeStats = filteredEmployees.map(e => calculateEmployeeStats(e, filteredAttendance));
    const departmentStats = getDepartmentComparison(filteredEmployees, filteredAttendance);

    // Filter only work days (exclude NS and H)
    const workDayRecords = filteredAttendance.filter(a => a.isWorkDay);
    
    const totalWorkDays = workDayRecords.length;
    const presentDays = filteredAttendance.filter(a => a.statusCode === 'W').length;
    const absentDays = filteredAttendance.filter(a => a.statusCode === 'A').length;
    const lateDays = filteredAttendance.filter(a => a.statusCode === 'L').length;
    const earlyLeaveDays = filteredAttendance.filter(a => a.statusCode === 'E').length;
    const lateAndEarlyDays = filteredAttendance.filter(a => a.statusCode === 'LE').length;
    const violationDays = filteredAttendance.filter(a => a.isViolation).length;

    const avgDisciplineScore = employeeStats.length > 0
      ? employeeStats.reduce((sum, s) => sum + s.disciplineScore, 0) / employeeStats.length
      : 0;

    return {
      totalEmployees: filteredEmployees.length,
      totalWorkDays,
      presentDays,
      absentDays,
      lateDays,
      earlyLeaveDays,
      lateAndEarlyDays,
      violationDays,
      avgDisciplineScore: Math.round(avgDisciplineScore * 10) / 10,
      attendanceRate: totalWorkDays > 0 ? Math.round((presentDays / totalWorkDays) * 1000) / 10 : 0,
      violationRate: totalWorkDays > 0 ? Math.round((violationDays / totalWorkDays) * 1000) / 10 : 0,
      employeeStats,
      departmentStats
    };
  }, [filteredEmployees, filteredAttendance]);

  const topLateComers = useMemo(() => 
    getTopViolators(filteredEmployees, filteredAttendance, 'late', topListLimit), 
    [filteredEmployees, filteredAttendance, topListLimit]
  );

  const topEarlyLeavers = useMemo(() => 
    getTopViolators(filteredEmployees, filteredAttendance, 'early_leave', topListLimit), 
    [filteredEmployees, filteredAttendance, topListLimit]
  );

  const topAbsentees = useMemo(() => 
    getTopViolators(filteredEmployees, filteredAttendance, 'absent', topListLimit), 
    [filteredEmployees, filteredAttendance, topListLimit]
  );

  const topDisciplined = useMemo(() => 
    getTopDisciplined(filteredEmployees, filteredAttendance, topListLimit * 2), 
    [filteredEmployees, filteredAttendance, topListLimit]
  );

  // Sorted department stats
  const sortedDepartmentStats = useMemo(() => {
    if (!stats) return [];
    
    return [...stats.departmentStats].sort((a, b) => {
      let comparison = 0;
      switch (deptSortField) {
        case 'department':
          comparison = a.department.localeCompare(b.department);
          break;
        case 'employeeCount':
          comparison = a.employeeCount - b.employeeCount;
          break;
        case 'attendance':
          const aAttendance = a.totalWorkDays > 0 ? (a.presentDays / a.totalWorkDays) * 100 : 0;
          const bAttendance = b.totalWorkDays > 0 ? (b.presentDays / b.totalWorkDays) * 100 : 0;
          comparison = aAttendance - bAttendance;
          break;
        case 'absent':
          comparison = a.absentDays - b.absentDays;
          break;
        case 'late':
          comparison = (a.lateDays + a.lateAndEarlyDays) - (b.lateDays + b.lateAndEarlyDays);
          break;
        case 'violations':
          comparison = a.violationRate - b.violationRate;
          break;
        case 'discipline':
          comparison = a.avgDisciplineScore - b.avgDisciplineScore;
          break;
      }
      return deptSortOrder === 'asc' ? comparison : -comparison;
    });
  }, [stats, deptSortField, deptSortOrder]);

  const DeptSortIcon = ({ field }: { field: typeof deptSortField }) => {
    if (deptSortField !== field) return <ChevronDown className="h-3 w-3 opacity-30" />;
    return deptSortOrder === 'asc' ? 
      <ChevronUp className="h-3 w-3" /> : 
      <ChevronDown className="h-3 w-3" />;
  };

  if (employees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <h3 className="text-xl font-semibold mb-2">{t.dashboard.noData}</h3>
        <p className="text-muted-foreground max-w-md">
          {t.dashboard.noDataDesc}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Department Filter - Collapsible */}
      <Card>
        <CardHeader 
          className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setIsFilterExpanded(!isFilterExpanded)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Filter className="h-4 w-4" />
              {t.dashboard.filterByDepartment}
              {selectedDepartments.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {selectedDepartments.length}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {isFilterExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </CardHeader>
        {isFilterExpanded && (
          <CardContent className="pt-0">
            <div className="flex items-center justify-end gap-2 mb-3">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={(e) => { e.stopPropagation(); selectAllDepartments(); }}
                disabled={selectedDepartments.length === allDepartments.length}
              >
                <Check className="h-3 w-3 mr-1" />
                {t.dashboard.selectAll}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={(e) => { e.stopPropagation(); clearFilters(); }}
                disabled={selectedDepartments.length === 0}
              >
                <X className="h-3 w-3 mr-1" />
                {t.dashboard.clearFilter}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {allDepartments.map(dept => (
                <button
                  key={dept}
                  onClick={(e) => { e.stopPropagation(); toggleDepartment(dept); }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    selectedDepartments.includes(dept)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                  }`}
                >
                  {dept}
                  {selectedDepartments.includes(dept) && (
                    <Check className="h-3 w-3 ml-1 inline" />
                  )}
                </button>
              ))}
            </div>
            {selectedDepartments.length > 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                {t.dashboard.selectedDepartments}: {selectedDepartments.length} / {allDepartments.length} {t.dashboard.departments}
              </p>
            )}
          </CardContent>
        )}
      </Card>

      {!stats ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-xl font-semibold mb-2">{t.dashboard.noData}</h3>
          <p className="text-muted-foreground max-w-md">
            {t.dashboard.noDataDesc}
          </p>
        </div>
      ) : (
      <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.dashboard.totalEmployees}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEmployees}</div>
            <p className="text-xs text-muted-foreground">
              {stats.departmentStats.length} {t.dashboard.departments}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.dashboard.attendance}</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.attendanceRate}%</div>
            <p className="text-xs text-muted-foreground">
              {stats.presentDays} / {stats.totalWorkDays} {t.dashboard.days}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.dashboard.violations}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.violationRate}%</div>
            <p className="text-xs text-muted-foreground">
              {stats.violationDays} {t.dashboard.cases}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.dashboard.avgDiscipline}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgDisciplineScore}</div>
            <p className="text-xs text-muted-foreground">
              {t.dashboard.outOf100}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              <span className="text-sm font-medium">{t.dashboard.late}</span>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
                {stats.lateDays}
              </span>
              <span className="text-sm text-yellow-600 ml-1">kun</span>
            </div>
            <p className="text-xs text-yellow-600 mt-1">
              + {stats.lateAndEarlyDays} {t.dashboard.both}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Timer className="h-5 w-5 text-orange-600" />
              <span className="text-sm font-medium">{t.dashboard.earlyLeave}</span>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold text-orange-700 dark:text-orange-400">
                {stats.earlyLeaveDays}
              </span>
              <span className="text-sm text-orange-600 ml-1">kun</span>
            </div>
            <p className="text-xs text-orange-600 mt-1">
              + {stats.lateAndEarlyDays} {t.dashboard.both}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <UserX className="h-5 w-5 text-red-600" />
              <span className="text-sm font-medium">{t.dashboard.absent}</span>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold text-red-700 dark:text-red-400">
                {stats.absentDays}
              </span>
              <span className="text-sm text-red-600 ml-1">kun</span>
            </div>
            <p className="text-xs text-red-600 mt-1">
              {stats.totalWorkDays > 0 ? Math.round((stats.absentDays / stats.totalWorkDays) * 100) : 0}% {t.dashboard.total}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium">{t.dashboard.disciplined}</span>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold text-green-700 dark:text-green-400">
                {stats.presentDays}
              </span>
              <span className="text-sm text-green-600 ml-1">kun</span>
            </div>
            <p className="text-xs text-green-600 mt-1">
              {t.dashboard.noViolations}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top Lists Section with Limit Control */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          {t.dashboard.topViolators}
        </h3>
        <div className="flex items-center gap-1">
          {[3, 5, 10].map(num => (
            <button
              key={num}
              onClick={() => setTopListLimit(num)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                topListLimit === num
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              }`}
            >
              {num}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              {t.dashboard.topLateComers}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topLateComers.slice(0, topListLimit).map((emp, index) => (
                <div key={emp.employeeId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground w-5">
                      {index + 1}.
                    </span>
                    <div>
                      <p className="text-sm font-medium">{emp.name}</p>
                      <p className="text-xs text-muted-foreground">{emp.department}</p>
                    </div>
                  </div>
                  <Badge variant="warning">
                    {emp.lateDays + emp.lateAndEarlyDays} kun
                  </Badge>
                </div>
              ))}
              {topLateComers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t.dashboard.noInfo}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Timer className="h-5 w-5 text-orange-500" />
              {t.dashboard.topEarlyLeavers}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topEarlyLeavers.slice(0, topListLimit).map((emp, index) => (
                <div key={emp.employeeId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground w-5">
                      {index + 1}.
                    </span>
                    <div>
                      <p className="text-sm font-medium">{emp.name}</p>
                      <p className="text-xs text-muted-foreground">{emp.department}</p>
                    </div>
                  </div>
                  <Badge variant="warning">
                    {emp.earlyLeaveDays + emp.lateAndEarlyDays} kun
                  </Badge>
                </div>
              ))}
              {topEarlyLeavers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t.dashboard.noInfo}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <UserX className="h-5 w-5 text-red-500" />
              {t.dashboard.topAbsentees}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topAbsentees.slice(0, topListLimit).map((emp, index) => (
                <div key={emp.employeeId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground w-5">
                      {index + 1}.
                    </span>
                    <div>
                      <p className="text-sm font-medium">{emp.name}</p>
                      <p className="text-xs text-muted-foreground">{emp.department}</p>
                    </div>
                  </div>
                  <Badge variant="danger">
                    {emp.absentDays} kun
                  </Badge>
                </div>
              ))}
              {topAbsentees.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t.dashboard.noInfo}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Award className="h-5 w-5 text-green-500" />
            {t.dashboard.topDisciplined}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            {topDisciplined.map((emp, index) => (
              <div 
                key={emp.employeeId} 
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                    ${index < 3 ? 'bg-yellow-400 text-yellow-900' : 'bg-muted text-muted-foreground'}
                  `}>
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium">{emp.name}</p>
                    <p className="text-xs text-muted-foreground">{emp.department}</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="success">
                    {emp.disciplineScore} ball
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    {emp.presentDays}/{emp.totalWorkDays} kun
                  </p>
                </div>
              </div>
            ))}
            {topDisciplined.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4 col-span-2">
                {t.dashboard.noInfo}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t.dashboard.departmentAnalysis}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2">
                    <button 
                      onClick={() => handleDeptSort('department')}
                      className="flex items-center gap-1 font-medium hover:text-primary transition-colors"
                    >
                      {t.dashboard.department} <DeptSortIcon field="department" />
                    </button>
                  </th>
                  <th className="text-center py-3 px-2">
                    <button 
                      onClick={() => handleDeptSort('employeeCount')}
                      className="flex items-center gap-1 font-medium hover:text-primary transition-colors mx-auto"
                    >
                      {t.dashboard.employeeCount} <DeptSortIcon field="employeeCount" />
                    </button>
                  </th>
                  <th className="text-center py-3 px-2">
                    <button 
                      onClick={() => handleDeptSort('attendance')}
                      className="flex items-center gap-1 font-medium hover:text-primary transition-colors mx-auto"
                    >
                      {t.dashboard.attendance} <DeptSortIcon field="attendance" />
                    </button>
                  </th>
                  <th className="text-center py-3 px-2">
                    <button 
                      onClick={() => handleDeptSort('absent')}
                      className="flex items-center gap-1 font-medium hover:text-primary transition-colors mx-auto"
                    >
                      {t.dashboard.absent} <DeptSortIcon field="absent" />
                    </button>
                  </th>
                  <th className="text-center py-3 px-2">
                    <button 
                      onClick={() => handleDeptSort('late')}
                      className="flex items-center gap-1 font-medium hover:text-primary transition-colors mx-auto"
                    >
                      {t.dashboard.late} <DeptSortIcon field="late" />
                    </button>
                  </th>
                  <th className="text-center py-3 px-2">
                    <button 
                      onClick={() => handleDeptSort('violations')}
                      className="flex items-center gap-1 font-medium hover:text-primary transition-colors mx-auto"
                    >
                      {t.dashboard.violations} <DeptSortIcon field="violations" />
                    </button>
                  </th>
                  <th className="text-center py-3 px-2">
                    <button 
                      onClick={() => handleDeptSort('discipline')}
                      className="flex items-center gap-1 font-medium hover:text-primary transition-colors mx-auto"
                    >
                      {t.dashboard.discipline} <DeptSortIcon field="discipline" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedDepartmentStats.map((dept) => (
                  <tr key={dept.department} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-2 font-medium">{dept.department}</td>
                    <td className="text-center py-3 px-2">{dept.employeeCount}</td>
                    <td className="text-center py-3 px-2">
                      <Badge variant="success">
                        {dept.totalWorkDays > 0 
                          ? Math.round((dept.presentDays / dept.totalWorkDays) * 100) 
                          : 0}%
                      </Badge>
                    </td>
                    <td className="text-center py-3 px-2">
                      <Badge variant={dept.absentDays > 0 ? 'danger' : 'secondary'}>
                        {dept.absentDays} kun
                      </Badge>
                    </td>
                    <td className="text-center py-3 px-2">
                      <Badge variant={dept.lateDays > 0 ? 'warning' : 'secondary'}>
                        {dept.lateDays + dept.lateAndEarlyDays} kun
                      </Badge>
                    </td>
                    <td className="text-center py-3 px-2">
                      <Badge variant={dept.violationRate > 20 ? 'danger' : 'secondary'}>
                        {dept.violationRate}%
                      </Badge>
                    </td>
                    <td className="text-center py-3 px-2">
                      <span className={`font-bold ${
                        dept.avgDisciplineScore >= 80 ? 'text-green-600' :
                        dept.avgDisciplineScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {dept.avgDisciplineScore}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}
