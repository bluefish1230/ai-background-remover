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
const brushTools = document.querySelector("#brush-tools");
const brushSizeInput = document.querySelector("#brush-size");
const brushSizeValue = document.querySelector("#brush-size-value");
const paintModeButton = document.querySelector("#paint-mode");
const eraseModeButton = document.querySelector("#erase-mode");
const clearMaskButton = document.querySelector("#clear-mask-button");
const applyMaskButton = document.querySelector("#apply-mask-button");
const sourceEditor = document.querySelector("#source-editor");
const sourceCanvas = document.querySelector("#source-canvas");
const maskCanvas = document.querySelector("#mask-canvas");
const sourceCtx = sourceCanvas.getContext("2d");
const maskCtx = maskCanvas.getContext("2d");

let selectedFile = null;
let sourceUrl = null;
let resultUrl = null;
let sourceImage = null;
let isPainting = false;
let brushMode = "paint";
let maskHasPaint = false;
let correctionDirty = false;
const editableResultCanvas = document.createElement("canvas");
const editableResultCtx = editableResultCanvas.getContext("2d");

const modelConfig = {
  publicPath: new URL("./background-removal-data/", window.location.href).href,
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
  editableResultCanvas.width = 0;
  editableResultCanvas.height = 0;
  correctionDirty = false;
  resultPreview.hidden = true;
  resultPreview.removeAttribute("src");
  resultEmpty.hidden = false;
  resultMeta.textContent = "尚未處理";
  downloadLink.removeAttribute("href");
  downloadLink.classList.add("disabled");
}

function clearMask() {
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  maskHasPaint = false;
  correctionDirty = false;
}

function setBrushMode(mode) {
  brushMode = mode;
  paintModeButton.classList.toggle("active", mode === "paint");
  eraseModeButton.classList.toggle("active", mode === "erase");
}

function canvasPointFromEvent(event) {
  const rect = maskCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (maskCanvas.width / rect.width),
    y: (event.clientY - rect.top) * (maskCanvas.height / rect.height),
  };
}

function drawBrushPoint(event) {
  if (!sourceImage) return;

  const point = canvasPointFromEvent(event);
  const radius = Number(brushSizeInput.value) / 2;

  maskCtx.save();
  maskCtx.globalCompositeOperation = brushMode === "paint" ? "source-over" : "destination-out";
  maskCtx.fillStyle = "#0f8b8d";
  maskCtx.beginPath();
  maskCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  maskCtx.fill();
  maskCtx.restore();

  if (brushMode === "paint") maskHasPaint = true;

  if (!editableResultCanvas.width || !editableResultCanvas.height) return;

  editableResultCtx.save();
  editableResultCtx.beginPath();
  editableResultCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  editableResultCtx.clip();

  if (brushMode === "paint") {
    editableResultCtx.globalCompositeOperation = "source-over";
    editableResultCtx.drawImage(sourceCanvas, 0, 0);
  } else {
    editableResultCtx.globalCompositeOperation = "destination-out";
    editableResultCtx.fillStyle = "#000";
    editableResultCtx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
  }

  editableResultCtx.restore();
  correctionDirty = true;
}

function prepareSourceCanvas(image) {
  sourceCanvas.width = image.naturalWidth;
  sourceCanvas.height = image.naturalHeight;
  maskCanvas.width = image.naturalWidth;
  maskCanvas.height = image.naturalHeight;

  sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  sourceCtx.drawImage(image, 0, 0);
  clearMask();
  sourceEditor.hidden = false;
  sourcePreview.hidden = true;
  brushTools.hidden = false;
}

function applyBrushMask() {
  if (editableResultCanvas.width && editableResultCanvas.height) {
    if (!correctionDirty) {
      setStatus("請先用補回或擦除筆刷修正右側結果。", true);
      return;
    }

    publishCanvasResult(editableResultCanvas, "筆刷修正已套用，可以下載 PNG。");
    clearMask();
    return;
  }

  if (!sourceImage || !maskHasPaint) {
    setStatus("請先按開始去背；若要純手動去背，請用筆刷塗滿要保留的區域。", true);
    return;
  }

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = sourceCanvas.width;
  outputCanvas.height = sourceCanvas.height;
  const outputCtx = outputCanvas.getContext("2d");

  outputCtx.drawImage(sourceCanvas, 0, 0);
  outputCtx.globalCompositeOperation = "destination-in";
  outputCtx.drawImage(maskCanvas, 0, 0);

  outputCanvas.toBlob((blob) => {
    if (!blob) {
      setStatus("筆刷去背失敗，請重新塗抹後再試。", true);
      return;
    }

    prepareEditableResult(blob);
    publishBlobResult(blob, "筆刷去背完成，可以下載 PNG。");
  }, "image/png");
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
      setStatus("筆刷修正失敗，請重新塗抹後再試。", true);
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
      resolve();
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("無法讀取去背結果。"));
    };

    image.src = url;
  });
}

