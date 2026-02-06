/**
 * =============================================================================
 * HR Analytics Backend - Database Connection
 * =============================================================================
 * 
 * SQLite database connection and initialization.
 * Uses sql.js for pure JavaScript SQLite operations.
 * 
 * @module database/connection
 * @author HR Analytics Team
 * @version 1.0.0
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

// =============================================================================
// DATABASE CONFIGURATION
// =============================================================================

/**
 * Database file path
 * Stored in server/data directory
 */
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'hr_analytics.db');

/**
 * Database instance (singleton)
 * Initialized lazily on first access
 */
let db: SqlJsDatabase | null = null;
let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

// =============================================================================
// WRAPPER CLASS FOR BETTER-SQLITE3 COMPATIBILITY
// =============================================================================

/**
 * Wrapper class to provide better-sqlite3 compatible API
 */
export class DatabaseWrapper {
    private _db: SqlJsDatabase;
    private _inTransaction: boolean = false;

    constructor(database: SqlJsDatabase) {
        this._db = database;
    }

    prepare(sql: string) {
        const self = this;
        return {
            run(...params: any[]) {
                // Flatten params if first element is an array
                const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
                self._db.run(sql, flatParams);
                // Only save to file if not in transaction
                if (!self._inTransaction) {
                    self.saveToFile();
                }
                return { changes: self._db.getRowsModified(), lastInsertRowid: self.getLastInsertRowId() };
            },
            get(...params: any[]) {
                const stmt = self._db.prepare(sql);
                try {
                    // Flatten params if first element is an array
                    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
                    if (flatParams.length > 0) {
                        stmt.bind(flatParams);
                    }
                    if (stmt.step()) {
                        const row = stmt.getAsObject();
                        stmt.free();
                        return row;
                    }
                    stmt.free();
                    return undefined;
                } catch (error) {
                    stmt.free();
                    throw error;
                }
            },
            all(...params: any[]) {
                const results: any[] = [];
                const stmt = self._db.prepare(sql);
                try {
                    // Flatten params if first element is an array
                    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
                    if (flatParams.length > 0) {
                        stmt.bind(flatParams);
                    }
                    while (stmt.step()) {
                        results.push(stmt.getAsObject());
                    }
                    stmt.free();
                    return results;
                } catch (error) {
                    stmt.free();
                    throw error;
                }
            },
            bind(...params: any[]) {
                return this;
            }
        };
    }

    private getLastInsertRowId(): number {
        const result = this._db.exec("SELECT last_insert_rowid() as id");
        return result[0]?.values[0]?.[0] as number || 0;
    }

    exec(sql: string): void {
        this._db.run(sql);
        // Only save to file if not in transaction
        if (!this._inTransaction) {
            this.saveToFile();
        }
    }

    /**
     * Begin a transaction - disables auto-save until commit/rollback
     */
    beginTransaction(): void {
        this._db.run('BEGIN TRANSACTION');
        this._inTransaction = true;
    }

    /**
     * Commit transaction and save to file
     */
    commit(): void {
        this._db.run('COMMIT');
        this._inTransaction = false;
        this.saveToFile();
    }

    /**
     * Rollback transaction
     */
    rollback(): void {
        try {
            this._db.run('ROLLBACK');
        } catch (e) {
            // Ignore rollback errors if no transaction active
        }
        this._inTransaction = false;
    }

    /**
     * Check if currently in a transaction
     */
    get inTransaction(): boolean {
        return this._inTransaction;
    }

    pragma(pragma: string): any {
        try {
            const result = this._db.exec(`PRAGMA ${pragma}`);
            return result[0]?.values[0]?.[0];
        } catch {
            return undefined;
        }
    }

    close(): void {
        this.saveToFile();
        this._db.close();
    }

    private saveToFile(): void {
        try {
            const data = this._db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(DB_PATH, buffer);
        } catch (error) {
            logger.error('Failed to save database to file', { error });
        }
    }

    get raw(): SqlJsDatabase {
        return this._db;
    }
}

// =============================================================================
// CONNECTION FUNCTIONS
// =============================================================================

let dbWrapper: DatabaseWrapper | null = null;

/**
 * Initialize SQL.js
 */
async function initSQL(): Promise<void> {
    if (!SQL) {
        SQL = await initSqlJs();
    }
}

/**
 * Get database connection instance (async initialization)
 * Creates new connection if not exists, returns existing otherwise
 * 
 * @returns Database wrapper instance
 * @throws Error if database connection fails
 */
export async function initDatabase(): Promise<DatabaseWrapper> {
    if (!dbWrapper) {
        try {
            await initSQL();
            
            // Ensure data directory exists
            if (!fs.existsSync(DATA_DIR)) {
                fs.mkdirSync(DATA_DIR, { recursive: true });
                logger.info('Created data directory', { path: DATA_DIR });
            }

            logger.info('Initializing database connection', { path: DB_PATH });

            // Load existing database or create new one
            if (fs.existsSync(DB_PATH)) {
                const fileBuffer = fs.readFileSync(DB_PATH);
                db = new SQL!.Database(fileBuffer);
                logger.info('Loaded existing database');
            } else {
                db = new SQL!.Database();
                logger.info('Created new database');
            }

            dbWrapper = new DatabaseWrapper(db);

            // Enable foreign keys constraint
            dbWrapper.pragma('foreign_keys = ON');

            logger.info('Database connection established successfully');
        } catch (error) {
            logger.error('Failed to initialize database connection', { error });
            throw error;
        }
    }

    return dbWrapper;
}

/**
 * Get database connection instance (synchronous - must be initialized first)
 * 
 * @returns Database wrapper instance
 * @throws Error if database not initialized
 */
export function getDatabase(): DatabaseWrapper {
    if (!dbWrapper) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return dbWrapper;
}

/**
 * Close database connection
 * Should be called on application shutdown
 */
export function closeDatabase(): void {
    if (dbWrapper) {
        try {
            dbWrapper.close();
            dbWrapper = null;
            db = null;
            logger.info('Database connection closed');
        } catch (error) {
            logger.error('Error closing database connection', { error });
        }
    }
}

/**
 * Execute a database transaction
 * Automatically rolls back on error
 * 
 * @param callback - Function to execute within transaction
 * @returns Result of callback function
 * @throws Rethrows any error from callback after rollback
 */
export function executeTransaction<T>(callback: (db: DatabaseWrapper) => T): T {
    const database = getDatabase();

    try {
        database.beginTransaction();
        const result = callback(database);
        database.commit();
        return result;
    } catch (error) {
        database.rollback();
        logger.error('Transaction failed', { error });
        throw error;
    }
}

export default getDatabase;
