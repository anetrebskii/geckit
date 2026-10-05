import datetime
from pathlib import Path
import plistlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import bundle


class ProvisioningTests(unittest.TestCase):
    def profile(self):
        return {
            "TeamIdentifier": ["MQKD7Z7V2L"],
            "Platform": ["OSX"],
            "ExpirationDate": datetime.datetime.now() + datetime.timedelta(days=1),
            "Entitlements": {
                "com.apple.application-identifier": "MQKD7Z7V2L." + bundle.HOST_ID,
                "com.apple.developer.networking.networkextension": [bundle.CAPABILITY],
                "com.apple.developer.system-extension.install": True,
            },
        }

    def validate(self, profile):
        decoded = subprocess.CompletedProcess([], 0, stdout=plistlib.dumps(profile))
        with patch("bundle.subprocess.run", return_value=decoded):
            bundle.read_profile("test.provisionprofile", bundle.HOST_ID, "MQKD7Z7V2L", install=True)

    def test_matching_capabilities(self):
        self.validate(self.profile())

    def test_wrong_team_bundle_platform_expiry(self):
        for field, value in [
            ("TeamIdentifier", ["OTHERTEAM1"]),
            ("Platform", ["iOS"]),
            ("ExpirationDate", datetime.datetime.now() - datetime.timedelta(days=1)),
        ]:
            profile = self.profile()
            profile[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.validate(profile)
        profile = self.profile()
        profile["Entitlements"]["com.apple.application-identifier"] = "MQKD7Z7V2L.unrelated"
        with self.assertRaises(ValueError):
            self.validate(profile)

    def test_missing_or_wrong_capability(self):
        for field, value in [
            ("com.apple.developer.networking.networkextension", ["packet-tunnel-provider"]),
            ("com.apple.developer.system-extension.install", False),
        ]:
            profile = self.profile()
            profile["Entitlements"][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.validate(profile)

    def test_unsigned_metadata_contains_no_profile(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bundle.build_metadata(root, "MQKD7Z7V2L", False)
            self.assertEqual(list(root.rglob("*.provisionprofile")), [])
            extension = next(root.rglob("*.systemextension"))
            metadata = plistlib.loads((extension / "Contents/Info.plist").read_bytes())
            self.assertTrue(metadata["NSSystemExtensionUsageDescription"].strip())
            host = plistlib.loads((root / "host.entitlements").read_bytes())
            tunnel = plistlib.loads((root / "tunnel.entitlements").read_bytes())
            groups = tunnel["com.apple.security.application-groups"]
            self.assertEqual(groups, host["com.apple.security.application-groups"])
            self.assertTrue(all(group.startswith("MQKD7Z7V2L.") for group in groups))
            self.assertTrue(any(metadata["NetworkExtension"]["NEMachServiceName"].startswith(group + ".") for group in groups))
            runner = root / "GeckIt VPN Qualification.app/Contents/Helpers/GeckIt Agent.app"
            self.assertFalse((runner / "Contents/embedded.provisionprofile").exists())
            self.assertEqual(metadata["NetworkExtension"]["NEProviderClasses"]["com.apple.networkextension.packet-tunnel"], "GeckItAgentVPN.PacketTunnel")
            transport = plistlib.loads((root / "transport.entitlements").read_bytes())
            self.assertTrue(transport["com.apple.security.inherit"])
            self.assertNotIn("com.apple.developer.networking.networkextension", transport)


if __name__ == "__main__":
    unittest.main()