function getMaskBounds(maskData, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (maskData[(y * width + x) * 4 + 3] > 0) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

function focusResultWithBrushMask() {
  if (!maskHasPaint || !editableResultCanvas.width || !editableResultCanvas.height) return false;

  const width = editableResultCanvas.width;
  const height = editableResultCanvas.height;
  const resultImage = editableResultCtx.getImageData(0, 0, width, height);
  const maskImage = maskCtx.getImageData(0, 0, width, height);
  const maskBounds = getMaskBounds(maskImage.data, width, height);

  if (!maskBounds) return false;

  const visited = new Uint8Array(width * height);
  const keep = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const resultData = resultImage.data;
  const maskData = maskImage.data;
  const alphaThreshold = 12;

  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] || resultData[start * 4 + 3] <= alphaThreshold) continue;

    let head = 0;
    let tail = 0;
    let touchesMask = false;
    const componentStart = tail;
    queue[tail] = start;
    tail += 1;
    visited[start] = 1;

    while (head < tail) {
      const index = queue[head];
      head += 1;

      if (maskData[index * 4 + 3] > 0) touchesMask = true;

      const x = index % width;
      const y = Math.floor(index / width);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1,
      ];

      for (const next of neighbors) {
        if (next < 0 || visited[next] || resultData[next * 4 + 3] <= alphaThreshold) continue;
        visited[next] = 1;
        queue[tail] = next;
        tail += 1;
      }
    }

    if (touchesMask) {
      for (let i = componentStart; i < tail; i += 1) {
        keep[queue[i]] = 1;
      }
    }
  }

  for (let index = 0; index < width * height; index += 1) {
    if (!keep[index]) resultData[index * 4 + 3] = 0;
  }

  editableResultCtx.putImageData(resultImage, 0, 0);

  const restoredCanvas = document.createElement("canvas");
  restoredCanvas.width = width;
  restoredCanvas.height = height;
  const restoredCtx = restoredCanvas.getContext("2d");
  restoredCtx.drawImage(sourceCanvas, 0, 0);
  restoredCtx.globalCompositeOperation = "destination-in";
  restoredCtx.drawImage(maskCanvas, 0, 0);

  editableResultCtx.save();
  editableResultCtx.globalCompositeOperation = "source-over";
  editableResultCtx.drawImage(restoredCanvas, 0, 0);
  editableResultCtx.restore();

  return true;
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
  removeButton.disabled = false;
  resetResult();
  setStatus("圖片已載入。若有多個物件，請先在每個要保留的物件上刷一下，再開始去背。");
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
    await prepareEditableResult(blob);
    const focusedWithBrush = focusResultWithBrushMask();
    const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
    if (focusedWithBrush) {
      publishCanvasResult(editableResultCanvas, `已依照筆刷標記保留物件，用時 ${seconds} 秒。若多留了相連物件，請用「擦除」細修。`);
      clearMask();
    } else {
      publishBlobResult(blob, `去背完成，用時 ${seconds} 秒。多物件圖片建議先刷要保留的物件，再按開始去背。`);
    }
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

brushSizeInput.addEventListener("input", () => {
  brushSizeValue.value = brushSizeInput.value;
  brushSizeValue.textContent = brushSizeInput.value;
});

paintModeButton.addEventListener("click", () => setBrushMode("paint"));
eraseModeButton.addEventListener("click", () => setBrushMode("erase"));
clearMaskButton.addEventListener("click", () => {
  clearMask();
  setStatus("筆刷標記已清除，結果圖不會被還原；可繼續補回或擦除。");
});
applyMaskButton.addEventListener("click", applyBrushMask);

maskCanvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  isPainting = true;
  maskCanvas.setPointerCapture(event.pointerId);
  drawBrushPoint(event);
});

maskCanvas.addEventListener("pointermove", (event) => {
  if (!isPainting) return;
  event.preventDefault();
  drawBrushPoint(event);
});

for (const eventName of ["pointerup", "pointercancel", "pointerleave"]) {
  maskCanvas.addEventListener(eventName, () => {
    if (isPainting && correctionDirty) {
      setStatus("已標記修正區域，按「套用修正」更新右側 PNG。");
    }
    isPainting = false;
  });
}

updateRuntimeStatus();
