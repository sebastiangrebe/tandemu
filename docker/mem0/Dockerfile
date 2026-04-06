FROM mem0/mem0-api-server:latest

# Fix missing psycopg[pool] dependency (https://github.com/mem0ai/mem0/issues/3753)
RUN pip install --no-cache-dir "psycopg[pool]>=3.2.6,<4.0.0"
