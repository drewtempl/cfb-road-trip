FROM python:3.12-slim

WORKDIR /app

# Install deps first (layer cache)
COPY api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY api/ ./api/
# db/ Python modules are imported at runtime via sys.path (see deps.py)
COPY db/*.py ./db/

# Database file is mounted at /data/gametrip.db via docker-compose volume
ENV GAMETRIP_DB=/data/gametrip.db

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
