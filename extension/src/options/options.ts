import { getSettings, saveSettings } from "../lib/settings";

const form = document.getElementById("options-form") as HTMLFormElement;
const apiKeyInput = document.getElementById("jina-api-key") as HTMLInputElement;
const fallbackInput = document.getElementById("jina-fallback") as HTMLInputElement;
const statusEl = document.getElementById("options-status") as HTMLElement;

async function loadOptions() {
  const settings = await getSettings();
  apiKeyInput.value = settings.jinaApiKey;
  fallbackInput.checked = settings.jinaFallbackEnabled;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await saveSettings({
    jinaApiKey: apiKeyInput.value.trim(),
    jinaFallbackEnabled: fallbackInput.checked,
  });
  statusEl.textContent = "Settings saved.";
  statusEl.hidden = false;
  window.setTimeout(() => {
    statusEl.hidden = true;
  }, 2500);
});

void loadOptions();
