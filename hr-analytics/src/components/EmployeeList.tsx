import { useMemo, useState } from 'react';
import { Search, Download, Filter, ChevronUp, ChevronDown, User, X, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useStore } from '../store/useStore';
import { calculateEmployeeStats } from '../utils/attendanceCalculator';
import { generateExcelExport } from '../utils/excelParser';
import { useLanguage } from '../i18n';

type SortField = 'name' | 'department' | 'workDays' | 'presentDays' | 'absentDays' | 'lateDays' | 'earlyLeaveDays' | 'disciplineScore';

export function EmployeeList() {
  const { employees, attendance, filters, setFilters } = useStore();
  const { t } = useLanguage();
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const departments = useMemo(() => {
    return [...new Set(employees.map(e => e.department))].sort();
  }, [employees]);

  const toggleDepartment = (dept: string) => {
    setSelectedDepartments(prev => 
      prev.includes(dept) 
        ? prev.filter(d => d !== dept)
        : [...prev, dept]
    );
  };

  const clearDepartmentFilters = () => {
    setSelectedDepartments([]);
  };

  const selectAllDepartments = () => {
    setSelectedDepartments([...departments]);
  };

  const employeeStats = useMemo(() => {
    return employees.map(e => calculateEmployeeStats(e, attendance));
  }, [employees, attendance]);

  const filteredAndSortedStats = useMemo(() => {
    let result = [...employeeStats];

    // Multi-select department filter
    if (selectedDepartments.length > 0) {
      result = result.filter(s => selectedDepartments.includes(s.department));
    }

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      result = result.filter(s => 
        s.name.toLowerCase().includes(query) ||
        s.department.toLowerCase().includes(query) ||
        s.employeeId.toLowerCase().includes(query)
      );
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'department':
          comparison = a.department.localeCompare(b.department);
          break;
        case 'workDays':
          comparison = a.totalWorkDays - b.totalWorkDays;
          break;
        case 'presentDays':
          comparison = a.presentDays - b.presentDays;
          break;
        case 'absentDays':
          comparison = a.absentDays - b.absentDays;
          break;
        case 'lateDays':
          comparison = (a.lateDays + a.lateAndEarlyDays) - (b.lateDays + b.lateAndEarlyDays);
          break;
        case 'earlyLeaveDays':
          comparison = (a.earlyLeaveDays + a.lateAndEarlyDays) - (b.earlyLeaveDays + b.lateAndEarlyDays);
          break;
        case 'disciplineScore':
          comparison = a.disciplineScore - b.disciplineScore;
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [employeeStats, filters, sortField, sortOrder, selectedDepartments]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleExport = () => {
    const exportData = filteredAndSortedStats.map(s => ({
      'ID': s.employeeId,
      'Ism': s.name,
      'Bo\'lim': s.department,
      'Ish kunlari': s.totalWorkDays,
      'Tartibli (W)': s.presentDays,
      'Kelmagan (A)': s.absentDays,
      'Kech qolgan (L)': s.lateDays,
      'Erta ketgan (E)': s.earlyLeaveDays,
      'Ikkalasi (LE)': s.lateAndEarlyDays,
      'Bayram (H)': s.holidayDays,
      'Dam olish (NS)': s.noScheduleDays,
      'Qoidabuzarlik': s.violationCount,
      'Intizom balli': s.disciplineScore
    }));

    generateExcelExport(exportData, `xodimlar-hisoboti-${new Date().toISOString().split('T')[0]}`);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? 
      <ChevronUp className="h-4 w-4" /> : 
      <ChevronDown className="h-4 w-4" />;
  };

  const getScoreBadge = (score: number) => {
    if (score >= 90) return <Badge variant="success">{score}</Badge>;
    if (score >= 70) return <Badge variant="warning">{score}</Badge>;
    return <Badge variant="danger">{score}</Badge>;
  };

  if (employees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <User className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <h3 className="text-xl font-semibold mb-2">{t.employees.empty}</h3>
        <p className="text-muted-foreground max-w-md">
          {t.employees.emptyDesc}
        </p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <CardTitle>{t.employees.title} ({filteredAndSortedStats.length})</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t.employees.search}
                value={filters.searchQuery}
                onChange={(e) => setFilters({ searchQuery: e.target.value })}
                className="pl-9 w-[200px]"
              />
            </div>
            {/* Multi-select Department Filter */}
            <div className="relative">
              <Button
                variant="outline"
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className="w-[180px] justify-start"
              >
                <Filter className="h-4 w-4 mr-2" />
                {selectedDepartments.length === 0 
                  ? t.employees.allDepartments
                  : `${selectedDepartments.length} ${t.dashboard.departments}`
                }
              </Button>
              {isFilterOpen && (
                <div className="absolute top-full left-0 mt-1 w-[280px] bg-background border rounded-lg shadow-lg z-50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{t.dashboard.filterByDepartment}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={selectAllDepartments}
                        className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80"
                        disabled={selectedDepartments.length === departments.length}
                      >
                        <Check className="h-3 w-3 inline mr-1" />
                        {t.dashboard.selectAll}
                      </button>
                      <button
                        onClick={clearDepartmentFilters}
                        className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80"
                        disabled={selectedDepartments.length === 0}
                      >
                        <X className="h-3 w-3 inline mr-1" />
                        {t.dashboard.clearFilter}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-[200px] overflow-y-auto">
                    {departments.map(dept => (
                      <button
                        key={dept}
                        onClick={() => toggleDepartment(dept)}
                        className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
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
                  <button
                    onClick={() => setIsFilterOpen(false)}
                    className="w-full mt-2 text-xs py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {t.common.close}
                  </button>
                </div>
              )}
            </div>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              {t.employees.export}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-3 px-2">
                  <button 
                    onClick={() => handleSort('name')}
                    className="flex items-center gap-1 font-medium hover:text-primary"
                  >
                    {t.employees.employee} <SortIcon field="name" />
                  </button>
                </th>
                <th className="text-left py-3 px-2">
                  <button 
                    onClick={() => handleSort('department')}
                    className="flex items-center gap-1 font-medium hover:text-primary"
                  >
                    {t.dashboard.department} <SortIcon field="department" />
                  </button>
                </th>
                <th className="text-center py-3 px-2">
                  <button 
                    onClick={() => handleSort('workDays')}
                    className="flex items-center gap-1 font-medium hover:text-primary mx-auto"
                  >
                    {t.employees.workDays} <SortIcon field="workDays" />
                  </button>
                </th>
                <th className="text-center py-3 px-2">
                  <button 
                    onClick={() => handleSort('presentDays')}
                    className="flex items-center gap-1 font-medium hover:text-primary mx-auto"
                  >
                    {t.employees.present} <SortIcon field="presentDays" />
                  </button>
                </th>
                <th className="text-center py-3 px-2">
                  <button 
                    onClick={() => handleSort('absentDays')}
                    className="flex items-center gap-1 font-medium hover:text-primary mx-auto"
                  >
                    {t.employees.notPresent} <SortIcon field="absentDays" />
                  </button>
                </th>
                <th className="text-center py-3 px-2">
                  <button 
                    onClick={() => handleSort('lateDays')}
                    className="flex items-center gap-1 font-medium hover:text-primary mx-auto"
                  >
                    {t.employees.lateness} <SortIcon field="lateDays" />
                  </button>
                </th>
                <th className="text-center py-3 px-2">
                  <button 
                    onClick={() => handleSort('earlyLeaveDays')}
                    className="flex items-center gap-1 font-medium hover:text-primary mx-auto"
                  >
                    {t.dashboard.earlyLeave} <SortIcon field="earlyLeaveDays" />
                  </button>
                </th>
                <th className="text-center py-3 px-2">
                  <button 
                    onClick={() => handleSort('disciplineScore')}
                    className="flex items-center gap-1 font-medium hover:text-primary mx-auto"
                  >
                    {t.dashboard.discipline} <SortIcon field="disciplineScore" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedStats.map((stat) => (
                <tr key={stat.employeeId} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-2">
                    <div>
                      <p className="font-medium">{stat.name}</p>
                      <p className="text-xs text-muted-foreground">{stat.employeeId}</p>
                    </div>
                  </td>
                  <td className="py-3 px-2">{stat.department}</td>
                  <td className="text-center py-3 px-2">{stat.totalWorkDays}</td>
                  <td className="text-center py-3 px-2">
                    <Badge variant="success">{stat.presentDays}</Badge>
                  </td>
                  <td className="text-center py-3 px-2">
                    <Badge variant={stat.absentDays > 0 ? 'danger' : 'secondary'}>
                      {stat.absentDays}
                    </Badge>
                  </td>
                  <td className="text-center py-3 px-2">
                    <div>
                      <Badge variant={(stat.lateDays + stat.lateAndEarlyDays) > 3 ? 'warning' : 'secondary'}>
                        {stat.lateDays + stat.lateAndEarlyDays} {t.common.day}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        L: {stat.lateDays}, LE: {stat.lateAndEarlyDays}
                      </p>
                    </div>
                  </td>
                  <td className="text-center py-3 px-2">
                    <div>
                      <Badge variant={(stat.earlyLeaveDays + stat.lateAndEarlyDays) > 3 ? 'warning' : 'secondary'}>
                        {stat.earlyLeaveDays + stat.lateAndEarlyDays} {t.common.day}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        E: {stat.earlyLeaveDays}, LE: {stat.lateAndEarlyDays}
                      </p>
                    </div>
                  </td>
                  <td className="text-center py-3 px-2">
                    {getScoreBadge(stat.disciplineScore)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredAndSortedStats.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            {t.employees.noEmployeesFound}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
