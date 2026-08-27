DO $bootstrap$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledgerly_runtime') THEN
    CREATE ROLE ledgerly_runtime LOGIN PASSWORD 'ledgerly_runtime_dev' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$bootstrap$;

ALTER ROLE ledgerly_runtime SET row_security = on;
GRANT CONNECT ON DATABASE ledgerly TO ledgerly_runtime;
