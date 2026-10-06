const fileInput = document.getElementById("fileInput");
const canvas = document.getElementById("patternCanvas");
const ctx = canvas.getContext("2d");
const ruler = document.getElementById("ruler");
const highlight = document.getElementById("highlight");
const stepInput = document.getElementById("stepInput");
const rowInfo = document.getElementById("rowInfo");
const blurOverlay = document.getElementById("blurOverlay");
const dimmingToggle = document.getElementById("dimmingToggle");
const viewMode = document.getElementById("viewMode");
const scaleInput = document.getElementById("scaleInput");
const scaleControl = document.getElementById("scaleControl");
const applyViewButton = document.getElementById("applyView");
const pageNavigation = document.getElementById("pageNavigation");
const pageInfo = document.getElementById("pageInfo");
const canvasContainer = document.getElementById("canvasContainer");
const hRuler = document.getElementById("hRuler");
const hHighlight = document.getElementById("hHighlight");
const hStepInput = document.getElementById("hStepInput");
const hRowInfo = document.getElementById("hRowInfo");
const rulerMode = document.getElementById("rulerMode");

let img = new Image();
let imgWidth = 0, imgHeight = 0;
let rulerPosition = 0;
let step = parseInt(stepInput.value);
let imgOffsetX = 0, imgOffsetY = 0;
let currentProjectIndex = null;
let rowOffset = 0;
let currentViewMode = "fit";
let currentScalePercent = 100;
let currentPage = 0;
let totalPages = 1;
const PAGE_OVERLAP = 0.10;
let hRulerPosition = 0;
let hStep = parseFloat(hStepInput.value);
let hRowOffset = 0;
let hCalibrationStart = null;
let isHCalibrating = false;

let calibrationStart = null;
let isCalibrating = false;

let hasUnsavedChanges = false;
let lastSavedState = null;

document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });

document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('gesturechange', e => e.preventDefault());
document.addEventListener('gestureend', e => e.preventDefault());

document.addEventListener('wheel', e => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
  }
}, { passive: false });

function showToast(message, type = 'success') {
  const backgroundColor = {
    success: 'linear-gradient(to right, #00b09b, #96c93d)',
    error: 'linear-gradient(to right, #ff5f6d, #ffc371)',
    warning: 'linear-gradient(to right, #f093fb, #f5576c)',
    info: 'linear-gradient(to right, #4facfe, #00f2fe)'
  };

  Toastify({
    text: message,
    duration: 2000,
    close: true,
    gravity: "top",
    position: "right",
    backgroundColor: backgroundColor[type],
    stopOnFocus: true
  }).showToast();
}

function getDisplayRow() {
  return Math.floor(rulerPosition / step) + 1 - rowOffset;
}

function checkForChanges() {
  if (currentProjectIndex === null) return;

  const currentState = {
    rulerPosition: rulerPosition,
    step: step,
    rowOffset: rowOffset,
    hRulerPosition, hStep, hRowOffset, rulerMode: rulerMode.value
  };

  hasUnsavedChanges = JSON.stringify(currentState) !== JSON.stringify(lastSavedState);
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      showToast('Недостатньо місця для збереження. Видаліть старі проєкти.', 'error');
    } else {
      showToast('Помилка збереження: ' + error.message, 'error');
    }
    return false;
  }
}

document.getElementById("startCalibration").onclick = () => {
  calibrationStart = parseInt(ruler.style.left) || 0;
  isCalibrating = true;
  document.getElementById("startCalibration").style.display = "none";
  document.getElementById("endCalibration").style.display = "inline-block";
  showToast("Калібровка розпочата. Перемістіть лінійку в кінцеву позицію", "info");
};

