// Centralized contact configuration.
// Provide final values via env vars (REACT_APP_CONTACT_EMAIL, REACT_APP_LINKEDIN_URL)
// or edit the fallbacks below. Recipient of form submissions is configured on the
// backend via the LEAD_ALERT_EMAIL environment variable.
export const CONTACT_EMAIL =
  process.env.REACT_APP_CONTACT_EMAIL || "finlit.start@gmail.com";

// TODO: replace with official FinLit LinkedIn URL.
export const LINKEDIN_URL = process.env.REACT_APP_LINKEDIN_URL || "https://www.linkedin.com/";
