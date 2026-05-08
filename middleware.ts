import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const APEX_HOST = "aceweather.app";
const WWW_HOST = "www.aceweather.app";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host");
  const { pathname, search } = request.nextUrl;

  if (!host || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (host === APEX_HOST) {
    return NextResponse.redirect(
      new URL(`https://${WWW_HOST}${pathname}${search}`),
      307,
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)",
  ],
};
