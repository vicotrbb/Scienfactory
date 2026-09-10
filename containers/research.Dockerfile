FROM scienfactory-lab:mathlib
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils tesseract-ocr texlive-publishers latexmk file antiword espeak-ng \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir openpyxl==3.1.5 python-docx==1.2.0 python-pptx==1.0.2 \
    pyarrow==20.0.0 h5py==3.14.0 xarray==2025.6.1 netCDF4==1.7.2 \
    trimesh==4.6.13 xlrd==2.0.2 odfpy==1.4.1 faster-whisper==1.2.1
RUN python -c "from faster_whisper.utils import download_model; download_model('base', output_dir='/opt/lab/whisper-base')"
COPY containers/inspect_file.py containers/compile_latex.py containers/runner.py /opt/lab/
LABEL scienfactory.documents="1" scienfactory.speech="whisper-base"
ENV HF_HUB_OFFLINE=1
USER 1000:1000
