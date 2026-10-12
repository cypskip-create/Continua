export const LEGAL_POLICY_VERSION = "2026-10-12";
export const SUPPORT_EMAIL = "cypskip@gmail.com";
export function signupAcknowledgement(adult: boolean, accepted: boolean) {
  if (!adult || !accepted)
    throw new Error(
      "Confirm that you are 18 or older and agree to the Terms before creating an account.",
    );
  return {
    adult_self_attested: true,
    terms_version: LEGAL_POLICY_VERSION,
    privacy_notice_version: LEGAL_POLICY_VERSION,
  };
}
export function paymentLabel(kind: "mpesa" | "card", suffix: string) {
  const digits = suffix.trim();
  const expected = kind === "card" ? 4 : 3;
  if (!new RegExp(`^\\d{${expected}}$`).test(digits))
    throw new Error(
      `Enter only the last ${expected} digits, not a full card or phone number.`,
    );
  return {
    method_type: kind,
    label: kind === "card" ? "Card reference" : "M-Pesa reference",
    detail: `•••• ${digits}`,
  };
}
