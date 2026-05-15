const form = document.querySelector("#askForm");
const regionText = document.querySelector("#regionText");
const marker = document.querySelector("#marker");
const courseHint = document.querySelector("#courseHint");
const nearbyContext = document.querySelector("#nearbyContext");
const askButton = document.querySelector("#askButton");
const resetFormButton = document.querySelector("#resetFormButton");
const clearButton = document.querySelector("#clearButton");
const courseSelect = document.querySelector("#courseSelect");
const activeCourseStatus = document.querySelector("#activeCourseStatus");
const useCourseGrounding = document.querySelector("#useCourseGrounding");
const createCourseForm = document.querySelector("#createCourseForm");
const newCourseName = document.querySelector("#newCourseName");
const newCourseDescription = document.querySelector("#newCourseDescription");
const createCourseButton = document.querySelector("#createCourseButton");
const courseUploadInput = document.querySelector("#courseUploadInput");
const uploadCourseFilesButton = document.querySelector("#uploadCourseFilesButton");
const courseFiles = document.querySelector("#courseFiles");
const retrievalQuery = document.querySelector("#retrievalQuery");
const retrievalTopK = document.querySelector("#retrievalTopK");
const retrievalButton = document.querySelector("#retrievalButton");
const retrievalResults = document.querySelector("#retrievalResults");
const answer = document.querySelector("#answer");
const answerSources = document.querySelector("#answerSources");
const answerControls = document.querySelector("#answerControls");
const showFullAnswer = document.querySelector("#showFullAnswer");
const copyAnswerButton = document.querySelector("#copyAnswerButton");
const intentOptions = document.querySelector("#intentOptions");
const responseType = document.querySelector("#responseType");
const turns = document.querySelector("#turns");
const turnCount = document.querySelector("#turnCount");
const undoLastButton = document.querySelector("#undoLastButton");
const copySessionButton = document.querySelector("#copySessionButton");
const downloadSessionButton = document.querySelector("#downloadSessionButton");
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
const connectionCodex = document.querySelector("#connectionCodex");
const connectionUpdated = document.querySelector("#connectionUpdated");
const codexStatusButton = document.querySelector("#codexStatusButton");

let pairingToken = "";
let pairingRequired = false;
let paired = true;
let pairingRejected = false;
let currentDetection = null;
let pollTimer = null;
let currentAnswerText = "";
let answerExpanded = false;
let latestTutorTurn = null;
let draftingFollowUpCheck = false;
let courses = [];
let activeCourseId = "";

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers ?? {});

  if (pairingToken) {
    headers.set("x-pairing-token", pairingToken);
  }

  const response = await fetch(path, { ...options, headers });

  if (response.status === 401 && pairingRequired) {
    markPairingRejected();
  }

  return response;
}

function markPairingRejected() {
  pairingRejected = true;
  paired = false;
  pairingToken = "";
  clearInterval(pollTimer);
  pairingPanel.hidden = false;
  pairingTokenInput.value = "";
  serviceStatus.textContent = "Pairing failed";
  serviceStatus.dataset.state = "offline";
  providerStatus.textContent = "Bad token";
  sessionStatus.textContent = "Session locked";
  connectionService.textContent = "Locked";
  connectionProvider.textContent = "Locked";
  connectionSession.textContent = "Locked";
  connectionPairing.textContent = "Token rejected";
  connectionUpdated.textContent = "Bad token";
  renderError("Pairing token rejected. Re-enter the token printed by the server.");
}

async function loadPairingState() {
  const response = await fetch("/pairing");
  const body = await response.json();
  pairingRequired = body.required === true;
  paired = !pairingRequired;
  pairingRejected = false;
  pairingPanel.hidden = !pairingRequired;
  connectionPairing.textContent = pairingRequired ? "Token required" : "Local only";

  if (!pairingRequired) {
    await refreshAll();
    startPolling();
  } else {
    serviceStatus.textContent = "Pairing required";
    serviceStatus.dataset.state = "offline";
    providerStatus.textContent = "Enter token";
    sessionStatus.textContent = "Session locked";
    connectionService.textContent = "Waiting for token";
    connectionProvider.textContent = "Locked";
    connectionSession.textContent = "Locked";
    connectionUpdated.textContent = "Not paired";
  }
}

