"""Outgoing email. Development writes to the `outbox` table so flows can be tested without sending anything;
production sends through Resend. Messages are plain text with a link or two: nothing sensitive is ever in the body."""

from __future__ import annotations

import logging
from typing import Optional, Protocol

import httpx

log = logging.getLogger("finlit.mail")


class Mailer(Protocol):
    async def send(self, to: str, subject: str, body: str) -> None: ...


class ConsoleMailer:
    def __init__(self, pool):
        self.pool = pool

    async def send(self, to: str, subject: str, body: str) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute("INSERT INTO outbox (to_email, subject, body) VALUES ($1, $2, $3)", to, subject, body)
        log.info("mail (console) to=%s subject=%s", to, subject)


class ResendMailer:
    def __init__(self, api_key: str, sender: str):
        self.api_key, self.sender = api_key, sender
        self.client: Optional[httpx.AsyncClient] = None

    async def send(self, to: str, subject: str, body: str) -> None:
        if self.client is None:
            self.client = httpx.AsyncClient(timeout=10)
        r = await self.client.post("https://api.resend.com/emails", headers={"Authorization": f"Bearer {self.api_key}"},
                                   json={"from": self.sender, "to": [to], "subject": subject, "text": body})
        if r.status_code >= 300:  # never log the body or the address
            log.error("resend failed status=%s", r.status_code)
            raise RuntimeError("mail provider rejected the message")


def verify_mail(link: str, name: Optional[str]) -> tuple[str, str]:
    hello = f"Hello {name}," if name else "Hello,"
    return ("Confirm your FinLit email", f"{hello}\n\nConfirm your email to finish creating your FinLit account:\n{link}\n\n"
            "The link works once and expires in 24 hours. If you did not sign up, ignore this message.\n\nFinLit Ventures")


def reset_mail(link: str, code: str = "") -> tuple[str, str]:
    """The reset email: the 6-digit code for the "Forgot password" page (15 minutes) and, as before, a one-click link (1 hour)."""
    if not code:
        return ("Reset your FinLit password", f"Someone asked to reset the password for this FinLit account.\n\nChoose a new one here:\n{link}\n\n"
                "The link works once and expires in 1 hour. If this was not you, ignore this message; your password is unchanged.\n\nFinLit Ventures")
    return (f"Your FinLit reset code: {code}", f"Someone asked to reset the password for this FinLit account.\n\nYour code: {code}\n\n"
            "Enter it on the FinLit page that asked for it, with your new password. It works once and expires in 15 minutes.\n\n"
            f"Or choose a new password with this link instead (expires in 1 hour):\n{link}\n\n"
            "Never share this code: FinLit will never ask you for it. If this was not you, ignore this message; your password is unchanged.\n\nFinLit Ventures")


def already_mail(link: str) -> tuple[str, str]:
    return ("You already have a FinLit account", f"Someone tried to sign up with this email address, but an account already exists.\n\n"
            f"Sign in or reset your password here:\n{link}\n\nIf this was not you, no action is needed.\n\nFinLit Ventures")


def mobile_taken_mail(link: str, contact: str, name: Optional[str] = None) -> tuple[str, str]:
    """Sign-up with a mobile number that another FinLit account already has (one account per mobile): no account is made, and the address that
    signed up is told so, instead of waiting for a confirmation that never comes. It never names the other account."""
    hello = f"Hello {name}," if name else "Hello,"
    return ("Your mobile number is already linked to a FinLit account",
            f"{hello}\n\nSomeone tried to create a FinLit account with this email address and a mobile number that is already linked to a FinLit "
            "account. Each mobile number can be used for one account only, so no new account was made.\n\n"
            f"If you already have an account with this number, sign in or reset your password here:\n{link}\n\n"
            "You can also sign up again with a different mobile number. If the number is yours and you did not create an account with it, "
            f"contact us here:\n{contact}\n\nIf this was not you, no action is needed.\n\nFinLit Ventures")
