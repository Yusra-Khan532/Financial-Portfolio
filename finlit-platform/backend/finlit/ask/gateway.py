"""Ask FinLit AI's way to the data: the website's own routes, called in-process AS THE MEMBER (their session cookie, their CSRF token, an administrator's
"view as" choice). Every plan rule, redaction, cache and number is therefore exactly what that member sees on the website; the AI never gets more.
It is the MCP gateway (finlit/mcp/gateway.py) with the member's credentials instead of none, and plan messages written for a member."""

from __future__ import annotations

from typing import Optional

import httpx

from ..auth.service import VIEW_AS_HEADER
from ..mcp.gateway import TIMEOUT, Gateway, ToolError


class MemberGateway(Gateway):
    def __init__(self, app, host: str, ip: str, *, cookie_name: str, cookie: str, csrf: str, origin: str, view_as: Optional[str] = None):
        super().__init__(app, host, ip)
        self.cookie_name, self.cookie, self.csrf, self.origin, self.view_as = cookie_name, cookie, csrf, origin, view_as

    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            # "ask:" keeps the site's per-address limits for the AI's lookups apart from the same person's own browsing
            transport = httpx.ASGITransport(app=self.app, client=(f"ask:{self.ip}", 0))
            headers = {"accept": "application/json", "accept-encoding": "identity", "user-agent": "finlit-ask", "origin": self.origin, "x-csrf-token": self.csrf}
            if self.view_as:
                headers[VIEW_AS_HEADER] = self.view_as
            self._client = httpx.AsyncClient(transport=transport, base_url=f"http://{self.host}", timeout=TIMEOUT, headers=headers,
                                             cookies={self.cookie_name: self.cookie} if self.cookie else None)
        return self._client

    async def json(self, path, params=None, *, method="GET", body=None, subject="That"):
        try:
            return await super().json(path, params, method=method, body=body, subject=subject)
        except ToolError as e:
            # the MCP wording speaks to an anonymous visitor ("not available through this free server"); here it is the member's own plan
            msg = str(e).replace(" It is not available through this free server.", " It is not included in this member's plan.")
            raise ToolError(msg) from None
