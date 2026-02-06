/**
 * =============================================================================
 * Dashboard API Routes
 * =============================================================================
 * 
 * RESTful API endpoints for dashboard statistics and charts data.
 * Provides optimized, pre-aggregated data for frontend visualization.
 * 
 * Endpoints:
 * - GET /api/dashboard/stats    - Get dashboard statistics
 * - GET /api/dashboard/charts   - Get charts data
 * 
 * @module routes/dashboard
 * @author HR Analytics Team
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import { createContextLogger } from '../utils/logger';
import {
    getDashboardData,
    getStatusDistribution,
    getDailyTrend
} from '../services/dashboardService';

// Create router instance
const router = Router();

// Create context-specific logger
const log = createContextLogger('DashboardAPI');

// =============================================================================
// GET /api/dashboard/stats - Get Dashboard Statistics
// =============================================================================

/**
 * Get comprehensive dashboard statistics
 * 
 * Query parameters:
 * - dateFrom: Optional start date (YYYY-MM-DD)
 * - dateTo: Optional end date (YYYY-MM-DD)
 * - departmentId: Optional department filter
 * 
 * @example
 * GET /api/dashboard/stats?dateFrom=2026-01-01&dateTo=2026-01-31&departmentId=5
 */
router.get('/stats', (req: Request, res: Response) => {
    try {
        const { dateFrom, dateTo, departmentId } = req.query;

        log.info('Fetching dashboard statistics', {
            dateFrom,
            dateTo,
            departmentId
        });

        // Get dashboard data from service
        const data = getDashboardData(
            dateFrom as string | undefined,
            dateTo as string | undefined,
            departmentId ? parseInt(departmentId as string) : undefined
        );

        log.info('Dashboard statistics fetched successfully', {
            totalEmployees: data.stats.totalEmployees,
            totalViolations: data.stats.totalViolations
        });

        res.json({
            success: true,
            data
        });
    } catch (error) {
        log.error('Failed to fetch dashboard statistics', { error });
        res.status(500).json({
            success: false,
            error: 'Dashboard statistikasini yuklashda xatolik'
        });
    }
});

// =============================================================================
// GET /api/dashboard/charts - Get Charts Data
// =============================================================================

/**
 * Get data for various chart types
 * 
 * Query parameters:
 * - type: Required - 'status' | 'trend' | 'all'
 * - dateFrom: Optional start date (YYYY-MM-DD)
 * - dateTo: Optional end date (YYYY-MM-DD)
 * 
 * @example
 * GET /api/dashboard/charts?type=status&dateFrom=2026-01-01&dateTo=2026-01-31
 */
router.get('/charts', (req: Request, res: Response) => {
    try {
        const { type, dateFrom, dateTo } = req.query;

        if (!type) {
            return res.status(400).json({
                success: false,
                error: 'Chart type is required (status, trend, or all)'
            });
        }

        log.info('Fetching charts data', { type, dateFrom, dateTo });

        let data: any = {};

        // Get status distribution
        if (type === 'status' || type === 'all') {
            data.statusDistribution = getStatusDistribution(
                dateFrom as string | undefined,
                dateTo as string | undefined
            );
        }

        // Get daily trend
        if (type === 'trend' || type === 'all') {
            if (!dateFrom || !dateTo) {
                return res.status(400).json({
                    success: false,
                    error: 'dateFrom and dateTo are required for trend chart'
                });
            }

            data.dailyTrend = getDailyTrend(
                dateFrom as string,
                dateTo as string
            );
        }

        log.info('Charts data fetched successfully', {
            type,
            recordCount: type === 'status' 
                ? data.statusDistribution?.length 
                : data.dailyTrend?.length
        });

        res.json({
            success: true,
            data
        });
    } catch (error) {
        log.error('Failed to fetch charts data', { error });
        res.status(500).json({
            success: false,
            error: 'Grafik ma\'lumotlarini yuklashda xatolik'
        });
    }
});

export default router;
