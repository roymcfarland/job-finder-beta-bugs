import { element, formatTimestamp, variant } from "/dom.js";

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
const severityLevels = ["low", "medium", "high", "blocking"];

initialize().catch(() => {
  showStatus("Unable to load the admin dashboard. Refresh and try again.", "error");
});

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
    return haltUntilNavigation();
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error("Failed to load session.");
  }

  if (data.user?.role !== "admin") {
    window.location.assign("/dashboard");
    return haltUntilNavigation();
  }

  return data;
}

// After window.location.assign the new page is loading; we don't want
// initialize() to keep running and flash a misleading error toast in the
// background, so we hand back a promise that never resolves.
function haltUntilNavigation() {
  return new Promise(() => {});
}

async function loadDashboard() {
  let response;
  let data;

  try {
    response = await fetch("/api/admin/dashboard");
    data = await response.json().catch(() => ({}));
  } catch {
    showStatus("Network error while loading the admin dashboard.", "error");
    return;
  }

  if (redirectIfUnauthorized(response)) {
    return;
  }

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

  let response;
  let data;

  try {
    response = await fetch(`/api/admin/comments?${searchParams.toString()}`);
    data = await response.json().catch(() => ({}));
  } catch {
    showStatus("Network error while loading comments.", "error");
    return;
  }

  if (redirectIfUnauthorized(response)) {
    return;
  }

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
  const button =
    event.target instanceof Element ? event.target.closest("[data-user-id]") : null;
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
  const button =
    event.target instanceof Element ? event.target.closest("[data-comment-id]") : null;
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
  usersContainer.replaceChildren(...userList.map(createUserCard));
}

function renderUserFilter(userList) {
  const currentValue = filterUser.value;

  filterUser.replaceChildren(
    element("option", { text: "All users", attrs: { value: "" } }),
    ...userList.map((user) =>
      element("option", {
        text: user.email,
        attrs: {
          value: user.id,
        },
      }),
    ),
  );

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
  commentsContainer.replaceChildren(...comments.map(createCommentCard));
}

function showStatus(message, variant) {
  statusPanel.textContent = message;
  statusPanel.dataset.variant = variant;
}

function redirectIfUnauthorized(response) {
  if (response.status === 401) {
    window.location.assign("/");
    return true;
  }

  if (response.status === 403) {
    window.location.assign("/dashboard");
    return true;
  }

  return false;
}

function createUserCard(user) {
  const isCurrentAdmin = currentSession?.user?.id === user.id;
  const statusClass = user.isDisabled ? "inline-badge--danger" : "inline-badge--success";

  return element(
    "article",
    {
      className: `admin-user-card${user.isDisabled ? " admin-user-card--disabled" : ""}`,
    },
    [
      element("div", { className: "admin-user-card__head" }, [
        element("div", {}, [
          element("strong", { text: user.email }),
          element("p", {}, [
            element("span", { className: "inline-badge", text: user.role }),
            element("span", {
              className: `inline-badge ${statusClass}`,
              text: user.isDisabled ? "disabled" : "active",
            }),
          ]),
        ]),
        element("button", {
          className: "button-secondary button-secondary--small",
          type: "button",
          text: user.isDisabled ? "Enable" : "Disable",
          disabled: isCurrentAdmin,
          dataset: {
            userId: user.id,
            disabled: String(!user.isDisabled),
          },
        }),
      ]),
      element("small", {
        text: [
          `${user.unresolvedCommentCount} unresolved`,
          `${user.totalCommentCount} total comments`,
        ].join(" / "),
      }),
    ],
  );
}

function createCommentCard(comment) {
  const severity = variant(comment.severity, severityLevels, "medium");
  const body = element("div", { className: "comment-card__body" }, [
    detailLine("What happened:", comment.happened),
    detailLine("How to reproduce:", comment.reproduceSteps),
    comment.expectedBehavior ? detailLine("Expected:", comment.expectedBehavior) : null,
    comment.extraDetails ? detailLine("Extra details:", comment.extraDetails) : null,
    createAffectedUrlLine(comment.affectedUrl),
  ]);

  return element(
    "article",
    {
      className: `comment-card${comment.isResolved ? " comment-card--resolved" : ""}`,
    },
    [
      element("div", { className: "comment-card__head" }, [
        element("div", {}, [
          element("div", { className: "comment-card__meta" }, [
            badge(comment.userEmail),
            badge(comment.category, "inline-badge--neutral"),
            badge(comment.severity, `inline-badge--${severity}`),
            badge(
              comment.isResolved ? "resolved" : "unresolved",
              comment.isResolved ? "inline-badge--muted" : "inline-badge--warning",
            ),
            comment.isUserDisabled ? badge("user disabled", "inline-badge--danger") : null,
          ]),
          element("h3", { text: comment.summary || "Untitled comment" }),
          element("small", { text: formatTimestamp(comment.createdAt) }),
        ]),
        element("button", {
          className: "button-secondary button-secondary--small",
          type: "button",
          text: comment.isResolved ? "Reopen" : "Resolve",
          dataset: {
            commentId: comment.id,
            resolved: String(!comment.isResolved),
          },
        }),
      ]),
      body,
    ],
  );
}

function badge(text, modifier = "") {
  return element("span", {
    className: `inline-badge${modifier ? ` ${modifier}` : ""}`,
    text,
  });
}

function detailLine(label, value) {
  const paragraph = element("p");
  paragraph.append(element("strong", { text: label }), " ", String(value || ""));
  return paragraph;
}

function createAffectedUrlLine(url) {
  if (!url) {
    return null;
  }

  const paragraph = element("p");
  paragraph.append(element("strong", { text: "Affected URL:" }), " ");

  if (isSafeHttpUrl(url)) {
    paragraph.append(
      element("a", {
        className: "text-link",
        href: url,
        text: url,
        attrs: {
          target: "_blank",
          rel: "noreferrer",
        },
      }),
    );
  } else {
    paragraph.append(String(url));
  }

  return paragraph;
}

function isSafeHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}
