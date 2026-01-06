import { useMemo } from 'react';
import { ArrowLeft, Calendar, TrendingUp, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useStore } from '../store/useStore';
import { calculateEmployeeStats } from '../utils/attendanceCalculator';
import { StatusBadge } from './StatusLegend';
import { STATUS_COLORS } from '../types';

interface EmployeeDetailProps {
  employeeId: string;
  onBack: () => void;
}

export function EmployeeDetail({ employeeId, onBack }: EmployeeDetailProps) {
  const { employees, attendance } = useStore();
  
  const employee = useMemo(() => 
    employees.find(e => e.id === employeeId), 
    [employees, employeeId]
  );

  const employeeAttendance = useMemo(() => 
    attendance.filter(a => a.employeeId === employeeId).sort((a, b) => a.date.localeCompare(b.date)),
    [attendance, employeeId]
  );

  const stats = useMemo(() => {
    if (!employee) return null;
    return calculateEmployeeStats(employee, attendance);
  }, [employee, attendance]);

  if (!employee || !stats) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Xodim topilmadi</p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Orqaga
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{employee.name}</h2>
          <p className="text-muted-foreground">{employee.department}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card className="bg-green-50 dark:bg-green-900/20">
          <CardContent className="pt-4 text-center">
            <div className={`w-10 h-10 mx-auto rounded-lg flex items-center justify-center text-white font-bold ${STATUS_COLORS['W']}`}>
              W
            </div>
            <p className="text-2xl font-bold mt-2">{stats.presentDays}</p>
            <p className="text-xs text-muted-foreground">Tartibli</p>
          </CardContent>
        </Card>

        <Card className="bg-yellow-50 dark:bg-yellow-900/20">
          <CardContent className="pt-4 text-center">
            <div className={`w-10 h-10 mx-auto rounded-lg flex items-center justify-center text-white font-bold ${STATUS_COLORS['L']}`}>
              L
            </div>
            <p className="text-2xl font-bold mt-2">{stats.lateDays}</p>
            <p className="text-xs text-muted-foreground">Kech qolgan</p>
          </CardContent>
        </Card>

        <Card className="bg-orange-50 dark:bg-orange-900/20">
          <CardContent className="pt-4 text-center">
            <div className={`w-10 h-10 mx-auto rounded-lg flex items-center justify-center text-white font-bold ${STATUS_COLORS['E']}`}>
              E
            </div>
            <p className="text-2xl font-bold mt-2">{stats.earlyLeaveDays}</p>
            <p className="text-xs text-muted-foreground">Erta ketgan</p>
          </CardContent>
        </Card>

        <Card className="bg-red-50 dark:bg-red-900/20">
          <CardContent className="pt-4 text-center">
            <div className={`w-10 h-10 mx-auto rounded-lg flex items-center justify-center text-white font-bold ${STATUS_COLORS['LE']}`}>
              LE
            </div>
            <p className="text-2xl font-bold mt-2">{stats.lateAndEarlyDays}</p>
            <p className="text-xs text-muted-foreground">Ikkalasi</p>
          </CardContent>
        </Card>

        <Card className="bg-red-100 dark:bg-red-900/30">
          <CardContent className="pt-4 text-center">
            <div className={`w-10 h-10 mx-auto rounded-lg flex items-center justify-center text-white font-bold ${STATUS_COLORS['A']}`}>
              A
            </div>
            <p className="text-2xl font-bold mt-2">{stats.absentDays}</p>
            <p className="text-xs text-muted-foreground">Kelmagan</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50 dark:bg-gray-900/20">
          <CardContent className="pt-4 text-center">
            <div className={`w-10 h-10 mx-auto rounded-lg flex items-center justify-center text-white font-bold ${STATUS_COLORS['NS']}`}>
              NS
            </div>
            <p className="text-2xl font-bold mt-2">{stats.noScheduleDays}</p>
            <p className="text-xs text-muted-foreground">Dam olish</p>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 dark:bg-blue-900/20">
          <CardContent className="pt-4 text-center">
            <div className={`w-10 h-10 mx-auto rounded-lg flex items-center justify-center text-white font-bold ${STATUS_COLORS['H']}`}>
              H
            </div>
            <p className="text-2xl font-bold mt-2">{stats.holidayDays}</p>
            <p className="text-xs text-muted-foreground">Bayram</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Ish Kunlari
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.totalWorkDays}</p>
            <p className="text-sm text-muted-foreground">
              Jami ish kunlari (NS va H bundan mustasno)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Qoidabuzarlik
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-600">{stats.violationCount}</p>
            <p className="text-sm text-muted-foreground">
              L + E + LE + A = {stats.lateDays} + {stats.earlyLeaveDays} + {stats.lateAndEarlyDays} + {stats.absentDays}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Intizom Balli
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${
              stats.disciplineScore >= 80 ? 'text-green-600' :
              stats.disciplineScore >= 60 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {stats.disciplineScore}
            </p>
            <p className="text-sm text-muted-foreground">
              100 - (qoidabuzarlik / ish kunlari × 100)
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Kunlik Davomat Kalendari</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-15 lg:grid-cols-20 gap-2">
            {employeeAttendance.map((record) => (
              <div
                key={record.date}
                className="relative group"
              >
                <div className={`
                  w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs
                  ${STATUS_COLORS[record.statusCode]}
                  cursor-pointer hover:opacity-80 transition-opacity
                `}>
                  {record.statusCode}
                </div>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                  {record.date}
                </div>
              </div>
            ))}
          </div>
          {employeeAttendance.length === 0 && (
            <p className="text-center text-muted-foreground py-4">
              Davomat ma'lumotlari yo'q
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Batafsil Davomat Jadvali</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-2 px-3">Sana</th>
                  <th className="text-center py-2 px-3">Status</th>
                  <th className="text-center py-2 px-3">Ish kuni</th>
                  <th className="text-center py-2 px-3">Qoidabuzarlik</th>
                </tr>
              </thead>
              <tbody>
                {employeeAttendance.map((record) => (
                  <tr key={record.date} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-3 font-medium">{record.date}</td>
                    <td className="py-2 px-3 text-center">
                      <StatusBadge code={record.statusCode} showLabel />
                    </td>
                    <td className="py-2 px-3 text-center">
                      {record.isWorkDay ? (
                        <Badge variant="success">Ha</Badge>
                      ) : (
                        <Badge variant="secondary">Yo'q</Badge>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {record.isViolation ? (
                        <Badge variant="danger">Ha</Badge>
                      ) : (
                        <Badge variant="secondary">Yo'q</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
