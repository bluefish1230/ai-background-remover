import { removeBackground } from "https://esm.sh/@imgly/background-removal@1.6.0";

const input = document.querySelector("#image-input");
const dropZone = document.querySelector(".drop-zone");
const analyzeButton = document.querySelector("#remove-button");
const downloadLink = document.querySelector("#download-link");
const statusEl = document.querySelector("#status");
const sourcePreview = document.querySelector("#source-preview");
const resultPreview = document.querySelector("#result-preview");
const sourceEmpty = document.querySelector("#source-empty");
const resultEmpty = document.querySelector("#result-empty");
const fileMeta = document.querySelector("#file-meta");
const resultMeta = document.querySelector("#result-meta");
const toolPanel = document.querySelector(".tool-panel");
const objectTools = document.querySelector("#object-tools");
const objectSummary = document.querySelector("#object-summary");
const objectList = document.querySelector("#object-list");
const applyObjectsButton = document.querySelector("#apply-objects-button");
const brushTools = document.querySelector("#brush-tools");
const brushSizeInput = document.querySelector("#brush-size");
const brushSizeValue = document.querySelector("#brush-size-value");
const clearMaskButton = document.querySelector("#clear-mask-button");
const applyMaskButton = document.querySelector("#apply-mask-button");
const sourceEditor = document.querySelector("#source-editor");
const sourceCanvas = document.querySelector("#source-canvas");
const maskCanvas = document.querySelector("#mask-canvas");
const sourceCtx = sourceCanvas.getContext("2d");
const maskCtx = maskCanvas.getContext("2d");

const editableResultCanvas = document.createElement("canvas");
const editableResultCtx = editableResultCanvas.getContext("2d");

let selectedFile = null;
let sourceUrl = null;
let resultUrl = null;
let sourceImage = null;
let isErasing = false;
let eraseDirty = false;
let eraseBaseImageData = null;
let baseResultImageData = null;
let componentMap = null;
let objectCandidates = [];

const modelConfig = {
  publicPath: new URL("./background-removal-data/", window.location.href).href,
  debug: true,
  progress: (_key, current, total) => {
    if (!total) return;
    const percent = Math.round((current / total) * 100);
    setStatus(`AI 模型載入中：${percent}%`);
  },
};

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
  editableResultCanvas.width = 0;
  editableResultCanvas.height = 0;
  eraseBaseImageData = null;
  baseResultImageData = null;
  componentMap = null;
  objectCandidates = [];
  eraseDirty = false;
  objectList.replaceChildren();
  objectTools.hidden = true;
  brushTools.hidden = true;
  resultPreview.hidden = true;
  resultPreview.removeAttribute("src");
  resultEmpty.hidden = false;
  resultMeta.textContent = "尚未處理";
  downloadLink.removeAttribute("href");
  downloadLink.classList.add("disabled");
}

function clearEraseMarks({ restore = false, message = "已還原本次擦除，可以重新修正。" } = {}) {
  if (restore && eraseBaseImageData && editableResultCanvas.width && editableResultCanvas.height) {
    editableResultCtx.putImageData(eraseBaseImageData, 0, 0);
    publishCanvasResult(editableResultCanvas, message);
  }

  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  eraseDirty = false;
  eraseBaseImageData = null;
}

function getSelectedRawIds() {
  return new Set(objectCandidates.filter((candidate) => candidate.selected).map((candidate) => candidate.rawId));
}

function prepareSourceCanvas(image) {
  sourceCanvas.width = image.naturalWidth;
  sourceCanvas.height = image.naturalHeight;
  maskCanvas.width = image.naturalWidth;
  maskCanvas.height = image.naturalHeight;

  sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  sourceCtx.drawImage(image, 0, 0);
  clearEraseMarks();
  sourceEditor.hidden = false;
  sourcePreview.hidden = true;
}

function publishBlobResult(blob, message) {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = URL.createObjectURL(blob);
  resultPreview.src = resultUrl;
  resultPreview.hidden = false;
  resultEmpty.hidden = true;
  resultMeta.textContent = `PNG · ${formatBytes(blob.size)}`;
  downloadLink.href = resultUrl;
  downloadLink.classList.remove("disabled");
  setStatus(message);
}

function publishCanvasResult(canvas, message) {
  canvas.toBlob((blob) => {
    if (!blob) {
      setStatus("產生 PNG 失敗，請重新整理後再試。", true);
      return;
    }

    publishBlobResult(blob, message);
  }, "image/png");
}

function prepareEditableResult(blob) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);

    image.onload = () => {
      editableResultCanvas.width = sourceCanvas.width || image.naturalWidth;
      editableResultCanvas.height = sourceCanvas.height || image.naturalHeight;
      editableResultCtx.clearRect(0, 0, editableResultCanvas.width, editableResultCanvas.height);
      editableResultCtx.drawImage(image, 0, 0, editableResultCanvas.width, editableResultCanvas.height);
      URL.revokeObjectURL(url);
      baseResultImageData = editableResultCtx.getImageData(0, 0, editableResultCanvas.width, editableResultCanvas.height);
      resolve();
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("無法讀取去背結果。"));
    };

    image.src = url;
  });
}

