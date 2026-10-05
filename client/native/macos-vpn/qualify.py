import json
from pathlib import Path
import select
import signal
import struct
import subprocess
import sys
import tempfile
import time


APP = Path("/Applications/GeckIt VPN Qualification.app")
CONTROLLER = APP / "Contents/MacOS/GeckItVPNQualification"
RUNNER = APP / "Contents/Helpers/GeckIt Agent.app/Contents/MacOS/GeckItAgent"
RUNNER_APP = APP / "Contents/Helpers/GeckIt Agent.app"

PROBE = r"""
import json, socket, struct, subprocess, threading, uuid
results = {}
errors = {}
sources = {}
def progress():
    if 'emit_progress' in globals():
        emit_progress(results, False)
for name, family, kind, address in [
    ('tcp4', socket.AF_INET, socket.SOCK_STREAM, ('10.91.0.1', 8091)),
    ('tcp6', socket.AF_INET6, socket.SOCK_STREAM, ('fd91::1', 8091)),
    ('udp4', socket.AF_INET, socket.SOCK_DGRAM, ('10.91.0.1', 8092)),
    ('udp6', socket.AF_INET6, socket.SOCK_DGRAM, ('fd91::1', 8092)),
]:
    try:
        with socket.socket(family, kind) as connection:
            connection.settimeout(3)
            connection.connect(address)
            sources[name] = connection.getsockname()[0] == ('10.91.0.2' if family == socket.AF_INET else 'fd91::2')
            connection.sendall(b'geckit-probe')
            results[name] = connection.recv(32) == b'geckit-probe'
    except OSError as error:
        results[name] = False
        errors[name] = error.errno
    progress()
hostname = 'geckit-' + uuid.uuid4().hex + '.tunnel.test.'
try:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as connection:
        connection.settimeout(3)
        connection.sendto(b'geckit-probe', ('10.91.0.1', 8092))
        results['udp4_unconnected'] = connection.recv(32) == b'geckit-probe'
except OSError as error:
    results['udp4_unconnected'] = False
    errors['udp4_unconnected'] = error.errno
progress()
try:
    labels = b''.join(bytes([len(label)]) + label.encode() for label in hostname.rstrip('.').split('.')) + b'\x00'
    query = struct.pack('!6H', 26454, 256, 1, 0, 0, 0) + labels + struct.pack('!2H', 1, 1)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as connection:
        connection.settimeout(3)
        connection.connect(('10.91.0.1', 53))
        sources['dns_udp'] = connection.getsockname()[0] == '10.91.0.2'
        connection.sendall(query)
        answer = connection.recv(4096)
        identifier, flags, _, count, _, _ = struct.unpack('!6H', answer[:12])
        results['dns_udp'] = identifier == 26454 and bool(flags & 32768) and flags & 15 == 0 and count == 1 and answer.endswith(bytes([10, 91, 0, 1]))
except (OSError, ValueError, struct.error) as error:
    results['dns_udp'] = False
    errors['dns_udp'] = getattr(error, 'errno', None)
progress()
resolved = threading.Event()
results['dns'] = False
def resolve():
    try:
        addresses = {entry[4][0] for entry in socket.getaddrinfo('system-' + hostname, 8091)}
        results['dns'] = '10.91.0.1' in addresses
    except OSError as error:
        errors['dns'] = error.errno
    finally:
        resolved.set()
threading.Thread(target=resolve, daemon=True).start()
resolved.wait(5)
for name, arguments in [
    ('icmp4', ['/sbin/ping', '-n', '-c', '1', '-t', '3', '10.91.0.1']),
    ('icmp6', ['/sbin/ping6', '-n', '-c', '1', 'fd91::1']),
]:
    try:
        results[name] = subprocess.run(arguments, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=4).returncode == 0
    except subprocess.TimeoutExpired:
        results[name] = False
    progress()
if 'emit_progress' in globals():
    emit_progress(results, True)
print(json.dumps({'results': results, 'errors': errors, 'sources': sources}))
"""


def command(name):
    result = subprocess.run([str(CONTROLLER), name], capture_output=True, text=True, timeout=15)
    if result.returncode != 0:
        raise RuntimeError("qualification_controller_failed")
    return json.loads(result.stdout)


def probe(protected, launched_app=False):
    with tempfile.TemporaryDirectory(prefix="geckit-vpn-probe-", dir="/private/tmp") as directory:
        result_path = Path(directory) / "result.json"
        script = PROBE
        if launched_app:
            script = "import json, os\nfrom pathlib import Path\ndef emit_progress(results, completed):\n    Path(" + repr(str(result_path)) + ").write_text(json.dumps({'results': results, 'errors': globals().get('errors', {}), 'sources': globals().get('sources', {}), 'completed': completed, 'probe_pid': os.getpid(), 'runner_pid': os.getppid()}))\n" + script
        return run_probe(protected, launched_app, script, result_path)


