import { AuthConfigurationError } from "./authService.js";
import { jsonResponse } from "./http.js";

export async function getSessionResult({ authService, cookieHeader, headers }) {
  try {
    return {
      session: await authService.getSessionFromCookie(cookieHeader),
      response: null,
    };
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return {
        session: null,
        response: jsonResponse(503, { error: error.message }, headers),
      };
    }

    throw error;
  }
}
