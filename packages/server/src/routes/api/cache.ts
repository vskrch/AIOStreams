import { Router, Request, Response, NextFunction } from 'express';
import { createResponse } from '../../utils/responses';
import { Cache } from '@aiostreams/core';
import { APIError, constants } from '@aiostreams/core';

const router = Router();

router.get('/stats', (req: Request, res: Response) => {
  const stats = Cache.getStatsObject();
  res.status(200).json(createResponse({ success: true, data: stats }));
});

router.post('/clear', (req: Request, res: Response, next: NextFunction) => {
  const { name } = req.query;
  if (name && typeof name !== 'string') {
    next(
      new APIError(
        constants.ErrorCode.MISSING_REQUIRED_FIELDS,
        undefined,
        'name must be a string'
      )
    );
    return;
  }

  if (typeof name === 'string') {
    const exists = Cache.getStatsObject().some((s) => s.name === name);
    if (exists) {
      Cache.getInstance(name).clear();
    }
  } else {
    Cache.clearAllInstances();
  }

  res.status(200).json(createResponse({ success: true }));
});

export default router;
