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

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

function setLoading(loading) {
  form.classList.toggle("is-loading", loading);
  submitBtn.disabled = loading;
  urlInput.disabled = loading;
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
  urlInput.focus();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");
  const url = urlInput.value.trim();
  if (!url) return;

  setLoading(true);

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
      showError(message);
      return;
    }
    showPreview(payload);
  } catch {
    showError("Network error. Is the server running?");
  } finally {
    setLoading(false);
  }
});

printBtn.addEventListener("click", () => window.print());
resetBtn.addEventListener("click", resetPreview);
