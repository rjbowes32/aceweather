import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const APEX_HOST = "aceweather.app";
const WWW_HOST = "www.aceweather.app";
const MACHINE_PATHS = ["/api", "/mcp", "/llms.txt", "/openapi.json", "/report-api.md"];

const isMachinePath = (pathname: string) =>
  MACHINE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

export function middleware(request: NextRequest) {
  const host = request.headers.get("host");
  const { pathname, search } = request.nextUrl;

  if (!host || isMachinePath(pathname)) {
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
