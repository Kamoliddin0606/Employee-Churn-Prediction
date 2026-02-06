/**
 * =============================================================================
 * HR Analytics Backend - Database Explorer API Routes
 * =============================================================================
 * 
 * API endpoints for exploring database tables and viewing data.
 * FOR DEVELOPMENT/TESTING PURPOSES ONLY.
 * 
 * @module routes/dbExplorer
 * @author HR Analytics Team
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import { getDatabase } from '../database/connection';
import { createContextLogger } from '../utils/logger';

// =============================================================================
// ROUTER INITIALIZATION
// =============================================================================

const router = Router();
const log = createContextLogger('DBExplorerAPI');

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Table info from SQLite
 */
interface TableInfo {
    name: string;
    type: string;
    sql: string;
}

/**
 * Column info from SQLite
 */
interface ColumnInfo {
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
}

// =============================================================================
// API ENDPOINTS
// =============================================================================

/**
 * GET /api/db-explorer/tables
 * 
 * Get list of all tables in the database
 * 
 * @returns Array of table names with row counts
 */
router.get('/tables', async (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        
        log.debug('Getting list of all tables');

        // Get all tables from sqlite_master
        const tables = db.prepare(`
            SELECT name, type, sql 
            FROM sqlite_master 
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        `).all() as TableInfo[];

        // Get row count for each table
        const tablesWithCount = tables.map(table => {
            try {
                const countResult = db.prepare(`SELECT COUNT(*) as count FROM "${table.name}"`).get() as { count: number };
                return {
                    name: table.name,
                    rowCount: countResult.count
                };
            } catch {
                return {
                    name: table.name,
                    rowCount: 0
                };
            }
        });

        return res.json({
            success: true,
            data: tablesWithCount
        });

    } catch (error) {
        log.error('Error getting tables', { error });
        return res.status(500).json({
            success: false,
            error: 'Jadvallar ro\'yxatini olishda xatolik'
        });
    }
});

/**
 * GET /api/db-explorer/tables/:tableName
 * 
 * Get data from a specific table with pagination
 * 
 * @param tableName - Name of the table to query
 * @query limit - Number of rows to return (default 100, max 1000)
 * @query offset - Number of rows to skip (default 0)
 * @query orderBy - Column to order by
 * @query orderDir - Order direction (asc/desc)
 * 
 * @returns Table data with columns and rows
 */
