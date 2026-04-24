const adminEmail = document.querySelector("#admin-email");
const logoutButton = document.querySelector("#admin-logout-button");
const usersContainer = document.querySelector("#admin-users");
const commentsContainer = document.querySelector("#admin-comments");
const filterUser = document.querySelector("#filter-user");
const filterStatus = document.querySelector("#filter-status");
const statusPanel = document.querySelector("#admin-status");

const summaryNodes = {
  totalUsers: document.querySelector("#summary-total-users"),
  disabledUsers: document.querySelector("#summary-disabled-users"),
  unresolvedComments: document.querySelector("#summary-unresolved-comments"),
  resolvedComments: document.querySelector("#summary-resolved-comments"),
};

let currentSession = null;
let users = [];

initialize();

logoutButton.addEventListener("click", handleLogout);
filterUser.addEventListener("change", loadComments);
filterStatus.addEventListener("change", loadComments);
usersContainer.addEventListener("click", handleUserAction);
commentsContainer.addEventListener("click", handleCommentAction);

async function initialize() {
  currentSession = await loadSession();
  adminEmail.textContent = currentSession.user.email;
  await loadDashboard();
  await loadComments();
}

async function loadSession() {
  const response = await fetch("/api/auth/session");

  if (response.status === 401) {
    window.location.assign("/");
    throw new Error("Unauthorized");
  }

  const data = await response.json();

  if (data.user.role !== "admin") {
    window.location.assign("/dashboard");
    throw new Error("Forbidden");
  }

  return data;
}

async function loadDashboard() {
  const response = await fetch("/api/admin/dashboard");

  if (response.status === 401) {
    window.location.assign("/");
    return;
  }

  if (response.status === 403) {
    window.location.assign("/dashboard");
    return;
  }

  const data = await response.json();

  if (!response.ok) {
    showStatus(data.error || "Failed to load admin dashboard.", "error");
    return;
  }

  users = data.users ?? [];
  renderSummary(data.summary ?? {});
  renderUsers(users);
  renderUserFilter(users);
}

async function loadComments() {
  const searchParams = new URLSearchParams({
    status: filterStatus.value || "all",
  });

  if (filterUser.value) {
    searchParams.set("userId", filterUser.value);
  }

  const response = await fetch(`/api/admin/comments?${searchParams.toString()}`);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    showStatus(data.error || "Failed to load comments.", "error");
    return;
  }

  renderComments(data.comments ?? []);
}

async function handleLogout() {
  logoutButton.disabled = true;

  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    window.location.assign("/");
  }
}

async function handleUserAction(event) {
  const button = event.target.closest("[data-user-id]");
  if (!button) {
    return;
  }

  const userId = button.dataset.userId;
  const disabled = button.dataset.disabled === "true";

  button.disabled = true;

  try {
    const response = await fetch("/api/admin/users/status", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        userId,
        disabled,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      showStatus(data.error || "Failed to update user status.", "error");
      return;
    }

    showStatus(
      `${data.user.email} is now ${data.user.isDisabled ? "disabled" : "active"}.`,
      "success",
    );

    await loadDashboard();
    await loadComments();
  } catch {
    showStatus("Network error while updating the user.", "error");
  } finally {
    button.disabled = false;
  }
}

async function handleCommentAction(event) {
  const button = event.target.closest("[data-comment-id]");
  if (!button) {
    return;
  }

  button.disabled = true;

  try {
    const response = await fetch("/api/admin/comments/status", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        commentId: button.dataset.commentId,
        resolved: button.dataset.resolved === "true",
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      showStatus(data.error || "Failed to update comment status.", "error");
      return;
    }

    showStatus(
      `Comment ${data.comment.isResolved ? "resolved" : "reopened"} successfully.`,
      "success",
    );

    await loadDashboard();
    await loadComments();
  } catch {
    showStatus("Network error while updating the comment.", "error");
  } finally {
    button.disabled = false;
  }
}

function renderSummary(summary) {
  summaryNodes.totalUsers.textContent = String(summary.total_users ?? 0);
  summaryNodes.disabledUsers.textContent = String(summary.disabled_users ?? 0);
  summaryNodes.unresolvedComments.textContent = String(summary.unresolved_comments ?? 0);
  summaryNodes.resolvedComments.textContent = String(summary.resolved_comments ?? 0);
}