async function refreshAll() {
  await Promise.all([loadStatus(), loadSession(), loadCourses()]);
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

    if (pairingRequired) {
      pairingRejected = false;
      paired = true;
      connectionPairing.textContent = "Paired";
    }

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
    if (pairingRequired && !paired) {
      if (!pairingRejected) {
        serviceStatus.textContent = "Pairing required";
        serviceStatus.dataset.state = "offline";
        providerStatus.textContent = "Enter token";
        connectionService.textContent = "Waiting for token";
        connectionProvider.textContent = "Locked";
      }
      return;
    }

    serviceStatus.textContent = pairingRequired && !paired ? "Pairing required" : "Offline";
    serviceStatus.dataset.state = "offline";
    providerStatus.textContent = "Provider unavailable";
    connectionService.textContent = pairingRequired && !paired ? "Waiting for token" : "Offline";
    connectionProvider.textContent = "Unavailable";
  }
}

async function checkCodexStatus() {
  if (pairingRequired && !paired) {
    return;
  }

  codexStatusButton.disabled = true;
  connectionCodex.textContent = "Checking";

  try {
    const response = await apiFetch("/codex/status");
    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.detail ?? "codex status failed");
    }

    if (!body.available) {
      connectionCodex.textContent = "CLI not found";
      return;
    }

    connectionCodex.textContent = body.loginStatus === "ok" ? "Ready" : "Needs login";
  } catch (error) {
    connectionCodex.textContent = "Status failed";
  } finally {
    codexStatusButton.disabled = false;
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
    if (pairingRequired && !paired) {
      if (!pairingRejected) {
        sessionStatus.textContent = "Session locked";
        connectionSession.textContent = "Locked";
      }
      return;
    }

    sessionStatus.textContent = "Session unavailable";
    connectionSession.textContent = "Unavailable";
  }
}

async function loadCourses() {
  if (pairingRequired && !paired) {
    return;
  }

  try {
    const response = await apiFetch("/courses");
    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.answer ?? "courses failed");
    }

    courses = body.courses ?? [];

    if (activeCourseId && !courses.some((course) => course.id === activeCourseId)) {
      activeCourseId = "";
    }

    if (!activeCourseId && courses.length > 0) {
      activeCourseId = courses[0].id;
    }

    renderCourseSelect();
    await loadActiveCourseDetails();
  } catch (error) {
    activeCourseStatus.textContent = "Courses unavailable";
  }
}

async function loadActiveCourseDetails() {
  courseFiles.replaceChildren();
  retrievalResults.replaceChildren();

  if (!activeCourseId) {
    activeCourseStatus.textContent = "No course";
    renderCourseFiles([]);
    return;
  }

  try {
    const [filesResponse, statusResponse] = await Promise.all([
      apiFetch(`/courses/${activeCourseId}/files`),
      apiFetch(`/courses/${activeCourseId}/index-status`)
    ]);
    const filesBody = await filesResponse.json();
    const statusBody = await statusResponse.json();

    if (!filesResponse.ok || !statusResponse.ok) {
      throw new Error(filesBody.answer ?? statusBody.answer ?? "course details failed");
    }

    activeCourseStatus.textContent = `${statusBody.indexedFiles}/${statusBody.totalFiles} indexed · ${statusBody.chunkCount} chunks`;
    renderCourseFiles(filesBody.files ?? []);
  } catch (error) {
    activeCourseStatus.textContent = "Course unavailable";
  }
}

function renderCourseSelect() {
  courseSelect.replaceChildren();

  if (courses.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No courses";
    courseSelect.append(option);
    courseSelect.value = "";
    return;
  }

  for (const course of courses) {
    const option = document.createElement("option");
    option.value = course.id;
    option.textContent = course.name;
    courseSelect.append(option);
  }

  courseSelect.value = activeCourseId;
}

