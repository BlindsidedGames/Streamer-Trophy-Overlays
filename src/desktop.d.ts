export {};

declare global {
  interface Window {
    streamerToolsDesktop?: {
      platform: "desktop";
      windowControls: {
        minimize: () => void;
        maximizeOrRestore: () => void;
        close: () => void;
        isMaximized: () => Promise<boolean>;
        onMaximizedChange: (listener: (isMaximized: boolean) => void) => () => void;
      };
    };
  }
}
