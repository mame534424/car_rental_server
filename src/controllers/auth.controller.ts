import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { COOKIE_NAMES } from "../constants";
import { ApiError } from "../utils/ApiError";
import { sendSuccess } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { clearAuthCookies, setAuthCookies } from "../utils/cookies";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt";

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  const isValid = await bcrypt.compare(password, admin.password);
  if (!isValid) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  const accessToken = signAccessToken({ adminId: admin.id, email: admin.email });
  const refreshToken = signRefreshToken({ adminId: admin.id });
  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

  await prisma.admin.update({
    where: { id: admin.id },
    data: { refreshTokenHash },
  });

  setAuthCookies(res, accessToken, refreshToken);

  return sendSuccess(res, {
    admin: { id: admin.id, name: admin.name, email: admin.email },
  }, "Logged in successfully");
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[COOKIE_NAMES.REFRESH_TOKEN];
  if (!token) {
    throw ApiError.unauthorized("No refresh token provided");
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw ApiError.unauthorized("Refresh token invalid or expired");
  }

  const admin = await prisma.admin.findUnique({ where: { id: payload.adminId } });
  if (!admin || !admin.refreshTokenHash) {
    throw ApiError.unauthorized("Session no longer valid");
  }

  const matches = await bcrypt.compare(token, admin.refreshTokenHash);
  if (!matches) {
    throw ApiError.unauthorized("Session no longer valid");
  }

  const accessToken = signAccessToken({ adminId: admin.id, email: admin.email });
  const newRefreshToken = signRefreshToken({ adminId: admin.id });
  const refreshTokenHash = await bcrypt.hash(newRefreshToken, 10);

  await prisma.admin.update({
    where: { id: admin.id },
    data: { refreshTokenHash },
  });

  setAuthCookies(res, accessToken, newRefreshToken);

  return sendSuccess(res, null, "Token refreshed");
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  if (req.admin) {
    await prisma.admin.update({
      where: { id: req.admin.adminId },
      data: { refreshTokenHash: null },
    });
  }
  clearAuthCookies(res);
  return sendSuccess(res, null, "Logged out");
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const admin = await prisma.admin.findUnique({
    where: { id: req.admin!.adminId },
    select: { id: true, name: true, email: true },
  });
  return sendSuccess(res, admin);
});
