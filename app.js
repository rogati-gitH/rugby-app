const PERIOD_SECONDS = 35 * 60;
const STORAGE_KEY = "rugby-match-pwa-state-v2";

const EVENT_TYPES = {
  try: { label: "Try", points: 5, summary: "TRY" },
  conversion: { label: "Conversión", points: 2, summary: "CONVERSIÓN" },
  penal: { label: "Penal", points: 3, summary: "PENAL" },
  drop: { label: "Drop", points: 3, summary: "DROP" },
  tryPenal: { label: "Try Penal", points: 7, summary: "TRYPENAL" },
};
const CARD_TYPES = {
  yellow: "Amarilla",
  red20: "Roja 20 min",
  red: "Roja",
  blue: "Azul",
};

const SUMMARY_ROWS = ["try", "conversion", "penal", "drop", "tryPenal"];
let activeTextUrl = "";
let editingEventId = null;

const state = {
  period: 1,
  elapsedSeconds: 0,
  timerId: null,
  isRunning: false,
  runStartedAtMs: null,
  runBaseElapsedSeconds: 0,
  pauseReason: null,
  matchFinished: false,
  events: [],
  curupaCode: "",
  rivalName: "RIVAL",
  crests: {
    rival: "",
  },
};

const dom = {
  rivalCrestInput: document.getElementById("rivalCrestInput"),
  rivalCrestPreview: document.getElementById("rivalCrestPreview"),
  curupaCode: document.getElementById("curupaCode"),
  rivalName: document.getElementById("rivalName"),
  scoreCurupaName: document.getElementById("scoreCurupaName"),
  scoreRivalName: document.getElementById("scoreRivalName"),
  scoreCurupa: document.getElementById("scoreCurupa"),
  scoreRival: document.getElementById("scoreRival"),
  periodLabel: document.getElementById("periodLabel"),
  clockDisplay: document.getElementById("clockDisplay"),
  timerStatus: document.getElementById("timerStatus"),
  startPeriodBtn: document.getElementById("startPeriodBtn"),
  refereePauseBtn: document.getElementById("refereePauseBtn"),
  cardsBtn: document.getElementById("cardsBtn"),
  endPeriodBtn: document.getElementById("endPeriodBtn"),
  eventBtn: document.getElementById("eventBtn"),
  historyBtn: document.getElementById("historyBtn"),
  newMatchBottomBtn: document.getElementById("newMatchBottomBtn"),
  textNotice: document.getElementById("textNotice"),
  textOpenLink: document.getElementById("textOpenLink"),
  textDownloadLink: document.getElementById("textDownloadLink"),
  closeTextNoticeBtn: document.getElementById("closeTextNoticeBtn"),
  eventModal: document.getElementById("eventModal"),
  cardsModal: document.getElementById("cardsModal"),
  historyModal: document.getElementById("historyModal"),
  eventForm: document.getElementById("eventForm"),
  cardsForm: document.getElementById("cardsForm"),
  eventType: document.getElementById("eventType"),
  eventPeriod: document.getElementById("eventPeriod"),
  eventTime: document.getElementById("eventTime"),
  playerName: document.getElementById("playerName"),
  cardPeriod: document.getElementById("cardPeriod"),
  cardTime: document.getElementById("cardTime"),
  cardType: document.getElementById("cardType"),
  cardPlayerName: document.getElementById("cardPlayerName"),
  cardsRivalTeamOptionLabel: document.getElementById("cardsRivalTeamOptionLabel"),
  rivalTeamOptionLabel: document.getElementById("rivalTeamOptionLabel"),
  historyBody: document.getElementById("historyBody"),
  emptyHistory: document.getElementById("emptyHistory"),
  summaryBody: document.getElementById("summaryBody"),
  downloadTextBtn: document.getElementById("downloadTextBtn"),
};

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function todayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRivalName() {
  return state.rivalName.trim() || "RIVAL";
}

