import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { STATUS_COLORS, AttendanceStatusCode } from '../types';
import { useLanguage } from '../i18n';

const statusOrder: AttendanceStatusCode[] = ['W', 'L', 'E', 'LE', 'A', 'NS', 'H'];

export function StatusLegend() {
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <Card>
      <CardHeader 
        className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{t.status.statusCodes}</CardTitle>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {statusOrder.map(code => (
              <div 
                key={code} 
                className="flex items-center gap-2 p-2 rounded-md bg-muted/50"
              >
                <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white ${STATUS_COLORS[code]}`}>
                  {code}
                </div>
                <span className="text-xs">{t.status[code]}</span>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

interface StatusBadgeProps {
  code: AttendanceStatusCode;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusBadge({ code, showLabel = false, size = 'md' }: StatusBadgeProps) {
  const { t } = useLanguage();
  const sizeClasses = {
    sm: 'w-5 h-5 text-[10px]',
    md: 'w-6 h-6 text-xs',
    lg: 'w-8 h-8 text-sm'
  };

  return (
    <div className="flex items-center gap-1">
      <div className={`${sizeClasses[size]} rounded flex items-center justify-center font-bold text-white ${STATUS_COLORS[code]}`}>
        {code}
      </div>
      {showLabel && <span className="text-xs text-muted-foreground">{t.status[code]}</span>}
    </div>
  );
}

interface StatusSummaryProps {
  stats: {
    W: number;
    L: number;
    E: number;
    LE: number;
    A: number;
    NS: number;
    H: number;
  };
}

export function StatusSummary({ stats }: StatusSummaryProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {statusOrder.map(code => (
        <div 
          key={code}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/50"
        >
          <div className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white ${STATUS_COLORS[code]}`}>
            {code}
          </div>
          <span className="text-sm font-medium">{stats[code]}</span>
        </div>
      ))}
    </div>
  );
}
