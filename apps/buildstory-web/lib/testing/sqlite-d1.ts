import { DatabaseSync } from "node:sqlite";

type SqliteValue = string | number | bigint | Uint8Array | null;

function meta(changes = 0, lastRowId = 0) {
  return { changes, last_row_id: lastRowId, rows_read: 0, rows_written: changes };
}

class SqlitePreparedStatement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly values: SqliteValue[] = [],
  ) {}

  bind(...values: SqliteValue[]) {
    return new SqlitePreparedStatement(this.database, this.sql, values);
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, meta: meta(Number(result.changes), Number(result.lastInsertRowid)) };
  }

  async first<T>() {
    const row = this.database.prepare(this.sql).get(...this.values);
    return (row ?? undefined) as T | undefined;
  }

  async all<T>() {
    const rows = this.database.prepare(this.sql).all(...this.values) as unknown as T[];
    return { success: true, results: rows, meta: meta() };
  }
}

export class SqliteD1Database {
  constructor(readonly database: DatabaseSync) {}

  prepare(sql: string) {
    return new SqlitePreparedStatement(this.database, sql) as unknown as D1PreparedStatement;
  }

  async batch(statements: D1PreparedStatement[]) {
    this.database.exec("BEGIN");
    try {
      const results: unknown[] = [];
      for (const statement of statements) {
        results.push(await (statement as unknown as { run(): Promise<unknown> }).run());
      }
      this.database.exec("COMMIT");
      return results as D1Result<unknown>[];
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}

export function openSqliteD1(filename = ":memory:") {
  return new SqliteD1Database(new DatabaseSync(filename));
}