function createEventId() {
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getScore() {
  return state.events.reduce(
    (score, event) => {
      if (event.team === "CURUPA") {
        score.curupa += event.value;
      } else {
        score.rival += event.value;
      }
      return score;
    },
    { curupa: 0, rival: 0 }
  );
}

function getSummary() {
  const summary = SUMMARY_ROWS.reduce((acc, eventKey) => {
    acc[eventKey] = { CURUPA: 0, RIVAL: 0 };
    return acc;
  }, {});

  state.events.forEach((event) => {
    if (summary[event.eventKey]) {
      summary[event.eventKey][event.team] += 1;
    }
  });

  return summary;
}

function setStatus(message) {
  dom.timerStatus.textContent = message;
}

function persistState() {
  const snapshot = {
    period: state.period,
    elapsedSeconds: state.elapsedSeconds,
    pauseReason: state.pauseReason,
    matchFinished: state.matchFinished,
    events: state.events,
    curupaCode: state.curupaCode,
    rivalName: state.rivalName,
    crests: state.crests,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== "object") {
      return;
    }

    state.period = saved.period === 2 ? 2 : 1;
    state.elapsedSeconds = Number.isFinite(saved.elapsedSeconds) ? saved.elapsedSeconds : 0;
    state.pauseReason = saved.pauseReason || null;
    state.matchFinished = Boolean(saved.matchFinished);
    state.events = Array.isArray(saved.events) ? saved.events : [];
    state.curupaCode = typeof saved.curupaCode === "string" ? saved.curupaCode : "";
    state.rivalName = typeof saved.rivalName === "string" && saved.rivalName.trim() ? saved.rivalName : "RIVAL";
    state.crests = {
      rival: saved.crests?.rival || "",
    };
    state.runStartedAtMs = null;
    state.runBaseElapsedSeconds = state.elapsedSeconds;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function renderCrest(boxInput, preview, dataUrl) {
  const box = boxInput.closest(".crest-box");
  preview.src = dataUrl || "";
  box.classList.toggle("has-image", Boolean(dataUrl));
}

function renderScore() {
  const score = getScore();
  dom.scoreCurupa.textContent = score.curupa;
  dom.scoreRival.textContent = score.rival;
  dom.scoreCurupaName.textContent = state.curupaCode ? `CURUPA ${state.curupaCode}` : "CURUPA";
  dom.scoreRivalName.textContent = getRivalName();
  dom.rivalTeamOptionLabel.textContent = getRivalName();
  dom.cardsRivalTeamOptionLabel.textContent = getRivalName();
}

function renderHistory() {
  dom.historyBody.replaceChildren();

  state.events.forEach((event) => {
    const row = document.createElement("tr");
    const cells = [
      event.period,
      event.time,
      event.team === "CURUPA" ? "CURUPA" : getRivalName(),
      event.player || "-",
      event.eventLabel,
      event.value,
    ];

    cells.forEach((cellValue) => {
      const cell = document.createElement("td");
      cell.textContent = cellValue;
      row.appendChild(cell);
    });

    const actionCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-event-button";
    deleteButton.type = "button";
    deleteButton.dataset.eventId = event.id;
    deleteButton.setAttribute("aria-label", `Borrar evento ${event.eventLabel} de ${event.team}`);
    deleteButton.textContent = "Borrar";
    actionCell.appendChild(deleteButton);
    row.appendChild(actionCell);

    const editCell = document.createElement("td");
    const editButton = document.createElement("button");
    editButton.className = "edit-event-button";
    editButton.type = "button";
    editButton.dataset.eventId = event.id;
    editButton.setAttribute("aria-label", `Editar evento ${event.eventLabel} de ${event.team}`);
    editButton.textContent = "Editar";
    editCell.appendChild(editButton);
    row.appendChild(editCell);

    dom.historyBody.appendChild(row);
  });

  dom.emptyHistory.hidden = state.events.length > 0;
}

function renderSummary() {
  const summary = getSummary();
  dom.summaryBody.replaceChildren();

  SUMMARY_ROWS.forEach((eventKey) => {
    const row = document.createElement("tr");
    const labelCell = document.createElement("td");
    const curupaCell = document.createElement("td");
    const rivalCell = document.createElement("td");

    labelCell.textContent = EVENT_TYPES[eventKey].summary;
    curupaCell.textContent = summary[eventKey].CURUPA;
    rivalCell.textContent = summary[eventKey].RIVAL;

    row.append(labelCell, curupaCell, rivalCell);
    dom.summaryBody.appendChild(row);
  });
}

function renderControls() {
  const pausedByReferee = state.pauseReason === "referee";
  dom.refereePauseBtn.classList.toggle("is-active", pausedByReferee);
  dom.startPeriodBtn.disabled = state.matchFinished || state.elapsedSeconds >= PERIOD_SECONDS;
  dom.refereePauseBtn.disabled = state.matchFinished;
  dom.cardsBtn.disabled = state.matchFinished;
  dom.eventBtn.disabled = state.matchFinished;
  dom.endPeriodBtn.textContent = state.period === 1 ? "Fin de período" : "Fin de partido";
  dom.newMatchBottomBtn.disabled = !state.matchFinished;
}

function render() {
  dom.curupaCode.value = state.curupaCode;
  dom.rivalName.value = state.rivalName === "RIVAL" ? "" : state.rivalName;
  dom.periodLabel.textContent = state.period;
  dom.clockDisplay.textContent = formatTime(state.elapsedSeconds);
  dom.clockDisplay.setAttribute("datetime", `PT${state.elapsedSeconds}S`);

  renderCrest(dom.rivalCrestInput, dom.rivalCrestPreview, state.crests.rival);
  renderScore();
  renderHistory();
  renderSummary();
  renderControls();
}

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  if (state.isRunning && state.runStartedAtMs) {
    const deltaSeconds = Math.floor((Date.now() - state.runStartedAtMs) / 1000);
    state.elapsedSeconds = Math.min(PERIOD_SECONDS, state.runBaseElapsedSeconds + Math.max(0, deltaSeconds));
  }
  state.runStartedAtMs = null;
  state.runBaseElapsedSeconds = state.elapsedSeconds;
  state.isRunning = false;
}

function tick() {
  if (!state.isRunning || state.pauseReason || state.matchFinished) {
    return;
  }

  const deltaSeconds = Math.floor((Date.now() - state.runStartedAtMs) / 1000);
  state.elapsedSeconds = Math.min(PERIOD_SECONDS, state.runBaseElapsedSeconds + Math.max(0, deltaSeconds));
  if (state.elapsedSeconds >= PERIOD_SECONDS) {
    state.elapsedSeconds = PERIOD_SECONDS;
    stopTimer();
    setStatus("Tiempo cumplido. Registrar fin de período.");
  }

  persistState();
  render();
}

function startTimer() {
  if (state.matchFinished) {
    return;
  }

  if (state.elapsedSeconds >= PERIOD_SECONDS) {
    setStatus("Tiempo cumplido. Registrar fin de período.");
    renderControls();
    return;
  }

  state.pauseReason = null;
  state.runBaseElapsedSeconds = state.elapsedSeconds;
  state.runStartedAtMs = Date.now();

  if (!state.timerId) {
    state.timerId = setInterval(tick, 250);
  }

  state.isRunning = true;
  setStatus(`Período ${state.period} en juego`);
  persistState();
  render();
}

function togglePause(reason) {
  if (state.matchFinished) {
    return;
  }

  if (state.pauseReason === reason) {
    state.pauseReason = null;
    startTimer();
    return;
  }

  stopTimer();
  state.pauseReason = reason;
  setStatus("Pausa referee activa");
  persistState();
  render();
}

function finishPeriod() {
  stopTimer();
  state.pauseReason = null;

  if (state.period === 1) {
    state.period = 2;
    state.elapsedSeconds = 0;
    state.runBaseElapsedSeconds = 0;
    state.runStartedAtMs = null;
    setStatus("Período 2 listo para iniciar");
    persistState();
    render();
    return;
  }

  state.matchFinished = true;
  setStatus("Partido finalizado. TXT generado.");
  persistState();
  render();
  generateTextFile();
}

function openModal(modal) {
  modal.hidden = false;
  const focusable = modal.querySelector("button, input, select, textarea");
  focusable?.focus();
}

function closeModal(modal) {
  modal.hidden = true;
}

function prepareNewEvent() {
  editingEventId = null;
  document.getElementById("eventModalTitle").textContent = "Evento del partido";
  dom.eventForm.reset();
  dom.eventForm.elements.team.value = "CURUPA";
  dom.eventPeriod.value = String(state.period);
  dom.eventTime.value = formatTime(state.elapsedSeconds);
  openModal(dom.eventModal);
}

function openEditEvent(eventId) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) {
    return;
  }

  editingEventId = eventId;
  document.getElementById("eventModalTitle").textContent = "Editar incidencia";
  dom.eventForm.elements.team.value = event.team;
  dom.eventPeriod.value = String(event.period);
  dom.eventTime.value = event.time;
  dom.eventType.value = event.eventKey;
  dom.playerName.value = event.player || "";
  closeModal(dom.historyModal);
  openModal(dom.eventModal);
}

