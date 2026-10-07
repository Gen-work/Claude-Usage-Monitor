"""Build dependency-free, deterministic extension and installation-helper ZIPs."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent
FILES = ('manifest.json', 'background.js', 'shared.js', 'i18n.js',
         'content.js', 'float_only.js', 'popup.html', 'popup.js', 'icon.png')


def archive(path, entries):
    with ZipFile(path, 'w', ZIP_DEFLATED) as out:
        for name, data, executable in sorted(entries):
            info = ZipInfo(name, (2020, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100755 if executable else 0o100644) << 16
            info.compress_type = ZIP_DEFLATED
            out.writestr(info, data)


def build(output, tag=None):
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    version = manifest['version']
    if not re.fullmatch(r'\d+(?:\.\d+){0,3}', version):
        raise ValueError('Invalid manifest version')
    if tag and tag != f'v{version}':
        raise ValueError(f'Tag {tag} must match manifest version v{version}')
    if json.loads((ROOT / 'package.json').read_text())['version'] != version:
        raise ValueError('package.json and manifest.json versions must match')
    entries = [(f'Claude-Usage-Monitor/{name}', (ROOT / name).read_bytes(), False)
               for name in FILES]
    output.mkdir(parents=True, exist_ok=True)
    extension = output / f'Claude-Usage-Monitor-v{version}-chrome-edge.zip'
    archive(extension, entries)
    helpers = [(p.name, p.read_bytes(), p.suffix in ('.command', '.sh'))
               for p in sorted((ROOT / 'installer').iterdir()) if p.is_file()]
    installer = output / 'Claude-Usage-Monitor-installer.zip'
    archive(installer, entries + helpers)
    checksums = output / 'SHA256SUMS.txt'
    checksums.write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n'
                                 for p in (extension, installer)), encoding='utf-8')
    for p in (extension, installer, checksums):
        print(p)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'packages')
    parser.add_argument('--tag')
    args = parser.parse_args()
    build(args.output_dir.resolve(), args.tag)