function renderCourseFiles(files) {
  courseFiles.replaceChildren();

  if (files.length === 0) {
    const item = document.createElement("li");
    item.className = "empty-item";
    item.textContent = activeCourseId ? "No files uploaded" : "Create or select a course";
    courseFiles.append(item);
    return;
  }

  for (const file of files) {
    const item = document.createElement("li");
    item.className = `course-file status-${file.status}`;

    const name = document.createElement("span");
    name.textContent = file.originalName;

    const status = document.createElement("span");
    status.textContent = `${file.status} · ${formatBytes(file.sizeBytes)}`;

    item.append(name, status);

    if (file.error) {
      const error = document.createElement("small");
      error.textContent = file.error;
      item.append(error);
    }

    courseFiles.append(item);
  }
}

async function createCourse(event) {
  event.preventDefault();

  if (pairingRequired && !paired) {
    renderError("Enter the pairing token before creating a course.");
    return;
  }

  const name = newCourseName.value.trim();

  if (!name) {
    activeCourseStatus.textContent = "Name required";
    return;
  }

  createCourseButton.disabled = true;
  activeCourseStatus.textContent = "Creating";

  try {
    const response = await apiFetch("/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: newCourseDescription.value.trim() || undefined
      })
    });
    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.answer ?? "course create failed");
    }

    activeCourseId = body.course.id;
    newCourseName.value = "";
    newCourseDescription.value = "";
    await loadCourses();
  } catch (error) {
    activeCourseStatus.textContent = "Create failed";
    renderError("The local tutor server could not create the course.");
  } finally {
    createCourseButton.disabled = false;
  }
}

async function uploadCourseFiles() {
  if (pairingRequired && !paired) {
    renderError("Enter the pairing token before uploading course files.");
    return;
  }

  if (!activeCourseId) {
    activeCourseStatus.textContent = "Select a course";
    return;
  }

  const files = Array.from(courseUploadInput.files ?? []);

  if (files.length === 0) {
    activeCourseStatus.textContent = "Choose files";
    return;
  }

  uploadCourseFilesButton.disabled = true;
  activeCourseStatus.textContent = "Uploading";

  try {
    for (const file of files) {
      const response = await apiFetch(`/courses/${activeCourseId}/files`, {
        method: "POST",
        headers: {
          "Content-Type": file.type || mimeTypeForFileName(file.name),
          "x-file-name": file.name
        },
        body: file
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.answer ?? `upload failed for ${file.name}`);
      }
    }

    courseUploadInput.value = "";
    await loadActiveCourseDetails();
  } catch (error) {
    activeCourseStatus.textContent = "Upload failed";
    renderError(error.message || "The local tutor server could not upload course files.");
  } finally {
    uploadCourseFilesButton.disabled = false;
  }
}

