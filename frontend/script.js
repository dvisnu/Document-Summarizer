const LOCAL_HOSTS = ["localhost", "127.0.0.1", ""];
const API_BASE = LOCAL_HOSTS.includes(window.location.hostname)
  ? "http://localhost:8000"
  : "https://document-summary-backend-3lgx.onrender.com";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB, matches backend limit

// Render free instances sleep after 15 min idle and take ~60s to wake
const HEALTH_ATTEMPT_TIMEOUT_MS = 6000;
const WAKE_BUDGET_MS = 90000;
const HEALTH_TTL_MS = 10 * 60 * 1000;
const SUMMARIZE_TIMEOUT_MS = 240000;
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
const ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

// Element references
const apiStatus = document.getElementById("apiStatus");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const dropzoneText = document.getElementById("dropzoneText");
const pillGroup = document.getElementById("pillGroup");
const generateBtn = document.getElementById("generateBtn");
const generateBtnText = document.getElementById("generateBtnText");
const spinner = document.getElementById("spinner");
const errorBanner = document.getElementById("errorBanner");
const resultWrap = document.getElementById("resultWrap");
const resultFilename = document.getElementById("resultFilename");
const resultLength = document.getElementById("resultLength");
const resultSummary = document.getElementById("resultSummary");
const resultKeyPoints = document.getElementById("resultKeyPoints");
const resultMainIdeas = document.getElementById("resultMainIdeas");
const resetBtn = document.getElementById("resetBtn");

// State
let selectedFile = null;
let selectedLength = "medium";

// API health / wake-up
const API_STATE_LABELS = {
  checking: "checking API…",
  waking: "waking backend… this can take a minute",
  online: "API connected",
  offline: "API offline — click to retry",
};

let apiState = "checking";
let lastHealthyAt = 0;
let wakeInFlight = null;

function setApiStatus(state) {
  apiState = state;
  apiStatus.textContent = API_STATE_LABELS[state];
  apiStatus.classList.toggle("is-online", state === "online");
  apiStatus.classList.toggle("is-waking", state === "waking");
  apiStatus.classList.toggle("is-offline", state === "offline");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Strict on purpose: Render's HTML loading page must not count as healthy
async function pingHealth(timeoutMs) {
  const res = await fetch(`${API_BASE}/api/health`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== "ok") throw new Error("unexpected payload");
}

async function runWake() {
  setApiStatus("checking");

  const deadline = Date.now() + WAKE_BUDGET_MS;
  let delay = 2000;
  let sawFailure = false;

  while (Date.now() < deadline) {
    try {
      await pingHealth(HEALTH_ATTEMPT_TIMEOUT_MS);
      lastHealthyAt = Date.now();
      setApiStatus("online");
      return true;
    } catch {
      // Only after a real failure, so a warm backend never flashes this
      if (!sawFailure) {
        sawFailure = true;
        setApiStatus("waking");
      }
      await sleep(delay);
      delay = Math.min(delay * 1.5, 5000);
    }
  }

  setApiStatus("offline");
  return false;
}

// Forces the next wakeBackend() past its cached result
function invalidateHealth() {
  lastHealthyAt = 0;
}

// Handed to concurrent callers so a second polling loop can't start
function wakeBackend() {
  if (apiState === "online" && Date.now() - lastHealthyAt < HEALTH_TTL_MS) {
    return Promise.resolve(true);
  }
  if (!wakeInFlight) {
    wakeInFlight = runWake().finally(() => {
      wakeInFlight = null;
    });
  }
  return wakeInFlight;
}

apiStatus.addEventListener("click", () => {
  if (apiState === "offline") wakeBackend();
});

wakeBackend();

// File selection
function isAcceptedFile(file) {
  const ext = "." + file.name.split(".").pop().toLowerCase();
  return ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.includes(ext);
}

function handleFileSelected(file) {
  hideError();

  if (!isAcceptedFile(file)) {
    showError("Unsupported file type. Please upload a PDF, JPG, or PNG.");
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    showError("File is too large. Maximum size is 15MB.");
    return;
  }

  selectedFile = file;
  dropzone.classList.add("has-file");
  dropzoneText.innerHTML = `Selected: <strong>${escapeHtml(file.name)}</strong>`;
  updateGenerateButton();
}

fileInput.addEventListener("change", (e) => {
  if (e.target.files[0]) handleFileSelected(e.target.files[0]);
});

// Drag & drop
["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("is-dragover");
  })
);

["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-dragover");
  })
);

dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelected(file);
});

dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

// Summary length pills
pillGroup.addEventListener("click", (e) => {
  const pill = e.target.closest(".pill");
  if (!pill) return;

  pillGroup.querySelectorAll(".pill").forEach((p) => {
    p.classList.remove("is-active");
    p.setAttribute("aria-checked", "false");
  });
  pill.classList.add("is-active");
  pill.setAttribute("aria-checked", "true");
  selectedLength = pill.dataset.length;
});

// Generate button state
function updateGenerateButton() {
  if (selectedFile) {
    generateBtn.disabled = false;
    generateBtnText.textContent = "Generate Summary";
  } else {
    generateBtn.disabled = true;
    generateBtnText.textContent = "Choose a file first";
  }
}

