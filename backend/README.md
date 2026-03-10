# Crypto4Pro — Backend

Production-grade crypto exchange backend with double-entry ledger, event-driven campaign engine, and real balance management.

## Stack

- **FastAPI** — async Python web framework
- **PostgreSQL** — primary database
- **SQLAlchemy 2.0** — async ORM
- **Alembic** — database migrations
- **Redis** — cache, event bus, Celery broker
- **Celery** — background task processing
- **JWT** — authentication (separate user/admin tokens)

## Quick Start

### 1. Start infrastructure (PostgreSQL + Redis)

```bash
docker-compose up -d postgres redis
```

### 2. Install Python dependencies

```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
```

### 3. Configure environment

```bash
copy .env.example .env
# Edit .env with your settings
```

### 4. Seed the database

```bash
python -m app.seed
```

This creates:
- 4 admin accounts (admin, operator, finance, viewer)
- 6 trading pairs (BTC, ETH, SOL, XRP, DOGE, AVAX vs USDT)
- System flags (all defaults)

### 5. Run the API server

```bash
uvicorn app.main:app --reload --port 8000
```

### 6. Start Celery worker (for campaign rewards)

```bash
celery -A app.tasks.celery_app worker --loglevel=info
```

### 7. Start Celery beat (periodic tasks)

```bash
celery -A app.tasks.celery_app beat --loglevel=info
```

## API Documentation

Once running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Admin Test Accounts

| Email | Password | Role |
|-------|----------|------|
| cihan@crypto4.io | Cihan!123.! | super_admin |
| admin@crypto4.io | (set via env) | super_admin |
| operator@crypto4.io | (set via env) | operator |
| finance@crypto4.io | (set via env) | finance |
| viewer@crypto4.io | (set via env) | readonly |

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full system design, database schema, API contracts, and ledger safety guarantees.
