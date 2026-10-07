import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

spec = importlib.util.spec_from_file_location('builder', Path(__file__).resolve().parents[1] / 'scripts/package.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class PackageTests(unittest.TestCase):
    def test_archives_and_manifest_dependencies(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            builder.build(output)
            before = {p.name: p.read_bytes() for p in output.iterdir()}
            builder.build(output)
            self.assertEqual(before, {p.name: p.read_bytes() for p in output.iterdir()})
            for package in output.glob('*.zip'):
                with ZipFile(package) as archive:
                    self.assertIsNone(archive.testzip())
                    names = archive.namelist()
                    manifest = json.loads(archive.read('Claude-Usage-Monitor/manifest.json'))
                    dependencies = [manifest['background']['service_worker'], manifest['action']['default_popup']]
                    dependencies += list(manifest['icons'].values())
                    for content in manifest['content_scripts']:
                        dependencies += content.get('js', []) + content.get('css', [])
                    for name in dependencies:
                        self.assertIn(f'Claude-Usage-Monitor/{name}', names)
                    self.assertFalse(any('test/' in n or '.git/' in n for n in names))
                    if package.name.endswith('-installer.zip'):
                        for name in ('install.cmd', 'install.ps1', 'install.command', 'install.sh', 'INSTALL.txt'):
                            self.assertIn(name, names)
                        self.assertTrue(archive.getinfo('install.command').external_attr >> 16 & 0o111)

    def test_tag_mismatch_fails_before_writing(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):
                builder.build(Path(temp), 'v999.0.0')
            self.assertEqual(list(Path(temp).iterdir()), [])
