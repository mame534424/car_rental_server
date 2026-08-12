import { NextFunction, Request, Response } from "express";
import { AnyZodObject, ZodError } from "zod";
import { ApiError } from "../utils/ApiError";

export const validate =
  (schema: AnyZodObject) => (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      req.body = parsed.body ?? req.body;
      req.params = (parsed.params as typeof req.params) ?? req.params;
      // query is left as-is (Express 5 / some setups make req.query read-only)
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        // Key errors by the leaf field name (drop the body/query/params prefix)
        // so clients receive { fieldName: [messages] } instead of { body: [...] }.
        const details: Record<string, string[]> = {};
        for (const issue of err.issues) {
          const key = issue.path.slice(1).join(".") || issue.path.join(".") || "form";
          if (!details[key]) details[key] = [];
          details[key].push(issue.message);
        }
        return next(ApiError.badRequest("Validation failed", details));
      }
      next(err);
    }
  };
