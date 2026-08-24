#!/usr/bin/env bash
set -euo pipefail

# The compose file intentionally supplies a generated hex password. Restricting the format here
# keeps this bootstrap script safe from SQL-literal injection while remaining easy to rotate.
if [[ -z "${MYSQL_SANDBOX_ADMIN_PASSWORD:-}" || ! "${MYSQL_SANDBOX_ADMIN_PASSWORD}" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "MYSQL_SANDBOX_ADMIN_PASSWORD must be a non-empty alphanumeric password (underscore/dash allowed)." >&2
  exit 1
fi

mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE USER IF NOT EXISTS 'tcp_sql_admin'@'%' IDENTIFIED BY '${MYSQL_SANDBOX_ADMIN_PASSWORD}';
ALTER USER 'tcp_sql_admin'@'%' IDENTIFIED BY '${MYSQL_SANDBOX_ADMIN_PASSWORD}';

GRANT CREATE, DROP, ALTER, INDEX, REFERENCES, CREATE TEMPORARY TABLES, LOCK TABLES,
      SELECT, INSERT, UPDATE, DELETE, CREATE VIEW, SHOW VIEW, TRIGGER, EVENT,
      CREATE ROUTINE, ALTER ROUTINE, EXECUTE, CREATE USER
ON *.* TO 'tcp_sql_admin'@'%' WITH GRANT OPTION;

GRANT SELECT ON mysql.user TO 'tcp_sql_admin'@'%';
FLUSH PRIVILEGES;
SQL
