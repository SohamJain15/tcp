# TCP SQL sandbox on Linux

This stack is a dedicated MySQL instance for DBMS labs. It must not share a MySQL server with
production application data. The backend creates a namespaced temporary database and temporary
user for every run/grade request, grants that user only the permissions needed inside that
database, and removes both objects in a `finally` block. The sweeper removes objects left behind
by a crashed backend process.

## 1. Start the sandbox

On the Linux host:

```bash
cd /opt/tcp
cp infrastructure/sql-sandbox/.env.example infrastructure/sql-sandbox/.env
cp infrastructure/sql-sandbox/mysql.cnf.example infrastructure/sql-sandbox/mysql.cnf
```

Set both passwords in `infrastructure/sql-sandbox/.env`. The real `mysql.cnf` is deployment-only
and is ignored by Git; keep it on the Linux server after copying the example. Then run these
commands from the repository root:

```bash
npm run sql-sandbox:up
npm run sql-sandbox:status
npm run sql-sandbox:logs
```

Run the following once on a systemd-based Linux server to enable Docker at boot and configure
the SQL sandbox to return after a reboot:

```bash
npm run sql-sandbox:enable
```

The compose service has `restart: unless-stopped`, so Docker starts it automatically after a
reboot. Do not use `sql-sandbox:down` as part of shutdown automation if it must return after
reboot; `down` intentionally stops the service. The `down` command does not delete the MySQL
volume.

To stop it manually:

```bash
npm run sql-sandbox:down
```

The commands resolve the compose and environment files from the repository location, so they
remain usable when invoked from the repository root without depending on the shell's current
directory.

The published port is `127.0.0.1:3307`; it is not reachable from the public network. Do not change
the binding to `0.0.0.0:3307`. If the backend runs in another container, place it on the
`tcp-sql-private` network and use `MYSQL_HOST=sql-sandbox`, `MYSQL_PORT=3306` instead of the
loopback mapping.

The SQL network is Docker-internal, so the MySQL container has no outbound internet route. The
container also runs with a read-only root filesystem, `no-new-privileges`, dropped capabilities,
and CPU, memory, process, and file-descriptor limits. The only writable locations are the named
MySQL data volume and temporary filesystems required by MySQL.

The current 4-vCPU server profile uses 1 GB RAM, 2 CPU cores, and 512 processes for the SQL
container. Tune these in the server-only `.env` only after checking the VM's total RAM and
load-testing.

For a separately managed backend compose project, join the existing private network rather than
publishing another MySQL port:

```yaml
networks:
  tcp-sql-private:
    external: true
```

Attach the backend service to that network and set `MYSQL_HOST=sql-sandbox` and
`MYSQL_PORT=3306`.

The init script runs only on the first creation of the named volume. If the admin password needs
to be rotated later, change it in the container and in the backend environment:

```bash
docker compose exec sql-sandbox mysql -uroot -p
ALTER USER 'tcp_sql_admin'@'%' IDENTIFIED BY 'NEW_HEX_PASSWORD';
```

## 2. Backend production environment

Set these values in the backend environment, never in frontend variables:

```env
SQL_SANDBOX_ENABLED=true
SQL_SANDBOX_ISOLATED_INSTANCE=true
SQL_SANDBOX_NAMESPACE=tcp
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3307
MYSQL_ADMIN_USER=tcp_sql_admin
MYSQL_ADMIN_PASSWORD=<the-admin-password-from-sql-sandbox/.env>
SQL_STATEMENT_TIMEOUT_MS=5000
SQL_MAX_ROWS=500
SQL_MAX_COLUMNS=100
SQL_MAX_QUERY_LENGTH=12000
SQL_MAX_SCHEMA_LENGTH=100000
SQL_MAX_SOLUTION_LENGTH=20000
SQL_SANDBOX_CONCURRENCY=32
SQL_SANDBOX_POOL_SIZE=40
SQL_SANDBOX_SWEEP_INTERVAL_MS=300000
```

This profile supports many simultaneous users by queueing work: 32 SQL executions run at once and
additional requests wait in the backend queue. Each active run temporarily uses one admin session
and one restricted student session, so the MySQL configuration allows 128 connections with
headroom. 500 signed-in users do not require 500 database sessions unless they execute at the same
time.

Monitor CPU, memory, connection count, queue wait time, and query latency during a real load test.
Do not expose the MySQL port publicly.

The production backend now refuses to start when the SQL sandbox is enabled without an isolated
instance acknowledgement, a password, or a non-root admin user.

Verify the private connection before restarting the backend:

```bash
mysql -h 127.0.0.1 -P 3307 -u tcp_sql_admin -p -e "SELECT 1;"
```

Then rebuild/restart the backend so it reads the new environment:

```bash
cd /opt/tcp
npm --prefix backend ci --omit=dev
npm --prefix backend run build
sudo systemctl restart tcp-backend
```

Use the service name used by the deployment if it is not `tcp-backend`. For Docker, recreate the
backend container rather than only restarting an old container so environment changes are loaded.

## 3. Security boundary

Students never receive MySQL credentials. They submit SQL to the authenticated backend API. The
backend enforces a maximum query length, one statement per request, a per-user execution rate
limit, a bounded number of concurrent sandboxes, result row caps, and rejection of server/file
system operations such as `GRANT`, `LOAD_FILE`, `INTO OUTFILE`, `CREATE USER`, `DROP DATABASE`,
stored-program calls, and system-schema access.

The admin account has broad privileges because it must create/drop databases and users. That is
acceptable only on this dedicated sandbox instance. Keep port 3306/3307 private, keep the admin
password backend-only, and do not point `MYSQL_HOST` at MongoDB, production MySQL, or a shared
institutional database.

This is strong single-server isolation, not a complete host-compromise boundary. The SQL
container must not be privileged, must not mount the Docker socket or host directories, and must
not share its MySQL data with application databases. A container escape or Docker-host compromise
could still affect other services on the same server.

## 4. Persistence and cleanup

The MySQL data volume is persistent so the container can restart safely. Lab databases are not
intended to persist: each request deletes its temporary database and user. The backend sweeper
uses the `SQL_SANDBOX_NAMESPACE` prefix and age threshold to remove leftovers from crashes.

If the sandbox is ever suspected of compromise, stop the backend, remove/recreate this dedicated
MySQL volume, rotate both MySQL passwords, and restart only after verifying the backend points to
the new instance.
