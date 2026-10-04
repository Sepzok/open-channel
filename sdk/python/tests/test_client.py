import json
import os
import subprocess
import sys
import time
import unittest
from urllib import error, request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdk", "python"))

from openchannel import Client, OcpError  # noqa: E402


def wait_for_port(proc: subprocess.Popen, timeout: float = 30.0) -> str:
    deadline = time.time() + timeout
    while time.time() < deadline:
        line = proc.stdout.readline() if proc.stdout else b""
        if not line:
            time.sleep(0.05)
            continue
        text = line.decode("utf-8", errors="replace").strip()
        if "http://" in text:
            return text.split("http://", 1)[1].strip()
        if proc.poll() is not None:
            raise RuntimeError("notes provider exited early")
    raise TimeoutError("notes provider did not print URL")


class SdkPythonTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data_dir = os.path.join(ROOT, "sdk", "python", "tests", "_data_notes")
        os.makedirs(cls.data_dir, exist_ok=True)
        store = os.path.join(cls.data_dir, "store.json")
        if os.path.exists(store):
            os.remove(store)
        cls.proc = subprocess.Popen(
            ["node", "--import", "tsx", os.path.join(ROOT, "examples", "notes", "index.ts")],
            cwd=ROOT,
            env={**os.environ, "PORT": "0", "DATA_DIR": cls.data_dir},
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        hostport = wait_for_port(cls.proc)
        cls.base_url = f"http://{hostport}"

    @classmethod
    def tearDownClass(cls):
        if cls.proc.poll() is None:
            cls.proc.terminate()
            cls.proc.wait(timeout=10)

    def test_sdk_flow(self):
        client = Client(self.base_url, "demo-token")
        channels = client.list_channels()
        self.assertIn("data", channels)
        ch = client.get_channel("ch_glossary")
        old_rev = ch["revision"]
        updated = client.update_channel(
            "ch_glossary",
            {"base_revision": old_rev, "body": [{"type": "text", "text": "Python 更新", "format": "plain"}]},
        )
        self.assertNotEqual(updated["revision"], old_rev)
        before = client.list_entries("ch_glossary")
        count_before = len(before["data"])
        client.create_entry(
            "ch_glossary",
            {
                "type": "comment",
                "body": [{"type": "text", "text": "Python 讨论", "format": "plain"}],
                "parent_id": None,
                "anchor": None,
            },
        )
        after = client.list_entries("ch_glossary")
        self.assertEqual(len(after["data"]), count_before + 1)
        self.assertEqual(after["data"][-1]["author"]["id"], "u_fuse")
        with self.assertRaises(OcpError) as ctx:
            client.create_entry(
                "ch_glossary",
                {
                    "type": "comment",
                    "author": {"id": "x", "display_name": "x"},
                    "body": [{"type": "text", "text": "bad", "format": "plain"}],
                },
            )
        self.assertEqual(ctx.exception.code, "validation_error")
        after2 = client.list_entries("ch_glossary")
        self.assertEqual(len(after2["data"]), count_before + 1)


if __name__ == "__main__":
    unittest.main()
