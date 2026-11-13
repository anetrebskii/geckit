import concurrent.futures
import hashlib
import json
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

VERSION = '158.0.1-beta.41'
TARGETS = ('mac.arm64', 'mac.x86_64', 'lin.arm64', 'lin.x86_64', 'win.x86_64')
TAG = f'camoufox-{VERSION}-no-fonts.1'
UPSTREAM = f'https://github.com/daijro/camoufox/releases/tag/v{VERSION}'


def request(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'GeckIt-Camoufox-Repack'}), timeout=90)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def font(name):
    return any(part.lower() in ('fonts', 'fontconfig', 'fontconfigs') for part in name.replace('\\', '/').split('/'))


def repack(asset, output, license_text, source_commit):
    target = next(target for target in TARGETS if asset['name'].endswith(f'-{target}.zip'))
    source = output / asset['name']
    expected = asset['digest'].removeprefix('sha256:')
    if not source.exists() or digest(source) != expected:
        print(f'Downloading {target}', flush=True)
        partial = source.with_suffix('.part')
        if shutil.which('aria2c'):
            if partial.exists() and not source.exists():
                partial.rename(source)
            subprocess.run(['aria2c', '--continue=true', '--max-connection-per-server=8', '--split=8', '--file-allocation=none', '--console-log-level=warn', '--summary-interval=30', '--download-result=hide', f'--checksum=sha-256={expected}', f'--dir={output}', f'--out={source.name}', asset['browser_download_url']], check=True)
        else:
            with request(asset['browser_download_url']) as response, partial.open('wb') as stream:
                shutil.copyfileobj(response, stream, 1024 * 1024)
            partial.rename(source)
        if digest(source) != expected:
            raise RuntimeError(f'Upstream checksum mismatch: {target}')
    name = f'camoufox-{VERSION}-{target}-no-fonts.zip'
    archive = output / name
    removed = []
    kept = 0
    print(f'Repacking {target}', flush=True)
    with zipfile.ZipFile(source) as before, zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as after:
        for entry in before.infolist():
            if font(entry.filename):
                removed.append(entry.filename)
                continue
            with before.open(entry) as incoming, after.open(entry, 'w') as outgoing:
                shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
            kept += 1
        notice = f'# GeckIt Camoufox repack\n\nUnofficial font-free repack of Camoufox {VERSION} ({target}). No browser executable or source code was modified. Only bundled fonts/fontconfig directories were removed; this notice and the upstream license were added. Existing third-party notices are retained. Use host system fonts.\n\nUpstream release: {UPSTREAM}\n\nCorresponding Camoufox source and build instructions: https://github.com/daijro/camoufox/tree/{source_commit}\n\nUpstream archive: {asset["browser_download_url"]}\n\nUpstream SHA256: {expected}\n\nLicense: Mozilla Public License 2.0, with third-party notices included in the browser. This repack is not an official Camoufox release.\n'
        after.writestr('GECKIT-REPACK.md', notice)
        after.writestr('LICENSE-CAMOUFOX', license_text)
    with zipfile.ZipFile(archive) as checked:
        bad = checked.testzip()
        if bad is not None or any(font(entry.filename) for entry in checked.infolist()):
            raise RuntimeError(f'Invalid repack: {target}: {bad}')
        retained = [entry for entry in checked.infolist() if entry.filename not in ('GECKIT-REPACK.md', 'LICENSE-CAMOUFOX')]
        with zipfile.ZipFile(source) as original:
            for entry in retained:
                old = original.getinfo(entry.filename)
                if (entry.CRC, entry.file_size, entry.external_attr) != (old.CRC, old.file_size, old.external_attr):
                    raise RuntimeError(f'Changed browser file: {entry.filename}')
    result = {'target': target, 'name': name, 'size': archive.stat().st_size, 'sha256': digest(archive), 'upstream': asset['browser_download_url'], 'upstream_sha256': expected, 'upstream_size': asset['size'], 'retained_entries': kept, 'removed_entries': len(removed)}
    print(json.dumps(result), flush=True)
    return result


def main():
    output = Path(sys.argv[1]).resolve()
    output.mkdir(parents=True, exist_ok=True)
    with request(f'https://api.github.com/repos/daijro/camoufox/releases/tags/v{VERSION}') as response:
        release = json.load(response)
    with request(f'https://raw.githubusercontent.com/daijro/camoufox/v{VERSION}/LICENSE') as response:
        license_text = response.read()
    assets = [asset for asset in release['assets'] if any(asset['name'].endswith(f'-{target}.zip') for target in TARGETS)]
    if len(assets) != len(TARGETS):
        raise RuntimeError('Missing supported upstream targets')
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(repack, asset, output, license_text, release['target_commitish']) for asset in assets]
        results = sorted((future.result() for future in futures), key=lambda one: one['target'])
    manifest = {'version': VERSION, 'release': TAG, 'upstream_release': UPSTREAM, 'source_commit': release['target_commitish'], 'fonts': False, 'assets': results}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (output / 'SHA256SUMS').write_text(''.join(f'{asset["sha256"]}  {asset["name"]}\n' for asset in results))
    (output / 'LICENSE-CAMOUFOX').write_bytes(license_text)


if __name__ == '__main__':
    main()
