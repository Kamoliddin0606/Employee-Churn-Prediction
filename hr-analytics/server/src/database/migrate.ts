/**
 * =============================================================================
 * HR Analytics Backend - Database Migrations
 * =============================================================================
 * 
 * Database schema migrations for creating and updating tables.
 * Run with: npm run migrate
 * 
 * @module database/migrate
 * @author HR Analytics Team
 * @version 1.0.0
 */

import { getDatabase, closeDatabase } from './connection';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

// =============================================================================
// MIGRATION DEFINITIONS
// =============================================================================

/**
 * Array of migration SQL statements
 * Each migration creates or modifies database tables
 * Executed in order during migration
 */
const migrations: string[] = [
  // ---------------------------------------------------------------------------
  // Migration 1: Create organizations table
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,

  // ---------------------------------------------------------------------------
  // Migration 2: Create departments table
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    organization_id INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    UNIQUE(name, organization_id)
  )`,

  // ---------------------------------------------------------------------------
  // Migration 3: Create employees table
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    department_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (department_id) REFERENCES departments(id)
  )`,

  // ---------------------------------------------------------------------------
  // Migration 4: Create work_schedules table
  // Supports organization, department, and employee level schedules
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS work_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT NOT NULL CHECK(target_type IN ('organization', 'department', 'employee')),
    target_id INTEGER NOT NULL,
    work_start TEXT NOT NULL DEFAULT '09:00',
    work_end TEXT NOT NULL DEFAULT '18:00',
    late_tolerance INTEGER NOT NULL DEFAULT 5,
    work_days TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
    valid_from TEXT,
    valid_to TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(target_type, target_id, valid_from)
  )`,

  // ---------------------------------------------------------------------------
  // Migration 5: Create schedule_exceptions table
  // For holidays, sick days, special cases
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS schedule_exceptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('holiday', 'sick', 'special', 'off')),
    employee_ids TEXT NOT NULL,
    date TEXT NOT NULL,
    work_start TEXT,
    work_end TEXT,
    reason TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  // ---------------------------------------------------------------------------
  // Migration 6: Create time_records table
  // Daily check-in/check-out from terminal
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS time_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    check_in TEXT,
    check_out TEXT,
    late_minutes INTEGER NOT NULL DEFAULT 0,
    early_leave_minutes INTEGER NOT NULL DEFAULT 0,
    total_work_minutes INTEGER NOT NULL DEFAULT 0,
    import_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (import_id) REFERENCES import_history(id),
    UNIQUE(employee_id, date)
  )`,

  // ---------------------------------------------------------------------------
  // Migration 7: Create attendance_records table
  // Status codes from Monthly Details Excel
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS attendance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    status_code TEXT NOT NULL CHECK(status_code IN ('W', 'L', 'E', 'LE', 'A', 'NS', 'H')),
    is_violation INTEGER NOT NULL DEFAULT 0,
    import_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (import_id) REFERENCES import_history(id),
    UNIQUE(employee_id, date)
  )`,

  // ---------------------------------------------------------------------------
  // Migration 8: Create violation_summary table
  // Monthly aggregated statistics per employee
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS violation_summary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    total_late_minutes INTEGER NOT NULL DEFAULT 0,
    total_early_leave_minutes INTEGER NOT NULL DEFAULT 0,
    late_count INTEGER NOT NULL DEFAULT 0,
    early_leave_count INTEGER NOT NULL DEFAULT 0,
    absent_count INTEGER NOT NULL DEFAULT 0,
    violation_count INTEGER NOT NULL DEFAULT 0,
    calculation_level TEXT NOT NULL DEFAULT 'full',
    calculated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    UNIQUE(employee_id, year, month)
  )`,

  // ---------------------------------------------------------------------------
  // Migration 9: Create import_history table
  // Tracks all Excel imports
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS import_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK(file_type IN ('details', 'checkinout')),
    import_date TEXT DEFAULT (datetime('now')),
    records_count INTEGER NOT NULL DEFAULT 0,
    new_employees INTEGER NOT NULL DEFAULT 0,
    updated_records INTEGER NOT NULL DEFAULT 0,
    errors TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  // ---------------------------------------------------------------------------
  // Migration 10: Create calculation_settings table
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS calculation_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    level TEXT NOT NULL DEFAULT 'full' CHECK(level IN ('organization', 'department', 'employee', 'full')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,

  // ---------------------------------------------------------------------------
  // Migration 11: Insert default organization
  // ---------------------------------------------------------------------------
  `INSERT OR IGNORE INTO organizations (id, name) VALUES (1, 'Gloriya')`,

  // ---------------------------------------------------------------------------
  // Migration 12: Insert default organization schedule
  // ---------------------------------------------------------------------------
  `INSERT OR IGNORE INTO work_schedules (target_type, target_id, work_start, work_end, late_tolerance, work_days)
   VALUES ('organization', 1, '09:00', '18:00', 5, '[1,2,3,4,5]')`,

  // ---------------------------------------------------------------------------
  // Migration 13: Insert default calculation settings
  // ---------------------------------------------------------------------------
  `INSERT OR IGNORE INTO calculation_settings (id, level) VALUES (1, 'full')`,

  // ---------------------------------------------------------------------------
  // Migration 14: Create indexes for better query performance
  // ---------------------------------------------------------------------------
  `CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id)`,
  `CREATE INDEX IF NOT EXISTS idx_employees_external_id ON employees(external_id)`,
  `CREATE INDEX IF NOT EXISTS idx_time_records_employee_date ON time_records(employee_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_time_records_date ON time_records(date)`,
  `CREATE INDEX IF NOT EXISTS idx_attendance_records_employee_date ON attendance_records(employee_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records(date)`,
  `CREATE INDEX IF NOT EXISTS idx_work_schedules_target ON work_schedules(target_type, target_id)`,
  `CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_date ON schedule_exceptions(date)`,
  `CREATE INDEX IF NOT EXISTS idx_violation_summary_employee ON violation_summary(employee_id, year, month)`
];

// =============================================================================
// MIGRATION EXECUTION
// =============================================================================

/**
 * Run all database migrations
 * Creates tables and indexes if they don't exist
 */
export function runMigrations(): void {
  const db = getDatabase();

  logger.info('Starting database migrations...');

  try {
    // Execute each migration
    for (let i = 0; i < migrations.length; i++) {
      try {
        db.exec(migrations[i]);
        logger.debug(`Migration ${i + 1}/${migrations.length} completed`);
      } catch (error) {
        logger.error(`Migration ${i + 1} failed`, { error, sql: migrations[i].substring(0, 100) });
        throw error;
      }
    }

    logger.info(`All ${migrations.length} migrations completed successfully`);
  } catch (error) {
    logger.error('Migration failed', { error });
    throw error;
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  try {
    runMigrations();
    logger.info('Migration script completed');
    closeDatabase();
  } catch (error) {
    logger.error('Migration script failed', { error });
    process.exit(1);
  }
}

export default runMigrations;
