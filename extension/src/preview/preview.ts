import { PREVIEW_STORAGE_KEY, type ConvertResult } from "../lib/types";

const printTitle = document.getElementById("print-title") as HTMLElement;
const printMeta = document.getElementById("print-meta") as HTMLElement;
const printBody = document.getElementById("print-body") as HTMLElement;
const errorEl = document.getElementById("error-message") as HTMLElement;
const printBtn = document.getElementById("print-btn") as HTMLButtonElement;
const closeBtn = document.getElementById("close-btn") as HTMLButtonElement;

function formatMeta(author: string | null, source: string | null, date: string | null) {
  return [author, source, date].filter(Boolean).join(" · ");
}

function showError(message: string) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

function renderPreview(data: ConvertResult) {
  printTitle.textContent = data.title;
  printMeta.textContent = formatMeta(data.author, data.source, data.date);
  printBody.innerHTML = data.html;
  document.title = data.title;
}

async function loadPreview() {
  const stored = await chrome.storage.session.get(PREVIEW_STORAGE_KEY);
  const data = stored[PREVIEW_STORAGE_KEY] as ConvertResult | undefined;
  if (!data?.html) {
    showError("No preview data found. Convert an article from the extension popup.");
    return;
  }
  renderPreview(data);
}

printBtn.addEventListener("click", () => window.print());
closeBtn.addEventListener("click", () => window.close());

void loadPreview();
