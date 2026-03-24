import { useState, useEffect, useCallback } from "react";

const getRouteFromHash = (): string => {
  const hash = window.location.hash.replace("#", "");
  return hash || "/";
};

export const useRoute = () => {
  const [route, setRoute] = useState(getRouteFromHash);

  const handleHashChange = useCallback(() => {
    setRoute(getRouteFromHash());
  }, []);

  useEffect(() => {
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [handleHashChange]);

  return route;
};
