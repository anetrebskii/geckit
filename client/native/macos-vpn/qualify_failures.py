import json
import os
from pathlib import Path
import select
import shlex
import shutil
import signal
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time

import qualify


ACTOR = r'''
import argparse, json, os, socket, time
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('--phase', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--endpoint', required=True)
parser.add_argument('--tcp-endpoint', required=True)
parser.add_argument('--detach', action='store_true')
args = parser.parse_args()
if args.detach:
    if os.fork(): os._exit(0)
    os.setsid()
endpoint = tuple(json.loads(args.endpoint))
tcp_endpoint = tuple(json.loads(args.tcp_endpoint))
phase = Path(args.phase)
output = Path(args.output)
state = {'actor_pid': os.getpid(), 'phases': {}}
def request(connection, endpoint=None):
    try:
        connection.settimeout(2)
        if endpoint is not None: connection.connect(endpoint)
        connection.sendall(b'geckit-failure-canary')
        if connection.type == socket.SOCK_DGRAM:
            return connection.recv(256) == b'geckit-failure-canary'
        deadline = time.monotonic() + 2
        reply = b''
        while len(reply) < len(b'geckit-failure-canary'):
            connection.settimeout(max(.001, deadline - time.monotonic()))
            data = connection.recv(len(b'geckit-failure-canary') - len(reply))
            if not data: return False
            reply += data
        return reply == b'geckit-failure-canary'
    except OSError: return False
def fresh(endpoint, kind=socket.SOCK_DGRAM):
    with socket.socket(socket.AF_INET, kind) as connection:
        return request(connection, endpoint)
with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as existing, socket.socket(socket.AF_INET, socket.SOCK_STREAM) as tunnel:
    existing.connect(endpoint)
    tunnel.settimeout(2)
    tunnel.connect(('10.91.0.1', 8091))
    for label in ['connected', 'gateway_down', 'disconnected']:
        deadline = time.monotonic() + 30
        while label != 'connected' and (not phase.exists() or phase.read_text() != label):
            if time.monotonic() > deadline: raise SystemExit(2)
            time.sleep(.1)
        state['phases'][label] = {
            'tunnel_udp': fresh(('10.91.0.1', 8092)),
            'tunnel_tcp': fresh(('10.91.0.1', 8091), socket.SOCK_STREAM),
            'existing_tunnel_tcp': request(tunnel),
            'direct_udp': fresh(endpoint),
            'direct_tcp': fresh(tcp_endpoint, socket.SOCK_STREAM),
            'existing_direct_udp': request(existing),
        }
        temporary = output.with_suffix('.part')
        temporary.write_text(json.dumps(state))
        temporary.replace(output)
'''


def wait_status(code):
    deadline = time.monotonic() + 25
    while qualify.command('status').get('code') != code:
        if time.monotonic() > deadline:
            raise RuntimeError('qualification_status_timeout')
        time.sleep(.2)


def wait_phase(paths, label, owned):
    deadline = time.monotonic() + 20
    results = {}
    while len(results) != len(paths):
        for name, path in paths.items():
            if not path.exists():
                continue
            state = json.loads(path.read_text())
            owned.add(state['actor_pid'])
            if label in state['phases']:
                results[name] = state['phases'][label]
        if time.monotonic() > deadline:
            raise RuntimeError('qualification_actor_timeout')
        time.sleep(.1)
    print(json.dumps({'phase': label, 'actors': results}), flush=True)
    for result in results.values():
        if result['direct_udp'] or result['existing_direct_udp'] or result['direct_tcp']:
            raise RuntimeError('qualification_direct_fallback')
        if any(result[name] != (label == 'connected') for name in ['tunnel_udp', 'tunnel_tcp', 'existing_tunnel_tcp']):
            raise RuntimeError('qualification_tunnel_canary_mismatch')


def ordinary_control(endpoint, tcp_endpoint):
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as connection:
        connection.settimeout(2)
        connection.sendto(b'geckit-failure-canary', endpoint)
        if connection.recv(256) != b'geckit-failure-canary':
            raise RuntimeError('qualification_ordinary_canary_unavailable')
    with socket.create_connection(tcp_endpoint, timeout=2) as connection:
        connection.sendall(b'geckit-failure-canary')
        if connection.recv(256) != b'geckit-failure-canary':
            raise RuntimeError('qualification_ordinary_canary_unavailable')


