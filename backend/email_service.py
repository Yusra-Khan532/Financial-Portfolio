import os
import asyncio
import logging
import resend

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
LEAD_ALERT_EMAIL = os.environ.get("LEAD_ALERT_EMAIL", "")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


def _row(label, value):
    if not value:
        return ""
    return (
        f'<tr><td style="padding:6px 12px;color:#64748B;font-size:13px;">{label}</td>'
        f'<td style="padding:6px 12px;color:#0A1E3F;font-size:14px;font-weight:600;">{value}</td></tr>'
    )


def _alert_html(lead):
    return f"""
    <div style="background:#050E1D;padding:32px;font-family:Arial,sans-serif;">
      <table style="max-width:560px;margin:auto;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#0A1E3F;padding:24px 28px;">
          <div style="color:#F5A623;font-size:12px;letter-spacing:2px;text-transform:uppercase;">New Enquiry</div>
          <div style="color:#ffffff;font-size:22px;font-weight:700;margin-top:6px;">Nishant Jain — PMS</div>
        </td></tr>
        <tr><td style="padding:24px 16px;">
          <table style="width:100%;border-collapse:collapse;">
            {_row("Name", lead.get("name"))}
            {_row("Email", lead.get("email"))}
            {_row("Phone", lead.get("phone"))}
            {_row("Investment Size", lead.get("investment_size"))}
          </table>
          <div style="margin:18px 12px 0;color:#64748B;font-size:13px;">Message</div>
          <div style="margin:6px 12px;padding:14px;background:#F1F5F9;border-radius:8px;color:#0A1E3F;font-size:14px;line-height:1.6;">
            {lead.get("message","")}
          </div>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#F8FAFC;color:#94A3B8;font-size:12px;">
          Reply directly to {lead.get("email")} to respond to this lead.
        </td></tr>
      </table>
    </div>
    """


def _reply_html(lead):
    return f"""
    <div style="background:#050E1D;padding:32px;font-family:Arial,sans-serif;">
      <table style="max-width:560px;margin:auto;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#0A1E3F;padding:28px;">
          <div style="color:#ffffff;font-size:22px;font-weight:700;">Thank you, {lead.get("name","")}</div>
          <div style="color:#F5A623;font-size:13px;margin-top:6px;">Nishant Jain · Independent Equity Research</div>
        </td></tr>
        <tr><td style="padding:28px;color:#334155;font-size:15px;line-height:1.7;">
          Thank you for reaching out. I've received your message and will personally
          get back to you shortly to discuss how we can work together on building a
          research-driven equity portfolio.
          <br/><br/>
          <span style="color:#64748B;font-size:13px;">— A copy of your message:</span>
          <div style="margin-top:8px;padding:14px;background:#F1F5F9;border-radius:8px;color:#0A1E3F;font-size:14px;line-height:1.6;">
            {lead.get("message","")}
          </div>
          <br/>
          Warm regards,<br/>
          <strong style="color:#0A1E3F;">Nishant Jain</strong>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#F8FAFC;color:#94A3B8;font-size:11px;">
          This is an automated confirmation. Investments are subject to market risks.
        </td></tr>
      </table>
    </div>
    """


def _send_sync(to, subject, html, reply_to=None):
    params = {"from": SENDER_EMAIL, "to": [to], "subject": subject, "html": html}
    if reply_to:
        params["reply_to"] = reply_to
    return resend.Emails.send(params)


async def send_lead_emails(lead: dict, auto_reply: bool = True):
    """Fire lead-alert (to owner) and optional auto-reply (to visitor). Never raises."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — skipping lead emails.")
        return

    try:
        if LEAD_ALERT_EMAIL:
            await asyncio.to_thread(
                _send_sync,
                LEAD_ALERT_EMAIL,
                f"New PMS enquiry — {lead.get('name','')}",
                _alert_html(lead),
                lead.get("email"),
            )
            logger.info("Lead alert email sent to %s", LEAD_ALERT_EMAIL)
    except Exception as e:
        logger.error("Failed to send lead alert email: %s", e)

    if auto_reply and lead.get("email"):
        try:
            await asyncio.to_thread(
                _send_sync,
                lead["email"],
                "We've received your message — Nishant Jain PMS",
                _reply_html(lead),
            )
            logger.info("Auto-reply sent to %s", lead["email"])
        except Exception as e:
            logger.error("Failed to send auto-reply email: %s", e)
