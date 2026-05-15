"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { isNativeCapacitorRuntime } from "../../lib/api-base";
import {
  buildNativeHashRoute,
  normalizeAppPath,
  parseNativeHashRoute,
} from "../../lib/native-routes";

export default function NativeRouteBridge() {
  const router = useRouter();
  const pathname = normalizeAppPath(usePathname());

  useEffect(() => {
    if (!isNativeCapacitorRuntime() || typeof window === "undefined") {
      return;
    }

    const syncFromHash = () => {
      const hashRoute = parseNativeHashRoute(window.location.hash);
      const currentPath = normalizeAppPath(window.location.pathname);
      const route = hashRoute ?? currentPath;

      console.log("CURRENT PATHNAME", window.location.pathname);
      console.log("CURRENT ROUTE", route);

      if (hashRoute && hashRoute !== pathname) {
        router.replace(hashRoute === "/" ? "/" : `${hashRoute}/`);
      }
    };

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);

    return () => {
      window.removeEventListener("hashchange", syncFromHash);
    };
  }, [pathname, router]);

  useEffect(() => {
    if (!isNativeCapacitorRuntime() || typeof window === "undefined") {
      return;
    }

    const desiredHash = buildNativeHashRoute(pathname);

    console.log("CURRENT PATHNAME", window.location.pathname);
    console.log("CURRENT ROUTE", pathname);

    if (window.location.hash !== desiredHash) {
      window.history.replaceState(window.history.state, "", desiredHash);
    }
  }, [pathname]);

  return null;
}