function renderUsers(userList) {
  if (!userList.length) {
    usersContainer.className = "admin-user-list empty-state";
    usersContainer.textContent = "No users yet.";
    return;
  }

  usersContainer.className = "admin-user-list";
  usersContainer.innerHTML = userList
    .map((user) => {
      const isCurrentAdmin = currentSession?.user?.id === user.id;

      return `
        <article class="admin-user-card ${user.isDisabled ? "admin-user-card--disabled" : ""}">
          <div class="admin-user-card__head">
            <div>
              <strong>${escapeHtml(user.email)}</strong>
              <p>
                <span class="inline-badge">${escapeHtml(user.role)}</span>
                <span class="inline-badge ${user.isDisabled ? "inline-badge--danger" : "inline-badge--success"}">
                  ${user.isDisabled ? "disabled" : "active"}
                </span>
              </p>
            </div>
            <button
              class="button-secondary button-secondary--small"
              type="button"
              data-user-id="${escapeHtml(user.id)}"
              data-disabled="${String(!user.isDisabled)}"
              ${isCurrentAdmin ? "disabled" : ""}
            >
              ${user.isDisabled ? "Enable" : "Disable"}
            </button>
          </div>
          <small>
            ${user.unresolvedCommentCount} unresolved / ${user.totalCommentCount} total comments
          </small>
        </article>
      `;
    })
    .join("");
}

function renderUserFilter(userList) {
  const currentValue = filterUser.value;

  filterUser.innerHTML = [
    `<option value="">All users</option>`,
    ...userList.map(
      (user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.email)}</option>`,
    ),
  ].join("");

  if (userList.some((user) => user.id === currentValue)) {
    filterUser.value = currentValue;
  }
}

function renderComments(comments) {
  if (!comments.length) {
    commentsContainer.className = "admin-comment-list empty-state";
    commentsContainer.textContent = "No comments match these filters.";
    return;
  }

  commentsContainer.className = "admin-comment-list";
  commentsContainer.innerHTML = comments
    .map(
      (comment) => `
        <article class="comment-card ${comment.isResolved ? "comment-card--resolved" : ""}">
          <div class="comment-card__head">
            <div>
              <div class="comment-card__meta">
                <span class="inline-badge">${escapeHtml(comment.userEmail)}</span>
                <span class="inline-badge inline-badge--neutral">${escapeHtml(comment.category)}</span>
                <span class="inline-badge inline-badge--${escapeHtml(comment.severity)}">${escapeHtml(
                  comment.severity,
                )}</span>
                <span class="inline-badge ${comment.isResolved ? "inline-badge--muted" : "inline-badge--warning"}">
                  ${comment.isResolved ? "resolved" : "unresolved"}
                </span>
                ${
                  comment.isUserDisabled
                    ? `<span class="inline-badge inline-badge--danger">user disabled</span>`
                    : ""
                }
              </div>
              <h3>${escapeHtml(comment.summary)}</h3>
              <small>${formatTimestamp(comment.createdAt)}</small>
            </div>

            <button
              class="button-secondary button-secondary--small"
              type="button"
              data-comment-id="${escapeHtml(comment.id)}"
              data-resolved="${String(!comment.isResolved)}"
            >
              ${comment.isResolved ? "Reopen" : "Resolve"}
            </button>
          </div>

          <div class="comment-card__body">
            <p><strong>What happened:</strong> ${escapeHtml(comment.happened)}</p>
            <p><strong>How to reproduce:</strong> ${escapeHtml(comment.reproduceSteps)}</p>
            ${
              comment.expectedBehavior
                ? `<p><strong>Expected:</strong> ${escapeHtml(comment.expectedBehavior)}</p>`
                : ""
            }
            ${
              comment.extraDetails
                ? `<p><strong>Extra details:</strong> ${escapeHtml(comment.extraDetails)}</p>`
                : ""
            }
            ${
              comment.affectedUrl
                ? `<p><strong>Affected URL:</strong> <a class="text-link" href="${escapeHtml(
                    comment.affectedUrl,
                  )}" target="_blank" rel="noreferrer">${escapeHtml(comment.affectedUrl)}</a></p>`
                : ""
            }
          </div>
        </article>
      `,
    )
    .join("");
}

function showStatus(message, variant) {
  statusPanel.textContent = message;
  statusPanel.dataset.variant = variant;
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
