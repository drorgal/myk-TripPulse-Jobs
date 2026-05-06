import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ValidationError } from '@trippulse/shared';

// Duck-typed Zod schema — avoids importing 'zod' directly in the API package.
interface ParseableSchema {
  safeParse(data: unknown):
    | { success: true; data: unknown }
    | { success: false; error: { flatten(): { fieldErrors: Record<string, string[] | undefined> } } };
}

export function validate(schema: ParseableSchema): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      return next(new ValidationError(JSON.stringify(fieldErrors)));
    }
    req.body = result.data as unknown;
    return next();
  };
}
