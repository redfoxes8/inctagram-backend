SELECT format('CREATE DATABASE %I', database_name)
FROM (
  VALUES
    ('gateway_db'),
    ('post_db'),
    ('files_db'),
    ('notification_db'),
    ('payment_db')
) AS required_databases(database_name)
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_database
  WHERE datname = required_databases.database_name
) \gexec
