import test from "node:test";
import assert from "node:assert/strict";

import { createAdminApi } from "../src/adminApi.js";
import { getConfig } from "../src/config.js";

function createAdminSession() {
  return {
    user: {
      id: "admin_1",
      email: "owner@example.com",
      role: "admin",
      isAdmin: true,
    },
  };
}

test("GET /api/admin/dashboard requires admin access", async () => {
  const api = createAdminApi({
    config: getConfig({ NODE_ENV: "test" }),
    authService: {
      async getSessionFromCookie() {
        return {
          user: {
            id: "user_1",
            email: "beta@example.com",
            role: "user",
            isAdmin: false,
          },
        };
      },
    },
    adminService: {
      async getDashboardData() {
        return {};
      },
      async listComments() {
        return [];
      },
      async setCommentResolved() {
        return {};
      },
      async setUserDisabled() {
        return {};
      },
    },
  });

  const result = await api.handle({
    pathname: "/api/admin/dashboard",
    method: "GET",
    origin: undefined,
    cookieHeader: "jobfinder_session=session_token",
    rawBody: "",
    searchParams: new URLSearchParams(),
  });

  assert.equal(result.status, 403);
});

test("GET /api/admin/comments returns filtered comment data for admins", async () => {
  const api = createAdminApi({
    config: getConfig({ NODE_ENV: "test" }),
    authService: {
      async getSessionFromCookie() {
        return createAdminSession();
      },
    },
    adminService: {
      async getDashboardData() {
        return {};
      },
      async listComments({ userId, status }) {
        assert.equal(userId, "user_1");
        assert.equal(status, "unresolved");

        return [
          {
            id: "comment_1",
            summary: "Broken filters",
            isResolved: false,
          },
        ];
      },
      async setCommentResolved() {
        return {};
      },
      async setUserDisabled() {
        return {};
      },
    },
  });

  const result = await api.handle({
    pathname: "/api/admin/comments",
    method: "GET",
    origin: undefined,
    cookieHeader: "jobfinder_session=session_token",
    rawBody: "",
    searchParams: new URLSearchParams({
      userId: "user_1",
      status: "unresolved",
    }),
  });

  assert.equal(result.status, 200);
  const body = JSON.parse(result.body);
  assert.equal(body.comments.length, 1);
  assert.equal(body.comments[0].id, "comment_1");
});

test("POST /api/admin/users/status toggles disabled state", async () => {
  const api = createAdminApi({
    config: getConfig({ NODE_ENV: "test" }),
    authService: {
      async getSessionFromCookie() {
        return createAdminSession();
      },
    },
    adminService: {
      async getDashboardData() {
        return {};
      },
      async listComments() {
        return [];
      },
      async setCommentResolved() {
        return {};
      },
      async setUserDisabled({ targetUserId, disabled }) {
        assert.equal(targetUserId, "user_2");
        assert.equal(disabled, true);

        return {
          id: "user_2",
          email: "beta@example.com",
          role: "user",
          isDisabled: true,
        };
      },
    },
  });

  const result = await api.handle({
    pathname: "/api/admin/users/status",
    method: "POST",
    origin: undefined,
    cookieHeader: "jobfinder_session=session_token",
    rawBody: JSON.stringify({
      userId: "user_2",
      disabled: true,
    }),
    searchParams: new URLSearchParams(),
  });

  assert.equal(result.status, 200);
  const body = JSON.parse(result.body);
  assert.equal(body.user.isDisabled, true);
});

test("POST /api/admin/users/status rejects non-boolean action values", async () => {
  let updateCalled = false;
  const api = createAdminApi({
    config: getConfig({ NODE_ENV: "test" }),
    authService: {
      async getSessionFromCookie() {
        return createAdminSession();
      },
    },
    adminService: {
      async getDashboardData() {
        return {};
      },
      async listComments() {
        return [];
      },
      async setCommentResolved() {
        return {};
      },
      async setUserDisabled() {
        updateCalled = true;
        return {};
      },
    },
  });

  const result = await api.handle({
    pathname: "/api/admin/users/status",
    method: "POST",
    origin: undefined,
    cookieHeader: "jobfinder_session=session_token",
    rawBody: JSON.stringify({
      userId: "user_2",
      disabled: "false",
    }),
    searchParams: new URLSearchParams(),
  });

  assert.equal(result.status, 400);
  assert.equal(updateCalled, false);
});
