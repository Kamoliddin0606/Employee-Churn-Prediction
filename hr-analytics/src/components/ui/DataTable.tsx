/**
 * =============================================================================
 * Reusable DataTable Component
 * =============================================================================
 * 
 * A powerful, reusable table component with:
 * - Sorting (ascending/descending) on all columns
 * - Search/filter across all cells
 * - Scrollable content area
 * - Collapsible header section
 * - Sticky table header
 */

import React, { useState, useMemo, useCallback } from 'react';
import { 
    Search, 
    ChevronUp, 
    ChevronDown, 
    ChevronsUpDown,
    ChevronRight,
    X
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

export interface Column<T> {
    key: string;
    header: string;
    sortable?: boolean;
    render?: (value: unknown, row: T, index: number) => React.ReactNode;
    className?: string;
    headerClassName?: string;
    width?: string;
}

export interface DataTableProps<T> {
    data: T[];
    columns: Column<T>[];
    searchable?: boolean;
    searchPlaceholder?: string;
    headerContent?: React.ReactNode;
    collapsibleHeader?: boolean;
    headerTitle?: string;
    emptyMessage?: string;
    emptyIcon?: React.ReactNode;
    maxHeight?: string;
    onRowClick?: (row: T, index: number) => void;
    rowClassName?: (row: T, index: number) => string;
    getRowKey?: (row: T, index: number) => string | number;
}

type SortDirection = 'asc' | 'desc' | null;

// =============================================================================
// COMPONENT
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DataTable<T extends Record<string, any>>({
    data,
    columns,
    searchable = true,
    searchPlaceholder = 'Qidirish...',
    headerContent,
    collapsibleHeader = true,
    headerTitle,
    emptyMessage = 'Ma\'lumot topilmadi',
    emptyIcon,
    maxHeight = 'calc(100vh - 350px)',
    onRowClick,
    rowClassName,
    getRowKey
}: DataTableProps<T>) {
    // =========================================================================
    // STATE
    // =========================================================================

    const [searchQuery, setSearchQuery] = useState('');
    const [sortColumn, setSortColumn] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>(null);
    const [headerCollapsed, setHeaderCollapsed] = useState(false);

    // =========================================================================
    // HANDLERS
    // =========================================================================

    const handleSort = useCallback((columnKey: string) => {
        if (sortColumn === columnKey) {
            // Cycle through: asc -> desc -> null
            if (sortDirection === 'asc') {
                setSortDirection('desc');
            } else if (sortDirection === 'desc') {
                setSortColumn(null);
                setSortDirection(null);
            } else {
                setSortDirection('asc');
            }
        } else {
            setSortColumn(columnKey);
            setSortDirection('asc');
        }
    }, [sortColumn, sortDirection]);

    const clearSearch = useCallback(() => {
        setSearchQuery('');
    }, []);

    // =========================================================================
    // FILTERED & SORTED DATA
    // =========================================================================

    const filteredData = useMemo(() => {
        let result = [...data];

        // Search filter - search across all columns
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            result = result.filter(row => {
                return columns.some(col => {
                    const value = row[col.key];
                    if (value === null || value === undefined) return false;
                    return String(value).toLowerCase().includes(query);
                });
            });
        }

        // Sort
        if (sortColumn && sortDirection) {
            result.sort((a, b) => {
                const aValue = a[sortColumn];
                const bValue = b[sortColumn];

                // Handle null/undefined
                if (aValue === null || aValue === undefined) return sortDirection === 'asc' ? 1 : -1;
                if (bValue === null || bValue === undefined) return sortDirection === 'asc' ? -1 : 1;

                // Compare based on type
                if (typeof aValue === 'number' && typeof bValue === 'number') {
                    return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
                }

                // String comparison
                const aStr = String(aValue).toLowerCase();
                const bStr = String(bValue).toLowerCase();
                const comparison = aStr.localeCompare(bStr);
                return sortDirection === 'asc' ? comparison : -comparison;
            });
        }

        return result;
    }, [data, searchQuery, sortColumn, sortDirection, columns]);

    // =========================================================================
    // RENDER HELPERS
    // =========================================================================

    const getSortIcon = (columnKey: string) => {
        if (sortColumn !== columnKey) {
            return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
        }
        if (sortDirection === 'asc') {
            return <ChevronUp className="w-3 h-3" />;
        }
        return <ChevronDown className="w-3 h-3" />;
    };

    const getCellValue = (row: T, column: Column<T>, index: number) => {
        const value = row[column.key];
        if (column.render) {
            return column.render(value, row, index);
        }
        if (value === null || value === undefined) {
            return '-';
        }
        return String(value);
    };

    // =========================================================================
    // RENDER
    // =========================================================================

    return (
        <div className="flex flex-col h-full">
            {/* Header Section - Collapsible */}
            {(headerContent || searchable || headerTitle) && (
                <div className="flex-shrink-0 bg-background border-b">
                    {/* Header Title with Collapse Toggle */}
                    {collapsibleHeader && headerContent && (
                        <div 
                            className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-muted/50"
                            onClick={() => setHeaderCollapsed(!headerCollapsed)}
                        >
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <ChevronRight className={`w-4 h-4 transition-transform ${headerCollapsed ? '' : 'rotate-90'}`} />
                                {headerTitle || 'Filtrlar va sozlamalar'}
                            </div>
                            <span className="text-xs text-muted-foreground">
                                {headerCollapsed ? 'Ochish' : 'Yashirish'}
                            </span>
                        </div>
                    )}

                    {/* Collapsible Header Content */}
                    {!headerCollapsed && headerContent && (
                        <div className="px-4 py-3 border-t">
                            {headerContent}
                        </div>
                    )}

                    {/* Search Bar - Always visible */}
                    {searchable && (
                        <div className="px-4 py-3 flex items-center gap-4 border-t">
                            <div className="relative flex-1 max-w-md">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={searchPlaceholder}
                                    className="w-full pl-9 pr-8 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={clearSearch}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
                                    >
                                        <X className="w-3 h-3 text-muted-foreground" />
                                    </button>
                                )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                                {filteredData.length} / {data.length} ta yozuv
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Table Container - Scrollable */}
            <div 
                className="flex-1 overflow-auto"
                style={{ maxHeight }}
            >
                <table className="w-full border-collapse">
                    {/* Sticky Header */}
                    <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                        <tr>
                            {columns.map((column) => (
                                <th
                                    key={column.key}
                                    className={`px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b ${
                                        column.sortable !== false ? 'cursor-pointer hover:bg-muted select-none' : ''
                                    } ${column.headerClassName || ''}`}
                                    style={{ width: column.width }}
                                    onClick={() => column.sortable !== false && handleSort(column.key)}
                                >
                                    <div className="flex items-center gap-1">
                                        <span>{column.header}</span>
                                        {column.sortable !== false && getSortIcon(column.key)}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>

                    {/* Table Body */}
                    <tbody className="divide-y">
                        {filteredData.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="px-4 py-12 text-center">
                                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                        {emptyIcon}
                                        <p>{emptyMessage}</p>
                                        {searchQuery && (
                                            <button
                                                onClick={clearSearch}
                                                className="text-sm text-primary hover:underline"
                                            >
                                                Qidiruvni tozalash
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredData.map((row, index) => {
                                const key = getRowKey ? getRowKey(row, index) : index;
                                const customClassName = rowClassName ? rowClassName(row, index) : '';
                                
                                return (
                                    <tr
                                        key={key}
                                        className={`hover:bg-muted/50 transition-colors ${
                                            onRowClick ? 'cursor-pointer' : ''
                                        } ${customClassName}`}
                                        onClick={() => onRowClick?.(row, index)}
                                    >
                                        {columns.map((column) => (
                                            <td
                                                key={column.key}
                                                className={`px-4 py-3 text-sm ${column.className || ''}`}
                                            >
                                                {getCellValue(row, column, index)}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer with stats */}
            {filteredData.length > 0 && (
                <div className="flex-shrink-0 px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
                    {sortColumn && sortDirection && (
                        <span>
                            Tartiblangan: {columns.find(c => c.key === sortColumn)?.header} ({sortDirection === 'asc' ? '↑' : '↓'})
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

export default DataTable;