function createCheckerboard(ctx, width, height) {
  const size = 10;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      ctx.fillStyle = (x / size + y / size) % 2 === 0 ? "#edf2f0" : "#dbe6e2";
      ctx.fillRect(x, y, size, size);
    }
  }
}

function createObjectThumbnail(candidate) {
  const thumb = document.createElement("canvas");
  thumb.width = 84;
  thumb.height = 84;
  thumb.className = "object-thumb";

  const ctx = thumb.getContext("2d");
  const { minX, minY, maxX, maxY } = candidate.bounds;
  const pad = Math.max(6, Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * 0.15));
  const cropX = Math.max(0, minX - pad);
  const cropY = Math.max(0, minY - pad);
  const cropW = Math.min(editableResultCanvas.width - cropX, maxX - minX + 1 + pad * 2);
  const cropH = Math.min(editableResultCanvas.height - cropY, maxY - minY + 1 + pad * 2);

  createCheckerboard(ctx, thumb.width, thumb.height);

  if (cropW > 0 && cropH > 0) {
    ctx.drawImage(editableResultCanvas, cropX, cropY, cropW, cropH, 0, 0, thumb.width, thumb.height);
  }

  return thumb;
}

function detectObjectsFromResult() {
  const width = editableResultCanvas.width;
  const height = editableResultCanvas.height;
  const imageData = baseResultImageData;
  const data = imageData.data;
  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  const map = new Int32Array(totalPixels);
  const alphaThreshold = 12;
  const minPixels = Math.max(90, Math.round(totalPixels * 0.00015));
  const candidates = [];

  let rawId = 0;

  for (let start = 0; start < totalPixels; start += 1) {
    if (visited[start] || data[start * 4 + 3] <= alphaThreshold) continue;

    let head = 0;
    let tail = 0;
    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    rawId += 1;
    queue[tail] = start;
    tail += 1;
    visited[start] = 1;

    while (head < tail) {
      const index = queue[head];
      head += 1;
      count += 1;

      const x = index % width;
      const y = Math.floor(index / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      map[index] = rawId;

      const neighbors = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1,
      ];

      for (const next of neighbors) {
        if (next < 0 || visited[next] || data[next * 4 + 3] <= alphaThreshold) continue;
        visited[next] = 1;
        queue[tail] = next;
        tail += 1;
      }
    }

    if (count >= minPixels) {
      candidates.push({
        rawId,
        selected: false,
        pixels: count,
        bounds: { minX, minY, maxX, maxY },
      });
    }
  }

  candidates.sort((a, b) => b.pixels - a.pixels);
  candidates.forEach((candidate, index) => {
    candidate.label = `物件 ${index + 1}`;
  });

  componentMap = map;
  objectCandidates = candidates;
}

function renderObjectButtons() {
  objectList.replaceChildren();

  if (!objectCandidates.length) {
    objectSummary.textContent = "沒有偵測到可分開選取的物件，已保留 AI 判斷的主體。";
    objectTools.hidden = false;
    applyObjectsButton.disabled = true;
    return;
  }

  objectSummary.textContent = `分析到 ${objectCandidates.length} 個物件。點選縮圖可即時切換，右側預覽會同步更新。`;
  applyObjectsButton.disabled = true;

  for (const candidate of objectCandidates) {
    const button = document.createElement("button");
    const area = `${candidate.bounds.maxX - candidate.bounds.minX + 1} x ${candidate.bounds.maxY - candidate.bounds.minY + 1}`;
    button.className = "object-button";
    button.type = "button";
    const meta = document.createElement("div");
    meta.className = "object-meta";

    const title = document.createElement("div");
    title.className = "object-title";
    title.textContent = candidate.label;

    const detail = document.createElement("div");
    detail.className = "object-detail";
    detail.textContent = area;

    const state = document.createElement("div");
    state.className = "object-state";
    state.textContent = "未選取";

    meta.append(title, detail, state);

    button.append(createObjectThumbnail(candidate), meta);
    button.addEventListener("click", () => {
      candidate.selected = !candidate.selected;
      button.classList.toggle("active", candidate.selected);
      state.textContent = candidate.selected ? "已選取" : "未選取";
      refreshSelectionPreview();
      updateApplyObjectsState();
    });
    objectList.append(button);
  }

  objectTools.hidden = false;
}

function updateApplyObjectsState() {
  applyObjectsButton.disabled = !objectCandidates.some((candidate) => candidate.selected);
}

function showFullAnalysisResult(message) {
  if (!baseResultImageData) return;

  editableResultCtx.putImageData(baseResultImageData, 0, 0);
  publishCanvasResult(editableResultCanvas, message);
}

