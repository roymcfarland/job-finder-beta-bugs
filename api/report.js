import { createBugReportApi } from "../src/bugReportApi.js";
import {
  BodyTooLargeError,
  getClientIp,
  getSecurityHeaders,
  readRequestBody,
} from "../src/http.js";

const api = createBugReportApi();

export default async function handler(request, response) {
  try {
    const result = await api.handle({
      method: request.method ?? "GET",
      origin: request.headers.origin,
      ip: getClientIp(request.headers, request.socket?.remoteAddress),
      userAgent: request.headers["user-agent"],
      rawBody: await readRequestBody(request),
    });

    response.statusCode = result.status;

    for (const [name, value] of Object.entries(result.headers)) {
      response.setHeader(name, value);
    }

    if (result.body === null) {
      response.end();
      return;
    }

    response.end(result.body);
  } catch (error) {
    response.statusCode = error instanceof BodyTooLargeError ? 413 : 500;

    for (const [name, value] of Object.entries({
      ...getSecurityHeaders(),
      "content-type": "application/json; charset=utf-8",
    })) {
      response.setHeader(name, value);
    }

    response.end(
      JSON.stringify({
        error:
          error instanceof BodyTooLargeError
            ? "Bug reports are limited to 64 KB."
            : "Something went wrong while receiving this report.",
      }),
    );
  }
}
