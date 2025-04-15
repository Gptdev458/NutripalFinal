import { SupabaseStorageAdapter } from 'shared'; // Import the interface from shared

export const localStorageAdapter: SupabaseStorageAdapter = {
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') { // Check if running on server (SSR/SSG)
        return null;
    }
    return window.localStorage.getItem(key);
  },
  setItem: (key: string, value: string): void => {
     if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, value);
     }
  },
  removeItem: (key: string): void => {
    if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key);
    }
  },
}; 