function normalizeEventTime(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) {
    return null;
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || seconds > 59) {
    return null;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function saveEvent(formData) {
  const eventKey = formData.get("eventType");
  const eventType = EVENT_TYPES[eventKey];
  const team = formData.get("team") === "RIVAL" ? "RIVAL" : "CURUPA";
  const player = String(formData.get("playerName") || "").trim();
  const period = formData.get("eventPeriod") === "2" ? 2 : 1;
  const time = normalizeEventTime(formData.get("eventTime"));

  if (!eventType || !time) {
    alert("Revisá el tiempo. Usá formato MM:SS, por ejemplo 03:25.");
    return;
  }

  const eventPayload = {
    id: editingEventId || createEventId(),
    period,
    time,
    team,
    eventKey,
    eventLabel: eventType.label,
    value: eventType.points,
    player,
  };

  if (editingEventId) {
    const eventIndex = state.events.findIndex((event) => event.id === editingEventId);
    if (eventIndex !== -1) {
      state.events[eventIndex] = eventPayload;
    }
    editingEventId = null;
  } else {
    state.events.push(eventPayload);
  }

  persistState();
  render();
}

function prepareCardsEvent() {
  dom.cardsForm.reset();
  dom.cardsForm.elements.team.value = "CURUPA";
  dom.cardPeriod.value = String(state.period);
  dom.cardTime.value = formatTime(state.elapsedSeconds);
  openModal(dom.cardsModal);
}

function saveCardEvent(formData) {
  const cardType = formData.get("cardType");
  const team = formData.get("team") === "RIVAL" ? "RIVAL" : "CURUPA";
  const period = formData.get("cardPeriod") === "2" ? 2 : 1;
  const time = normalizeEventTime(formData.get("cardTime"));
  const player = String(formData.get("cardPlayerName") || "").trim();
  const cardLabel = CARD_TYPES[cardType];

  if (!cardLabel || !time) {
    alert("Revisá el tiempo. Usá formato MM:SS, por ejemplo 03:25.");
    return;
  }

  state.events.push({
    id: createEventId(),
    period,
    time,
    team,
    eventKey: "card",
    eventLabel: `Tarjeta ${cardLabel}`,
    value: 0,
    player,
  });

  persistState();
  render();
}

function deleteEvent(eventId) {
  const eventIndex = state.events.findIndex((event) => event.id === eventId);
  if (eventIndex === -1) {
    return;
  }

  const event = state.events[eventIndex];
  const confirmed = confirm(`¿Borrar este evento?\n\n${event.period} | ${event.time} | ${event.eventLabel} | ${event.player || "-"}`);
  if (!confirmed) {
    return;
  }

  state.events.splice(eventIndex, 1);
  persistState();
  render();
}

function sanitizeFilePart(value) {
  const cleaned = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "");
  return cleaned || "Rival";
}

