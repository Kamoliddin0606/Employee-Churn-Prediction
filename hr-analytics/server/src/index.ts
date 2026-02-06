/**
 * =============================================================================
 * HR Analytics Backend - Express Server Entry Point
 * =============================================================================
 * 
 * Main application entry point. Initializes Express server with:
 * - CORS configuration
 * - JSON body parsing
 * - API routes
 * - Error handling middleware
 * 
 * @module index
 * @author HR Analytics Team
 * @version 1.0.0
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';

import { logger } from './utils/logger';
import { runMigrations } from './database/migrate';
import { closeDatabase, initDatabase } from './database/connection';

// Import routes
import employeesRouter from './routes/employees';
import departmentsRouter from './routes/departments';
import schedulesRouter from './routes/schedules';
import importRouter from './routes/import';
import settingsRouter from './routes/settings';
import violationsRouter from './routes/violations';
import compensationRouter from './routes/compensation';
import penaltiesRouter from './routes/penalties';
import missingTimeSettingsRouter from './routes/missingTimeSettings';
import dbExplorerRouter from './routes/dbExplorer';
import timeRecordsRouter from './routes/timeRecords';

// =============================================================================
// SERVER CONFIGURATION
// =============================================================================

/**
 * Server port
 * Can be overridden with PORT environment variable
 */
const PORT = process.env.PORT || 3001;

/**
 * Express application instance
 */
const app: Express = express();

// =============================================================================
// MIDDLEWARE SETUP
// =============================================================================

/**
 * CORS configuration
 * Allows requests from frontend development server
 */
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

/**
 * JSON body parser
 * Limit set to 10mb for Excel file uploads
 */
app.use(express.json({ limit: '10mb' }));

/**
 * URL-encoded body parser
 */
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * Request logging middleware
 * Logs all incoming requests with method, path, and duration
 */
app.use((req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.info(`${req.method} ${req.path}`, {
            status: res.statusCode,
            duration: `${duration}ms`,
            query: Object.keys(req.query).length > 0 ? req.query : undefined
        });
    });

    next();
});

// =============================================================================
// API ROUTES
// =============================================================================

/**
 * Health check endpoint
 * Returns server status and timestamp
 */
app.get('/api/health', (req: Request, res: Response) => {
    res.json({
        success: true,
        message: 'HR Analytics API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

/**
 * Mount API routers
 * All routes are prefixed with /api
 */
app.use('/api/employees', employeesRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/import', importRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/violations', violationsRouter);
app.use('/api/compensation', compensationRouter);
app.use('/api/penalties', penaltiesRouter);
app.use('/api/missing-time-settings', missingTimeSettingsRouter);
app.use('/api/db-explorer', dbExplorerRouter);
app.use('/api/time-records', timeRecordsRouter);

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * 404 handler
 * Catches requests to non-existent endpoints
 */
app.use((req: Request, res: Response) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path
    });
});

/**
 * Global error handler
 * Catches and logs all unhandled errors
 */
app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method
    });

    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : error.message
    });
});

// =============================================================================
// SERVER INITIALIZATION
// =============================================================================

/**
 * Initialize and start the server
 */
async function startServer(): Promise<void> {
    try {
        // Initialize database first
        logger.info('Initializing database...');
        await initDatabase();
        
        // Run database migrations
        logger.info('Running database migrations...');
        runMigrations();

        // Start Express server
        app.listen(PORT, () => {
            logger.info(`🚀 HR Analytics API server started`, {
                port: PORT,
                environment: process.env.NODE_ENV || 'development',
                url: `http://localhost:${PORT}`
            });
            logger.info('Available endpoints:');
            logger.info('  GET  /api/health');
            logger.info('  GET  /api/employees');
            logger.info('  GET  /api/departments');
            logger.info('  GET  /api/schedules');
            logger.info('  POST /api/import/upload');
            logger.info('  POST /api/import/recalculate');
            logger.info('  GET  /api/settings/calculation');
            logger.info('  GET  /api/violations/summary');
            logger.info('  POST /api/violations/calculate');
            logger.info('  GET  /api/penalties');
            logger.info('  POST /api/penalties/calculate');
        });
    } catch (error) {
        logger.error('Failed to start server', { error });
        process.exit(1);
    }
}

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

/**
 * Handle process termination signals
 * Closes database connection before exit
 */
process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    closeDatabase();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    closeDatabase();
    process.exit(0);
});

// Start the server
startServer();

export default app;
