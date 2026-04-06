FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir \
  fastapi==0.115.8 \
  uvicorn==0.34.0 \
  pydantic==2.10.4 \
  "mem0ai>=0.1.48" \
  python-dotenv==1.0.1 \
  "psycopg[binary,pool]>=3.2.8,<4.0.0"

COPY main.py .

RUN mkdir -p /app/history

EXPOSE 8000

ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
