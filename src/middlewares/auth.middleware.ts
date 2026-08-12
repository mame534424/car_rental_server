import { NextFunction, Request, Response } from "express";
import { COOKIE_NAMES } from "../constants";
import { ApiError } from "../utils/ApiError";
import { verifyAccessToken } from "../utils/jwt";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: { adminId: string; email: string };
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAMES.ACCESS_TOKEN];

  if (!token) {
    return next(ApiError.unauthorized("Not authenticated"));
  }

  try {
    const payload = verifyAccessToken(token);
    req.admin = { adminId: payload.adminId, email: payload.email };
    next();
  } catch {
    next(ApiError.unauthorized("Session expired, please log in again"));
  }
}