async function previewRetrieval() {
  if (pairingRequired && !paired) {
    renderError("Enter the pairing token before retrieving course material.");
    return;
  }

  if (!activeCourseId) {
    activeCourseStatus.textContent = "Select a course";
    return;
  }

  const query = retrievalQuery.value.trim() || regionText.value.trim();

  if (!query) {
    retrievalResults.textContent = "Enter a query";
    return;
  }

  retrievalButton.disabled = true;
  retrievalResults.textContent = "Retrieving";

  try {
    const response = await apiFetch(`/courses/${activeCourseId}/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        topK: Number.parseInt(retrievalTopK.value, 10) || 5
      })
    });
    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.answer ?? "retrieval failed");
    }

    renderRetrievalResults(body.chunks ?? []);
  } catch (error) {
    retrievalResults.textContent = "";
    renderError("The local tutor server could not retrieve course chunks.");
  } finally {
    retrievalButton.disabled = false;
  }
}

function renderRetrievalResults(chunks) {
  retrievalResults.replaceChildren();

  if (chunks.length === 0) {
    retrievalResults.textContent = "No relevant chunks";
    return;
  }

  for (const chunk of chunks) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const text = document.createElement("p");

    summary.textContent = `${chunk.sourceLabel} · ${Number(chunk.score).toFixed(2)}`;
    text.textContent = chunk.text;
    details.append(summary, text);
    retrievalResults.append(details);
  }
}

function currentRequest() {
  const request = {
    regionText: regionText.value.trim(),
    marker: marker.value.trim(),
    courseHint: courseHint.value.trim(),
    nearbyContext: nearbyContext.value.trim()
  };

  if (activeCourseId) {
    request.courseId = activeCourseId;
  }

  if (activeCourseId && useCourseGrounding.checked) {
    request.useCourseGrounding = true;
  }

  return request;
}

async function submitAsk() {
  const request = currentRequest();

  if (!request.regionText || !request.marker) {
    detectionState.textContent = "Missing input";
    renderError("Enter boxed text and marker before simulating.");
    return;
  }

  if (pairingRequired && !paired) {
    detectionState.textContent = "Pairing required";
    renderError("Enter the pairing token before simulating.");
    return;
  }

  draftingFollowUpCheck = false;
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
      detectionState.textContent = "Error";
      renderError(body.answer ?? "Detection failed.");
      return;
    }

    renderDetectionResult(body);
    scrollToResults(body.tutorResponse?.type);
    await loadSession();
  } catch (error) {
    detectionState.textContent = "Error";
    renderError("The local tutor server did not respond.");
  } finally {
    askButton.disabled = false;
  }
}

async function uploadFrame(includeCurrentText = true) {
  if (!frameFile.files?.[0]) {
    frameStatus.textContent = "No frame";
    renderError("Choose a screenshot or crop before uploading.");
    return;
  }

  if (pairingRequired && !paired) {
    frameStatus.textContent = "Pairing required";
    renderError("Enter the pairing token before uploading a frame.");
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
      scrollToResults("tutor_answer");
      return;
    }

    renderDetectionResult(body);
    scrollToResults(body.tutorResponse?.type);
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
    scrollToResults(body.tutorResponse?.type);
    await loadSession();
  } catch (error) {
    renderError("The local tutor server did not respond.");
  }
}

async function fetchSessionMarkdown() {
  const response = await apiFetch("/session.md", {
    headers: { Accept: "text/markdown" }
  });

  if (!response.ok) {
    throw new Error("session markdown failed");
  }

  return response.text();
}

async function copySessionNotes() {
  if (pairingRequired && !paired) {
    return;
  }

  copySessionButton.disabled = true;

  try {
    const markdown = await fetchSessionMarkdown();

    if (!navigator.clipboard?.writeText) {
      throw new Error("clipboard unavailable");
    }

    await navigator.clipboard.writeText(markdown);
    turnCount.textContent = "Copied";
    setTimeout(loadSession, 1200);
  } catch (error) {
    renderError("Copy is unavailable in this browser. Use Download .md instead.");
  } finally {
    copySessionButton.disabled = false;
  }
}

async function downloadSessionNotes() {
  if (pairingRequired && !paired) {
    return;
  }

  downloadSessionButton.disabled = true;

  try {
    const markdown = await fetchSessionMarkdown();
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `goodnotes-companion-session-${date}.md`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    renderError("The local tutor server could not export this session.");
  } finally {
    downloadSessionButton.disabled = false;
  }
}

async function undoLastTurn() {
  if (pairingRequired && !paired) {
    return;
  }

  undoLastButton.disabled = true;
  draftingFollowUpCheck = false;

  try {
    const response = await apiFetch("/undo-last", { method: "POST" });
    const body = await response.json();

    if (!response.ok) {
      throw new Error("undo failed");
    }

    currentDetection = body.session.latest?.detectedQuestion ?? null;
    detectionState.textContent = currentDetection ? "Restored previous" : "Ready";
    responseType.textContent = currentDetection ? "Restored" : "Ready";
    await loadSession();
  } catch (error) {
    renderError("The local tutor server could not undo the latest turn.");
  } finally {
    undoLastButton.disabled = false;
  }
}

async function clearSessionHistory() {
  if (pairingRequired && !paired) {
    renderError("Enter the pairing token before clearing the session.");
    return;
  }

  if (!window.confirm("Clear this tutor session history?")) {
    return;
  }

  clearButton.disabled = true;

  try {
    const response = await apiFetch("/clear-session", { method: "POST" });

    if (response.status === 401 && pairingRequired) {
      return;
    }

    if (!response.ok) {
      throw new Error("clear failed");
    }

    currentDetection = null;
    draftingFollowUpCheck = false;
    clearIntentOptions();
    detectionState.textContent = "Ready";
    answerExpanded = false;
    renderAnswerText("");
    responseType.textContent = "Ready";
    await loadSession();
  } catch (error) {
    renderError("The local tutor server could not clear this session.");
  } finally {
    clearButton.disabled = false;
  }
}

async function copyCurrentAnswer() {
  if (!currentAnswerText || !navigator.clipboard?.writeText) {
    renderError("Copy is unavailable in this browser.");
    return;
  }

  copyAnswerButton.disabled = true;

  try {
    await navigator.clipboard.writeText(currentAnswerText);
    responseType.textContent = "Copied";
  } catch (error) {
    renderError("Copy is unavailable in this browser.");
  } finally {
    copyAnswerButton.disabled = false;
  }
}

function renderDetectionResult(body) {
  draftingFollowUpCheck = false;
  currentDetection = body.detectedQuestion;
  detectionState.textContent = "Detected";
  renderCurrentQuestion(currentDetection);
  renderTutorResponse(body.tutorResponse);
}

function scrollToResults(responseKind) {
  const target = responseKind === "intent_options" ? intentOptions : answer;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderTutorResponse(body) {
  responseType.textContent = body.type;
  renderSources(body.sources ?? []);

  if (body.type === "intent_options") {
    responseType.textContent = "Choose intent";
    answerExpanded = false;
    renderAnswerText("Choose the kind of help you want for this boxed work. The tutor will answer after you pick one option.");
    renderIntentOptions(body.options ?? []);
    return;
  }

  renderAnswerText(body.answer ?? "No answer returned.");
}

function renderSources(sources) {
  answerSources.replaceChildren();

  if (!sources.length) {
    answerSources.hidden = true;
    return;
  }

  answerSources.hidden = false;

  for (const source of sources) {
    const item = document.createElement("li");
    item.textContent = source.pageNumber
      ? `${source.sourceLabel} p.${source.pageNumber}`
      : source.sourceLabel;
    answerSources.append(item);
  }
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

  if (draftingFollowUpCheck && marker.value === "check?" && !regionText.value.trim()) {
    return;
  }

  if (session.latest) {
    currentDetection = session.latest.detectedQuestion;
    renderCurrentQuestion(session.latest.detectedQuestion);
    renderTutorResponse(session.latest.tutorResponse);
  } else if (!currentDetection) {
    currentQuestion.textContent = "";
    currentConfidence.textContent = "No detection";
    renderSources([]);
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
  latestTutorTurn = sessionTurns.length > 0 ? sessionTurns[sessionTurns.length - 1] : null;

  for (const turn of sessionTurns) {
    const item = document.createElement("li");
    item.className = "turn-item";

    const meta = document.createElement("p");
    meta.className = "turn-meta";
    meta.textContent = [
      formatTurnTime(turn.createdAt),
      turn.marker,
      turn.selectedIntent,
      turn.provider
    ].filter(Boolean).join(" · ");

    const prompt = document.createElement("p");
    prompt.className = "turn-region";
    prompt.textContent = turn.regionText;

    const reply = document.createElement("p");
    reply.className = "turn-answer";
    reply.textContent = turn.answer;

    const sources = document.createElement("p");
    sources.className = "turn-sources";
    sources.textContent = (turn.sources ?? []).length
      ? `Sources: ${turn.sources.map((source) => source.sourceLabel).join(", ")}`
      : "";

    const actions = document.createElement("div");
    actions.className = "turn-actions";

    const reuse = document.createElement("button");
    reuse.type = "button";
    reuse.textContent = "Reuse";
    reuse.addEventListener("click", () => reuseTurn(turn));

    const check = document.createElement("button");
    check.type = "button";
    check.textContent = "Check follow-up";
    check.addEventListener("click", () => prepareFollowUpCheck(turn));

    actions.append(reuse, check);
    item.append(meta, prompt, reply);

    if (sources.textContent) {
      item.append(sources);
    }

    item.append(actions);
    turns.append(item);
  }
}

function reuseTurn(turn, nextMarker = turn.marker) {
  draftingFollowUpCheck = false;
  regionText.value = turn.regionText ?? "";
  regionText.placeholder = "";
  marker.value = nextMarker;
  courseHint.value = turn.courseHint ?? courseHint.value;
  nearbyContext.value = turn.nearbyContext ?? "";

  if (turn.courseId) {
    activeCourseId = turn.courseId;
    courseSelect.value = turn.courseId;
  }

  useCourseGrounding.checked = turn.useCourseGrounding !== false;
  regionText.focus();
}

function prepareFollowUpCheck(turn = latestTutorTurn) {
  draftingFollowUpCheck = true;
  marker.value = "check?";
  regionText.value = "";
  regionText.placeholder = "Enter the new boxed work to check";
  detectionState.textContent = "Enter new work";
  responseType.textContent = "Ready to check";
  clearIntentOptions();

  if (turn?.courseHint) {
    courseHint.value = turn.courseHint;
  }

  if (turn) {
    nearbyContext.value = [
      `Previous boxed work: ${compactForContext(turn.regionText ?? "")}`,
      `Previous tutor answer: ${compactForContext(turn.answer ?? "")}`
    ].filter((line) => !line.endsWith(": ")).join("\n");
  }

  renderAnswerText("Enter the new boxed work to check, then tap Simulate.");
  regionText.focus();
}

function compactForContext(value) {
  const singleLine = String(value).replace(/\s+/g, " ").trim();

  if (singleLine.length <= 180) {
    return singleLine;
  }

  return `${singleLine.slice(0, 177)}...`;
}

function formatTurnTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function resetForm() {
  draftingFollowUpCheck = false;
  regionText.value = "";
  regionText.placeholder = "";
  marker.value = "?";
  nearbyContext.value = "";
  clearIntentOptions();
  detectionState.textContent = "Ready";

  if (frameFile.files?.length) {
    frameFile.value = "";
  }

  framePreview.hidden = true;
  framePreview.removeAttribute("src");
  frameStatus.textContent = "No frame";
  regionText.focus();
}

function renderError(message) {
  responseType.textContent = "Error";
  renderSources([]);
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

clearButton.addEventListener("click", clearSessionHistory);

resetFormButton.addEventListener("click", resetForm);

createCourseForm.addEventListener("submit", createCourse);
uploadCourseFilesButton.addEventListener("click", uploadCourseFiles);
retrievalButton.addEventListener("click", previewRetrieval);
courseSelect.addEventListener("change", async () => {
  activeCourseId = courseSelect.value;
  await loadActiveCourseDetails();
});

showFullAnswer.addEventListener("click", () => {
  answerExpanded = !answerExpanded;
  renderAnswerText(currentAnswerText);
});

pairButton.addEventListener("click", async () => {
  pairingToken = pairingTokenInput.value.trim();
  pairingRejected = false;
  paired = Boolean(pairingToken);
  connectionPairing.textContent = paired ? "Checking token" : "Token required";

  if (!paired) {
    clearInterval(pollTimer);
    return;
  }

  await refreshAll();

  if (paired) {
    startPolling();
  }
});

codexStatusButton.addEventListener("click", checkCodexStatus);
undoLastButton.addEventListener("click", undoLastTurn);
copyAnswerButton.addEventListener("click", copyCurrentAnswer);
copySessionButton.addEventListener("click", copySessionNotes);
downloadSessionButton.addEventListener("click", downloadSessionNotes);
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
      prepareFollowUpCheck();
      return;
    }
    draftingFollowUpCheck = false;
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

function formatBytes(value) {
  if (!Number.isFinite(value)) {
    return "0 B";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeTypeForFileName(name) {
  const lower = name.toLowerCase();

  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return "text/markdown";
  }

  if (lower.endsWith(".json")) {
    return "application/json";
  }

  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    return "text/html";
  }

  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }

  return "text/plain";
}
