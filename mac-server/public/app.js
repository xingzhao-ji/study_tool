const form = document.querySelector("#askForm");
const regionText = document.querySelector("#regionText");
const marker = document.querySelector("#marker");
const courseHint = document.querySelector("#courseHint");
const nearbyContext = document.querySelector("#nearbyContext");
const askButton = document.querySelector("#askButton");
const clearButton = document.querySelector("#clearButton");
const answer = document.querySelector("#answer");
const answerControls = document.querySelector("#answerControls");
const showFullAnswer = document.querySelector("#showFullAnswer");
const intentOptions = document.querySelector("#intentOptions");
const responseType = document.querySelector("#responseType");
const turns = document.querySelector("#turns");
const turnCount = document.querySelector("#turnCount");
const serviceStatus = document.querySelector("#serviceStatus");
const providerStatus = document.querySelector("#providerStatus");
const sessionStatus = document.querySelector("#sessionStatus");
const currentQuestion = document.querySelector("#currentQuestion");
const currentConfidence = document.querySelector("#currentConfidence");
const detectionState = document.querySelector("#detectionState");
const pairingPanel = document.querySelector("#pairingPanel");
const pairingTokenInput = document.querySelector("#pairingToken");
const pairButton = document.querySelector("#pairButton");
const frameFile = document.querySelector("#frameFile");
const uploadFrameButton = document.querySelector("#uploadFrameButton");
const uploadFrameOnlyButton = document.querySelector("#uploadFrameOnlyButton");
const frameStatus = document.querySelector("#frameStatus");
const framePreview = document.querySelector("#framePreview");
const connectionService = document.querySelector("#connectionService");
const connectionProvider = document.querySelector("#connectionProvider");
const connectionSession = document.querySelector("#connectionSession");
const connectionPairing = document.querySelector("#connectionPairing");
const connectionUpdated = document.querySelector("#connectionUpdated");

let pairingToken = "";
let pairingRequired = false;
let paired = true;
let currentDetection = null;
let pollTimer = null;
let currentAnswerText = "";
let answerExpanded = false;

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers ?? {});

  if (pairingToken) {
    headers.set("x-pairing-token", pairingToken);
  }

  return fetch(path, { ...options, headers });
}

async function loadPairingState() {
  const response = await fetch("/pairing");
  const body = await response.json();
  pairingRequired = body.required === true;
  paired = !pairingRequired;
  pairingPanel.hidden = !pairingRequired;
  connectionPairing.textContent = pairingRequired ? "Token required" : "Local only";

  if (!pairingRequired) {
    await refreshAll();
    startPolling();
  } else {
    serviceStatus.textContent = "Pairing required";
    serviceStatus.dataset.state = "offline";
    providerStatus.textContent = "Enter token";
    connectionService.textContent = "Waiting for token";
    connectionProvider.textContent = "Locked";
    connectionUpdated.textContent = "Not paired";
  }
}

async function refreshAll() {
  await Promise.all([loadStatus(), loadSession()]);
}

