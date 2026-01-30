// composables/useLogin.ts
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

export type LoginProvider = 'hypergryph' | 'gryphline';

export const openLoginWindow = (provider: LoginProvider = 'hypergryph') => {
  return new Promise<string | null>(async (resolve, reject) => {
    let unlistenSuccess: UnlistenFn | null = null;
    let unlistenClose: UnlistenFn | null = null;
    let isResolved = false;
    const label = `hg-login-${provider}`;

    const cleanup = () => {
      if (unlistenSuccess) unlistenSuccess();
      if (unlistenClose) unlistenClose();
    };

    unlistenSuccess = await listen<string>('hg-login-success', async (event) => {
      console.log("前端收到 Token:", event.payload);
      
      if (isResolved) return;
      isResolved = true;

      try {
        const win = await WebviewWindow.getByLabel(label);
        if (win) await win.close();
      } catch (e) {}
      
      cleanup();
      resolve(event.payload);
    });

    unlistenClose = await listen('hg-login-closed', () => {
      console.log("登录窗口已关闭");

      if (isResolved) {
        console.log("忽略关闭事件，因为已获取 Token");
        return;
      }
      
      isResolved = true;
      cleanup();
      resolve(null); // 用户手动关闭
    });

    try {
      await invoke('open_login_window', { provider });
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
};
