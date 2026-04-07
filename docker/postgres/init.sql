-- Create mem0 database and enable pgvector extension
CREATE DATABASE mem0;
\c mem0
CREATE EXTENSION IF NOT EXISTS vector;

-- Also enable pgvector in the tandemu database (in case needed)
\c tandemu
CREATE EXTENSION IF NOT EXISTS vector;
