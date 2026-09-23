// Keep each account's local drafts separate; legacy anonymous data stays untouched.
export function accountStorage(userId: string, storage: Storage): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const prefix = `account:${userId}:`;
  return {
    getItem: (key) => storage.getItem(prefix + key),
    setItem: (key, value) => storage.setItem(prefix + key, value),
    removeItem: (key) => storage.removeItem(prefix + key),
  };
}
