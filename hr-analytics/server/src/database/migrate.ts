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
  // Migration 14: Create employee_compensation table
  // Stores monthly KPI and salary data for penalty calculations
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS employee_compensation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
    
    -- Compensation details
    base_salary REAL NOT NULL CHECK(base_salary >= 0),
    kpi_amount REAL NOT NULL CHECK(kpi_amount >= 0),
    total_salary REAL GENERATED ALWAYS AS (base_salary + kpi_amount) STORED,
    
    -- Additional fields for future use
    bonus REAL DEFAULT 0 CHECK(bonus >= 0),
    deductions REAL DEFAULT 0 CHECK(deductions >= 0),
    notes TEXT,
    
    -- Audit timestamps
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    
    -- Constraints
    UNIQUE(employee_id, year, month),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
  )`,

  // ---------------------------------------------------------------------------
  // Migration 15: Create indexes for better query performance
  // ---------------------------------------------------------------------------
  `CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id)`,
  `CREATE INDEX IF NOT EXISTS idx_employees_external_id ON employees(external_id)`,
  `CREATE INDEX IF NOT EXISTS idx_time_records_employee_date ON time_records(employee_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_time_records_date ON time_records(date)`,
  `CREATE INDEX IF NOT EXISTS idx_attendance_records_employee_date ON attendance_records(employee_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records(date)`,
  `CREATE INDEX IF NOT EXISTS idx_work_schedules_target ON work_schedules(target_type, target_id)`,
  `CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_date ON schedule_exceptions(date)`,
  `CREATE INDEX IF NOT EXISTS idx_violation_summary_employee ON violation_summary(employee_id, year, month)`,
  `CREATE INDEX IF NOT EXISTS idx_compensation_employee ON employee_compensation(employee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_compensation_period ON employee_compensation(year, month)`,

  // Performance indexes for year/month queries
  `CREATE INDEX IF NOT EXISTS idx_time_records_year_month ON time_records(strftime('%Y-%m', date))`,
  `CREATE INDEX IF NOT EXISTS idx_attendance_records_year_month ON attendance_records(strftime('%Y-%m', date))`,

  // ---------------------------------------------------------------------------
  // Migration 28: Create penalty_rules table
  // Configurable penalty rules per month (dynamic thresholds and amounts)
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS penalty_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
    level INTEGER NOT NULL CHECK(level >= 1),
    penalty_type TEXT NOT NULL CHECK(penalty_type IN ('fine', 'kpi_zero', 'termination')),
    fine_amount REAL DEFAULT 0 CHECK(fine_amount >= 0),
    kpi_months INTEGER DEFAULT 0 CHECK(kpi_months >= 0),
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(year, month, level)
  )`,

  // ---------------------------------------------------------------------------
  // Migration 29: Create employee_penalties table
  // Applied penalties per employee per month
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS employee_penalties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
    late_count INTEGER NOT NULL DEFAULT 0,
    total_fine REAL NOT NULL DEFAULT 0 CHECK(total_fine >= 0),
    kpi_zeroed INTEGER NOT NULL DEFAULT 0,
    kpi_zeroed_months INTEGER NOT NULL DEFAULT 0,
    termination_recommended INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    calculated_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(employee_id, year, month),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
  )`,

  // ---------------------------------------------------------------------------
  // Migration 30: Create kpi_zero_records table
  // Tracks KPI zeroing across months (for cross-month penalties)
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS kpi_zero_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    target_year INTEGER NOT NULL,
    target_month INTEGER NOT NULL CHECK(target_month >= 1 AND target_month <= 12),
    source_year INTEGER NOT NULL,
    source_month INTEGER NOT NULL CHECK(source_month >= 1 AND source_month <= 12),
    reason TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(employee_id, target_year, target_month, source_year, source_month),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
  )`,

  // ---------------------------------------------------------------------------
  // Migration 31: Create penalty_details table
  // Itemized penalty breakdown per employee
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS penalty_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    penalty_id INTEGER NOT NULL,
    level INTEGER NOT NULL,
    penalty_type TEXT NOT NULL CHECK(penalty_type IN ('fine', 'kpi_zero', 'termination')),
    amount REAL DEFAULT 0,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (penalty_id) REFERENCES employee_penalties(id) ON DELETE CASCADE
  )`,

  // ---------------------------------------------------------------------------
  // Migration 32: Create indexes for penalty tables
  // ---------------------------------------------------------------------------
  `CREATE INDEX IF NOT EXISTS idx_penalty_rules_period ON penalty_rules(year, month)`,
  `CREATE INDEX IF NOT EXISTS idx_employee_penalties_employee ON employee_penalties(employee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_employee_penalties_period ON employee_penalties(year, month)`,
  `CREATE INDEX IF NOT EXISTS idx_kpi_zero_records_employee ON kpi_zero_records(employee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_kpi_zero_records_target ON kpi_zero_records(target_year, target_month)`,
  `CREATE INDEX IF NOT EXISTS idx_penalty_details_penalty ON penalty_details(penalty_id)`,

  // ---------------------------------------------------------------------------
  // Migration 33: Insert default penalty rules for current year
  // Default rules: 1-3 = fines, 4 = 1 month KPI, 5 = 2 months KPI, 6+ = termination
  // ---------------------------------------------------------------------------
  `INSERT OR IGNORE INTO penalty_rules (year, month, level, penalty_type, fine_amount, kpi_months, description)
   SELECT 2026, m.month, 1, 'fine', 100000, 0, '1-marta kech qolish jarimasi'
   FROM (SELECT 1 AS month UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 
         UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12) m`,
  
  `INSERT OR IGNORE INTO penalty_rules (year, month, level, penalty_type, fine_amount, kpi_months, description)
   SELECT 2026, m.month, 2, 'fine', 150000, 0, '2-marta kech qolish jarimasi'
   FROM (SELECT 1 AS month UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 
         UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12) m`,

  `INSERT OR IGNORE INTO penalty_rules (year, month, level, penalty_type, fine_amount, kpi_months, description)
   SELECT 2026, m.month, 3, 'fine', 200000, 0, '3-marta kech qolish jarimasi'
   FROM (SELECT 1 AS month UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 
         UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12) m`,

  `INSERT OR IGNORE INTO penalty_rules (year, month, level, penalty_type, fine_amount, kpi_months, description)
   SELECT 2026, m.month, 4, 'kpi_zero', 0, 1, '4-marta kech qolish - joriy oy KPI nollanadi'
   FROM (SELECT 1 AS month UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 
         UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12) m`,

  `INSERT OR IGNORE INTO penalty_rules (year, month, level, penalty_type, fine_amount, kpi_months, description)
   SELECT 2026, m.month, 5, 'kpi_zero', 0, 2, '5-marta kech qolish - joriy va keyingi oy KPI nollanadi'
   FROM (SELECT 1 AS month UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 
         UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12) m`,

  `INSERT OR IGNORE INTO penalty_rules (year, month, level, penalty_type, fine_amount, kpi_months, description)
   SELECT 2026, m.month, 6, 'termination', 0, 0, '6+ marta kech qolish - ishdan bo''shatish tavsiyasi'
   FROM (SELECT 1 AS month UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 
         UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12) m`,

  // ---------------------------------------------------------------------------
  // Migration 39: Add violation breakdown columns to employee_penalties
  // Tracks individual violation counts for reporting
  // ---------------------------------------------------------------------------
  `ALTER TABLE employee_penalties ADD COLUMN early_leave_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE employee_penalties ADD COLUMN absent_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE employee_penalties ADD COLUMN total_violations INTEGER NOT NULL DEFAULT 0`,

  // ---------------------------------------------------------------------------
  // Migration 40: Create missing_time_settings table
  // Configures how missing check-in/check-out times are handled
  // 
  // Handling Types:
  //   Type 1: Yo'q vaqt = to'liq ishlanmagan kun (full absent)
  //           Kirish/chiqish yo'q bo'lsa, kun ishlanmagan hisoblanadi
  //           va to'liq ish vaqti kech qolish sifatida yoziladi
  //   
  //   Type 2: Avtomatik to'ldirish (auto-fill with penalty)
  //           Kirish yo'q bo'lsa: jadval_vaqti + penalty_minutes
  //           Chiqish yo'q bo'lsa: jadval_vaqti - penalty_minutes
  //           Ikkalasi yo'q bo'lsa: ish joyida bo'lmagan (not_at_workplace)
  //
  // Priority: employee > department > organization (cascading resolution)
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS missing_time_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT NOT NULL CHECK(target_type IN ('organization', 'department', 'employee')),
    target_id INTEGER NOT NULL,
    handling_type INTEGER NOT NULL DEFAULT 1 CHECK(handling_type IN (1, 2)),
    missing_checkin_penalty_minutes INTEGER NOT NULL DEFAULT 60,
    missing_checkout_penalty_minutes INTEGER NOT NULL DEFAULT 120,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(target_type, target_id)
  )`,

  // ---------------------------------------------------------------------------
  // Migration 41: Create index for missing_time_settings
  // Optimizes priority-based lookups
  // ---------------------------------------------------------------------------
  `CREATE INDEX IF NOT EXISTS idx_missing_time_settings_target 
   ON missing_time_settings(target_type, target_id)`,

  // ---------------------------------------------------------------------------
  // Migration 42: Add columns to time_records for tracking auto-filled times
  // These columns preserve original NULL values and track auto-fill status
  // ---------------------------------------------------------------------------
  `ALTER TABLE time_records ADD COLUMN is_auto_filled INTEGER DEFAULT 0`,
  `ALTER TABLE time_records ADD COLUMN missing_type TEXT CHECK(missing_type IN ('check_in', 'check_out', 'both', NULL))`,
  `ALTER TABLE time_records ADD COLUMN original_check_in TEXT`,
  `ALTER TABLE time_records ADD COLUMN original_check_out TEXT`,

  // ---------------------------------------------------------------------------
  // Migration 43: Add not_at_workplace columns to violation_summary
  // Tracks separate statistics for employees who were not at workplace
  // (both check_in and check_out missing on work days)
  // ---------------------------------------------------------------------------
  `ALTER TABLE violation_summary ADD COLUMN not_at_workplace_count INTEGER DEFAULT 0`,
  `ALTER TABLE violation_summary ADD COLUMN not_at_workplace_minutes INTEGER DEFAULT 0`,

  // ---------------------------------------------------------------------------
  // Migration 44: Add not_at_workplace_count to employee_penalties
  // For penalty calculation to include not_at_workplace violations
  // ---------------------------------------------------------------------------
  `ALTER TABLE employee_penalties ADD COLUMN not_at_workplace_count INTEGER DEFAULT 0`,

  // ---------------------------------------------------------------------------
  // Migration 45: Insert default organization-level missing time setting
  // Default: Type 1 (full absent when check-in/check-out missing)
  // ---------------------------------------------------------------------------
  `INSERT OR IGNORE INTO missing_time_settings 
   (target_type, target_id, handling_type, missing_checkin_penalty_minutes, missing_checkout_penalty_minutes)
   VALUES ('organization', 1, 1, 60, 120)`
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
      } catch (error: unknown) {
        const sqlError = error as { code?: string; message?: string };
        const sql = migrations[i];
        
        // Skip ALTER TABLE errors if column already exists (duplicate column name)
        if (sql.includes('ALTER TABLE') && sql.includes('ADD COLUMN') && 
            sqlError.message?.includes('duplicate column name')) {
          logger.debug(`Migration ${i + 1}/${migrations.length} skipped (column already exists)`);
          continue;
        }
        
        logger.error(`Migration ${i + 1} failed`, { error, sql: sql.substring(0, 100) });
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