async function loadStatus() {
  try {
    const [healthResponse, providersResponse] = await Promise.all([
      apiFetch("/health"),
      apiFetch("/providers")
    ]);

    if (!healthResponse.ok || !providersResponse.ok) {
      throw new Error("status failed");
    }

    const health = await healthResponse.json();
    const providers = await providersResponse.json();
    const active = providers.providers.find((provider) => provider.name === providers.activeProvider);

    serviceStatus.textContent = health.ok ? "Online" : "Unavailable";
    serviceStatus.dataset.state = health.ok ? "online" : "offline";
    providerStatus.textContent = active
      ? `${providers.activeProvider} · ${active.status}`
      : providers.activeProvider;
    connectionService.textContent = health.ok ? "Online" : "Unavailable";
    connectionProvider.textContent = active
      ? `${providers.activeProvider} (${active.status})`
      : providers.activeProvider;
    connectionUpdated.textContent = new Date().toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch (error) {
    serviceStatus.textContent = pairingRequired && !paired ? "Pairing required" : "Offline";
    serviceStatus.dataset.state = "offline";
    providerStatus.textContent = "Provider unavailable";
    connectionService.textContent = pairingRequired && !paired ? "Waiting for token" : "Offline";
    connectionProvider.textContent = "Unavailable";
  }
}

async function loadSession() {
  if (pairingRequired && !paired) {
    return;
  }

  try {
    const response = await apiFetch("/session");

    if (!response.ok) {
      throw new Error("session failed");
    }

    const session = await response.json();
    sessionStatus.textContent = `Session ${shortId(session.id)}`;
    connectionSession.textContent = `${shortId(session.id)} · ${session.turns.length} turns`;
    renderSession(session);
  } catch (error) {
    sessionStatus.textContent = "Session unavailable";
    connectionSession.textContent = "Unavailable";
  }
}

function currentRequest() {
  return {
    regionText: regionText.value.trim(),
    marker: marker.value.trim(),
    courseHint: courseHint.value.trim(),
    nearbyContext: nearbyContext.value.trim()
  };
}

async function submitAsk() {
  const request = currentRequest();

  if (!request.regionText || !request.marker || (pairingRequired && !paired)) {
    return;
  }

  askButton.disabled = true;
  detectionState.textContent = "Submitting";
  clearIntentOptions();

  try {
    const response = await apiFetch("/simulate-detection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });
    const body = await response.json();

    if (!response.ok) {
      renderError(body.answer ?? "Detection failed.");
      return;
    }

    renderDetectionResult(body);
    await loadSession();
  } catch (error) {
    renderError("The local tutor server did not respond.");
  } finally {
    askButton.disabled = false;
  }
}

async function uploadFrame(includeCurrentText = true) {
  if (!frameFile.files?.[0] || (pairingRequired && !paired)) {
    return;
  }

  uploadFrameButton.disabled = true;
  uploadFrameOnlyButton.disabled = true;
  frameStatus.textContent = "Uploading";

  try {
    const dataUrl = await readFileAsDataUrl(frameFile.files[0]);
    const request = currentRequest();
    const manualFields = includeCurrentText
      ? request
      : {
          courseHint: request.courseHint,
          nearbyContext: request.nearbyContext
        };
    const response = await apiFetch("/frame", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataUrl,
        filename: frameFile.files[0].name,
        mimeType: frameFile.files[0].type,
        ...manualFields
      })
    });
    const body = await response.json();

    if (!response.ok) {
      frameStatus.textContent = "Upload failed";
      renderError(body.answer ?? "Frame upload failed.");
      return;
    }

    frameStatus.textContent = body.frame?.saved ? "Frame saved" : "Frame processed";

    if (body.type === "manual_text_required") {
      responseType.textContent = "Manual text required";
      answer.textContent = body.message;
      return;
    }

    renderDetectionResult(body);
    await loadSession();
  } catch (error) {
    frameStatus.textContent = "Upload failed";
    renderError("The local tutor server did not accept the frame.");
  } finally {
    uploadFrameButton.disabled = false;
    uploadFrameOnlyButton.disabled = false;
  }
}

async function selectedIntent(option) {
  if (!currentDetection || (pairingRequired && !paired)) {
    return;
  }

  responseType.textContent = "Answering";
  clearIntentOptions();

  try {
    const response = await apiFetch("/select-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: currentDetection.id,
        selectedIntent: option
      })
    });
    const body = await response.json();

    if (!response.ok) {
      renderError(body.answer ?? "Intent selection failed.");
      return;
    }

    renderDetectionResult(body);
    await loadSession();
  } catch (error) {
    renderError("The local tutor server did not respond.");
  }
}

function renderDetectionResult(body) {
  currentDetection = body.detectedQuestion;
  detectionState.textContent = "Detected";
  renderCurrentQuestion(currentDetection);
  renderTutorResponse(body.tutorResponse);
}

function renderTutorResponse(body) {
  responseType.textContent = body.type;

  if (body.type === "intent_options") {
    renderAnswerText("");
    renderIntentOptions(body.options ?? []);
    return;
  }

  renderAnswerText(body.answer ?? "No answer returned.");
}

function renderIntentOptions(options) {
  intentOptions.replaceChildren();

  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "intent-option";
    button.textContent = option;
    button.addEventListener("click", () => selectedIntent(option));
    intentOptions.append(button);
  }

  if (options.length === 0) {
    renderAnswerText("No intent options returned.");
  }
}

function clearIntentOptions() {
  intentOptions.replaceChildren();
}

function renderSession(session) {
  renderTurns(session.turns ?? []);

  if (session.latest) {
    currentDetection = session.latest.detectedQuestion;
    renderCurrentQuestion(session.latest.detectedQuestion);
    renderTutorResponse(session.latest.tutorResponse);
  } else if (!currentDetection) {
    currentQuestion.textContent = "";
    currentConfidence.textContent = "No detection";
    renderAnswerText("");
    responseType.textContent = "Ready";
  }
}

