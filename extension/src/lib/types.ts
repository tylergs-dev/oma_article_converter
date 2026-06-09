export interface ConvertResult {
  title: string;
  author: string | null;
  source: string | null;
  date: string | null;
  html: string;
}

export interface ExtensionSettings {
  jinaApiKey: string;
  jinaFallbackEnabled: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  jinaApiKey: "",
  jinaFallbackEnabled: true,
};

export type ConvertMessage =
  | { type: "convert"; url: string; tabId?: number }
  | { type: "getSettings" };

export type ConvertResponse =
  | { ok: true; previewTabId: number }
  | { ok: false; error: string };

export const PREVIEW_STORAGE_KEY = "lastPreview";
