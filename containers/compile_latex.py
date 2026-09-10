"""Compile an offline multi-file paper and retain compiler evidence and page previews."""
import json
import os
import pathlib
import shutil
import subprocess
from pypdf import PdfReader

root = pathlib.Path('/workspace')
out = root/'artifacts'
env = dict(os.environ, TEXINPUTS='/workspace/inputs//:', BIBINPUTS='/workspace/inputs//:', BSTINPUTS='/workspace/inputs//:')
result = subprocess.run(['latexmk', '-pdf', '-bibtex', '-interaction=nonstopmode', '-halt-on-error', '-no-shell-escape', '-jobname=paper', '-outdir=artifacts', 'main.tex'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
log = result.stdout.decode('utf8', 'replace')
print(log, flush=True)
(out/'compile-log.txt').write_text(log)
final_log = (out/'paper.log').read_text(errors='replace') if (out/'paper.log').exists() else log
summary = {'exitCode': result.returncode, 'pages': 0, 'unresolvedReferences': bool(__import__('re').search(r'(Citation .* undefined|Reference .* undefined|There were undefined references)', final_log)), 'overfullBoxes': final_log.count('Overfull \\hbox'), 'pagePreviews': [], 'textContainsEmDash': False}
if result.returncode == 0:
    reader = PdfReader(out/'paper.pdf')
    summary['pages'] = len(reader.pages)
    text = '\n'.join(p.extract_text() or '' for p in reader.pages)
    summary['textContainsEmDash'] = '\u2014' in text
    (out/'paper-text.txt').write_text(text)
    # Twelve page previews fit the default per-job artifact budget for ordinary papers.
    for index in range(min(len(reader.pages), 12)):
        name = f'paper-page-{index+1:02d}'
        subprocess.run(['pdftoppm', '-f', str(index+1), '-l', str(index+1), '-singlefile', '-scale-to', '1600', '-png', str(out/'paper.pdf'), str(out/name)], check=True)
        summary['pagePreviews'].append(name+'.png')
    shutil.copy(root/'main.tex', out/'paper.tex')
(out/'compile-report.json').write_text(json.dumps(summary))
raise SystemExit(result.returncode)
