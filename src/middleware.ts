import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Middleware kann Firebase Auth nicht direkt prüfen (Client-seitig).
// Stattdessen prüfen wir Auth client-seitig in den Komponenten.
// Diese Middleware leitet nur öffentliche/geschützte Routen-Logik.

const publicPaths = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Öffentliche Pfade durchlassen
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Statische Assets und API-Routen durchlassen
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
