const tabs = [...document.querySelectorAll("[data-mode]")];
const panels = [...document.querySelectorAll("[data-panel]")];
const statusPanel = document.querySelector("#auth-status");
const sessionCta = document.querySelector("#session-cta");

const formConfigs = [
  {
    form: document.querySelector("#login-form"),
    endpoint: "/api/auth/login",
    successMessage: "Signed in. Redirecting...",
    redirectTo: "/dashboard",
    errorPrefix: "login",
  },
  {
    form: document.querySelector("#register-form"),
    endpoint: "/api/auth/register",
    successMessage: "Account created. Redirecting...",
    redirectTo: "/dashboard",
    errorPrefix: "register",
  },
  {
    form: document.querySelector("#forgot-form"),
    endpoint: "/api/auth/request-password-reset",
    successMessage:
      "If that email is registered, a password reset link is on the way.",
    redirectTo: null,
    errorPrefix: "forgot",
  },
];

initialize();

for (const tab of tabs) {
  tab.addEventListener("click", () => {
    switchMode(tab.dataset.mode);
  });
}

for (const config of formConfigs) {
  config.form.addEventListener("submit", (event) => handleSubmit(event, config));
}

async function initialize() {
  switchMode("login");

  for (const config of formConfigs) {
    const button = config.form.querySelector("button[type='submit']");
    button.dataset.label = button.textContent;
  }

  try {
    const response = await fetch("/api/auth/session");
    if (!response.ok) {
      return;
    }

    const data = await response.json();
    sessionCta.classList.remove("hidden");
    sessionCta.querySelector("p").textContent = `You're already signed in as ${data.user.email}.`;
    const link = sessionCta.querySelector("a");
    link.href = data.user.role === "admin" ? "/admin" : "/dashboard";
    link.textContent =
      data.user.role === "admin" ? "Open admin dashboard" : "Open bug dashboard";
  } catch {
    // Ignore background session lookup errors on the landing page.
  }
}

function switchMode(mode) {
  clearErrors();

  for (const tab of tabs) {
    tab.classList.toggle("is-active", tab.dataset.mode === mode);
  }

  for (const panel of panels) {
    panel.classList.toggle("hidden", panel.dataset.panel !== mode);
  }
}

async function handleSubmit(event, config) {
  event.preventDefault();
  clearErrors();
  setPending(config.form, true);

  const formData = new FormData(config.form);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      applyFieldErrors(config.errorPrefix, data.fieldErrors ?? {});
      showStatus(data.error || "Please try again.", "error");
      return;
    }

    showStatus(data.message || config.successMessage, "success");

    if (config.redirectTo) {
      window.location.assign(config.redirectTo);
      return;
    }

    config.form.reset();
  } catch {
    showStatus("Network error. Please try again in a minute.", "error");
  } finally {
    setPending(config.form, false);
  }
}

function setPending(form, isPending) {
  const button = form.querySelector("button[type='submit']");
  button.disabled = isPending;
  button.textContent = isPending ? "Working..." : button.dataset.label || "Submit";
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

function applyFieldErrors(prefix, fieldErrors) {
  for (const [fieldName, message] of Object.entries(fieldErrors)) {
    if (!message) {
      continue;
    }

    const form = document.querySelector(`#${prefix}-form`);
    const field = form?.elements.namedItem(fieldName);
    const errorNode = document.querySelector(`[data-error-for="${prefix}-${fieldName}"]`);

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
