import type { CookieOptions, Response } from "express";
import jwt from "jsonwebtoken";
import type { AppConfig } from "../config/env.js";

export interface SessionClaims extends jwt.JwtPayload {
  sub: string;
  email: string;
}

export function issueSession(user: { id: string; email: string }, config: AppConfig): string {
  return jwt.sign({ email: user.email }, config.JWT_SECRET, {
    subject: user.id,
    expiresIn: `${config.JWT_TTL_DAYS}d`,
    issuer: "cruxer-api",
    audience: "cruxer-web"
  });
}

export function verifySession(token: string, config: AppConfig): SessionClaims {
  const decoded = jwt.verify(token, config.JWT_SECRET, {
    issuer: "cruxer-api",
    audience: "cruxer-web"
  });
  if (typeof decoded === "string" || typeof decoded.sub !== "string" || typeof decoded.email !== "string") {
    throw new jwt.JsonWebTokenError("Invalid session claims.");
  }
  return decoded as SessionClaims;
}

export function setSessionCookie(
  response: Response,
  token: string,
  config: AppConfig
): void {
  response.cookie(config.COOKIE_NAME, token, cookieOptions(config));
}

export function clearSessionCookie(response: Response, config: AppConfig): void {
  const { maxAge: _maxAge, ...options } = cookieOptions(config);
  response.clearCookie(config.COOKIE_NAME, options);
}

function cookieOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: config.JWT_TTL_DAYS * 24 * 60 * 60 * 1000
  };
}
