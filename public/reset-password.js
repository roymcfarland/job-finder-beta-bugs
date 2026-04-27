const form = document.querySelector("#reset-form");
const statusPanel = document.querySelector("#reset-status");
const resetButton = document.querySelector("#reset-button");
const token = new URLSearchParams(window.location.search).get("token") || "";

if (token) {
  // Remove the token from the visible URL/history so it doesn't leak via the
  // browser's address bar, the page Referer, or sync extensions.
  try {
    const cleaned = new URL(window.location.href);
    cleaned.searchParams.delete("token");
    window.history.replaceState(null, "", cleaned.toString());
  } catch {
    // History rewrite is best-effort; fall through silently.
  }
}

initialize();

form.addEventListener("submit", handleSubmit);

function initialize() {
  if (token) {
    return;
  }

  resetButton.disabled = true;
  showStatus("This reset link is invalid or missing.", "error");
}

async function handleSubmit(event) {
  event.preventDefault();
  clearErrors();
  resetButton.disabled = true;
  resetButton.textContent = "Updating...";

  const payload = {
    token,
    password: form.elements.namedItem("password")?.value ?? "",
  };

  try {
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      applyErrors(data.fieldErrors ?? {});
      showStatus(data.error || "Please try again.", "error");
      return;
    }

    showStatus("Password updated. Redirecting...", "success");
    window.location.assign("/dashboard");
  } catch {
    showStatus("Network error. Please try again in a minute.", "error");
  } finally {
    resetButton.disabled = false;
    resetButton.textContent = "Update password";
  }
}

function clearErrors() {
  statusPanel.textContent = "";
  statusPanel.dataset.variant = "";

  for (const field of document.querySelectorAll(".field-error")) {
    field.textContent = "";
  }

  for (const input of document.querySelectorAll(".is-invalid")) {
    input.classList.remove("is-invalid");
    input.removeAttribute("aria-invalid");
  }
}

function applyErrors(fieldErrors) {
  for (const [fieldName, message] of Object.entries(fieldErrors)) {
    const field = form.elements.namedItem(fieldName);
    const errorNode = document.querySelector(`[data-error-for="${fieldName}"]`);

    if (field instanceof HTMLElement) {
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
