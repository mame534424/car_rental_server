import { CookieOptions, Response } from "express";
import { env, isProd } from "../config/env";
import { COOKIE_NAMES } from "../constants";
import { expiresInToMs } from "./jwt";

function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd, // requires HTTPS in production
    sameSite: isProd ? "none" : "lax",
    domain: env.COOKIE_DOMAIN,
    path: "/",
  };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie(COOKIE_NAMES.ACCESS_TOKEN, accessToken, {
    ...baseCookieOptions(),
    maxAge: expiresInToMs(env.JWT_ACCESS_EXPIRES_IN),
  });
  res.cookie(COOKIE_NAMES.REFRESH_TOKEN, refreshToken, {
    ...baseCookieOptions(),
    maxAge: expiresInToMs(env.JWT_REFRESH_EXPIRES_IN),
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, baseCookieOptions());
  res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, baseCookieOptions());
}
