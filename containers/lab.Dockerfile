FROM python:3.13-slim-bookworm
ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 MPLBACKEND=Agg HOME=/tmp
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl xz-utils zstd nodejs graphviz ffmpeg blender \
    texlive-latex-base texlive-latex-recommended texlive-latex-extra texlive-science lmodern \
    r-base-core && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir numpy==2.2.6 scipy==1.15.3 sympy==1.14.0 pandas==2.3.3 \
    matplotlib==3.10.8 scikit-learn==1.7.2 pillow==12.1.1 networkx==3.4.2 \
    requests==2.32.5 beautifulsoup4==4.14.3 pypdf==6.9.1
ENV ELAN_HOME=/opt/elan PATH=/opt/elan/bin:$PATH
RUN curl --retry 5 --retry-all-errors -sSf https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh -o /tmp/elan-init.sh \
    && sh /tmp/elan-init.sh -y --default-toolchain leanprover/lean4:v4.24.0 \
    && chmod -R a+rX /opt/elan && rm /tmp/elan-init.sh && lean --version
RUN apt-get update && apt-get install -y --no-install-recommends python3-numpy && rm -rf /var/lib/apt/lists/*
COPY containers/runner.py /opt/lab/runner.py
RUN mkdir /workspace && chmod 777 /workspace
WORKDIR /workspace
USER 1000:1000
ENTRYPOINT ["python", "/opt/lab/runner.py"]
