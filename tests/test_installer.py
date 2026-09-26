import hashlib
import json
import os
from pathlib import Path
import struct
import tempfile
import unittest
import unittest.mock

import install


def write_minimal_asar(path, package=None):
    package = package or {'name': 'openai-codex-electron', 'version': 'test'}
    data = json.dumps(package, separators=(',', ':')).encode()
    header = {'files': {'package.json': {'size': len(data), 'offset': '0'}}}
    raw = json.dumps(header, separators=(',', ':')).encode()
    payload = struct.pack('<I', len(raw)) + raw
    payload += b'\0' * ((-len(payload)) % 4)
    pickle = struct.pack('<I', len(payload)) + payload
    path.write_bytes(struct.pack('<II', 4, len(pickle)) + pickle + data)
    return hashlib.sha256(raw).hexdigest()


class InstallerTests(unittest.TestCase):
    def test_distribution_checksums(self):
        self.assertIn('install.py', install.verify_bundle())

    def test_asar_header_hash_matches_electron_integrity_value(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'app.asar'
            expected = write_minimal_asar(path)
            self.assertEqual(install.asar_header_sha(path), expected)
            self.assertEqual(json.loads(install.Asar(path).read('package.json'))['version'], 'test')

    def test_runtime_placeholders_are_bound_for_every_build(self):
        for spec in install.BUILD_SPECS:
            with self.subTest(spec=spec['id']):
                loader = install.render_runtime('animation-loader.js', spec)
                runtime = install.render_runtime('animation-runtime.js', spec)
                self.assertNotIn('__NF_', loader + runtime)
                self.assertIn(spec['safe_join'] + '(platform, directory', loader)
                self.assertIn(spec['react'] + '.createElement', runtime)
        linux = install.BUILD_SPECS[0]
        self.assertEqual(
            hashlib.sha256(install.render_runtime('animation-loader.js', linux).encode()).hexdigest(),
            '0ac19d05d0ff8edafedb990f6c2ddb65ec4aa41594a54bd11cdb6aa7d3c6907f')
        self.assertEqual(
            hashlib.sha256(install.render_runtime('animation-runtime.js', linux).encode()).hexdigest(),
            'f0d37a1f45c8f55b5898bf01ce2b84eb4a527bebb0aacd111faba99475125b40')

    def test_specs_are_platform_and_fingerprint_specific(self):
        for spec in install.BUILD_SPECS:
            with self.subTest(spec=spec['id']):
                self.assertIs(install.spec_for(spec['version'], spec['original'], spec['platform']), spec)
                other = 'darwin' if spec['platform'] == 'linux' else 'linux'
                self.assertIsNone(install.spec_for(spec['version'], spec['original'], other))
                self.assertIsNone(install.spec_for(spec['version'], '0' * 64, spec['platform']))

    def test_only_linux_builds_are_available(self):
        self.assertEqual({s['platform'] for s in install.BUILD_SPECS}, {'linux'})
        for platform in ['darwin', 'win32']:
            with self.subTest(platform=platform), unittest.mock.patch.object(install.sys, 'platform', platform), unittest.mock.patch.object(install.sys, 'argv', ['install.py', 'check']):
                with self.assertRaisesRegex(install.InstallError, '暂不支持'):
                    install.main()


if __name__ == '__main__':
    unittest.main()