def run_probe(protected, launched_app, script, result_path):
    args = [sys.executable, "-c", script]
    if protected:
        args = [str(RUNNER), *args]
    if launched_app:
        args = ["/usr/bin/open", "-g", "-n", "-a", str(RUNNER_APP), "--args", sys.executable, "-c", script]
    process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    try:
        output, _ = process.communicate(timeout=45)
        if process.returncode != 0:
            return {"probe_failed": True}
        if launched_app:
            deadline = time.monotonic() + 40
            while time.monotonic() < deadline:
                if result_path.exists():
                    try:
                        progress = json.loads(result_path.read_text())
                    except ValueError:
                        time.sleep(0.1)
                        continue
                    if progress.get("completed") is True:
                        return {"results": progress["results"], "errors": progress["errors"], "sources": progress["sources"]}
                time.sleep(0.1)
            if result_path.exists():
                return {"probe_timeout": True, "partial": json.loads(result_path.read_text()).get("results", {})}
            return {"probe_not_started": True}
        return json.loads(output)
    except subprocess.TimeoutExpired:
        return {"probe_timeout": True}
    finally:
        if process.poll() is None:
            import os
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=5)


def main(peer_path):
    peer = subprocess.Popen([peer_path], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    controller = None
    try:
        if not select.select([peer.stdout], [], [], 5)[0]:
            raise RuntimeError("qualification_peer_not_ready")
        header = peer.stdout.read(4)
        if len(header) != 4:
            raise RuntimeError("qualification_peer_invalid_frame")
        length = struct.unpack(">I", header)[0]
        if not 0 < length <= 65536:
            raise RuntimeError("qualification_peer_invalid_frame")
        profile = peer.stdout.read(length)
        if len(profile) != length:
            raise RuntimeError("qualification_peer_invalid_frame")
        print(json.dumps(command("configure")), flush=True)
        controller = subprocess.Popen([str(CONTROLLER), "start"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        controller.stdin.write(header + profile)
        controller.stdin.flush()
        del profile
        deadline = time.monotonic() + 25
        last = None
        started = False
        while time.monotonic() < deadline:
            status = command("status")
            if status != last:
                print(json.dumps(status), flush=True)
                last = status
            if status.get("code") == 3:
                break
            if status.get("code") == 2:
                started = True
            elif started and status.get("code") == 1:
                raise RuntimeError("qualification_tunnel_disconnected")
            if controller.poll() is not None:
                raise RuntimeError("qualification_start_failed")
            time.sleep(1)
        else:
            raise RuntimeError("qualification_connect_timeout")
        ordinary = probe(False)
        print(json.dumps({"ordinary_process": ordinary}), flush=True)
        if set(ordinary.get("results", {})) != {"tcp4", "tcp6", "udp4", "udp6", "udp4_unconnected", "dns_udp", "dns", "icmp4", "icmp6"} or any(ordinary["results"].values()):
            raise RuntimeError("qualification_ordinary_process_captured")
        results = probe(True)
        print(json.dumps({"signed_runner": results}), flush=True)
        app_results = probe(True, launched_app=True)
        print(json.dumps({"launched_runner_app": app_results}), flush=True)
        if set(app_results.get("results", {})) != {"tcp4", "tcp6", "udp4", "udp6", "udp4_unconnected", "dns_udp", "dns", "icmp4", "icmp6"} or not all(app_results["results"].values()):
            raise RuntimeError("qualification_capture_failed")
        print(json.dumps({"state": "application_capture_passed_unqualified"}), flush=True)
    finally:
        try:
            print(json.dumps(command("stop")), flush=True)
        finally:
            if controller is not None and controller.poll() is None:
                controller.terminate()
                controller.wait(timeout=5)
            if peer.stdin is not None:
                peer.stdin.close()
            try:
                peer.wait(timeout=5)
            except subprocess.TimeoutExpired:
                peer.kill()
                peer.wait(timeout=5)
            for line in peer.stderr.read().decode().splitlines():
                if line.startswith(("qualification_dns_reply ", "qualification_dns_packet ", "qualification_dns_received ", "qualification_dns_rejected")):
                    print(json.dumps({"peer": line}), flush=True)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Pass the generated qualification-peer executable path.")
    try:
        main(sys.argv[1])
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(json.dumps({"state": str(error) if isinstance(error, RuntimeError) else "qualification_failed"}))
        sys.exit(1)
