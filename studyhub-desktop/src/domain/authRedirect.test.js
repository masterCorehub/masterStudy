import test from "node:test";
import assert from "node:assert/strict";
import { readAuthRedirect } from "./authRedirect.js";

test("captures recovery metadata without exposing callback credentials", () => {
  assert.deepEqual(
    readAuthRedirect({
      hash: "#access_token=secret&refresh_token=secret&type=recovery",
    }),
    {
      isRecovery: true,
      flowType: "implicit",
      errorMessage: "",
    },
  );
});
test("preserves PKCE for normal sign-in and legacy code callbacks", () => {
  assert.equal(readAuthRedirect({}).flowType, "pkce");
  assert.equal(
    readAuthRedirect({ search: "?auth=recovery&code=legacy" }).isRecovery,
    true,
  );
});
test("expired recovery links have a useful message without reflecting URL text", () => {
  const result = readAuthRedirect({
    search: "?auth=recovery",
    hash: "#error=access_denied&error_code=otp_expired&error_description=secret",
  });
  assert.match(result.errorMessage, /expirou/);
  assert.ok(!result.errorMessage.includes("secret"));
});
