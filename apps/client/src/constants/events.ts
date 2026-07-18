/** 全局事件名（Taro.eventCenter）。 */
export const NOW_PLAYING_EVENTS = {
  /** 进入「正在播放」全屏页 —— 隐藏底部迷你播放条。 */
  enter: "vs:now-playing:enter",
  /** 离开「正在播放」全屏页 —— 恢复底部迷你播放条。 */
  leave: "vs:now-playing:leave",
} as const;
