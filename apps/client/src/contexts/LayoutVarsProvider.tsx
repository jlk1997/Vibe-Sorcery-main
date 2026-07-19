import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { View } from "@tarojs/components";
import { currentLayoutRoute } from "../constants/routes";
import { useRouteTick } from "../hooks/useRouteTick";
import {
  applyBottomLayoutVars,
  getBottomLayoutVars,
  layoutVarsToStyle,
  syncRootLayoutFromRoute,
} from "../platform/layout";

type LayoutVarsContextValue = {
  setMiniPlayerVisible: (visible: boolean) => void;
  miniPlayerVisible: boolean;
};

const LayoutVarsContext = createContext<LayoutVarsContextValue | null>(null);

export function LayoutVarsProvider({ children }: PropsWithChildren) {
  const routeTick = useRouteTick();
  const [miniPlayerVisible, setMiniPlayerVisibleState] = useState(false);
  const route = currentLayoutRoute();
  void routeTick;

  const setMiniPlayerVisible = useCallback((visible: boolean) => {
    setMiniPlayerVisibleState(visible);
  }, []);

  const vars = useMemo(
    () => getBottomLayoutVars({ route, miniPlayerVisible }),
    [route, miniPlayerVisible, routeTick],
  );

  useEffect(() => {
    if (process.env.TARO_ENV === "h5") {
      applyBottomLayoutVars(vars);
      syncRootLayoutFromRoute({ showAppHeader: true });
    }
  }, [vars]);

  const ctx = useMemo(
    () => ({ setMiniPlayerVisible, miniPlayerVisible }),
    [setMiniPlayerVisible, miniPlayerVisible],
  );

  if (process.env.TARO_ENV === "weapp") {
    return (
      <LayoutVarsContext.Provider value={ctx}>
        <View className="app-layout-root" style={layoutVarsToStyle(vars)}>
          {children}
        </View>
      </LayoutVarsContext.Provider>
    );
  }

  return <LayoutVarsContext.Provider value={ctx}>{children}</LayoutVarsContext.Provider>;
}

export function useLayoutVars() {
  const ctx = useContext(LayoutVarsContext);
  if (!ctx) {
    return { setMiniPlayerVisible: () => {}, miniPlayerVisible: false };
  }
  return ctx;
}
