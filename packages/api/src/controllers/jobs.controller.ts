import type { Request, Response, NextFunction } from 'express';
import type { CarSearchParams } from '@trippulse/shared';
import { createCarSearchJob, getJobById } from '../services/job.service';

export async function createCarSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = req.body as CarSearchParams;
    const job = await createCarSearchJob(params);
    res.status(202).json({
      jobId: job.id,
      status: job.status,
      statusUrl: `/jobs/${job.id}`,
      offersUrl: `/offers/cars?jobId=${job.id}`,
      estimatedWaitMs: 5000,
    });
  } catch (err) {
    next(err);
  }
}

export async function getJob(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params['id'];
    if (!id) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Missing job id' } });
      return;
    }
    const job = await getJobById(id);
    res.json({
      id: job.id,
      status: job.status,
      params: job.params,
      providers: job.providers,
      offerCount: job._count.carOffers,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    });
  } catch (err) {
    next(err);
  }
}
