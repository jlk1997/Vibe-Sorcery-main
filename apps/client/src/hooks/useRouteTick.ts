import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";

/** Re-render when the H5 router changes (push, pop, tab switch). */
export function useRouteTick() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    if (process.env.TARO_ENV === "h5" && typeof window !== "undefined") {
      window.addEventListener("hashchange", bump);
      window.addEventListener("popstate", bump);
    }
    Taro.eventCenter.on("__taroRouterChange", bump);
    Taro.eventCenter.on("__afterTaroRouterChange", bump);
    return () => {
      if (process.env.TARO_ENV === "h5" && typeof window !== "undefined") {
        window.removeEventListener("hashchange", bump);
        window.removeEventListener("popstate", bump);
      }
      Taro.eventCenter.off("__taroRouterChange", bump);
      Taro.eventCenter.off("__afterTaroRouterChange", bump);
    };
  }, []);

  return tick;
}
