import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { DateRangePicker } from './ui/date-range-picker';
import { useStore } from '../store/useStore';
import { getDepartmentComparison, calculateEmployeeStats } from '../utils/attendanceCalculator';
import { BarChart3, PieChartIcon, TrendingUp, Calendar } from 'lucide-react';
import { useLanguage } from '../i18n';


export function Charts() {
  const { employees, attendance } = useStore();
  const { t, language } = useLanguage();
  
  // Period filter
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Get available date range from attendance data
  const dateRange = useMemo(() => {
    if (attendance.length === 0) return { min: '', max: '', dates: [] as string[] };
    const dates = [...new Set(attendance.map(a => a.date))].sort();
    return { min: dates[0], max: dates[dates.length - 1], dates };
  }, [attendance]);

  // Filter attendance by date range
  const filteredAttendance = useMemo(() => {
    let result = attendance;
    if (dateFrom) {
      result = result.filter(a => a.date >= dateFrom);
    }
    if (dateTo) {
      result = result.filter(a => a.date <= dateTo);
    }
    return result;
  }, [attendance, dateFrom, dateTo]);

  const departmentData = useMemo(() => {
    return getDepartmentComparison(employees, filteredAttendance);
  }, [employees, filteredAttendance]);

  const statusDistribution = useMemo(() => {
    const present = filteredAttendance.filter(a => a.statusCode === 'W').length;
    const late = filteredAttendance.filter(a => a.statusCode === 'L').length;
    const earlyLeave = filteredAttendance.filter(a => a.statusCode === 'E').length;
    const lateAndEarly = filteredAttendance.filter(a => a.statusCode === 'LE').length;
    const absent = filteredAttendance.filter(a => a.statusCode === 'A').length;
    const noSchedule = filteredAttendance.filter(a => a.statusCode === 'NS').length;
    const holiday = filteredAttendance.filter(a => a.statusCode === 'H').length;

    return [
      { name: `${t.status.W} (W)`, value: present, color: '#22c55e' },
      { name: `${t.status.L} (L)`, value: late, color: '#f59e0b' },
      { name: `${t.status.E} (E)`, value: earlyLeave, color: '#f97316' },
      { name: `${t.status.LE} (LE)`, value: lateAndEarly, color: '#ef4444' },
      { name: `${t.status.A} (A)`, value: absent, color: '#dc2626' },
      { name: `${t.status.NS} (NS)`, value: noSchedule, color: '#9ca3af' },
      { name: `${t.status.H} (H)`, value: holiday, color: '#3b82f6' },
    ].filter(item => item.value > 0);
  }, [filteredAttendance, t]);

  const dailyTrend = useMemo(() => {
    const dateMap = new Map<string, { date: string; present: number; late: number; absent: number; total: number }>();
    
    filteredAttendance.forEach(record => {
      // Skip non-work days
      if (!record.isWorkDay) return;
      
      const existing = dateMap.get(record.date) || { 
        date: record.date, 
        present: 0, 
        late: 0, 
        absent: 0, 
        total: 0 
      };
      
      existing.total++;
      if (record.statusCode === 'W') existing.present++;
      if (record.statusCode === 'L' || record.statusCode === 'LE') existing.late++;
      if (record.statusCode === 'A') existing.absent++;
      
      dateMap.set(record.date, existing);
    });

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredAttendance]);

  const disciplineDistribution = useMemo(() => {
    const stats = employees.map(e => calculateEmployeeStats(e, filteredAttendance));
    
    const ranges = [
      { range: '90-100', min: 90, max: 100, count: 0 },
      { range: '80-89', min: 80, max: 89, count: 0 },
      { range: '70-79', min: 70, max: 79, count: 0 },
      { range: '60-69', min: 60, max: 69, count: 0 },
      { range: '0-59', min: 0, max: 59, count: 0 },
    ];

    stats.forEach(s => {
      const range = ranges.find(r => s.disciplineScore >= r.min && s.disciplineScore <= r.max);
      if (range) range.count++;
    });

    return ranges;
  }, [employees, filteredAttendance]);

  const violationsByDepartment = useMemo(() => {
    return departmentData.map(dept => ({
      name: dept.department.length > 15 ? dept.department.substring(0, 15) + '...' : dept.department,
      fullName: dept.department,
      kechQolish: dept.lateDays,
      ertaKetish: dept.earlyLeaveDays,
      kelmagan: dept.absentDays,
      intizom: dept.avgDisciplineScore
    }));
  }, [departmentData]);

  if (employees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <BarChart3 className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <h3 className="text-xl font-semibold mb-2">{t.charts.noData}</h3>
        <p className="text-muted-foreground max-w-md">
          {t.charts.noDataDesc}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Filter */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">{t.dashboard.period}:</span>
            <DateRangePicker
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
              availableDates={dateRange.dates}
              locale={language as 'uz' | 'ru' | 'en'}
              labels={{
                from: t.dashboard.from,
                to: t.dashboard.to,
                clear: t.dashboard.clearFilter,
                selectRange: t.dashboard.period
              }}
            />
            {dateRange.min && (
              <span className="text-xs text-muted-foreground ml-auto">
                {t.dashboard.availableRange}: {dateRange.min} — {dateRange.max}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5" />
              {t.charts.statusDistribution}
            </CardTitle>
            <CardDescription>
              {t.charts.statusDistributionDesc}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {statusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {t.charts.disciplineDistribution}
            </CardTitle>
            <CardDescription>
              {t.charts.disciplineDistributionDesc}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={disciplineDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="range" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" name={t.charts.employeeCount} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            {t.charts.dailyTrend}
          </CardTitle>
          <CardDescription>
            {t.charts.dailyTrendDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="present" 
                  name={t.status.W} 
                  stackId="1"
                  stroke="#22c55e" 
                  fill="#22c55e" 
                  fillOpacity={0.6}
                />
                <Area 
                  type="monotone" 
                  dataKey="late" 
                  name={t.status.L} 
                  stackId="1"
                  stroke="#f59e0b" 
                  fill="#f59e0b"
                  fillOpacity={0.6}
                />
                <Area 
                  type="monotone" 
                  dataKey="absent" 
                  name={t.status.A} 
                  stackId="1"
                  stroke="#ef4444" 
                  fill="#ef4444"
                  fillOpacity={0.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {t.charts.violationsByDept}
          </CardTitle>
          <CardDescription>
            {t.charts.violationsByDeptDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={violationsByDepartment} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} />
                <Tooltip />
                <Legend />
                <Bar dataKey="kechQolish" name={t.dashboard.late} fill="#f59e0b" radius={[0, 4, 4, 0]} />
                <Bar dataKey="ertaKetish" name={t.dashboard.earlyLeave} fill="#f97316" radius={[0, 4, 4, 0]} />
                <Bar dataKey="kelmagan" name={t.dashboard.absent} fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            {t.charts.deptRating}
          </CardTitle>
          <CardDescription>
            {t.charts.deptRatingDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...violationsByDepartment].sort((a, b) => b.intizom - a.intizom)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Bar 
                  dataKey="intizom" 
                  name={t.charts.disciplineScore}
                  radius={[4, 4, 0, 0]}
                >
                  {violationsByDepartment.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.intizom >= 80 ? '#22c55e' : entry.intizom >= 60 ? '#f59e0b' : '#ef4444'} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t.charts.monthlyCalendar}
          </CardTitle>
          <CardDescription>
            {t.charts.monthlyCalendarDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {t.charts.weekDays.map((day: string) => (
              <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
            {dailyTrend.map((day, index) => {
              const attendanceRate = day.total > 0 ? (day.present / day.total) * 100 : 0;
              let bgColor = 'bg-gray-100 dark:bg-gray-800';
              if (attendanceRate >= 90) bgColor = 'bg-green-500';
              else if (attendanceRate >= 70) bgColor = 'bg-green-300';
              else if (attendanceRate >= 50) bgColor = 'bg-yellow-400';
              else if (attendanceRate > 0) bgColor = 'bg-red-400';
              
              return (
                <div
                  key={index}
                  className={`aspect-square rounded-md ${bgColor} flex items-center justify-center text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity`}
                  title={`${day.date}: ${Math.round(attendanceRate)}%`}
                >
                  {day.date.split('-').pop()}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-4 mt-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-green-500"></div>
              <span>90%+</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-green-300"></div>
              <span>70-89%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-yellow-400"></div>
              <span>50-69%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-red-400"></div>
              <span>&lt;50%</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
