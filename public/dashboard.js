import { element, formatTimestamp, variant } from "/dom.js";

const form = document.querySelector("#bug-report-form");
const statusPanel = document.querySelector("#form-status");
const submitButton = document.querySelector("#submit-button");
const startedAtField = document.querySelector("#startedAt");
const logoutButton = document.querySelector("#logout-button");
const sessionEmail = document.querySelector("#session-email");
const recentReports = document.querySelector("#recent-reports");
const adminLink = document.querySelector("#admin-link");
const storageKey = "jobfinder-beta-bugs:report-draft:v2";
const severityLevels = ["low", "medium", "high", "blocking"];

initialize().catch(() => {
  showStatus("Unable to load the dashboard. Refresh and try again.", "error");
});

form.addEventListener("submit", handleSubmit);
form.addEventListener("input", persistDraft);
logoutButton.addEventListener("click", handleLogout);

async function initialize() {
  const session = await loadSession();
  sessionEmail.textContent = session.user.email;

  if (session.user.role === "admin") {
    adminLink.classList.remove("hidden");
  }

  restoreDraft();
  setStartedAt();
  await loadRecentReports();
}

async function loadSession() {
  const response = await fetch("/api/auth/session");

  if (response.status === 401) {
    window.location.assign("/");
    return new Promise(() => {});
  }

  if (!response.ok) {
    throw new Error("Failed to load session.");
  }

  return response.json();
}

async function handleSubmit(event) {
  event.preventDefault();
  clearErrors();
  setBusy(true);

  const payload = {
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

    if (response.status === 401) {
      window.location.assign("/");
      return;
    }

    if (!response.ok) {
      applyErrors(data.fieldErrors ?? {});
      showStatus(
        data.error || "I couldn't submit that report right now. Please try again.",
        "error",
      );
      return;
    }

    clearDraft();
    form.reset();
    setStartedAt();
    showStatus(
      `Thanks. Your report is stored${data.reportId ? ` (${data.reportId})` : ""}.`,
      "success",
    );
    await loadRecentReports();
  } catch {
    showStatus("Network error. Please try again in a minute.", "error");
  } finally {
    setBusy(false);
  }
}

async function handleLogout() {
  logoutButton.disabled = true;

  try {
    await fetch("/api/auth/logout", {
      method: "POST",
    });
  } finally {
    window.location.assign("/");
  }
}

async function loadRecentReports() {
  try {
    const response = await fetch("/api/reports");
    if (!response.ok) {
      return;
    }

    const data = await response.json();
    renderReports(data.reports ?? []);
  } catch {
    renderReports([]);
  }
}

function renderReports(reports) {
  if (!reports.length) {
    recentReports.className = "report-list empty-state";
    recentReports.textContent = "No reports yet.";
    return;
  }

  recentReports.className = "report-list";
  recentReports.replaceChildren(...reports.map(createReportItem));
}

function createReportItem(report) {
  const severity = variant(report.severity, severityLevels, "medium");
  const state = report.isResolved ? "resolved" : "open";
  const meta = element("p");
  meta.append(
    String(report.category || "uncategorized"),
    " • ",
    formatTimestamp(report.createdAt),
  );

  return element(
    "article",
    {
      className: `report-item${report.isResolved ? " report-item--resolved" : ""}`,
    },
    [
      element("div", {
        className: `report-item__state report-item__state--${state}`,
        text: report.isResolved ? "Resolved" : "Unresolved",
      }),
      element("div", { className: "report-item__head" }, [
        element("strong", { text: report.summary || "Untitled report" }),
        element("span", {
          className: `report-badge report-badge--${severity}`,
          text: report.severity || "unknown",
        }),
      ]),
      meta,
      element("small", { text: report.id || "Unknown report id" }),
    ],
  );
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
    summary: getFieldValue("summary"),
    category: getFieldValue("category"),
    severity: getFieldValue("severity"),
    affectedUrl: getFieldValue("affectedUrl"),
    happened: getFieldValue("happened"),
    reproduceSteps: getFieldValue("reproduceSteps"),
    expectedBehavior: getFieldValue("expectedBehavior"),
    extraDetails: getFieldValue("extraDetails"),
  };

  try {
    localStorage.setItem(storageKey, JSON.stringify(draft));
  } catch {
    // Draft persistence is helpful, but it should never block form use.
  }
}

function restoreDraft() {
  let rawDraft;

  try {
    rawDraft = localStorage.getItem(storageKey);
  } catch {
    return;
  }

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
    clearDraft();
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage cleanup failures.
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
