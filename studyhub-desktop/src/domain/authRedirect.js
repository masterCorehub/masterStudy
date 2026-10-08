// Capture only redirect metadata before the auth SDK consumes the URL fragment.
export function readAuthRedirect(location = {}) {
  const query = new URLSearchParams(location.search || "");
  const fragment = new URLSearchParams(
    String(location.hash || "").replace(/^#/, ""),
  );
  const isRecovery =
    query.get("auth") === "recovery" || fragment.get("type") === "recovery";
  const errorCode = fragment.get("error_code") || query.get("error_code");
  const failed = Boolean(
    errorCode || fragment.get("error") || query.get("error"),
  );
  return {
    isRecovery,
    // A reset requested in Electron opens in a browser without its PKCE verifier.
    flowType: fragment.has("access_token") ? "implicit" : "pkce",
    errorMessage: failed
      ? errorCode === "otp_expired"
        ? "Este link expirou ou já foi utilizado. Solicite um novo e-mail de recuperação."
        : "Não foi possível validar este link. Solicite um novo e-mail de recuperação."
      : "",
  };
}
