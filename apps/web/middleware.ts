import { NextResponse, type NextRequest } from "next/server";

const sessionCookieName = process.env.SESSION_COOKIE_NAME?.trim() || "cruxer_session";

/**
 * Fast UX preflight only: the API still verifies the signed JWT before any
 * private data is rendered or returned. This prevents a signed-out visitor
 * from waiting for a cold API instance merely to learn they need to sign in.
 */
export function middleware(request: NextRequest) {
  if (request.cookies.has(sessionCookieName)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = { matcher: ["/dashboard/:path*"] };
