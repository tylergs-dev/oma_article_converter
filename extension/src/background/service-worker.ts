import { capturePageHtml } from "../lib/capture-page";
import { ExtractError } from "../lib/errors";
import { extractArticle, isWeakExtraction } from "../lib/extract";
import { convertWithFetchAndJina, fetchJinaArticle } from "../lib/jina";
import { getSettings } from "../lib/settings";
import type { ConvertMessage, ConvertResponse } from "../lib/types";
import { PREVIEW_STORAGE_KEY } from "../lib/types";
import { originPatternForUrl, validateUrl } from "../lib/validate";

async function getTabUrl(tabId: number): Promise<string | null> {
  const tab = await chrome.tabs.get(tabId);
  return tab.url?.startsWith("http") ? tab.url : null;
}

async function captureHtmlFromTab(tabId: number): Promise<string> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: capturePageHtml,
  });
  if (!result?.result || typeof result.result !== "string") {
    throw new ExtractError("Could not read page content from the active tab");
  }
  return result.result;
}

async function ensureFetchPermission(url: string): Promise<void> {
  const pattern = originPatternForUrl(url);
  const has = await chrome.permissions.contains({ origins: [pattern] });
  if (has) return;

  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) {
    throw new ExtractError(
      "Permission denied to fetch that URL. Open the page in a tab and convert from there, or allow host access.",
    );
  }
}

async function convertUrl(
  url: string,
  tabId?: number,
): Promise<import("../lib/types").ConvertResult> {
  const safeUrl = validateUrl(url);
  const settings = await getSettings();

  let tabMatches = false;
  if (tabId != null) {
    const tabUrl = await getTabUrl(tabId);
    tabMatches = tabUrl === safeUrl;
  }

  if (tabMatches && tabId != null) {
    try {
      const html = await captureHtmlFromTab(tabId);
      const result = extractArticle(safeUrl, html);
      if (!isWeakExtraction(result)) {
        return result;
      }
      if (settings.jinaFallbackEnabled) {
        return fetchJinaArticle(safeUrl, settings);
      }
      return result;
    } catch (err) {
      if (err instanceof ExtractError && settings.jinaFallbackEnabled) {
        return fetchJinaArticle(safeUrl, settings);
      }
      throw err;
    }
  }

  await ensureFetchPermission(safeUrl);
  return convertWithFetchAndJina(safeUrl, settings);
}

async function openPreview(
  result: import("../lib/types").ConvertResult,
): Promise<number> {
  await chrome.storage.session.set({ [PREVIEW_STORAGE_KEY]: result });
  const tab = await chrome.tabs.create({
    url: chrome.runtime.getURL("src/preview/preview.html"),
  });
  return tab.id ?? 0;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Conversion failed";
}

chrome.runtime.onMessage.addListener(
  (message: ConvertMessage, _sender, sendResponse) => {
    if (message.type === "getSettings") {
      getSettings().then((settings) => sendResponse({ ok: true, settings }));
      return true;
    }

    if (message.type === "convert") {
      convertUrl(message.url, message.tabId)
        .then(async (result) => {
          const previewTabId = await openPreview(result);
          const response: ConvertResponse = { ok: true, previewTabId };
          sendResponse(response);
        })
        .catch((err) => {
          const response: ConvertResponse = { ok: false, error: errorMessage(err) };
          sendResponse(response);
        });
      return true;
    }

    return false;
  },
);
