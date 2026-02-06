/**
 * =============================================================================
 * HR Analytics Frontend - Database Explorer Component
 * =============================================================================
 * 
 * UI component for exploring database tables and viewing data.
 * FOR DEVELOPMENT/TESTING PURPOSES ONLY.
 * 
 * Features:
 * - List all database tables with row counts
 * - View table data with pagination
 * - Sort by columns
 * - Execute custom SELECT queries
 * 
 * @module components/DatabaseExplorer
 * @author HR Analytics Team
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Database,
    Table,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    Play,
    AlertCircle,
    Search,
    ArrowUpDown,
    Code
} from 'lucide-react';

// =============================================================================
// API CONFIGURATION
// =============================================================================

const API_BASE_URL = `http://${window.location.hostname}:3001/api`;

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Table info from API
 */
interface TableInfo {
    name: string;
    rowCount: number;
}

/**
 * Column info from API
 */
interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
    primaryKey: boolean;
    defaultValue: string | null;
}

/**
 * Table data response
 */
interface TableData {
    tableName: string;
    columns: ColumnInfo[];
    rows: Record<string, unknown>[];
    pagination: {
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
    };
}

/**
 * Query result
 */
interface QueryResult {
    columns: string[];
    rows: Record<string, unknown>[];
    rowCount: number;
    duration: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

const DatabaseExplorer: React.FC = () => {
    // =========================================================================
    // STATE
    // =========================================================================
    
    const [tables, setTables] = useState<TableInfo[]>([]);
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [tableData, setTableData] = useState<TableData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(50);
    
    // Sorting
    const [orderBy, setOrderBy] = useState<string | null>(null);
    const [orderDir, setOrderDir] = useState<'asc' | 'desc'>('desc');
    
    // Custom query
    const [showQueryPanel, setShowQueryPanel] = useState(false);
    const [customQuery, setCustomQuery] = useState('SELECT * FROM employees LIMIT 10');
    const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
    const [queryLoading, setQueryLoading] = useState(false);
    const [queryError, setQueryError] = useState<string | null>(null);

    // =========================================================================
    // DATA FETCHING
    // =========================================================================

    /**
     * Fetch list of all tables
     */
    const fetchTables = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_BASE_URL}/db-explorer/tables`);
            const data = await response.json();
            
            if (data.success) {
                setTables(data.data);
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError('Server bilan bog\'lanishda xatolik');
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Fetch data for selected table
     */
    const fetchTableData = useCallback(async () => {
        if (!selectedTable) return;
        
        try {
            setLoading(true);
            setError(null);
            
            const offset = (currentPage - 1) * pageSize;
            let url = `${API_BASE_URL}/db-explorer/tables/${selectedTable}?limit=${pageSize}&offset=${offset}`;
            
            if (orderBy) {
                url += `&orderBy=${orderBy}&orderDir=${orderDir}`;
            }
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.success) {
                setTableData(data.data);
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError('Ma\'lumotlarni olishda xatolik');
        } finally {
            setLoading(false);
        }
    }, [selectedTable, currentPage, pageSize, orderBy, orderDir]);

    /**
     * Execute custom query
     */
    const executeQuery = async () => {
        if (!customQuery.trim()) return;
        
        try {
            setQueryLoading(true);
            setQueryError(null);
            
            const response = await fetch(`${API_BASE_URL}/db-explorer/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: customQuery })
            });
            
            const data = await response.json();
            
            if (data.success) {
                setQueryResult(data.data);
            } else {
                setQueryError(data.error);
                setQueryResult(null);
            }
        } catch (err) {
            setQueryError('So\'rovni bajarishda xatolik');
        } finally {
            setQueryLoading(false);
        }
    };

    // =========================================================================
    // EFFECTS
    // =========================================================================

    useEffect(() => {
        fetchTables();
    }, [fetchTables]);

    useEffect(() => {
        if (selectedTable) {
            setCurrentPage(1);
            setOrderBy(null);
            setOrderDir('desc');
        }
    }, [selectedTable]);

    useEffect(() => {
        fetchTableData();
    }, [fetchTableData]);

    // =========================================================================
    // HANDLERS
    // =========================================================================

    const handleTableSelect = (tableName: string) => {
        setSelectedTable(tableName);
        setQueryResult(null);
    };

    const handleSort = (column: string) => {
        if (orderBy === column) {
            setOrderDir(orderDir === 'asc' ? 'desc' : 'asc');
        } else {
            setOrderBy(column);
            setOrderDir('desc');
        }
    };

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
    };

    const totalPages = tableData ? Math.ceil(tableData.pagination.total / pageSize) : 0;

    // =========================================================================
    // RENDER HELPERS
    // =========================================================================

    /**
     * Format cell value for display
     */
    const formatCellValue = (value: unknown): string => {
        if (value === null) return 'NULL';
        if (value === undefined) return '';
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    };

    /**
     * Get column type badge color
     */
    const getTypeColor = (type: string): string => {
        const t = type.toUpperCase();
        if (t.includes('INT')) return 'bg-blue-100 text-blue-700';
        if (t.includes('TEXT') || t.includes('VARCHAR')) return 'bg-green-100 text-green-700';
        if (t.includes('REAL') || t.includes('FLOAT')) return 'bg-yellow-100 text-yellow-700';
        if (t.includes('BLOB')) return 'bg-purple-100 text-purple-700';
        return 'bg-gray-100 text-gray-700';
    };

    // =========================================================================
    // RENDER
    // =========================================================================

    return (
        <div className="p-4 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <Database className="w-6 h-6 text-blue-600" />
                    <h1 className="text-xl font-bold text-gray-800 dark:text-white">
                        Database Explorer
                    </h1>
                    <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded">
                        TEST MODE
                    </span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowQueryPanel(!showQueryPanel)}
                        className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                            showQueryPanel 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        <Code className="w-4 h-4" />
                        SQL Query
                    </button>
                    <button
                        onClick={fetchTables}
                        className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Yangilash
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                    <AlertCircle className="w-5 h-5" />
                    {error}
                </div>
            )}

            {/* Custom Query Panel */}
            {showQueryPanel && (
                <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                    <div className="flex gap-2 mb-3">
                        <textarea
                            value={customQuery}
                            onChange={(e) => setCustomQuery(e.target.value)}
                            className="flex-1 px-3 py-2 border rounded-lg font-mono text-sm resize-none h-20 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            placeholder="SELECT * FROM table_name LIMIT 10"
                        />
                        <button
                            onClick={executeQuery}
                            disabled={queryLoading}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            <Play className="w-4 h-4" />
                            {queryLoading ? 'Bajarilmoqda...' : 'Bajarish'}
                        </button>
                    </div>
                    
                    {queryError && (
                        <div className="p-2 bg-red-50 text-red-700 text-sm rounded mb-3">
                            {queryError}
                        </div>
                    )}
                    
                    {queryResult && (
                        <div className="text-xs text-gray-500 mb-2">
                            {queryResult.rowCount} ta qator • {queryResult.duration}
                        </div>
                    )}
                </div>
            )}

            <div className="flex-1 flex gap-4 min-h-0">
                {/* Tables List */}
                <div className="w-64 flex-shrink-0 bg-white dark:bg-gray-800 rounded-lg border overflow-hidden flex flex-col">
                    <div className="p-3 border-b bg-gray-50 dark:bg-gray-700">
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                            <Table className="w-4 h-4" />
                            Jadvallar ({tables.length})
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {tables.map((table) => (
                            <button
                                key={table.name}
                                onClick={() => handleTableSelect(table.name)}
                                className={`w-full px-3 py-2 text-left text-sm flex justify-between items-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                                    selectedTable === table.name 
                                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-l-2 border-blue-600' 
                                        : 'text-gray-700 dark:text-gray-300'
                                }`}
                            >
                                <span className="truncate">{table.name}</span>
                                <span className="text-xs text-gray-400 ml-2">
                                    {table.rowCount}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Table Data */}
                <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg border overflow-hidden flex flex-col min-w-0">
                    {!selectedTable && !queryResult ? (
                        <div className="flex-1 flex items-center justify-center text-gray-400">
                            <div className="text-center">
                                <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p>Jadval tanlang yoki SQL so'rov yozing</p>
                            </div>
                        </div>
                    ) : queryResult ? (
                        /* Query Result */
                        <>
                            <div className="p-3 border-b bg-gray-50 dark:bg-gray-700 flex justify-between items-center">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    So'rov natijasi
                                </span>
                                <span className="text-xs text-gray-500">
                                    {queryResult.rowCount} ta qator
                                </span>
                            </div>
                            <div className="flex-1 overflow-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                                        <tr>
                                            {queryResult.columns.map((col) => (
                                                <th
                                                    key={col}
                                                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                                                >
                                                    {col}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y dark:divide-gray-700">
                                        {queryResult.rows.map((row, i) => (
                                            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                {queryResult.columns.map((col) => (
                                                    <td
                                                        key={col}
                                                        className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap"
                                                    >
                                                        {formatCellValue(row[col])}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : tableData ? (
                        /* Table Data */
                        <>
                            <div className="p-3 border-b bg-gray-50 dark:bg-gray-700 flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        {tableData.tableName}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        {tableData.pagination.total} ta qator
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {tableData.columns.slice(0, 3).map((col) => (
                                        <span
                                            key={col.name}
                                            className={`px-2 py-0.5 text-xs rounded ${getTypeColor(col.type)}`}
                                        >
                                            {col.name}: {col.type}
                                        </span>
                                    ))}
                                    {tableData.columns.length > 3 && (
                                        <span className="text-xs text-gray-400">
                                            +{tableData.columns.length - 3}
                                        </span>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex-1 overflow-auto">
                                {loading ? (
                                    <div className="flex items-center justify-center h-full">
                                        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
                                    </div>
                                ) : (
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                                            <tr>
                                                {tableData.columns.map((col) => (
                                                    <th
                                                        key={col.name}
                                                        onClick={() => handleSort(col.name)}
                                                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                                                    >
                                                        <div className="flex items-center gap-1">
                                                            {col.name}
                                                            {col.primaryKey && (
                                                                <span className="text-yellow-500">🔑</span>
                                                            )}
                                                            {orderBy === col.name && (
                                                                <ArrowUpDown className="w-3 h-3" />
                                                            )}
                                                        </div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y dark:divide-gray-700">
                                            {tableData.rows.map((row, i) => (
                                                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                    {tableData.columns.map((col) => (
                                                        <td
                                                            key={col.name}
                                                            className={`px-3 py-2 whitespace-nowrap ${
                                                                row[col.name] === null
                                                                    ? 'text-gray-400 italic'
                                                                    : 'text-gray-700 dark:text-gray-300'
                                                            }`}
                                                        >
                                                            {formatCellValue(row[col.name])}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="p-3 border-t bg-gray-50 dark:bg-gray-700 flex justify-between items-center">
                                    <span className="text-xs text-gray-500">
                                        {tableData.pagination.offset + 1} - {Math.min(tableData.pagination.offset + pageSize, tableData.pagination.total)} / {tableData.pagination.total}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handlePageChange(currentPage - 1)}
                                            disabled={currentPage === 1}
                                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                                        >
                                            <ChevronLeft className="w-5 h-5" />
                                        </button>
                                        <span className="text-sm">
                                            {currentPage} / {totalPages}
                                        </span>
                                        <button
                                            onClick={() => handlePageChange(currentPage + 1)}
                                            disabled={currentPage === totalPages}
                                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                                        >
                                            <ChevronRight className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

export default DatabaseExplorer;
