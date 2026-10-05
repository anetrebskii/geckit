import datetime
import os
from pathlib import Path
import plistlib
import subprocess
import sys

HOST_ID = "org.anetrebskii.GeckIt.VPNQualification"
TUNNEL_ID = "org.anetrebskii.GeckIt.AgentVPN.Tunnel"
RUNNER_ID = "org.anetrebskii.GeckIt.AgentVPN.RunnerIdentityProbe"
CAPABILITY = "packet-tunnel-provider-systemextension"


def read_profile(path, bundle_id, team, install=False):
    decoded = subprocess.run(["/usr/bin/security", "cms", "-D", "-i", path], capture_output=True, check=True).stdout
    profile = plistlib.loads(decoded)
    entitlements = profile.get("Entitlements", {})
    identifier = entitlements.get("com.apple.application-identifier", entitlements.get("application-identifier"))
    expiration = profile.get("ExpirationDate")
    valid = (
        team in profile.get("TeamIdentifier", [])
        and identifier == team + "." + bundle_id
        and "OSX" in profile.get("Platform", [])
        and CAPABILITY in entitlements.get("com.apple.developer.networking.networkextension", [])
        and isinstance(expiration, datetime.datetime)
        and expiration > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
        and (not install or entitlements.get("com.apple.developer.system-extension.install") is True)
    )
    if not valid:
        raise ValueError("Provisioning profile does not authorize this VPN bundle.")


def write_plist(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(plistlib.dumps(data))


def info(identifier, executable, package_type="APPL"):
    return {
        "CFBundleIdentifier": identifier,
        "CFBundleExecutable": executable,
        "CFBundleName": executable,
        "CFBundlePackageType": package_type,
        "CFBundleVersion": "14",
        "CFBundleShortVersionString": "0.1",
        "LSMinimumSystemVersion": "15.0",
    }


def build_metadata(output, team, signed):
    app_group = team + ".org.anetrebskii.GeckIt.AgentVPN"
    app = output / "GeckIt VPN Qualification.app"
    extension = app / "Contents/Library/SystemExtensions" / (TUNNEL_ID + ".systemextension")
    runner = app / "Contents/Helpers/GeckIt Agent.app"
    host_info = info(HOST_ID, "GeckItVPNQualification")
    host_info.update({"LSUIElement": True, "GeckItVPNTeam": team})
    extension_info = info(TUNNEL_ID, "GeckItAgentVPNTunnel", "SYSX")
    extension_info["NSSystemExtensionUsageDescription"] = "Tests a separate VPN connection for GeckIt agents and their tools."
    extension_info["NetworkExtension"] = {
        "NEProviderClasses": {"com.apple.networkextension.packet-tunnel": "GeckItAgentVPN.PacketTunnel"},
        "NEMachServiceName": app_group + ".Tunnel",
    }
    write_plist(app / "Contents/Info.plist", host_info)
    write_plist(extension / "Contents/Info.plist", extension_info)
    write_plist(runner / "Contents/Info.plist", info(RUNNER_ID, "GeckItAgent"))
    for bundle in [app, extension, runner]:
        (bundle / "Contents/MacOS").mkdir(parents=True, exist_ok=True)
    (extension / "Contents/Resources").mkdir(parents=True, exist_ok=True)
    host_entitlements = {
        "com.apple.security.app-sandbox": True,
        "com.apple.security.application-groups": [app_group],
        "com.apple.developer.networking.networkextension": [CAPABILITY],
        "com.apple.developer.system-extension.install": True,
    }
    extension_entitlements = {
        "com.apple.security.app-sandbox": True,
        "com.apple.security.application-groups": [app_group],
        "com.apple.security.network.client": True,
        "com.apple.security.network.server": True,
        "com.apple.developer.networking.networkextension": [CAPABILITY],
    }
    if signed:
        host_profile = os.environ["GECKIT_VPN_HOST_PROFILE"]
        tunnel_profile = os.environ["GECKIT_VPN_TUNNEL_PROFILE"]
        read_profile(host_profile, HOST_ID, team, install=True)
        read_profile(tunnel_profile, TUNNEL_ID, team)
        (app / "Contents/embedded.provisionprofile").write_bytes(Path(host_profile).read_bytes())
        (extension / "Contents/embedded.provisionprofile").write_bytes(Path(tunnel_profile).read_bytes())
        for entitlements, identifier in [(host_entitlements, HOST_ID), (extension_entitlements, TUNNEL_ID)]:
            entitlements["com.apple.application-identifier"] = team + "." + identifier
            entitlements["com.apple.developer.team-identifier"] = team
    write_plist(output / "host.entitlements", host_entitlements)
    write_plist(output / "tunnel.entitlements", extension_entitlements)
    write_plist(output / "transport.entitlements", {"com.apple.security.app-sandbox": True, "com.apple.security.inherit": True})


if __name__ == "__main__":
    try:
        build_metadata(Path(sys.argv[1]), sys.argv[2], sys.argv[3] == "signed")
    except (KeyError, ValueError, OSError, subprocess.CalledProcessError, plistlib.InvalidFileException):
        sys.exit("Matching macOS Network Extension provisioning profiles are required. No configuration or profile contents were logged.")
