"""One isolated job; NDJSON output, bounded resources enforced by Docker and this runner."""
import base64
import codecs
import json
import mimetypes
import os
import pathlib
import re
import selectors
import subprocess
import sys
import time

ROOT = pathlib.Path('/workspace')
MAX_BYTES = 8 * 1024 * 1024


def emit(kind, **data):
    print(json.dumps({'type': kind, **data}), flush=True)


def main():
    spec = json.loads(sys.stdin.readline(16 * 1024 * 1024))
    language, code = spec['language'], spec['code']
    commands = {
        'python': ('main.py', ['python', '-u', 'main.py']),
        'javascript': ('main.js', ['node', 'main.js']),
        'lean': ('Main.lean', ['lean', 'Main.lean']),
        'latex': ('main.tex', ['pdflatex', '-no-shell-escape', '-halt-on-error', '-interaction=nonstopmode', '-output-directory=artifacts', 'main.tex']),
        'r': ('main.R', ['Rscript', '--vanilla', 'main.R']),
        'blender': ('main.py', ['blender', '--background', '--factory-startup', '--threads', '2', '--python-exit-code', '1', '--python', 'main.py']),
        'graphviz': ('main.dot', ['dot', '-Tsvg', 'main.dot', '-o', 'artifacts/diagram.svg']),
    }
    filename, command = commands[language]
    if language == 'latex' and pathlib.Path('/opt/lab/compile_latex.py').exists():
        command = ['python', '-u', '/opt/lab/compile_latex.py']
    lean_path = pathlib.Path('/opt/lab/lean-path')
    if lean_path.exists():
        os.environ['LEAN_PATH'] = lean_path.read_text()
    if language == 'lean':
        if re.search(r'\b(sorry|admit|axiom|unsafe)\b', code):
            emit('result', exitCode=1, error='Unchecked declarations and proof holes are not accepted in checked Lean jobs.', durationMs=0)
            return
        # The compiler promotes warnings (including use of sorry) to errors.
        command = ['lean', '-DwarningAsError=true', 'Main.lean']
    ROOT.joinpath('artifacts').mkdir(exist_ok=True)
    ROOT.joinpath('inputs').mkdir(exist_ok=True)
    for item in spec.get('inputs', []):
        name = pathlib.Path(item['name']).name
        if name not in ('', '.', '..'):
            ROOT.joinpath('inputs', name).write_bytes(base64.b64decode(item['data'], validate=True))
    ROOT.joinpath(filename).write_text(code)
    started = time.monotonic()
    proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, cwd=ROOT, start_new_session=True)
    selector = selectors.DefaultSelector()
    selector.register(proc.stdout, selectors.EVENT_READ)
    total = 0
    decoder = codecs.getincrementaldecoder('utf-8')('replace')
    timed_out = False
    while selector.get_map():
        if time.monotonic() - started > 110:
            import signal
            os.killpg(proc.pid, signal.SIGKILL)
            timed_out = True
            break
        for key, _ in selector.select(timeout=0.2):
            block = os.read(key.fileobj.fileno(), 4096)
            if not block:
                selector.unregister(key.fileobj)
                continue
            if total < 100_000:
                emit('stdout', text=decoder.decode(block[:100_000-total]))
            total += len(block)
    proc.wait()
    if total > 100_000:
        emit('stdout', text='\n[Output truncated at 100 KB]\n')
    used = 0
    mime_extra = {'.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.tex': 'text/x-tex', '.lean': 'text/x-lean', '.py': 'text/x-python', '.md': 'text/markdown'}
    for path in sorted(ROOT.joinpath('artifacts').rglob('*')):
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(ROOT / 'artifacts'):
            continue
        if path.suffix in ('.aux', '.log', '.out'):
            continue
        size = path.stat().st_size
        if used + size > MAX_BYTES:
            emit('stdout', text=f'\n[Artifact exceeds 8 MB output budget: {path.name}]\n')
            continue
        data = path.read_bytes()
        used += len(data)
        emit('artifact', name=path.name, mime=mime_extra.get(path.suffix, mimetypes.guess_type(path.name)[0] or 'application/octet-stream'), data=base64.b64encode(data).decode())
    emit('result', exitCode=proc.returncode, error='Execution exceeded 110 seconds.' if timed_out else None, durationMs=round((time.monotonic()-started)*1000))


try:
    main()
except Exception as error:
    emit('result', exitCode=1, error=str(error), durationMs=0)
    sys.exit(1)