def main(peer_path):
    tmux = shutil.which('tmux')
    if tmux is None:
        raise RuntimeError('qualification_tmux_unavailable')
    peer = subprocess.Popen([peer_path], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    controller = None
    owned = set()
    stop_echo = threading.Event()
    tmux_socket = None
    temporary = None
    try:
        if not select.select([peer.stdout], [], [], 5)[0]:
            raise RuntimeError('qualification_peer_not_ready')
        header = peer.stdout.read(4)
        if len(header) != 4:
            raise RuntimeError('qualification_peer_invalid_frame')
        length = struct.unpack('>I', header)[0]
        if not 0 < length <= 65536:
            raise RuntimeError('qualification_peer_invalid_frame')
        profile = peer.stdout.read(length)
        if len(profile) != length:
            raise RuntimeError('qualification_peer_invalid_frame')
        profile = profile.replace(b'fd91::2/128', b'fd91::2/120')
        print(json.dumps(qualify.command('configure')), flush=True)
        controller = subprocess.Popen([str(qualify.CONTROLLER), 'start'], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        controller.stdin.write(struct.pack('>I', len(profile)) + profile)
        controller.stdin.flush()
        del profile
        wait_status(3)
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as route:
            route.connect(('10.91.0.1', 8092))
            address = route.getsockname()[0]
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as echo, socket.socket(socket.AF_INET, socket.SOCK_STREAM) as tcp:
            echo.bind((address, 0))
            endpoint = echo.getsockname()
            echo.settimeout(.2)
            tcp.bind((address, 0))
            tcp_endpoint = tcp.getsockname()
            tcp.listen(4)
            tcp.settimeout(.2)
            def serve():
                while not stop_echo.is_set():
                    try:
                        payload, remote = echo.recvfrom(256)
                        if payload == b'geckit-failure-canary':
                            echo.sendto(payload, remote)
                    except socket.timeout:
                        pass
                    except OSError:
                        return
            threading.Thread(target=serve, daemon=True).start()
            def serve_tcp():
                while not stop_echo.is_set():
                    try:
                        connection, _ = tcp.accept()
                        with connection:
                            connection.settimeout(2)
                            payload = connection.recv(256)
                            if payload == b'geckit-failure-canary':
                                connection.sendall(payload)
                    except socket.timeout:
                        pass
                    except OSError:
                        return
            threading.Thread(target=serve_tcp, daemon=True).start()
            ordinary_control(endpoint, tcp_endpoint)
            temporary = tempfile.TemporaryDirectory(prefix='geckit-vpn-failure-', dir='/private/tmp')
            root = Path(temporary.name)
            actor = root / 'actor.py'
            actor.write_text(ACTOR)
            phase = root / 'phase'
            paths = {name: root / (name + '.json') for name in ['runner', 'detached', 'tmux']}
            def arguments(name):
                return [sys.executable, str(actor), '--phase', str(phase), '--output', str(paths[name]), '--endpoint', json.dumps(endpoint), '--tcp-endpoint', json.dumps(tcp_endpoint)]
            def launch(arguments):
                subprocess.run(['/usr/bin/open', '-g', '-n', '-a', str(qualify.RUNNER_APP), '--args', *arguments], check=True, timeout=10)
            launch(arguments('runner'))
            launch([*arguments('detached'), '--detach'])
            tmux_socket = root / 'tmux.sock'
            script = root / 'tmux-actor.sh'
            script.write_text('exec ' + shlex.join(arguments('tmux')) + '\n')
            launch(['/usr/bin/env', '-u', 'TMUX', '-u', 'TMUX_PANE', tmux, '-f', '/dev/null', '-S', str(tmux_socket), 'new-session', '-d', '-s', 'qualification', shlex.join(['/bin/sh', str(script)])])
            wait_phase(paths, 'connected', owned)
            ordinary_control(endpoint, tcp_endpoint)
            peer.stdin.close()
            peer.wait(timeout=5)
            phase.write_text('gateway_down')
            wait_phase(paths, 'gateway_down', owned)
            ordinary_control(endpoint, tcp_endpoint)
            print(json.dumps(qualify.command('stop')), flush=True)
            wait_status(1)
            phase.write_text('disconnected')
            wait_phase(paths, 'disconnected', owned)
            ordinary_control(endpoint, tcp_endpoint)
            print(json.dumps({'state': 'local_ipv4_failure_matrix_passed_unqualified', 'ordinary_controls': True}), flush=True)
    finally:
        stop_echo.set()
        if tmux_socket is not None and tmux_socket.exists():
            try:
                subprocess.run([tmux, '-S', str(tmux_socket), 'kill-server'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
            except subprocess.SubprocessError:
                print(json.dumps({'state': 'qualification_tmux_cleanup_failed'}), flush=True)
        for pid in owned:
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        if temporary is not None:
            temporary.cleanup()
        try:
            print(json.dumps(qualify.command('stop')), flush=True)
        finally:
            try:
                if controller is not None and controller.poll() is None:
                    controller.terminate()
                    controller.wait(timeout=5)
            finally:
                if peer.stdin is not None and not peer.stdin.closed:
                    peer.stdin.close()
                try:
                    peer.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    peer.kill()
                    peer.wait(timeout=5)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Pass the generated qualification-peer executable path.')
    try:
        main(sys.argv[1])
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(json.dumps({'state': str(error) if isinstance(error, RuntimeError) else 'qualification_failed'}))
        sys.exit(1)
