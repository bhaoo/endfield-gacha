import { invoke } from '@tauri-apps/api/core';
import type { AppConfig, User } from '~/types/gacha';

export const useUserStore = () => {
  const userList = useState<User[]>('global-user-list', () => []);
  
  const uidList = computed(() => userList.value.map(u => u.uid));

  const loadConfig = async () => {
    try {
      const config = await invoke<AppConfig>('read_config');
      userList.value = Array.isArray(config.users) ? config.users : [];
    } catch (e) {
      console.error('加载配置失败', e);
      userList.value = [];
    }
  };

  const addUser = async (newUser: User) => {
    const index = userList.value.findIndex(u => u.uid === newUser.uid);
    if (index !== -1) {
      userList.value[index] = newUser;
    } else {
      userList.value.push(newUser);
    }

    try {
      await invoke('save_config', { 
        data: { users: toRaw(userList.value) }
      });
      return true;
    } catch (e) {
      console.error('保存配置失败', e);
      return false;
    }
  };

  return {
    userList,
    uidList,
    loadConfig,
    addUser
  };
};