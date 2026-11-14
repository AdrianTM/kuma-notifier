"""Create an allowlisted source archive for Mozilla's reproducible-build review."""
import json
import platform
import subprocess
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
package = json.loads((root / 'package.json').read_text())
version = package['version']
files = [Path(name) for name in ['package.json', 'package-lock.json', 'LICENSE', 'README.md', 'PRIVACY.md', 'FIREFOXAMO.md']]
for folder in ['src', 'public', 'scripts', 'tests', 'docs/mozilla']:
    files.extend(p.relative_to(root) for p in (root / folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix not in ['.pyc', '.pyo'])
node = subprocess.check_output(['node', '--version'], text=True).strip()
npm = subprocess.check_output(['npm', '--version'], text=True).strip()
instructions = f'''# Reproduce Kuma Notifier {version}

Packaged on {platform.system()} {platform.machine()}, Node {node}, npm {npm}.
Use Node.js 22 and npm. Dependencies are downloaded from the official npm registry
using the included package-lock.json. From this extracted directory run:

```sh
npm ci
npm run build
```

The Firefox files are in dist/firefox/. Compare their uncompressed contents with
the submitted extension ZIP. The Chrome build is separate in dist/chrome/.
Do not upload this source archive as the installable extension.

The build uses esbuild without minification or dependency-source patches.
Third-party license notices are generated from the exact bundled npm packages.
See docs/mozilla/reviewer-notes.txt for the one known upstream validator warning,
the localhost fixture credentials, and functional testing instructions.
'''
output = root / 'artifacts' / f'kuma-notifier-{version}-source.zip'
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(files):
        if (root / path).is_symlink():
            raise RuntimeError(f'Symlinks are not allowed in source archives: {path}')
        archive.write(root / path, str(path))
    archive.writestr('BUILD-FIREFOX.md', instructions)
print(output.relative_to(root))