document.getElementById("endCalibration").onclick = async () => {
  if (!isCalibrating || calibrationStart === null) return;

  const calibrationEnd = parseInt(ruler.style.left) || 0;
  const pixelDistance = Math.abs(calibrationEnd - calibrationStart);

  const { value: columns } = await Swal.fire({
    title: 'Калібровка',
    text: 'Скільки стовпчиків між початковою і кінцевою позицією?',
    input: 'number',
    inputAttributes: {
      min: 1,
      step: 1
    },
    showCancelButton: true,
    confirmButtonText: 'Підтвердити',
    cancelButtonText: 'Скасувати',
    customClass: {
      confirmButton: 'custom-confirm-btn',
      denyButton: 'custom-deny-btn',
      cancelButton: 'custom-cancel-btn'
    },
    buttonsStyling: false,
    inputValidator: (value) => {
      if (!value || isNaN(value) || parseInt(value) <= 0) {
        return 'Введіть коректну кількість стовпчиків!'
      }
    }
  });

  if (!columns) return;

  const newStep = pixelDistance / parseInt(columns);
  step = newStep;
  stepInput.value = newStep.toFixed(1);

  const currentLeft = parseInt(ruler.style.left) || imgOffsetX;
  rulerPosition = currentLeft - imgOffsetX;
  isCalibrating = false;
  calibrationStart = null;
  document.getElementById("startCalibration").style.display = "inline-block";
  document.getElementById("endCalibration").style.display = "none";

  updateRuler();
  checkForChanges();
  showToast(`Калібровка завершена! Новий крок: ${newStep.toFixed(1)} px`);
};

document.getElementById("setRowOffset").onclick = () => {
  const currentCalculatedRow = Math.floor(rulerPosition / step) + 1;
  rowOffset = currentCalculatedRow - 1;
              updateRuler();
  checkForChanges();
  showToast(`Поточна позиція встановлена як рядок 1`, "info");
};

