# cfb-road-trip

College Football Road Trip Planner — interactive map and trip optimizer for CFB games.

## Prerequisites

- [Node.js](https://nodejs.org/) 22+ (frontend)
- Python 3.12+ (API)
- [Docker](https://www.docker.com/) + Docker Compose (production mode)
- A [Mapbox](https://account.mapbox.com/access-tokens/) public access token

---

## Development (fast loop)

Run the API and frontend independently for instant hot-reload.

### 1. API

```bash
cd cfb-road-trip

# Create and activate a virtual environment (first time only)
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# Install dependencies (first time, or after requirements change)
pip install -r api/requirements.txt

uvicorn api.main:app --port 8000 --reload
```

> The venv must be active any time you run the API locally. Re-run `source .venv/bin/activate` in each new shell session.

API is available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### 2. Frontend

```bash
cd cfb-road-trip/frontend
npm install        # first time only
npm run dev
```

Frontend is available at `http://localhost:5173` with Vite HMR.

The `frontend/.env.local` file is already configured:

```
VITE_MAPBOX_TOKEN=<your token>
VITE_API_BASE_URL=http://localhost:8000
```

Update `VITE_MAPBOX_TOKEN` if you need to use a different token.

---

## Production (Docker Compose)

Builds the frontend as a static nginx image and runs the API in a Python container. The SQLite database is bind-mounted from `./db/` so data persists across restarts.

### First-time startup

```bash
cd cfb-road-trip
export VITE_MAPBOX_TOKEN=pk.your_token_here
export VITE_API_BASE_URL=http://localhost:8000

docker compose up --build
```

| Service  | URL                       |
|----------|---------------------------|
| Frontend | http://localhost:3000     |
| API      | http://localhost:8000     |
| API docs | http://localhost:8000/docs |

### Rebuild after a frontend change

```bash
docker compose up --build frontend
```

The `api` container keeps running untouched.

### Rebuild after an API change

```bash
docker compose up --build api
```

### Tear down

```bash
docker compose down
```

The `./db/` directory (SQLite file) is a bind mount — it is **not** deleted by `docker compose down`.

---

## Environment variables

| Variable           | Where set                        | Description                                      |
|--------------------|----------------------------------|--------------------------------------------------|
| `VITE_MAPBOX_TOKEN`| `frontend/.env.local` or export  | Mapbox public token (baked in at build time)     |
| `VITE_API_BASE_URL`| `frontend/.env.local` or export  | API base URL seen by the browser                 |
| `GAMETRIP_DB`      | `docker-compose.yml`             | Path to SQLite file inside the API container     |
| `ALLOWED_ORIGINS`  | `docker-compose.yml`             | CORS origin(s) allowed by the API                |
| `RATE_LIMIT`       | `docker-compose.yml`             | Max API requests per minute (default 60)         |

---

## Project structure

```
cfb-road-trip/
├── api/                  # FastAPI backend
│   ├── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── db/                   # SQLite database (bind-mounted in Docker)
├── frontend/             # React + Vite frontend
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js
│   │   ├── constants.js
│   │   └── components/
│   │       ├── Map.jsx
│   │       ├── SidePanel.jsx
│   │       └── TripCard.jsx
│   ├── .env.local
│   └── Dockerfile
└── docker-compose.yml
```
