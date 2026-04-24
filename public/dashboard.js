const form = document.querySelector("#bug-report-form");
const statusPanel = document.querySelector("#form-status");
const submitButton = document.querySelector("#submit-button");
const startedAtField = document.querySelector("#startedAt");
const logoutButton = document.querySelector("#logout-button");
const sessionEmail = document.querySelector("#session-email");
const recentReports = document.querySelector("#recent-reports");
const adminLink = document.querySelector("#admin-link");
const storageKey = "jobfinder-beta-bugs:report-draft:v2";

initialize();

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
    throw new Error("Unauthorized");
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

    localStorage.removeItem(storageKey);
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
  recentReports.innerHTML = reports
    .map(
      (report) => `
        <article class="report-item">
          <div class="report-item__state ${
            report.isResolved ? "report-item__state--resolved" : "report-item__state--open"
          }">
            ${report.isResolved ? "Resolved" : "Unresolved"}
          </div>
          <div class="report-item__head">
            <strong>${escapeHtml(report.summary)}</strong>
            <span class="report-badge report-badge--${escapeHtml(report.severity)}">${escapeHtml(
              report.severity,
            )}</span>
          </div>
          <p>${escapeHtml(report.category)} • ${formatTimestamp(report.createdAt)}</p>
          <small>${escapeHtml(report.id)}</small>
        </article>
      `,
    )
    .join("");

  for (const [index, report] of reports.entries()) {
    if (!report.isResolved) {
      continue;
    }

    recentReports.children[index]?.classList.add("report-item--resolved");
  }
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

function formatTimestamp(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Unknown time"
    : parsed.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
