import { removeBackground } from "https://esm.sh/@imgly/background-removal@1.6.0";

const input = document.querySelector("#image-input");
const dropZone = document.querySelector(".drop-zone");
const removeButton = document.querySelector("#remove-button");
const downloadLink = document.querySelector("#download-link");
const statusEl = document.querySelector("#status");
const sourcePreview = document.querySelector("#source-preview");
const resultPreview = document.querySelector("#result-preview");
const sourceEmpty = document.querySelector("#source-empty");
const resultEmpty = document.querySelector("#result-empty");
const fileMeta = document.querySelector("#file-meta");
const resultMeta = document.querySelector("#result-meta");
const toolPanel = document.querySelector(".tool-panel");

let selectedFile = null;
let sourceUrl = null;
let resultUrl = null;

const modelConfig = {
  publicPath: "./background-removal-data/",
  debug: true,
  progress: (_key, current, total) => {
    if (!total) return;
    const percent = Math.round((current / total) * 100);
    setStatus(`AI 模型載入中：${percent}%`);
  },
};

function updateRuntimeStatus() {
  if (!selectedFile) {
    const runtimeReady = hasAiRuntime();
    setStatus(runtimeReady ? "請先選擇一張圖片。" : "AI 環境準備中，若頁面自動重整後仍看到此訊息，請按 Ctrl + F5。", !runtimeReady);
  }
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function hasAiRuntime() {
  return window.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined";
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resetResult() {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = null;
  resultPreview.hidden = true;
  resultPreview.removeAttribute("src");
  resultEmpty.hidden = false;
  resultMeta.textContent = "尚未處理";
  downloadLink.removeAttribute("href");
  downloadLink.classList.add("disabled");
}

function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    setStatus("請上傳 JPG、PNG 或 WebP 圖片。", true);
    return;
  }

  selectedFile = file;
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = URL.createObjectURL(file);

  sourcePreview.src = sourceUrl;
  sourcePreview.hidden = false;
  sourceEmpty.hidden = true;
  fileMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  removeButton.disabled = false;
  resetResult();
  setStatus("圖片已載入，可以開始去背。");
}

async function removeImageBackground() {
  if (!selectedFile) return;

  if (!hasAiRuntime()) {
    setStatus("AI 執行環境尚未啟用。請重新整理頁面一次，再重新上傳圖片去背。", true);
    return;
  }

  removeButton.disabled = true;
  toolPanel.classList.add("is-busy");
  resetResult();
  setStatus("正在分析圖片，第一次使用會先下載 AI 模型。");

  try {
    const startedAt = performance.now();
    const blob = await removeBackground(selectedFile, modelConfig);
    resultUrl = URL.createObjectURL(blob);
    resultPreview.src = resultUrl;
    resultPreview.hidden = false;
    resultEmpty.hidden = true;
    downloadLink.href = resultUrl;
    downloadLink.classList.remove("disabled");
    const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
    resultMeta.textContent = `PNG · ${formatBytes(blob.size)}`;
    setStatus(`去背完成，用時 ${seconds} 秒。`);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`處理失敗：${message || "請重新整理後再試。"}`, true);
  } finally {
    removeButton.disabled = false;
    toolPanel.classList.remove("is-busy");
  }
}

input.addEventListener("change", (event) => {
  loadFile(event.target.files?.[0]);
});

removeButton.addEventListener("click", removeImageBackground);

for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
  });
}

dropZone.addEventListener("drop", (event) => {
  loadFile(event.dataTransfer?.files?.[0]);
});

updateRuntimeStatus();
