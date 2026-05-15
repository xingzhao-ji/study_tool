const form = document.querySelector("#askForm");
const regionText = document.querySelector("#regionText");
const marker = document.querySelector("#marker");
const courseHint = document.querySelector("#courseHint");
const nearbyContext = document.querySelector("#nearbyContext");
const askButton = document.querySelector("#askButton");
const clearButton = document.querySelector("#clearButton");
const answer = document.querySelector("#answer");
const intentOptions = document.querySelector("#intentOptions");
const responseType = document.querySelector("#responseType");
const turns = document.querySelector("#turns");
const turnCount = document.querySelector("#turnCount");
const serviceStatus = document.querySelector("#serviceStatus");
const providerStatus = document.querySelector("#providerStatus");

const tutorTurns = [];

async function loadStatus() {
  try {
    const [healthResponse, providersResponse] = await Promise.all([
      fetch("/health"),
      fetch("/providers")
    ]);
    const health = await healthResponse.json();
    const providers = await providersResponse.json();
    const active = providers.providers.find((provider) => provider.name === providers.activeProvider);

    serviceStatus.textContent = health.ok ? "Online" : "Unavailable";
    serviceStatus.dataset.state = health.ok ? "online" : "offline";
    providerStatus.textContent = active
      ? `${providers.activeProvider} · ${active.status}`
      : providers.activeProvider;
  } catch (error) {
    serviceStatus.textContent = "Offline";
    serviceStatus.dataset.state = "offline";
    providerStatus.textContent = "Provider unavailable";
  }
}

function currentRequest(selectedIntent = null) {
  return {
    regionText: regionText.value.trim(),
    marker: marker.value.trim(),
    selectedIntent,
    courseHint: courseHint.value.trim(),
    nearbyContext: nearbyContext.value.trim(),
    previousTutorState: tutorTurns
  };
}

async function submitAsk(selectedIntent = null) {
  const request = currentRequest(selectedIntent);

  if (!request.regionText || !request.marker) {
    return;
  }

  askButton.disabled = true;
  responseType.textContent = selectedIntent ? "Answering" : "Asking";
  clearIntentOptions();

  try {
    const response = await fetch("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });
    const body = await response.json();
    renderTutorResponse(request, body);
  } catch (error) {
    responseType.textContent = "Error";
    answer.textContent = "The local tutor server did not respond.";
  } finally {
    askButton.disabled = false;
  }
}

function renderTutorResponse(request, body) {
  responseType.textContent = body.type;

  if (body.type === "intent_options") {
    answer.textContent = "";
    renderIntentOptions(request, body.options ?? []);
    return;
  }

  const text = body.answer ?? "No answer returned.";
  answer.textContent = text;
  tutorTurns.push({
    regionText: request.regionText,
    marker: request.marker,
    selectedIntent: request.selectedIntent,
    answer: text
  });
  renderTurns();
}

function renderIntentOptions(request, options) {
  intentOptions.replaceChildren();

  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "intent-option";
    button.textContent = option;
    button.addEventListener("click", () => submitAsk(option));
    intentOptions.append(button);
  }

  if (options.length === 0) {
    answer.textContent = "No intent options returned.";
  }
}

function clearIntentOptions() {
  intentOptions.replaceChildren();
}

function renderTurns() {
  turns.replaceChildren();
  turnCount.textContent = String(tutorTurns.length);

  for (const turn of tutorTurns) {
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

    item.append(meta, prompt, reply);
    turns.prepend(item);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAsk();
});

clearButton.addEventListener("click", () => {
  tutorTurns.splice(0, tutorTurns.length);
  clearIntentOptions();
  answer.textContent = "";
  responseType.textContent = "Ready";
  renderTurns();
});

for (const button of document.querySelectorAll("[data-marker]")) {
  button.addEventListener("click", () => {
    marker.value = button.dataset.marker;
    marker.focus();
  });
}

loadStatus();
