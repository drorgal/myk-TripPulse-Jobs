import { Router } from 'express';
import { getCarsOffers } from '../controllers/offers.controller';

export const offersRouter = Router();

offersRouter.get('/cars', getCarsOffers);
