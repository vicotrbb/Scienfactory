# Verified spatial truss article

`paper.pdf` is the visually inspected two-page IEEEtran draft. `truss-study.tex` and `references.bib` are its sources. The original corrected 100 N research data, a GLB of the chosen geometry, numerical verification code, regenerated figure and build/audit records accompany it.

`verification.json` records independently reconstructed results for all three configurations. This is a finite linear axial-bar calculation, not physical validation or a construction design. `article-review.json` records mechanical formatting and evidence-linkage checks; scientific validity still requires independent review. The anonymous draft was prepared with AI assistance and has not been submitted or peer reviewed.

## Reproduce the calculation

Use Python 3.13, NumPy 2.2.6 and matplotlib 3.10.8 (the supplied research container includes them). From this directory:

```sh
mkdir -p inputs artifacts
cp engineering-results.json inputs/
python verify-and-plot.py
```

The script asserts all three saved displacements, force balance, positive stiffness, energy consistency and linear scaling. It writes new verification and figure files under `artifacts/`. Floating-point last digits can vary across platforms.

## Rebuild the article

With IEEEtran, latexmk, BibTeX and the common LaTeX science packages installed:

```sh
cp artifacts/depth-tradeoff.pdf .
latexmk -pdf -bibtex -no-shell-escape -interaction=nonstopmode -halt-on-error -jobname=paper truss-study.tex
```

Alternatively, upload `truss-study.tex`, `references.bib` and `depth-tradeoff.pdf` to Scienfactory and click Compile PDF. Inspect both pages after recompilation. The template changes IEEEtran's Abstract and Index Terms separators from em dashes to periods at the user's request; verify the chosen venue's requirements before submission.

Artifact manifests use application IDs and SHA-256 hashes. Their execution records are included as `execution-*.json`; the original `.data` research retains the complete ID index. `SHA256SUMS` records the exported files, excluding this checksum file itself.
