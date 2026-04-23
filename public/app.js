const form = document.querySelector("#bug-report-form");
const statusPanel = document.querySelector("#form-status");
const submitButton = document.querySelector("#submit-button");
const startedAtField = document.querySelector("#startedAt");
const storageKey = "jobfinder-beta-bugs:draft:v1";

initialize();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();
  setBusy(true);

  const payload = {
    name: getFieldValue("name"),
    email: getFieldValue("email"),
    summary: getFieldValue("summary"),
    category: getFieldValue("category"),
    severity: getFieldValue("severity"),
    affectedUrl: getFieldValue("affectedUrl"),
    happened: getFieldValue("happened"),
    reproduceSteps: getFieldValue("reproduceSteps"),
    expectedBehavior: getFieldValue("expectedBehavior"),
    extraDetails: getFieldValue("extraDetails"),
    startedAt: startedAtField.value,
    website: getFieldValue("website"),
    clientContext: collectClientContext(),
  };

  try {
    const response = await fetch("/api/report", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      applyErrors(data.fieldErrors ?? {});
      showStatus(
        data.error || "I couldn't submit that report right now. Please try again.",
        "error",
      );
      return;
    }

    localStorage.removeItem(storageKey);
    form.reset();
    setStartedAt();
    showStatus(
      `Thanks. Your report is in${data.reportId ? ` (${data.reportId})` : ""}.`,
      "success",
    );
  } catch {
    showStatus(
      "Network error. Please try again in a minute, or paste the report directly to me.",
      "error",
    );
  } finally {
    setBusy(false);
  }
});

form.addEventListener("input", () => {
  persistDraft();
});

function initialize() {
  restoreDraft();
  prefillAffectedUrlFromQuery();
  setStartedAt();
}

function setStartedAt() {
  startedAtField.value = String(Date.now());
}

function collectClientContext() {
  return {
    language: navigator.language || "",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    platform: navigator.userAgentData?.platform || navigator.platform || "",
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
}

function persistDraft() {
  const draft = {
    name: getFieldValue("name"),
    email: getFieldValue("email"),
    summary: getFieldValue("summary"),
    category: getFieldValue("category"),
    severity: getFieldValue("severity"),
    affectedUrl: getFieldValue("affectedUrl"),
    happened: getFieldValue("happened"),
    reproduceSteps: getFieldValue("reproduceSteps"),
    expectedBehavior: getFieldValue("expectedBehavior"),
    extraDetails: getFieldValue("extraDetails"),
  };

  localStorage.setItem(storageKey, JSON.stringify(draft));
}

function restoreDraft() {
  const rawDraft = localStorage.getItem(storageKey);
  if (!rawDraft) {
    return;
  }

  try {
    const draft = JSON.parse(rawDraft);

    for (const [key, value] of Object.entries(draft)) {
      const field = getField(key);

      if (field && typeof value === "string") {
        field.value = value;
      }
    }
  } catch {
    localStorage.removeItem(storageKey);
  }
}

function prefillAffectedUrlFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const page = params.get("page");

  if (page && !getFieldValue("affectedUrl")) {
    getField("affectedUrl").value = page;
  }
}

function setBusy(isBusy) {
  submitButton.disabled = isBusy;
  submitButton.textContent = isBusy ? "Sending..." : "Send bug report";
}

function clearErrors() {
  statusPanel.textContent = "";
  statusPanel.dataset.variant = "";

  for (const element of form.querySelectorAll(".field-error")) {
    element.textContent = "";
  }

  for (const field of form.querySelectorAll(".is-invalid")) {
    field.classList.remove("is-invalid");
    field.removeAttribute("aria-invalid");
  }
}

function applyErrors(fieldErrors) {
  for (const [fieldName, message] of Object.entries(fieldErrors)) {
    const field = getField(fieldName);
    const errorNode = form.querySelector(`[data-error-for="${fieldName}"]`);

    if (field) {
      field.classList.add("is-invalid");
      field.setAttribute("aria-invalid", "true");
    }

    if (errorNode) {
      errorNode.textContent = message;
    }
  }
}

function showStatus(message, variant) {
  statusPanel.textContent = message;
  statusPanel.dataset.variant = variant;
}

function getField(name) {
  const field = form.elements.namedItem(name);
  return field instanceof HTMLElement ? field : null;
}

function getFieldValue(name) {
  return getField(name)?.value ?? "";
}
