const form = document.getElementById("convert-form");
const urlInput = document.getElementById("url-input");
const submitBtn = document.getElementById("submit-btn");
const errorEl = document.getElementById("error-message");
const previewSection = document.getElementById("preview-section");
const printTitle = document.getElementById("print-title");
const printMeta = document.getElementById("print-meta");
const printBody = document.getElementById("print-body");
const printBtn = document.getElementById("print-btn");
const resetBtn = document.getElementById("reset-btn");
const progressEl = document.getElementById("conversion-progress");
const progressLabel = document.getElementById("progress-label");
const progressPercent = document.getElementById("progress-percent");
const progressFill = document.getElementById("progress-fill");
const progressTrack = progressEl?.querySelector('[role="progressbar"]');

const CONVERSION_STEPS = [
  { label: "Checking URL", max: 12 },
  { label: "Downloading page", max: 45 },
  { label: "Extracting article", max: 78 },
  { label: "Formatting for print", max: 92 },
];

let progressTimer = null;
let currentProgress = 0;
let stepIndex = 0;

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

function setLoading(loading) {
  form.classList.toggle("is-loading", loading);
  submitBtn.disabled = loading;
  urlInput.disabled = loading;
}

function updateProgressUI() {
  const step = CONVERSION_STEPS[stepIndex];
  const rounded = Math.round(currentProgress);
  progressLabel.textContent = step?.label ?? "Finishing up";
  progressPercent.textContent = `${rounded}%`;
  progressFill.style.width = `${currentProgress}%`;
  if (progressTrack) {
    progressTrack.setAttribute("aria-valuenow", String(rounded));
  }
}

function startProgress() {
  stopProgress(false);
  currentProgress = 0;
  stepIndex = 0;
  progressEl.classList.remove("is-complete");
  progressEl.hidden = false;
  updateProgressUI();
  progressTimer = window.setInterval(tickProgress, 100);
}

function tickProgress() {
  const step = CONVERSION_STEPS[stepIndex];
  if (!step) return;

  const cap = step.max;
  if (currentProgress < cap) {
    const remaining = cap - currentProgress;
    const delta = Math.max(0.25, remaining * 0.06);
    currentProgress = Math.min(cap, currentProgress + delta);
    updateProgressUI();
    return;
  }

  if (stepIndex < CONVERSION_STEPS.length - 1) {
    stepIndex += 1;
    updateProgressUI();
  }
}

function stopProgress(hide = true) {
  if (progressTimer !== null) {
    window.clearInterval(progressTimer);
    progressTimer = null;
  }
  if (hide) {
    progressEl.hidden = true;
    progressEl.classList.remove("is-complete");
    currentProgress = 0;
    stepIndex = 0;
    progressFill.style.width = "0%";
    if (progressTrack) {
      progressTrack.setAttribute("aria-valuenow", "0");
    }
  }
}

function finishProgress() {
  return new Promise((resolve) => {
    if (progressTimer !== null) {
      window.clearInterval(progressTimer);
      progressTimer = null;
    }
    stepIndex = CONVERSION_STEPS.length - 1;
    currentProgress = 100;
    progressEl.classList.add("is-complete");
    progressLabel.textContent = "Ready";
    updateProgressUI();
    window.setTimeout(() => {
      stopProgress(true);
      resolve();
    }, 350);
  });
}

function formatMeta(author, source, date) {
  const parts = [author, source, date].filter(Boolean);
  return parts.join(" · ");
}

function showPreview(data) {
  printTitle.textContent = data.title;
  printMeta.textContent = formatMeta(data.author, data.source, data.date);
  printBody.innerHTML = data.html;
  previewSection.hidden = false;
  previewSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetPreview() {
  previewSection.hidden = true;
  printTitle.textContent = "";
  printMeta.textContent = "";
  printBody.innerHTML = "";
  urlInput.value = "";
  showError("");
  stopProgress(true);
  urlInput.focus();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");
  const url = urlInput.value.trim();
  if (!url) return;

  setLoading(true);
  startProgress();

  try {
    const res = await fetch("/api/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = payload.detail;
      const message = Array.isArray(detail)
        ? detail.map((d) => d.msg).join(", ")
        : typeof detail === "string"
          ? detail
          : "Conversion failed";
      stopProgress(true);
      showError(message);
      return;
    }
    await finishProgress();
    showPreview(payload);
  } catch {
    stopProgress(true);
    showError("Network error. Is the server running?");
  } finally {
    setLoading(false);
  }
});

printBtn.addEventListener("click", () => window.print());
resetBtn.addEventListener("click", resetPreview);
