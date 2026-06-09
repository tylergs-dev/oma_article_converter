import { DEFAULT_SETTINGS, type ExtensionSettings } from "./types";

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return {
    jinaApiKey: String(stored.jinaApiKey ?? ""),
    jinaFallbackEnabled: stored.jinaFallbackEnabled !== false,
  };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.sync.set(settings);
}
