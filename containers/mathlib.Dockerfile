FROM scienfactory-lab:local
LABEL scienfactory.mathlib="4.24.0"
USER root
ENV HOME=/root
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch v4.24.0 https://github.com/leanprover-community/mathlib4.git /opt/mathlib
WORKDIR /opt/mathlib
RUN lake exe cache get
RUN python -c "from pathlib import Path; paths=[Path('/opt/mathlib/.lake/build/lib/lean')]+list(Path('/opt/mathlib/.lake/packages').glob('*/.lake/build/lib/lean')); Path('/opt/lab/lean-path').write_text(':'.join(map(str,paths)))"
COPY containers/runner.py /opt/lab/runner.py
ENV HOME=/tmp
WORKDIR /workspace
USER 1000:1000
