const CONVERSION_STEPS = [
  { label: "Checking URL", max: 12 },
  { label: "Downloading page", max: 45 },
  { label: "Extracting article", max: 78 },
  { label: "Formatting for print", max: 92 },
];

export function createProgressController(elements: {
  progressEl: HTMLElement;
  progressLabel: HTMLElement;
  progressPercent: HTMLElement;
  progressFill: HTMLElement;
  progressTrack: HTMLElement | null;
}) {
  let progressTimer: number | null = null;
  let currentProgress = 0;
  let stepIndex = 0;

  function updateProgressUI() {
    const step = CONVERSION_STEPS[stepIndex];
    const rounded = Math.round(currentProgress);
    elements.progressLabel.textContent = step?.label ?? "Finishing up";
    elements.progressPercent.textContent = `${rounded}%`;
    elements.progressFill.style.width = `${currentProgress}%`;
    elements.progressTrack?.setAttribute("aria-valuenow", String(rounded));
  }

  function stopProgress(hide = true) {
    if (progressTimer !== null) {
      window.clearInterval(progressTimer);
      progressTimer = null;
    }
    if (hide) {
      elements.progressEl.hidden = true;
      elements.progressEl.classList.remove("is-complete");
      currentProgress = 0;
      stepIndex = 0;
      elements.progressFill.style.width = "0%";
      elements.progressTrack?.setAttribute("aria-valuenow", "0");
    }
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

  return {
    start() {
      stopProgress(false);
      currentProgress = 0;
      stepIndex = 0;
      elements.progressEl.classList.remove("is-complete");
      elements.progressEl.hidden = false;
      updateProgressUI();
      progressTimer = window.setInterval(tickProgress, 100);
    },
    stop: stopProgress,
    async finish() {
      if (progressTimer !== null) {
        window.clearInterval(progressTimer);
        progressTimer = null;
      }
      stepIndex = CONVERSION_STEPS.length - 1;
      currentProgress = 100;
      elements.progressEl.classList.add("is-complete");
      elements.progressLabel.textContent = "Ready";
      updateProgressUI();
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      stopProgress(true);
    },
  };
}