function getTextReport() {
  const date = todayISO();
  const rivalName = getRivalName();
  const score = getScore();
  const summary = getSummary();
  const colWidth = 11;
  const formatCol = (value) => String(value ?? "").slice(0, colWidth).padEnd(colWidth, " ");
  const joinCols = (cols) => cols.map((col) => formatCol(col)).join("");

  const lines = [
    "Registro de partido",
    `Fecha: ${date}`,
    `Resultado final: CURUPA ${score.curupa} - ${score.rival} ${rivalName}`,
    "",
    "Historial completo",
    joinCols(["PER", "TIEMPO", "EQUIPO", "JUGADOR", "EVENTO", "VALOR"]),
  ];

  if (state.events.length === 0) {
    lines.push("Sin eventos registrados");
  } else {
    state.events.forEach((event) => {
      lines.push(
        joinCols([
          event.period,
          event.time,
          event.team === "CURUPA" ? "CURUPA" : rivalName,
          event.player || "-",
          event.eventLabel,
          event.value,
        ])
      );
    });
  }

  lines.push("", "Resumen", joinCols(["EVENTO", "CURUPA", "RIVAL"]));
  SUMMARY_ROWS.forEach((eventKey) => {
    lines.push(joinCols([EVENT_TYPES[eventKey].summary, summary[eventKey].CURUPA, summary[eventKey].RIVAL]));
  });

  return `${lines.join("\n")}\n`;
}

