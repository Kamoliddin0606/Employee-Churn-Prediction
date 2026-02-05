/**
 * =============================================================================
 * HR Analytics Backend - Logger Utility
 * =============================================================================
 * 
 * Winston-based logging utility for consistent logging across the application.
 * Provides structured logging with timestamps, log levels, and context.
 * 
 * @module utils/logger
 * @author HR Analytics Team
 * @version 1.0.0
 */

import winston from 'winston';

/**
 * Log format configuration
 * Combines timestamp, log level, and message in a readable format
 */
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        // Include metadata if present
        const metaString = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaString}`;
    })
);

/**
 * Main logger instance
 * 
 * Usage:
 * - logger.info('Message') - Informational messages
 * - logger.error('Error message', error) - Error logging with stack trace
 * - logger.warn('Warning') - Warning messages
 * - logger.debug('Debug info') - Debug information (development only)
 */
export const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: logFormat,
    transports: [
        // Console output with colors
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                logFormat
            )
        }),
        // File output for errors
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // File output for all logs
        new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ]
});

/**
 * Create a child logger with specific context
 * Useful for adding module-specific metadata to all log messages
 * 
 * @param context - Context name (e.g., 'ScheduleResolver', 'ExcelParser')
 * @returns Child logger instance with context metadata
 * 
 * @example
 * const log = createContextLogger('ScheduleResolver');
 * log.info('Resolving schedule for employee', { employeeId: 123 });
 */
export function createContextLogger(context: string) {
    return logger.child({ context });
}

export default logger;
