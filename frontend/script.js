const LOCAL_HOSTS = ["localhost", "127.0.0.1", ""];
const API_BASE = LOCAL_HOSTS.includes(window.location.hostname)
  ? "http://localhost:8000"
  : "https://document-summary-backend.onrender.com";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB, matches backend limit
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
const ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

// --- Element references ---
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

// --- State ---
let selectedFile = null;
let selectedLength = "medium";

// =====================================================================
// API health check — lets the user know immediately if the backend
// isn't running, instead of finding out only after they hit "Generate".
// =====================================================================
async function checkApiHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) throw new Error("not ok");
    apiStatus.textContent = "API connected";
    apiStatus.classList.add("is-online");
    apiStatus.classList.remove("is-offline");
  } catch {
    apiStatus.textContent = "API offline — start the backend";
    apiStatus.classList.add("is-offline");
    apiStatus.classList.remove("is-online");
  }
}
checkApiHealth();

// =====================================================================
// File selection (click-to-browse AND drag-and-drop share this path)
// =====================================================================
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

// Let Enter/Space on the focused dropzone open the file picker (keyboard access)
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

// =====================================================================
// Summary length pills (simple custom radio group)
// =====================================================================
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

// =====================================================================
// Generate button state
// =====================================================================
function updateGenerateButton() {
  if (selectedFile) {
    generateBtn.disabled = false;
    generateBtnText.textContent = "Generate Summary";
  } else {
    generateBtn.disabled = true;
    generateBtnText.textContent = "Choose a file first";
  }
}

// =====================================================================
// Submit → FastAPI /api/summarize
// =====================================================================
generateBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  hideError();
  setLoading(true);

  const formData = new FormData();
  formData.append("file", selectedFile);
  formData.append("summary_length", selectedLength);

  try {
    const res = await fetch(`${API_BASE}/api/summarize`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    if (!data.success) {
      // Every error path on the backend returns {success: false, error: "..."}
      showError(data.error || "Something went wrong. Please try again.");
      return;
    }

    renderResult(data);
  } catch (err) {
    showError("Could not reach the backend. Is it running on " + API_BASE + "?");
  } finally {
    setLoading(false);
  }
});

function setLoading(isLoading) {
  generateBtn.disabled = isLoading;
  spinner.hidden = !isLoading;
  generateBtnText.textContent = isLoading ? "Summarizing…" : "Generate Summary";
  document.querySelector(".panel").classList.toggle("is-loading", isLoading);
}

// =====================================================================
// Rendering results onto the "paper page"
// =====================================================================
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

// =====================================================================
// Reset
// =====================================================================
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

// =====================================================================
// Small helpers
// =====================================================================
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