function renderCurrentQuestion(detection) {
  currentConfidence.textContent = `Confidence ${Math.round((detection.confidence ?? 1) * 100)}%`;
  currentQuestion.replaceChildren();

  const text = document.createElement("p");
  text.className = "detected-text";
  text.textContent = detection.regionText;

  const meta = document.createElement("p");
  meta.className = "detected-meta";
  meta.textContent = `${detection.marker} · ${detection.courseHint || "No course hint"}`;

  currentQuestion.append(meta, text);
}

function renderTurns(sessionTurns) {
  turns.replaceChildren();
  turnCount.textContent = String(sessionTurns.length);

  for (const turn of sessionTurns) {
    const item = document.createElement("li");
    item.className = "turn-item";

    const meta = document.createElement("p");
    meta.className = "turn-meta";
    meta.textContent = [turn.marker, turn.selectedIntent].filter(Boolean).join(" · ");

    const prompt = document.createElement("p");
    prompt.className = "turn-region";
    prompt.textContent = turn.regionText;

    const reply = document.createElement("p");
    reply.className = "turn-answer";
    reply.textContent = turn.answer;

    const actions = document.createElement("div");
    actions.className = "turn-actions";

    const reuse = document.createElement("button");
    reuse.type = "button";
    reuse.textContent = "Reuse";
    reuse.addEventListener("click", () => reuseTurn(turn));

    const check = document.createElement("button");
    check.type = "button";
    check.textContent = "Check follow-up";
    check.addEventListener("click", () => reuseTurn(turn, "check?"));

    actions.append(reuse, check);
    item.append(meta, prompt, reply, actions);
    turns.append(item);
  }
}

function reuseTurn(turn, nextMarker = turn.marker) {
  regionText.value = turn.regionText ?? "";
  marker.value = nextMarker;
  courseHint.value = turn.courseHint ?? courseHint.value;
  nearbyContext.value = turn.nearbyContext ?? "";
  regionText.focus();
}

function renderError(message) {
  responseType.textContent = "Error";
  renderAnswerText(message);
}

function renderAnswerText(text) {
  currentAnswerText = text;
  answer.replaceChildren();

  if (!text) {
    answerControls.hidden = true;
    return;
  }

  const shouldCollapse = text.length > 650 && !answerExpanded;
  const displayText = shouldCollapse ? `${text.slice(0, 650).trim()}...` : text;

  for (const paragraph of displayText.split(/\n{2,}/).filter(Boolean)) {
    const block = document.createElement("p");
    block.textContent = paragraph;
    answer.append(block);
  }

  answerControls.hidden = text.length <= 650;
  showFullAnswer.textContent = answerExpanded ? "Show less" : "Show full";
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(loadSession, 2000);
}

function shortId(id) {
  return id ? id.slice(0, 8) : "none";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAsk();
});

clearButton.addEventListener("click", async () => {
  await apiFetch("/clear-session", { method: "POST" });
  currentDetection = null;
  clearIntentOptions();
  detectionState.textContent = "Ready";
  answerExpanded = false;
  renderAnswerText("");
  responseType.textContent = "Ready";
  await loadSession();
});

showFullAnswer.addEventListener("click", () => {
  answerExpanded = !answerExpanded;
  renderAnswerText(currentAnswerText);
});

pairButton.addEventListener("click", async () => {
  pairingToken = pairingTokenInput.value.trim();
  paired = Boolean(pairingToken);
  connectionPairing.textContent = paired ? "Paired" : "Token required";
  await refreshAll();
  startPolling();
});

uploadFrameButton.addEventListener("click", () => uploadFrame(true));
uploadFrameOnlyButton.addEventListener("click", () => uploadFrame(false));
frameFile.addEventListener("change", async () => {
  if (!frameFile.files?.[0]) {
    framePreview.hidden = true;
    framePreview.removeAttribute("src");
    frameStatus.textContent = "No frame";
    return;
  }

  const dataUrl = await readFileAsDataUrl(frameFile.files[0]);
  framePreview.src = dataUrl;
  framePreview.hidden = false;
  frameStatus.textContent = "Frame selected";
});

for (const button of document.querySelectorAll("[data-marker]")) {
  button.addEventListener("click", () => {
    marker.value = button.dataset.marker;
    marker.focus();
  });
}

for (const button of document.querySelectorAll("[data-quick-marker]")) {
  button.addEventListener("click", () => {
    marker.value = button.dataset.quickMarker;
    if (button.dataset.quickMarker === "check?") {
      regionText.focus();
      return;
    }
    submitAsk();
  });
}

loadPairingState();

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}
