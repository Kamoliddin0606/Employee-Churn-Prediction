import { useState } from 'react';
import { 
  Trash2, 
  RotateCcw, 
  History, 
  AlertTriangle, 
  Database,
  FileSpreadsheet,
  Calendar,
  Users
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { useStore } from '../store/useStore';
import { format } from 'date-fns';
import { useLanguage } from '../i18n';

export function AdminPanel() {
  const { t } = useLanguage();
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showRollbackDialog, setShowRollbackDialog] = useState(false);
  const [selectedRollbackId, setSelectedRollbackId] = useState<string | null>(null);

  const {
    employees,
    attendance,
    importHistory,
    clearAllData,
    rollbackImport
  } = useStore();

  const handleClearData = () => {
    clearAllData();
    setShowClearDialog(false);
  };

  const handleRollback = () => {
    if (selectedRollbackId) {
      rollbackImport(selectedRollbackId);
      setShowRollbackDialog(false);
      setSelectedRollbackId(null);
    }
  };

  const stats = {
    totalEmployees: employees.length,
    totalRecords: attendance.length,
    totalImports: importHistory.length,
    uniqueDates: [...new Set(attendance.map(a => a.date))].length,
    // Status code breakdown
    statusCounts: {
      W: attendance.filter(a => a.statusCode === 'W').length,
      L: attendance.filter(a => a.statusCode === 'L').length,
      E: attendance.filter(a => a.statusCode === 'E').length,
      LE: attendance.filter(a => a.statusCode === 'LE').length,
      A: attendance.filter(a => a.statusCode === 'A').length,
      NS: attendance.filter(a => a.statusCode === 'NS').length,
      H: attendance.filter(a => a.statusCode === 'H').length,
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {t.admin.dbStatus}
          </CardTitle>
          <CardDescription>
            {t.admin.dbStatusDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Users className="h-4 w-4" />
                <span className="text-sm">{t.admin.employeesCount}</span>
              </div>
              <p className="text-2xl font-bold">{stats.totalEmployees}</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <FileSpreadsheet className="h-4 w-4" />
                <span className="text-sm">{t.admin.records}</span>
              </div>
              <p className="text-2xl font-bold">{stats.totalRecords}</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Calendar className="h-4 w-4" />
                <span className="text-sm">{t.admin.daysCount}</span>
              </div>
              <p className="text-2xl font-bold">{stats.uniqueDates}</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <History className="h-4 w-4" />
                <span className="text-sm">{t.admin.imports}</span>
              </div>
              <p className="text-2xl font-bold">{stats.totalImports}</p>
            </div>
          </div>

          {stats.totalRecords > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">{t.admin.statusBreakdown}</h4>
              <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
                <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg text-center">
                  <div className="w-8 h-8 mx-auto rounded bg-green-500 flex items-center justify-center text-white font-bold text-sm">W</div>
                  <p className="text-lg font-bold mt-1">{stats.statusCounts.W}</p>
                  <p className="text-xs text-muted-foreground">{t.status.W}</p>
                </div>
                <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg text-center">
                  <div className="w-8 h-8 mx-auto rounded bg-yellow-500 flex items-center justify-center text-white font-bold text-sm">L</div>
                  <p className="text-lg font-bold mt-1">{stats.statusCounts.L}</p>
                  <p className="text-xs text-muted-foreground">{t.status.L}</p>
                </div>
                <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg text-center">
                  <div className="w-8 h-8 mx-auto rounded bg-orange-500 flex items-center justify-center text-white font-bold text-sm">E</div>
                  <p className="text-lg font-bold mt-1">{stats.statusCounts.E}</p>
                  <p className="text-xs text-muted-foreground">{t.status.E}</p>
                </div>
                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg text-center">
                  <div className="w-8 h-8 mx-auto rounded bg-red-400 flex items-center justify-center text-white font-bold text-sm">LE</div>
                  <p className="text-lg font-bold mt-1">{stats.statusCounts.LE}</p>
                  <p className="text-xs text-muted-foreground">{t.status.LE}</p>
                </div>
                <div className="p-3 bg-red-200 dark:bg-red-900/40 rounded-lg text-center">
                  <div className="w-8 h-8 mx-auto rounded bg-red-600 flex items-center justify-center text-white font-bold text-sm">A</div>
                  <p className="text-lg font-bold mt-1">{stats.statusCounts.A}</p>
                  <p className="text-xs text-muted-foreground">{t.status.A}</p>
                </div>
                <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-center">
                  <div className="w-8 h-8 mx-auto rounded bg-gray-400 flex items-center justify-center text-white font-bold text-sm">NS</div>
                  <p className="text-lg font-bold mt-1">{stats.statusCounts.NS}</p>
                  <p className="text-xs text-muted-foreground">{t.status.NS}</p>
                </div>
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-center">
                  <div className="w-8 h-8 mx-auto rounded bg-blue-400 flex items-center justify-center text-white font-bold text-sm">H</div>
                  <p className="text-lg font-bold mt-1">{stats.statusCounts.H}</p>
                  <p className="text-xs text-muted-foreground">{t.status.H}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {t.admin.importHistory}
          </CardTitle>
          <CardDescription>
            {t.admin.importHistoryDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {importHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>{t.admin.noImports}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {importHistory.slice(0, 10).map((history, index) => (
                <div
                  key={history.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <FileSpreadsheet className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{history.fileName}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{format(new Date(history.importDate), 'dd.MM.yyyy HH:mm')}</span>
                        <span>•</span>
                        <span>{history.recordsCount} {t.admin.records}</span>
                        {history.newEmployees > 0 && (
                          <>
                            <span>•</span>
                            <Badge variant="success" className="text-xs">
                              +{history.newEmployees} {t.admin.newRecords}
                            </Badge>
                          </>
                        )}
                        {history.updatedRecords > 0 && (
                          <>
                            <span>•</span>
                            <Badge variant="warning" className="text-xs">
                              {history.updatedRecords} {t.admin.updated}
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {index === 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedRollbackId(history.id);
                        setShowRollbackDialog(true);
                      }}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      {t.admin.rollback}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {t.admin.dangerZone}
          </CardTitle>
          <CardDescription>
            {t.admin.dangerZoneDesc}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-destructive/30 rounded-lg">
            <div>
              <p className="font-medium">{t.admin.clearAll}</p>
              <p className="text-sm text-muted-foreground">
                {t.admin.clearAllDesc}
              </p>
            </div>
            <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t.admin.clear}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t.admin.clearConfirmTitle}</DialogTitle>
                  <DialogDescription>
                    {t.admin.clearConfirmDesc}
                  </DialogDescription>
                </DialogHeader>
                <div className="p-4 bg-destructive/10 rounded-lg">
                  <div className="flex items-center gap-2 text-destructive mb-2">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="font-medium">{t.admin.warning}</span>
                  </div>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• {t.admin.employeesWillBeDeleted.replace('{count}', String(stats.totalEmployees))}</li>
                    <li>• {t.admin.recordsWillBeDeleted.replace('{count}', String(stats.totalRecords))}</li>
                    <li>• {t.admin.importsWillBeDeleted.replace('{count}', String(stats.totalImports))}</li>
                  </ul>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowClearDialog(false)}>
                    {t.common.cancel}
                  </Button>
                  <Button variant="destructive" onClick={handleClearData}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t.admin.yesDelete}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showRollbackDialog} onOpenChange={setShowRollbackDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.admin.rollbackTitle}</DialogTitle>
            <DialogDescription>
              {t.admin.rollbackDesc}
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400 mb-2">
              <RotateCcw className="h-5 w-5" />
              <span className="font-medium">Rollback</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t.admin.rollbackInfo}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRollbackDialog(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="warning" onClick={handleRollback}>
              <RotateCcw className="h-4 w-4 mr-2" />
              {t.admin.doRollback}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
