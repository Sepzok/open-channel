"""Open Channel Protocol Python client (stdlib only)."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Mapping, MutableMapping, Optional


class OcpError(Exception):
    def __init__(self, status: int, body: Mapping[str, Any]):
        super().__init__(body.get("title") or body.get("code") or "OCP error")
        self.status = status
        self.code = str(body.get("code", "unknown"))
        self.body = dict(body)


class Client:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url.rstrip("/")
        self.token = token

    def _url(self, path: str, query: Optional[Mapping[str, Any]] = None) -> str:
        q = ""
        if query:
            parts = [(k, v) for k, v in query.items() if v is not None]
            if parts:
                q = "?" + urllib.parse.urlencode(parts)
        return f"{self.base_url}{path}{q}"

    def _request(
        self,
        method: str,
        path: str,
        *,
        query: Optional[Mapping[str, Any]] = None,
        body: Any = None,
        headers: Optional[MutableMapping[str, str]] = None,
        idempotency_key: Optional[str] = None,
        raw_body: Optional[bytes] = None,
        content_type: Optional[str] = None,
    ) -> tuple[int, Any]:
        hdrs: MutableMapping[str, str] = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.ocp+json",
        }
        if headers:
            hdrs.update(headers)
        if idempotency_key:
            hdrs["Idempotency-Key"] = idempotency_key
        data = raw_body
        if body is not None:
            hdrs["Content-Type"] = "application/json"
            data = json.dumps(body).encode("utf-8")
        if content_type:
            hdrs["Content-Type"] = content_type
        req = urllib.request.Request(self._url(path, query), data=data, method=method, headers=hdrs)
        try:
            with urllib.request.urlopen(req) as resp:
                status = resp.status
                raw = resp.read()
        except urllib.error.HTTPError as e:
            status = e.code
            raw = e.read()
        if not raw:
            parsed = None
        else:
            try:
                parsed = json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError:
                parsed = raw.decode("utf-8", errors="replace")
        if status >= 400:
            if isinstance(parsed, dict) and "code" in parsed:
                raise OcpError(status, parsed)
            raise OcpError(status, {"code": "unknown", "title": "Error", "status": status})
        return status, parsed

    def list_channels(self, **query: Any) -> Any:
        _, data = self._request("GET", "/v1/channels", query=query)
        return data

    def create_channel(self, body: Mapping[str, Any], idempotency_key: Optional[str] = None) -> tuple[int, Any]:
        status, data = self._request("POST", "/v1/channels", body=dict(body), idempotency_key=idempotency_key)
        return status, data

    def get_channel(self, channel_id: str) -> Any:
        _, data = self._request("GET", f"/v1/channels/{channel_id}")
        return data

    def update_channel(self, channel_id: str, body: Mapping[str, Any]) -> Any:
        _, data = self._request("PATCH", f"/v1/channels/{channel_id}", body=dict(body))
        return data

    def delete_channel(self, channel_id: str) -> Any:
        _, data = self._request("DELETE", f"/v1/channels/{channel_id}")
        return data

    def list_entries(self, channel_id: str, **query: Any) -> Any:
        _, data = self._request("GET", f"/v1/channels/{channel_id}/entries", query=query)
        return data

    def create_entry(self, channel_id: str, body: Mapping[str, Any], idempotency_key: Optional[str] = None) -> tuple[int, Any]:
        status, data = self._request(
            "POST", f"/v1/channels/{channel_id}/entries", body=dict(body), idempotency_key=idempotency_key
        )
        return status, data

    def get_entry(self, entry_id: str) -> Any:
        _, data = self._request("GET", f"/v1/entries/{entry_id}")
        return data

    def delete_entry(self, entry_id: str) -> Any:
        _, data = self._request("DELETE", f"/v1/entries/{entry_id}")
        return data

    def list_links(self, channel_id: str, **query: Any) -> Any:
        _, data = self._request("GET", f"/v1/channels/{channel_id}/links", query=query)
        return data

    def create_link(self, channel_id: str, body: Mapping[str, Any], idempotency_key: Optional[str] = None) -> tuple[int, Any]:
        status, data = self._request(
            "POST", f"/v1/channels/{channel_id}/links", body=dict(body), idempotency_key=idempotency_key
        )
        return status, data

    def delete_link(self, link_id: str) -> Any:
        _, data = self._request("DELETE", f"/v1/links/{link_id}")
        return data

    def create_share(self, channel_id: str, body: Mapping[str, Any], idempotency_key: Optional[str] = None) -> tuple[int, Any]:
        status, data = self._request(
            "POST", f"/v1/channels/{channel_id}/shares", body=dict(body), idempotency_key=idempotency_key
        )
        return status, data

    def get_share(self, share_id: str) -> Any:
        _, data = self._request("GET", f"/v1/shares/{share_id}")
        return data

    def revoke_share(self, share_id: str) -> Any:
        _, data = self._request("DELETE", f"/v1/shares/{share_id}")
        return data

    def resolve_share(self, token: str) -> Any:
        url = f"{self.base_url}/s/{token}"
        req = urllib.request.Request(url, headers={"Accept": "application/json"}, method="GET")
        try:
            with urllib.request.urlopen(req) as resp:
                raw = resp.read()
                status = resp.status
        except urllib.error.HTTPError as e:
            status = e.code
            raw = e.read()
        parsed = json.loads(raw.decode("utf-8")) if raw else None
        if status >= 400:
            raise OcpError(status, parsed if isinstance(parsed, dict) else {"code": "unknown"})
        return parsed

    def list_revisions(self, channel_id: str) -> Any:
        _, data = self._request("GET", f"/v1/channels/{channel_id}/revisions")
        return data

    def get_revision(self, channel_id: str, rev_id: str) -> Any:
        _, data = self._request("GET", f"/v1/channels/{channel_id}/revisions/{rev_id}")
        return data

    def restore_revision(self, channel_id: str, rev_id: str) -> Any:
        _, data = self._request("POST", f"/v1/channels/{channel_id}/revisions/{rev_id}/restore", body={})
        return data

    def upload_file(self, data: bytes, name: str, media_type: str) -> Any:
        _, parsed = self._request(
            "POST",
            "/v1/files",
            raw_body=data,
            content_type=media_type,
            headers={"X-File-Name": urllib.parse.quote(name)},
        )
        return parsed

    def download_file(self, file_id: str) -> tuple[bytes, str, str]:
        url = self._url(f"/v1/files/{file_id}")
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {self.token}"}, method="GET")
        try:
            with urllib.request.urlopen(req) as resp:
                raw = resp.read()
                media_type = resp.headers.get("Content-Type", "application/octet-stream")
                name_hdr = resp.headers.get("X-File-Name") or resp.headers.get("x-file-name")
                name = urllib.parse.unquote(name_hdr) if name_hdr else file_id
                return raw, media_type, name
        except urllib.error.HTTPError as e:
            body = json.loads(e.read().decode("utf-8"))
            raise OcpError(e.code, body)