fileInput.addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;

  if (hasUnsavedChanges && currentProjectIndex !== null) {
    const result = await Swal.fire({
      title: 'Незбережені зміни',
      text: 'У поточному проєкті є незбереженні зміни. Зберегти їх?',
      icon: 'question',
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: 'Зберегти',
      denyButtonText: 'Не зберігати',
      cancelButtonText: 'Скасувати',
      customClass: {
        confirmButton: 'custom-confirm-btn',
        denyButton: 'custom-deny-btn',
        cancelButton: 'custom-cancel-btn'
      },
      buttonsStyling: false
    });

    if (result.isDismissed) return;

    if (result.isConfirmed) {
      try {
      const projects = JSON.parse(localStorage.getItem("beadProjects")) || [];
      if (projects[currentProjectIndex]) {
        projects[currentProjectIndex].rulerPosition = rulerPosition;
        projects[currentProjectIndex].step = step;
        projects[currentProjectIndex].rowOffset = rowOffset;
        projects[currentProjectIndex].hRulerPosition = hRulerPosition;
        projects[currentProjectIndex].hStep = hStep;
        projects[currentProjectIndex].hRowOffset = hRowOffset;
        projects[currentProjectIndex].rulerMode = rulerMode.value;
      if (safeSetItem("beadProjects", JSON.stringify(projects))) {
            showToast("Зміни збережено");
      }
    }
  } catch (error) {
        showToast("Помилка збереження змін: " + error.message, "error");
  }
    }
  }

  currentProjectIndex = null;
  hasUnsavedChanges = false;
  lastSavedState = null;
  rowOffset = 0;
  document.getElementById("updateProject").disabled = true;
  document.getElementById("deleteProject").disabled = true;
  document.getElementById("projectList").value = "";

  if (!file.type.startsWith("image/")) {
    showToast("Оберіть файл зображення (PNG, JPG, WebP тощо)", "warning");
    fileInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = ev => {
    img.onload = () => {
      fitToScreen(img);
      drawImage();
      rulerPosition = 0; hRulerPosition = 0; hRowOffset = 0;
      step = 20; hStep = 20; hStepInput.value = hStep;
      stepInput.value = step;
      updateRuler();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

function getViewportSize() {
  const styles = getComputedStyle(canvasContainer);
  const paddingX = parseFloat(styles.paddingLeft || 0) + parseFloat(styles.paddingRight || 0);
  const paddingY = parseFloat(styles.paddingTop || 0) + parseFloat(styles.paddingBottom || 0);

  // Canvas має по 20 px службового відступу зліва/зверху і запас справа/знизу.
  // Рахуємо саме видиму client-area контейнера, без scrollbar.
  const safetyX = 44;
  const safetyY = 44;

  return {
    width: Math.max(1, canvasContainer.clientWidth - paddingX - safetyX),
    height: Math.max(1, canvasContainer.clientHeight - paddingY - safetyY)
  };
}

function getSourceSize() {
  return {
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height
  };
}

function setCanvasScale(scale) {
  const source = getSourceSize();

  // Canvas зберігає оригінальну кількість пікселів.
  // Масштаб змінює лише CSS-розмір, тому повторне збільшення не псує джерело.
  if (canvas.width !== source.width || canvas.height !== source.height) {
    canvas.width = source.width;
    canvas.height = source.height;
  }

  imgWidth = Math.max(1, source.width * scale);
  imgHeight = Math.max(1, source.height * scale);

  canvas.style.width = imgWidth + "px";
  canvas.style.height = imgHeight + "px";
  imgOffsetX = 20;
  imgOffsetY = 20;
  canvas.style.marginLeft = imgOffsetX + "px";
  canvas.style.marginTop = imgOffsetY + "px";
  canvas.style.marginBottom = "20px";
  syncOverlayGeometry();
}

function fitToScreen(img) {
  const viewport = getViewportSize();
  const source = getSourceSize();
  const scale = Math.min(viewport.width / source.width, viewport.height / source.height, 1);
  setCanvasScale(scale);
  currentViewMode = "fit";
  currentPage = 0;
  totalPages = 1;
  updatePageControls();
}

function syncOverlayGeometry() {
  [blurOverlay, highlight].forEach(el => {
    el.style.top = imgOffsetY + "px";
    el.style.height = imgHeight + "px";
  });
  blurOverlay.style.left = imgOffsetX + "px";
  blurOverlay.style.width = imgWidth + "px";
  ruler.style.top = imgOffsetY + "px";
  ruler.style.height = imgHeight + "px";
  const touchArea = document.getElementById("rulerTouchArea");
  touchArea.style.top = imgOffsetY + "px";
  touchArea.style.height = imgHeight + "px";
  hRuler.style.left = imgOffsetX + "px";
  hRuler.style.width = imgWidth + "px";
  const hTouchArea = document.getElementById("hRulerTouchArea");
  hTouchArea.style.left = imgOffsetX + "px";
  hTouchArea.style.width = imgWidth + "px";
  updateRulerVisibility();
}

function calculatePages(scalePercent) {
  const viewport = getViewportSize();
  const scaledWidth = getSourceSize().width * scalePercent / 100;
  if (scaledWidth <= viewport.width) return 1;
  const stride = viewport.width * (1 - PAGE_OVERLAP);
  return 1 + Math.ceil((scaledWidth - viewport.width) / stride);
}

function updatePageControls() {
  const isPages = currentViewMode === "pages";
  pageNavigation.classList.toggle("is-hidden", !isPages);
  canvasContainer.classList.toggle("page-mode", isPages);
  pageInfo.textContent = `${currentPage + 1} / ${totalPages}`;
  document.getElementById("prevPage").disabled = currentPage <= 0;
  document.getElementById("nextPage").disabled = currentPage >= totalPages - 1;
}

function goToPage(page) {
  if (currentViewMode !== "pages") return;
  currentPage = Math.max(0, Math.min(page, totalPages - 1));
  const pageWidth = getViewportSize().width;
  const stride = pageWidth * (1 - PAGE_OVERLAP);
  canvasContainer.scrollTo({ left: currentPage * stride, behavior: "smooth" });
  updatePageControls();
}

function applyViewMode(mode, scalePercent = 100) {
  if (!img.src || !img.width) return;
  const previousWidth = imgWidth || img.width;
  const previousRulerPosition = rulerPosition;
  const previousStep = step;
  const previousHRulerPosition = hRulerPosition;
  const previousHStep = hStep;
  currentViewMode = mode;
  currentScalePercent = scalePercent;
  currentPage = 0;
  canvasContainer.scrollTo({ left: 0, top: 0, behavior: "auto" });

  if (mode === "fit") {
    const viewport = getViewportSize();
    const source = getSourceSize();
    setCanvasScale(Math.min(viewport.width / source.width, viewport.height / source.height, 1));
    totalPages = 1;
  } else if (mode === "original") {
    setCanvasScale(1);
    totalPages = Math.max(1, Math.ceil(imgWidth / getViewportSize().width));
  } else {
    setCanvasScale(scalePercent / 100);
    totalPages = calculatePages(scalePercent);
  }

  const scaleRatio = previousWidth > 0 ? imgWidth / previousWidth : 1;
  rulerPosition = Math.max(0, Math.min(previousRulerPosition * scaleRatio, imgWidth));
  step = Math.max(0.1, previousStep * scaleRatio);
  stepInput.value = step.toFixed(1);
  hRulerPosition = Math.max(0, Math.min(previousHRulerPosition * scaleRatio, imgHeight));
  hStep = Math.max(0.1, previousHStep * scaleRatio);
  hStepInput.value = hStep.toFixed(1);
  drawImage();
  updateRuler();
  updatePageControls();
  checkForChanges();
}

function drawImage() {
  const source = getSourceSize();
  if (canvas.width !== source.width || canvas.height !== source.height) {
    canvas.width = source.width;
    canvas.height = source.height;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, source.width, source.height);
}

function updateRuler() {
  const left = imgOffsetX + rulerPosition;
  ruler.style.left = left + "px";
  highlight.style.left = left + "px";
  highlight.style.width = step + "px";

  const displayRow = getDisplayRow();
  rowInfo.textContent = `Рядок ≈ ${displayRow} (${rulerPosition.toFixed(1)}px)`;
  updateBlurMask();
  updateHorizontalRuler();
  autoFollowVerticalRuler();
}

function moveRulerTo(left) {
  const minLeft = imgOffsetX;
  const maxLeft = imgOffsetX + imgWidth;
  left = Math.max(minLeft, Math.min(left, maxLeft));

  rulerPosition = left - imgOffsetX;

  ruler.style.left = left + "px";
  highlight.style.left = left + "px";
  highlight.style.width = step + "px";

  const displayRow = getDisplayRow();
  rowInfo.textContent = `Рядок ≈ ${displayRow} (${rulerPosition.toFixed(1)}px)`;
  updateBlurMask();

  checkForChanges();
}

function getDisplayHRow() {
  return Math.floor(hRulerPosition / hStep) + 1 - hRowOffset;
}

function updateHorizontalRuler() {
  const top = imgOffsetY + hRulerPosition;
  hRuler.style.top = top + "px";
  hHighlight.style.top = top + "px";
  hHighlight.style.left = imgOffsetX + "px";
  hHighlight.style.width = imgWidth + "px";
  hHighlight.style.height = hStep + "px";
  const hTouchArea = document.getElementById("hRulerTouchArea");
  hTouchArea.style.top = top + "px";
  hRowInfo.textContent = `Рядок ≈ ${getDisplayHRow()} (${hRulerPosition.toFixed(1)}px)`;
  updateBlurMask();
}

function moveHorizontalRulerTo(top) {
  const minTop = imgOffsetY;
  const maxTop = imgOffsetY + imgHeight;
  top = Math.max(minTop, Math.min(top, maxTop));
  hRulerPosition = top - imgOffsetY;
  updateHorizontalRuler();
  autoFollowHorizontalRuler();
  checkForChanges();
}

function autoFollowVerticalRuler() {
  if (currentViewMode !== "pages") return;
  const viewport = getViewportSize();
  const stride = viewport.width * (1 - PAGE_OVERLAP);
  const x = rulerPosition;
  let target = Math.floor(x / stride);
  target = Math.max(0, Math.min(target, totalPages - 1));
  if (target !== currentPage) goToPage(target);
}

function autoFollowHorizontalRuler() {
  const viewportTop = canvasContainer.scrollTop;
  const viewportBottom = viewportTop + canvasContainer.clientHeight;
  const y = imgOffsetY + hRulerPosition;
  const margin = 50;
  if (y < viewportTop + margin) {
    canvasContainer.scrollTo({ left: canvasContainer.scrollLeft, top: Math.max(0, y - margin), behavior: "smooth" });
  } else if (y > viewportBottom - margin) {
    canvasContainer.scrollTo({ left: canvasContainer.scrollLeft, top: Math.max(0, y - canvasContainer.clientHeight + margin), behavior: "smooth" });
  }
}

function updateRulerVisibility() {
  const mode = rulerMode.value;
  const showV = mode === "vertical" || mode === "both";
  const showH = mode === "horizontal" || mode === "both";
  [ruler, document.getElementById("rulerTouchArea"), highlight].forEach(el => el?.classList.toggle("axis-hidden", !showV));
  [hRuler, document.getElementById("hRulerTouchArea"), hHighlight].forEach(el => el?.classList.toggle("axis-hidden", !showH));
  document.querySelector('.vertical-navigation')?.classList.toggle('axis-controls-disabled', !showV);
  document.querySelector('.vertical-calibration')?.classList.toggle('axis-controls-disabled', !showV);
  document.querySelector('.horizontal-navigation')?.classList.toggle('axis-controls-disabled', !showH);
  document.querySelector('.horizontal-calibration')?.classList.toggle('axis-controls-disabled', !showH);
  updateBlurMask();
}

function updateBlurMask() {
  const relativeLeft = rulerPosition;
  const relativeTop = hRulerPosition;
  document.documentElement.style.setProperty('--ruler-left', relativeLeft + 'px');
  document.documentElement.style.setProperty('--ruler-width', step + 'px');
  document.documentElement.style.setProperty('--h-ruler-top', relativeTop + 'px');
  document.documentElement.style.setProperty('--h-ruler-height', hStep + 'px');
  blurOverlay.dataset.rulerMode = rulerMode.value;
}

hStepInput.onchange = () => {
  hStep = Math.max(0.1, parseFloat(hStepInput.value) || 20);
  hStepInput.value = hStep.toFixed(1);
  updateHorizontalRuler();
  checkForChanges();
};

rulerMode.addEventListener("change", () => {
  updateRulerVisibility();
  checkForChanges();
});

document.getElementById("prevHRow").onclick = () => {
  hRulerPosition = Math.max(0, hRulerPosition - hStep);
  updateHorizontalRuler(); autoFollowHorizontalRuler(); checkForChanges();
};
document.getElementById("nextHRow").onclick = () => {
  hRulerPosition = Math.min(imgHeight, hRulerPosition + hStep);
  updateHorizontalRuler(); autoFollowHorizontalRuler(); checkForChanges();
};
document.getElementById("setHRowOffset").onclick = () => {
  hRowOffset = Math.floor(hRulerPosition / hStep);
  updateHorizontalRuler(); checkForChanges();
  showToast("Поточна зелена позиція встановлена як рядок 1", "info");
};

document.getElementById("startHCalibration").onclick = () => {
  hCalibrationStart = hRulerPosition;
  isHCalibrating = true;
  document.getElementById("startHCalibration").style.display = "none";
  document.getElementById("endHCalibration").style.display = "inline-block";
  showToast("Вертикальна калібровка: перемістіть зелену лінію", "info");
};
document.getElementById("endHCalibration").onclick = async () => {
  if (!isHCalibrating || hCalibrationStart === null) return;
  const pixelDistance = Math.abs(hRulerPosition - hCalibrationStart);
  const { value: rows } = await Swal.fire({
    title: 'Калібровка зеленої лінійки',
    text: 'Скільки рядів між початковою і кінцевою позицією?',
    input: 'number', inputAttributes: { min: 1, step: 1 }, showCancelButton: true,
    confirmButtonText: 'Підтвердити', cancelButtonText: 'Скасувати',
    customClass: { confirmButton: 'custom-confirm-btn', cancelButton: 'custom-cancel-btn' }, buttonsStyling: false,
    inputValidator: v => (!v || isNaN(v) || parseInt(v) <= 0) ? 'Введіть коректну кількість рядів!' : undefined
  });
  if (!rows) return;
  hStep = pixelDistance / parseInt(rows);
  hStepInput.value = hStep.toFixed(1);
  isHCalibrating = false; hCalibrationStart = null;
  document.getElementById("startHCalibration").style.display = "inline-block";
  document.getElementById("endHCalibration").style.display = "none";
  updateHorizontalRuler(); checkForChanges();
  showToast(`Калібровка завершена! Новий крок ↕: ${hStep.toFixed(1)} px`);
};

let hDragging = false;
[hRuler, document.getElementById("hRulerTouchArea")].forEach(element => {
  element?.addEventListener("mousedown", e => { hDragging = true; e.preventDefault(); });
  element?.addEventListener("touchstart", e => { hDragging = true; e.preventDefault(); }, {passive:false});
});
document.addEventListener("mousemove", e => {
  if (!hDragging) return;
  const rect = canvasContainer.getBoundingClientRect();
  moveHorizontalRulerTo(e.clientY - rect.top + canvasContainer.scrollTop);
});
document.addEventListener("touchmove", e => {
  if (!hDragging) return;
  const rect = canvasContainer.getBoundingClientRect();
  moveHorizontalRulerTo(e.touches[0].clientY - rect.top + canvasContainer.scrollTop);
}, {passive:false});
document.addEventListener("mouseup", () => hDragging = false);
document.addEventListener("touchend", () => hDragging = false);

stepInput.onchange = () => {
  step = parseFloat(stepInput.value);
  updateRuler();
  checkForChanges();
};

function updateDimming() {
  const enabled = dimmingToggle.checked;
  blurOverlay.classList.toggle("is-hidden", !enabled);
  document.body.classList.toggle("dimming-off", !enabled);
}

dimmingToggle.addEventListener("change", updateDimming);
updateDimming();

viewMode.addEventListener("change", () => {
  scaleControl.classList.toggle("is-hidden", viewMode.value !== "pages");
});

applyViewButton.addEventListener("click", async () => {
  if (!img.src || !img.width) {
    showToast("Спочатку завантажте схему", "warning");
    return;
  }
  const mode = viewMode.value;
  const scalePercent = Math.max(10, Math.min(200, parseFloat(scaleInput.value) || 100));
  scaleInput.value = scalePercent;

  if (mode === "pages") {
    const pages = calculatePages(scalePercent);
    const result = await Swal.fire({
      title: 'Сторінковий перегляд',
      html: `При масштабі <b>${scalePercent}%</b> схема буде розміщена на <b>${pages}</b> ${pages === 1 ? 'сторінці' : 'сторінках'} по ширині.<br><small>Сусідні сторінки перекриваються на 10%. По вертикалі схема прокручується плавно.</small>`,
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: 'Підтвердити',
      cancelButtonText: 'Редагувати',
      customClass: { confirmButton: 'custom-confirm-btn', cancelButton: 'custom-cancel-btn' },
      buttonsStyling: false
    });
    if (!result.isConfirmed) {
      scaleInput.focus();
      scaleInput.select();
      return;
    }
  }
  applyViewMode(mode, scalePercent);
});

document.getElementById("prevPage").addEventListener("click", () => goToPage(currentPage - 1));
document.getElementById("nextPage").addEventListener("click", () => goToPage(currentPage + 1));

let dragging = false;
let freePositioning = false;

const rulerElements = [ruler, document.getElementById("rulerTouchArea")];

rulerElements.forEach(element => {
  if (!element) return;
  element.addEventListener("mousedown", e => {
  dragging = true;
  freePositioning = true;
  e.preventDefault();
});

  element.addEventListener("touchstart", e => {
    dragging = true;
    freePositioning = true;
    e.preventDefault();
});
});

document.addEventListener("mouseup", () => {
  if(dragging) {
    dragging = false;
    if (!freePositioning && !isCalibrating) {
      snapToGrid();
    }
    freePositioning = false;
  }
});

document.addEventListener("mousemove", e => {
  if (!dragging) return;
  const rect = canvasContainer.getBoundingClientRect();
  moveRulerTo(e.clientX - rect.left + canvasContainer.scrollLeft);
});

document.addEventListener("touchend", () => {
  if(dragging) {
    dragging = false;
    if (!freePositioning && !isCalibrating) {
      snapToGrid();
    }
    freePositioning = false;
  }
});

document.addEventListener("touchmove", e => {
  if (!dragging) return;
  const rect = canvasContainer.getBoundingClientRect();
  moveRulerTo(e.touches[0].clientX - rect.left + canvasContainer.scrollLeft);
});
document.getElementById("prevRow").onclick = () => {
  rulerPosition = Math.max(0, rulerPosition - step);
  updateRuler();
  autoFollowVerticalRuler();
  checkForChanges();
};

document.getElementById("nextRow").onclick = () => {
  rulerPosition = Math.min(imgWidth, rulerPosition + step);
      updateRuler();
  autoFollowVerticalRuler();
  checkForChanges();
      };

function snapToGrid() {
  const left = parseInt(ruler.style.left) || 0;
  const snappedPosition = Math.round((left - imgOffsetX) / step) * step;
  rulerPosition = Math.max(0, snappedPosition);
  moveRulerTo(imgOffsetX + rulerPosition);
}
function loadProjectList() {
    const projects = JSON.parse(localStorage.getItem("beadProjects")) || [];
  const select = document.getElementById("projectList");
  select.innerHTML = `<option value="">-- Обрати проєкт --</option>`;
  projects.forEach((p,i)=>{
    const opt = document.createElement("option");
    opt.value=i;
    opt.textContent=p.name||`Проєкт ${i+1}`;
    select.appendChild(opt);
  });
    }

document.getElementById("saveProject").onclick = async () => {
  if (!img.src) {
    showToast("Спочатку завантажте картинку", "warning");
    return;
  }

  const projects = JSON.parse(localStorage.getItem("beadProjects")) || [];

  const { value: name } = await Swal.fire({
    title: 'Зберегти проєкт',
    text: 'Введіть назву проєкту:',
    input: 'text',
    inputValue: `Проєкт ${projects.length + 1}`,
    showCancelButton: true,
    confirmButtonText: 'Зберегти',
    cancelButtonText: 'Скасувати',
    customClass: {
      confirmButton: 'custom-confirm-btn',
      denyButton: 'custom-deny-btn',
      cancelButton: 'custom-cancel-btn'
    },
    buttonsStyling: false,
    inputValidator: (value) => {
      if (!value || value.trim() === '') {
        return 'Введіть назву проєкту!'
      }
    }
  });

  if (!name) return;

  const data = {
    name: name.trim(),
    imgSrc: img.src,
    rulerPosition: rulerPosition,
    step,
    rowOffset,
    hRulerPosition, hStep, hRowOffset, rulerMode: rulerMode.value
};
  projects.push(data);

  if (safeSetItem("beadProjects", JSON.stringify(projects))) {
    currentProjectIndex = projects.length - 1;
loadProjectList();
updateRulerVisibility();
    document.getElementById("projectList").value = currentProjectIndex;
    document.getElementById("updateProject").disabled = false;
    document.getElementById("deleteProject").disabled = false;

    lastSavedState = {
      rulerPosition: rulerPosition,
      step: step,
      rowOffset: rowOffset,
      hRulerPosition, hStep, hRowOffset, rulerMode: rulerMode.value
    };
    hasUnsavedChanges = false;

    showToast("Проєкт збережено ✅");
  }
};

document.getElementById("projectList").onchange = () => {
  const select = document.getElementById("projectList");
  const idx = select.value;

  if (idx === "") {
    currentProjectIndex = null;
    document.getElementById("updateProject").disabled = true;
    document.getElementById("deleteProject").disabled = true;
    return;
  }

  try {
    const projects = JSON.parse(localStorage.getItem("beadProjects")) || [];
    const data = projects[idx];
    if (!data) {
      showToast("Проєкт не знайдено", "error");
      return;
    }

    currentProjectIndex = parseInt(idx);
    document.getElementById("updateProject").disabled = false;
    document.getElementById("deleteProject").disabled = false;

    img.onload = () => {
      fitToScreen(img);
      drawImage();
      step = data.step;
      stepInput.value = step;
      rulerPosition = data.rulerPosition || 0;
      rowOffset = data.rowOffset || 0;
      hRulerPosition = data.hRulerPosition || 0;
      hStep = data.hStep || 20;
      hStepInput.value = hStep;
      hRowOffset = data.hRowOffset || 0;
      rulerMode.value = data.rulerMode || "both";
      updateRuler(); updateHorizontalRuler(); updateRulerVisibility();

      lastSavedState = {
        rulerPosition: rulerPosition, step: step, rowOffset: rowOffset,
        hRulerPosition, hStep, hRowOffset, rulerMode: rulerMode.value
      };
      hasUnsavedChanges = false;

      showToast(`Проєкт "${data.name}" завантажено`);
    };

    img.onerror = () => {
      showToast("Помилка завантаження картинки проєкту", "error");
    };

    img.src = data.imgSrc;
  } catch (error) {
    showToast("Помилка завантаження проєкту: " + error.message, "error");
  }
};

document.getElementById("updateProject").onclick = () => {
  if (currentProjectIndex === null) {
    showToast("Немає завантаженого проєкту для оновлення", "warning");
    return;
  }

  try {
    const projects = JSON.parse(localStorage.getItem("beadProjects")) || [];
    if (!projects[currentProjectIndex]) {
      showToast("Проєкт не знайдено", "error");
      return;
    }

    projects[currentProjectIndex].rulerPosition = rulerPosition;
    projects[currentProjectIndex].step = step;
    projects[currentProjectIndex].rowOffset = rowOffset;
    projects[currentProjectIndex].hRulerPosition = hRulerPosition;
    projects[currentProjectIndex].hStep = hStep;
    projects[currentProjectIndex].hRowOffset = hRowOffset;
    projects[currentProjectIndex].rulerMode = rulerMode.value;

    if (safeSetItem("beadProjects", JSON.stringify(projects))) {
loadProjectList();
      document.getElementById("projectList").value = currentProjectIndex;

      lastSavedState = {
        rulerPosition: rulerPosition, step: step, rowOffset: rowOffset,
        hRulerPosition, hStep, hRowOffset, rulerMode: rulerMode.value
      };
      hasUnsavedChanges = false;

      showToast("Проєкт оновлено ✅");
    }
  } catch (error) {
    showToast("Помилка оновлення проєкту: " + error.message, "error");
  }
};

document.getElementById("deleteProject").onclick = async () => {
  if (currentProjectIndex === null) {
    showToast("Немає проєкту для видалення", "warning");
    return;
  }

  try {
    const projects = JSON.parse(localStorage.getItem("beadProjects")) || [];
    const projectName = projects[currentProjectIndex]?.name || "Проєкт";

    const result = await Swal.fire({
      title: 'Видалити проєкт?',
      text: `Видалити проєкт "${projectName}"? Цю дію неможливо скасувати.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      customClass: {
        confirmButton: 'custom-confirm-btn',
        denyButton: 'custom-deny-btn',
        cancelButton: 'custom-cancel-btn'
      },
      buttonsStyling: false,
      confirmButtonText: 'Так, видалити!',
      cancelButtonText: 'Скасувати'
    });

    if (result.isConfirmed) {
      projects.splice(currentProjectIndex, 1);

      if (safeSetItem("beadProjects", JSON.stringify(projects))) {
        currentProjectIndex = null;
        hasUnsavedChanges = false;
        lastSavedState = null;

        loadProjectList();
        document.getElementById("projectList").value = "";
        document.getElementById("updateProject").disabled = true;
        document.getElementById("deleteProject").disabled = true;

        showToast(`Проєкт "${projectName}" видалено`);
      }
    }
  } catch (error) {
    showToast("Помилка видалення проєкту: " + error.message, "error");
  }
};

loadProjectList();
updateRulerVisibility();


// ===== Fit both top toolbar rows without horizontal scrolling =====
function fitToolbarRow(row) {
  if (!row) return;
  row.style.setProperty("--toolbar-scale", "1");
  row.style.transform = "none";
  row.style.width = "100%";

  requestAnimationFrame(() => {
    const available = Math.max(1, window.innerWidth);
    const needed = Math.max(1, row.scrollWidth);
    const scale = Math.min(1, available / needed);

    if (row.id === "secondaryControls") {
      row.style.setProperty("--toolbar-scale", scale.toFixed(4));
      row.style.width = (100 / scale).toFixed(3) + "%";
      row.style.transform = `scale(${scale})`;
    } else if (scale < 1) {
      row.style.transformOrigin = "top left";
      row.style.transform = `scale(${scale})`;
      row.style.width = (100 / scale).toFixed(3) + "%";
      row.style.marginBottom = `${-(row.offsetHeight * (1-scale))}px`;
    }
  });
}

function fitTopToolbars() {
  fitToolbarRow(document.getElementById("controls"));
  fitToolbarRow(document.getElementById("secondaryControls"));
}

window.addEventListener("load", fitTopToolbars);
window.addEventListener("resize", fitTopToolbars);
setTimeout(fitTopToolbars, 50);


// Після зміни розміру панелей повторно вписуємо схему,
// якщо активний режим "Вписати в екран".
let fitResizeTimer;
function refitImageAfterLayout() {
  clearTimeout(fitResizeTimer);
  fitResizeTimer = setTimeout(() => {
    if (!img || !img.src) return;
    if (viewMode && viewMode.value === "fit") {
      fitToScreen(img);
      drawImage();
      updateRuler();
      updateHorizontalRuler();
    }
  }, 80);
}

window.addEventListener("resize", refitImageAfterLayout);
window.addEventListener("load", () => setTimeout(refitImageAfterLayout, 150));