router.get('/tables/:tableName', async (req: Request, res: Response) => {
    try {
        const { tableName } = req.params;
        const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
        const offset = parseInt(req.query.offset as string) || 0;
        const orderBy = req.query.orderBy as string;
        const orderDir = (req.query.orderDir as string)?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

        const db = getDatabase();

        log.debug('Getting table data', { tableName, limit, offset });

        // Verify table exists (prevent SQL injection)
        const tableExists = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type = 'table' AND name = ?
        `).get(tableName);

        if (!tableExists) {
            return res.status(404).json({
                success: false,
                error: `Jadval topilmadi: ${tableName}`
            });
        }

        // Get column info
        const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all() as ColumnInfo[];

        // Get total row count
        const countResult = db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get() as { count: number };
        const totalRows = countResult.count;

        // Build query with optional ordering
        let query = `SELECT * FROM "${tableName}"`;
        
        if (orderBy) {
            // Verify column exists
            const columnExists = columns.find(c => c.name === orderBy);
            if (columnExists) {
                query += ` ORDER BY "${orderBy}" ${orderDir}`;
            }
        } else {
            // Default order by first column or id if exists
            const idColumn = columns.find(c => c.name === 'id');
            if (idColumn) {
                query += ` ORDER BY id DESC`;
            }
        }
        
        query += ` LIMIT ? OFFSET ?`;

        // Get rows
        const rows = db.prepare(query).all(limit, offset);

        return res.json({
            success: true,
            data: {
                tableName,
                columns: columns.map(c => ({
                    name: c.name,
                    type: c.type,
                    nullable: c.notnull === 0,
                    primaryKey: c.pk === 1,
                    defaultValue: c.dflt_value
                })),
                rows,
                pagination: {
                    total: totalRows,
                    limit,
                    offset,
                    hasMore: offset + limit < totalRows
                }
            }
        });

    } catch (error) {
        log.error('Error getting table data', { error });
        return res.status(500).json({
            success: false,
            error: 'Jadval ma\'lumotlarini olishda xatolik'
        });
    }
});

/**
 * GET /api/db-explorer/tables/:tableName/schema
 * 
 * Get schema (CREATE statement) for a table
 * 
 * @param tableName - Name of the table
 * @returns Table schema/DDL
 */
router.get('/tables/:tableName/schema', async (req: Request, res: Response) => {
    try {
        const { tableName } = req.params;
        const db = getDatabase();

        log.debug('Getting table schema', { tableName });

        // Get table schema
        const tableInfo = db.prepare(`
            SELECT sql FROM sqlite_master 
            WHERE type = 'table' AND name = ?
        `).get(tableName) as { sql: string } | undefined;

        if (!tableInfo) {
            return res.status(404).json({
                success: false,
                error: `Jadval topilmadi: ${tableName}`
            });
        }

        // Get indexes for the table
        const indexes = db.prepare(`
            SELECT name, sql FROM sqlite_master 
            WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL
        `).all(tableName) as { name: string; sql: string }[];

        return res.json({
            success: true,
            data: {
                tableName,
                createStatement: tableInfo.sql,
                indexes
            }
        });

    } catch (error) {
        log.error('Error getting table schema', { error });
        return res.status(500).json({
            success: false,
            error: 'Jadval sxemasini olishda xatolik'
        });
    }
});

/**
 * POST /api/db-explorer/query
 * 
 * Execute a custom SELECT query (read-only)
 * FOR DEVELOPMENT/TESTING ONLY
 * 
 * @body query - SQL SELECT query
 * @returns Query results
 */
router.post('/query', async (req: Request, res: Response) => {
    try {
        const { query } = req.body;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'SQL so\'rov kiritilmagan'
            });
        }

        // Only allow SELECT statements (basic security)
        const trimmedQuery = query.trim().toUpperCase();
        if (!trimmedQuery.startsWith('SELECT')) {
            return res.status(400).json({
                success: false,
                error: 'Faqat SELECT so\'rovlari ruxsat etilgan'
            });
        }

        // Disallow dangerous keywords
        const dangerousKeywords = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'ALTER', 'CREATE', 'TRUNCATE'];
        for (const keyword of dangerousKeywords) {
            if (trimmedQuery.includes(keyword)) {
                return res.status(400).json({
                    success: false,
                    error: `"${keyword}" kalit so'zi ruxsat etilmagan`
                });
            }
        }

        const db = getDatabase();
        
        log.info('Executing custom query', { query: query.substring(0, 100) });

        const startTime = Date.now();
        const rows = db.prepare(query).all();
        const duration = Date.now() - startTime;

        // Get column names from first row
        const columns = rows.length > 0 ? Object.keys(rows[0] as object) : [];

        return res.json({
            success: true,
            data: {
                columns,
                rows,
                rowCount: rows.length,
                duration: `${duration}ms`
            }
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log.error('Error executing query', { error: errorMessage });
        return res.status(400).json({
            success: false,
            error: `So'rovda xatolik: ${errorMessage}`
        });
    }
});

// =============================================================================
// POST /api/db-explorer/truncate/:tableName
// =============================================================================

/**
 * Truncate (clear all data from) a specific table
 * Protected tables cannot be truncated
 * 
 * @param tableName - Name of the table to truncate
 * @returns Success status and deleted row count
 */
router.post('/truncate/:tableName', async (req: Request, res: Response) => {
    try {
        const { tableName } = req.params;

        // List of protected tables that cannot be truncated
        const protectedTables = ['organizations', 'calculation_settings'];
        
        if (protectedTables.includes(tableName)) {
            return res.status(403).json({
                success: false,
                error: `"${tableName}" jadvali himoyalangan va tozalab bo'lmaydi`
            });
        }

        const db = getDatabase();

        // Check if table exists
        const tableExists = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type = 'table' AND name = ?
        `).get(tableName);

        if (!tableExists) {
            return res.status(404).json({
                success: false,
                error: `"${tableName}" jadvali topilmadi`
            });
        }

        // Get current row count
        const countResult = db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get() as { count: number };
        const deletedCount = countResult.count;

        // Delete all rows
        db.prepare(`DELETE FROM "${tableName}"`).run();

        // Reset auto-increment counter if applicable
        try {
            db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(tableName);
        } catch {
            // sqlite_sequence may not exist for all tables
        }

        log.info('Table truncated', { tableName, deletedCount });

        return res.json({
            success: true,
            data: {
                tableName,
                deletedCount
            },
            message: `"${tableName}" jadvalidan ${deletedCount} ta yozuv o'chirildi`
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log.error('Error truncating table', { error: errorMessage, tableName: req.params.tableName });
        return res.status(500).json({
            success: false,
            error: `Jadvalni tozalashda xatolik: ${errorMessage}`
        });
    }
});

// =============================================================================
// EXPORT
// =============================================================================

export default router;
