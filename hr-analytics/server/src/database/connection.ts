/**
 * =============================================================================
 * HR Analytics Backend - Database Connection
 * =============================================================================
 * 
 * SQLite database connection and initialization.
 * Uses better-sqlite3 for synchronous, fast database operations.
 * 
 * @module database/connection
 * @author HR Analytics Team
 * @version 1.0.0
 */

import Database from 'better-sqlite3';
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
let db: Database.Database | null = null;

// =============================================================================
// CONNECTION FUNCTIONS
// =============================================================================

/**
 * Get database connection instance
 * Creates new connection if not exists, returns existing otherwise
 * 
 * @returns Database instance
 * @throws Error if database connection fails
 * 
 * @example
 * const db = getDatabase();
 * const users = db.prepare('SELECT * FROM employees').all();
 */
export function getDatabase(): Database.Database {
    if (!db) {
        try {
            // Ensure data directory exists
            if (!fs.existsSync(DATA_DIR)) {
                fs.mkdirSync(DATA_DIR, { recursive: true });
                logger.info('Created data directory', { path: DATA_DIR });
            }

            logger.info('Initializing database connection', { path: DB_PATH });

            // Create database instance with WAL mode for better performance
            db = new Database(DB_PATH);

            // Enable foreign keys constraint
            db.pragma('foreign_keys = ON');

            // Enable WAL mode for better concurrent access
            db.pragma('journal_mode = WAL');

            logger.info('Database connection established successfully');
        } catch (error) {
            logger.error('Failed to initialize database connection', { error });
            throw error;
        }
    }

    return db;
}

/**
 * Close database connection
 * Should be called on application shutdown
 */
export function closeDatabase(): void {
    if (db) {
        try {
            db.close();
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
 * 
 * @example
 * const result = executeTransaction((db) => {
 *   db.prepare('INSERT INTO employees ...').run();
 *   db.prepare('INSERT INTO time_records ...').run();
 *   return { success: true };
 * });
 */
export function executeTransaction<T>(callback: (db: Database.Database) => T): T {
    const database = getDatabase();

    try {
        database.exec('BEGIN TRANSACTION');
        const result = callback(database);
        database.exec('COMMIT');
        return result;
    } catch (error) {
        database.exec('ROLLBACK');
        logger.error('Transaction rolled back due to error', { error });
        throw error;
    }
}

export default getDatabase;
