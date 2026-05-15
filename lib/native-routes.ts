export function normalizeAppPath(pathname: string) {
  if (!pathname || pathname === "/") {
    return "/";
  }

  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function buildNativeHashRoute(pathname: string) {
  const normalized = normalizeAppPath(pathname);
  return normalized === "/" ? "#/" : `#${normalized}`;
}

export function parseNativeHashRoute(hash: string) {
  if (!hash || !hash.startsWith("#")) {
    return null;
  }

  const raw = hash.slice(1).trim();

  if (!raw) {
    return "/";
  }

  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  return normalizeAppPath(normalized);
}
