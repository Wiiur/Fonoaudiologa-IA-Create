FROM python:3.11-slim

# Instala o FFmpeg e bibliotecas de som necessárias para o Praat e conversão de áudio
RUN apt-get update && apt-get install -y ffmpeg libsndfile1 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia a lista de pacotes e instala tudo
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia os arquivos do backend (server.py, core.py, finance_routes.py, etc.)
COPY . .

# Cria as pastas de armazenamento locais
RUN mkdir -p uploads storage_data

# Inicia o servidor FastAPI usando a porta dinâmica do Render ($PORT)
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]