function refreshSelectionPreview(message) {
  if (!baseResultImageData || !componentMap || !objectCandidates.length) return false;

  const selectedRawIds = getSelectedRawIds();
  if (!selectedRawIds.size) {
    showFullAnalysisResult("目前沒有選取物件。點選左側縮圖後，右側會只顯示選取物件。");
    return false;
  }

  const output = new ImageData(
    new Uint8ClampedArray(baseResultImageData.data),
    baseResultImageData.width,
    baseResultImageData.height,
  );

  for (let index = 0; index < componentMap.length; index += 1) {
    if (!selectedRawIds.has(componentMap[index])) {
      output.data[index * 4 + 3] = 0;
    }
  }

  editableResultCtx.putImageData(output, 0, 0);
  publishCanvasResult(
    editableResultCanvas,
    message || `已選取 ${selectedRawIds.size} 個物件，右側預覽已更新。`,
  );
  brushTools.hidden = false;
  return true;
}

function applySelectedObjects() {
  if (!baseResultImageData || !componentMap || !objectCandidates.length) {
    setStatus("請先分析物件。", true);
    return;
  }

  if (refreshSelectionPreview("已套用選取物件，可再用擦除筆刷清理邊緣。")) {
    clearEraseMarks();
  }
}

function canvasPointFromEvent(event) {
  const rect = maskCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (maskCanvas.width / rect.width),
    y: (event.clientY - rect.top) * (maskCanvas.height / rect.height),
  };
}

function eraseResultPoint(event) {
  if (!editableResultCanvas.width || !editableResultCanvas.height) return;

  if (!eraseBaseImageData) {
    eraseBaseImageData = editableResultCtx.getImageData(
      0,
      0,
      editableResultCanvas.width,
      editableResultCanvas.height,
    );
  }

  const point = canvasPointFromEvent(event);
  const radius = Number(brushSizeInput.value) / 2;

  maskCtx.save();
  maskCtx.globalCompositeOperation = "source-over";
  maskCtx.fillStyle = "#d92d20";
  maskCtx.beginPath();
  maskCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  maskCtx.fill();
  maskCtx.restore();

  editableResultCtx.save();
  editableResultCtx.globalCompositeOperation = "destination-out";
  editableResultCtx.beginPath();
  editableResultCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  editableResultCtx.fill();
  editableResultCtx.restore();

  eraseDirty = true;
}

function applyEraseCorrection() {
  if (!editableResultCanvas.width || !editableResultCanvas.height) {
    setStatus("請先分析並產生結果。", true);
    return;
  }

  if (!eraseDirty) {
    setStatus("請先用擦除筆刷標記要移除的區域。", true);
    return;
  }

  publishCanvasResult(editableResultCanvas, "擦除修正已套用，可以下載 PNG。");
  clearEraseMarks();
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
  sourceImage = new Image();
  sourceImage.onload = () => prepareSourceCanvas(sourceImage);
  sourceImage.src = sourceUrl;
  sourceEmpty.hidden = true;
  fileMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  analyzeButton.disabled = false;
  resetResult();
  setStatus("圖片已載入，按「分析物件」偵測可保留的物件。");
}

async function analyzeObjects() {
  if (!selectedFile) return;

  if (!hasAiRuntime()) {
    setStatus("AI 執行環境尚未啟用。請重新整理頁面一次，再重新上傳圖片。", true);
    return;
  }

  analyzeButton.disabled = true;
  toolPanel.classList.add("is-busy");
  resetResult();
  setStatus("正在分析圖片物件，第一次使用會先下載 AI 模型。");

  try {
    const startedAt = performance.now();
    const blob = await removeBackground(selectedFile, modelConfig);
    await prepareEditableResult(blob);
    detectObjectsFromResult();
    renderObjectButtons();
    publishBlobResult(blob, `物件分析完成，用時 ${((performance.now() - startedAt) / 1000).toFixed(1)} 秒。請選擇要保留的物件。`);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`處理失敗：${message || "請重新整理後再試。"}`, true);
  } finally {
    analyzeButton.disabled = false;
    toolPanel.classList.remove("is-busy");
  }
}

input.addEventListener("change", (event) => {
  loadFile(event.target.files?.[0]);
});

analyzeButton.addEventListener("click", analyzeObjects);
applyObjectsButton.addEventListener("click", applySelectedObjects);

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

brushSizeInput.addEventListener("input", () => {
  brushSizeValue.value = brushSizeInput.value;
  brushSizeValue.textContent = brushSizeInput.value;
});

clearMaskButton.addEventListener("click", () => {
  if (!eraseDirty) {
    setStatus("目前沒有需要還原的擦除。");
    return;
  }

  clearEraseMarks({ restore: true });
});
applyMaskButton.addEventListener("click", applyEraseCorrection);

maskCanvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  isErasing = true;
  maskCanvas.setPointerCapture(event.pointerId);
  eraseResultPoint(event);
});

maskCanvas.addEventListener("pointermove", (event) => {
  if (!isErasing) return;
  event.preventDefault();
  eraseResultPoint(event);
});

for (const eventName of ["pointerup", "pointercancel", "pointerleave"]) {
  maskCanvas.addEventListener(eventName, () => {
    if (isErasing && eraseDirty) {
      setStatus("已標記擦除區域，按「套用修正」更新右側 PNG。");
    }
    isErasing = false;
  });
}

if (!hasAiRuntime()) {
  setStatus("AI 環境準備中，若頁面自動重整後仍看到此訊息，請按 Ctrl + F5。", true);
}