// Render's edge answers a failed wake with a bare 5xx that carries no CORS
// headers, so the browser blocks it and fetch() rejects instead of resolving.
// Both shapes mean the same thing: the instance wasn't up for this request.
// Only a fast failure is safe to resend. Once the request has been in flight
// long enough for the server to have called Gemini, a retry would spend the
// quota a second time, so past this window the error is surfaced instead.
const COLD_START_FAIL_WINDOW_MS = 15000;

class BackendAsleepError extends Error {
  constructor(message, elapsedMs) {
    super(message);
    this.elapsedMs = elapsedMs;
  }

  get isSafeToResend() {
    return this.elapsedMs <= COLD_START_FAIL_WINDOW_MS;
  }
}

function buildFormData() {
  const formData = new FormData();
  formData.append("file", selectedFile);
  formData.append("summary_length", selectedLength);
  return formData;
}

async function postSummarize() {
  const startedAt = Date.now();
  let res;
  try {
    res = await fetch(`${API_BASE}/api/summarize`, {
      method: "POST",
      body: buildFormData(),
      signal: AbortSignal.timeout(SUMMARIZE_TIMEOUT_MS),
    });
  } catch (err) {
    // A real timeout is the app being slow, not absent — let it through as-is
    if (err.name === "TimeoutError") throw err;
    throw new BackendAsleepError(err.message, Date.now() - startedAt);
  }

  // Non-JSON means Render's proxy answered, not the app
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    if (res.status >= 500) {
      throw new BackendAsleepError(`HTTP ${res.status}`, Date.now() - startedAt);
    }
    throw new Error(`Unexpected response from the server (HTTP ${res.status}).`);
  }

  return res.json();
}

// Submit → /api/summarize
generateBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  hideError();

  // May have spun down while the tab sat open
  setLoading(true, "Waking backend…");
  if (!(await wakeBackend())) {
    showError(
      "The backend isn't responding. It may still be starting up — give it a moment and try again."
    );
    setLoading(false);
    return;
  }

  setLoading(true, "Summarizing…");

  try {
    let data;
    try {
      data = await postSummarize();
    } catch (err) {
      if (!(err instanceof BackendAsleepError)) throw err;
      // Failed slowly? The document may already have been summarized once.
      if (!err.isSafeToResend) throw err;

      // A free instance can be recycled between the health check and the
      // upload, and the cached "online" state is what let this request
      // through. Drop that cache, wake it for real, and send the file once more.
      invalidateHealth();
      setLoading(true, "Backend restarted — waking it again…");
      if (!(await wakeBackend())) {
        setApiStatus("offline");
        showError(
          "The backend went back to sleep and didn't wake in time. Give it a minute and try again."
        );
        return;
      }

      setLoading(true, "Summarizing…");
      data = await postSummarize();
    }

    if (!data.success) {
      showError(data.error || "Something went wrong. Please try again.");
      return;
    }

    lastHealthyAt = Date.now();
    renderResult(data);
  } catch (err) {
    if (err.name === "TimeoutError") {
      showError(
        "The summary is taking longer than expected. Try a shorter document, or try again."
      );
    } else if (err instanceof BackendAsleepError) {
      setApiStatus("offline");
      showError(
        err.isSafeToResend
          ? "The backend is starting up or restarting. Give it a minute and try again."
          : "The backend stopped responding while summarizing this document. Try a smaller document, or give it a moment before retrying."
      );
    } else {
      setApiStatus("offline");
      showError(err.message || "Could not reach the backend. Check your connection and try again.");
    }
  } finally {
    setLoading(false);
  }
});

function setLoading(isLoading, message = "Summarizing…") {
  generateBtn.disabled = isLoading;
  spinner.hidden = !isLoading;
  if (isLoading) {
    generateBtnText.textContent = message;
  } else {
    updateGenerateButton();
  }
  document.querySelector(".panel").classList.toggle("is-loading", isLoading);
}

// Render results
function renderResult(data) {
  resultFilename.textContent = data.filename;
  resultLength.textContent = selectedLength;
  resultSummary.textContent = data.summary;

  resultKeyPoints.innerHTML = "";
  data.key_points.forEach((point) => {
    const li = document.createElement("li");
    li.textContent = point;
    resultKeyPoints.appendChild(li);
  });

  resultMainIdeas.innerHTML = "";
  data.main_ideas.forEach((idea) => {
    const span = document.createElement("span");
    span.textContent = idea;
    resultMainIdeas.appendChild(span);
  });

  resultWrap.hidden = false;
  resultWrap.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Reset
resetBtn.addEventListener("click", () => {
  selectedFile = null;
  fileInput.value = "";
  dropzone.classList.remove("has-file");
  dropzoneText.innerHTML = 'Drag a file here, or <span class="link">browse</span>';
  resultWrap.hidden = true;
  hideError();
  updateGenerateButton();
  dropzone.scrollIntoView({ behavior: "smooth", block: "center" });
});

// Helpers
function showError(message) {
  errorBanner.textContent = message;
  errorBanner.hidden = false;
}

function hideError() {
  errorBanner.hidden = true;
  errorBanner.textContent = "";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}