SELECT 'CREATE DATABASE evolution_db OWNER n8n_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'evolution_db')\gexec
