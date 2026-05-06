import { Router } from 'express';
import { CarSearchParamsSchema } from '@trippulse/shared';
import { validate } from '../middleware/validate';
import { createCarSearch, getJob } from '../controllers/jobs.controller';

export const jobsRouter = Router();

jobsRouter.post('/car-search', validate(CarSearchParamsSchema), createCarSearch);
jobsRouter.get('/:id', getJob);
