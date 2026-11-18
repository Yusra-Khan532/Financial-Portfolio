"""What the site may email (the owner, 19 Nov 2026). The mail allowance is small (about 100 messages a day on the free plan), so it is kept for the
account emails only: the password-reset link, sign-up verification and the 'you already have an account' notice (auth/routes.py), plus the team's
'Raise a Query' notice (page_feedback.py). Every alert (price, rule, screen, Mutual Fund Score, job and data health) reaches people in the site's bell
only, and the weekly 'week ahead' email is not sent. Switching ALERT_EMAILS back on restores the alert emails and the digest in one place."""

ALERT_EMAILS = False