function showTextResult(blob, fileName) {
  if (activeTextUrl) {
    URL.revokeObjectURL(activeTextUrl);
  }

  activeTextUrl = URL.createObjectURL(blob);
  dom.textOpenLink.href = activeTextUrl;
  dom.textDownloadLink.href = activeTextUrl;
  dom.textDownloadLink.download = fileName;
  dom.textNotice.hidden = false;

  const downloadLink = document.createElement("a");
  downloadLink.href = activeTextUrl;
  downloadLink.download = fileName;
  downloadLink.style.display = "none";
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
}

function generateTextFile() {
  const date = todayISO();
  const rivalName = getRivalName();
  const fileName = `${date}_${sanitizeFilePart(rivalName)}.txt`;
  const blob = new Blob([getTextReport()], { type: "text/plain;charset=utf-8" });
  showTextResult(blob, fileName);
}

function handleCrestUpload(side, input, preview) {
  const file = input.files?.[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    state.crests[side] = String(reader.result || "");
    renderCrest(input, preview, state.crests[side]);
    persistState();
  });
  reader.readAsDataURL(file);
}

function resetMatch() {
  const confirmed = confirm("¿Iniciar un partido nuevo y borrar el historial actual?");
  if (!confirmed) {
    return;
  }

  stopTimer();
  state.period = 1;
  state.elapsedSeconds = 0;
  state.runBaseElapsedSeconds = 0;
  state.runStartedAtMs = null;
  state.pauseReason = null;
  state.matchFinished = false;
  state.events = [];
  setStatus("Listo para iniciar");
  persistState();
  render();
}

function bindEvents() {
  dom.startPeriodBtn.addEventListener("click", startTimer);
  dom.endPeriodBtn.addEventListener("click", finishPeriod);
  dom.refereePauseBtn.addEventListener("click", () => togglePause("referee"));
  dom.cardsBtn.addEventListener("click", prepareCardsEvent);
  dom.eventBtn.addEventListener("click", prepareNewEvent);
  dom.historyBtn.addEventListener("click", () => openModal(dom.historyModal));
  dom.downloadTextBtn.addEventListener("click", generateTextFile);
  dom.closeTextNoticeBtn.addEventListener("click", () => {
    dom.textNotice.hidden = true;
  });
  dom.newMatchBottomBtn.addEventListener("click", resetMatch);

  dom.historyBody.addEventListener("click", (event) => {
    const deleteButton = event.target.closest(".delete-event-button");
    if (deleteButton) {
      deleteEvent(deleteButton.dataset.eventId);
      return;
    }

    const editButton = event.target.closest(".edit-event-button");
    if (editButton) {
      openEditEvent(editButton.dataset.eventId);
    }
  });

  dom.curupaCode.addEventListener("input", (event) => {
    state.curupaCode = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    event.target.value = state.curupaCode;
    persistState();
    renderScore();
  });

  dom.rivalName.addEventListener("input", (event) => {
    state.rivalName = event.target.value.trim() || "RIVAL";
    persistState();
    renderScore();
  });

  dom.rivalCrestInput.addEventListener("change", () => handleCrestUpload("rival", dom.rivalCrestInput, dom.rivalCrestPreview));

  dom.eventForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveEvent(new FormData(dom.eventForm));
    dom.eventForm.reset();
    dom.eventForm.elements.team.value = "CURUPA";
    editingEventId = null;
    document.getElementById("eventModalTitle").textContent = "Evento del partido";
    closeModal(dom.eventModal);
  });

  dom.cardsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveCardEvent(new FormData(dom.cardsForm));
    closeModal(dom.cardsModal);
  });

  document.addEventListener("click", (event) => {
    const closeTarget = event.target.closest("[data-close-modal]");
    if (closeTarget) {
      closeModal(document.getElementById(closeTarget.dataset.closeModal));
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal(dom.eventModal);
      closeModal(dom.cardsModal);
      closeModal(dom.historyModal);
    }
  });

  [dom.eventModal, dom.cardsModal, dom.historyModal].forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeModal(modal);
      }
    });
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // The app still works as a normal web page if registration is unavailable.
    });
  }
}

restoreState();
bindEvents();
render();
registerServiceWorker();
