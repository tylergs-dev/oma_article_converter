/** Injected into the active tab via chrome.scripting.executeScript */
export function capturePageHtml(): string {
  return document.documentElement.outerHTML;
}
