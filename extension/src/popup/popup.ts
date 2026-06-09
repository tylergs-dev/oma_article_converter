import { createProgressController } from "../ui/progress";
import type { ConvertResponse } from "../lib/types";

const form = document.getElementById("convert-form") as HTMLFormElement;
const urlInput = document.getElementById("url-input") as HTMLInputElement;
const submitBtn = document.getElementById("submit-btn") as HTMLButtonElement;
const errorEl = document.getElementById("error-message") as HTMLElement;
const progressEl = document.getElementById("conversion-progress") as HTMLElement;
const progressLabel = document.getElementById("progress-label") as HTMLElement;
const progressPercent = document.getElementById("progress-percent") as HTMLElement;
const progressFill = document.getElementById("progress-fill") as HTMLElement;
const optionsLink = document.getElementById("options-link") as HTMLAnchorElement;

const progress = createProgressController({
  progressEl,
  progressLabel,
  progressPercent,
  progressFill,
  progressTrack: progressEl.querySelector('[role="progressbar"]'),
});

function showError(message: string) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

function setLoading(loading: boolean) {
  form.classList.toggle("is-loading", loading);
  submitBtn.disabled = loading;
  urlInput.disabled = loading;
}

async function initUrlField() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.startsWith("http")) {
    urlInput.value = tab.url;
  }
}

optionsLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");
  const url = urlInput.value.trim();
  if (!url) return;

  setLoading(true);
  progress.start();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id;

  try {
    const response = (await chrome.runtime.sendMessage({
      type: "convert",
      url,
      tabId,
    })) as ConvertResponse | undefined;

    if (!response) {
      progress.stop(true);
      showError("No response from extension background.");
      return;
    }

    if (!response.ok) {
      progress.stop(true);
      showError(response.error);
      return;
    }

    await progress.finish();
    window.close();
  } catch {
    progress.stop(true);
    showError("Conversion failed. Try again or check extension options.");
  } finally {
    setLoading(false);
  }
});

void initUrlField();
