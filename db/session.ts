import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { demoSessions } from "@/db/schema";
import { seedTenant } from "@/lib/demo-seed";
import type { DemoMode, DemoSession, Role } from "@/lib/types";

const cookieName = "integration_ops_session";
const sessionHours = 8;
const runHours = 24;

const personaNames: Record<Role, string> = {
  support: "Alex Morgan",
  customer: "Jordan Lee",
  engineer: "Priya Shah",
};

type SessionRow = {
  role: Role;
  mode: DemoMode;
  runId: string | null;
  customerId: string | null;
  displayName: string;
  expiresAt: string;
};

let schemaReady: Promise<void> | null = null;

export class DemoSessionError extends Error {
  constructor(
    message: string,
    public status = 401,
  ) {
    super(message);
  }
}

function getD1(): D1Database {
  if (!env.DB) {
    throw new DemoSessionError("The session database is unavailable.", 503);
  }
  return env.DB;
}

async function ensureSessionTables(db: D1Database) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.batch([
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_runs (
            id TEXT PRIMARY KEY,
            scenario_version TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_sessions (
            token_hash TEXT PRIMARY KEY,
            role TEXT NOT NULL,
            mode TEXT NOT NULL DEFAULT 'role',
            run_id TEXT,
            customer_id TEXT,
            display_name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
          )`,
        ),
      ]);

      const columns = await db
        .prepare("PRAGMA table_info(demo_sessions)")
        .all<{ name: string }>();
      const names = new Set(columns.results.map((column) => column.name));
      if (!names.has("mode")) {
        await db
          .prepare("ALTER TABLE demo_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'role'")
          .run();
      }
      if (!names.has("run_id")) {
        await db.prepare("ALTER TABLE demo_sessions ADD COLUMN run_id TEXT").run();
      }
      await db
        .prepare(
          "CREATE INDEX IF NOT EXISTS demo_sessions_run_idx ON demo_sessions(run_id)",
        )
        .run();
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function readCookie(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  const value = cookies
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));
  return value ? decodeURIComponent(value.slice(cookieName.length + 1)) : null;
}

function serializeCookie(token: string, request: Request, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

async function readSessionRow(_db: D1Database, tokenHash: string) {
  const row = await getDb()
    .select({
      role: demoSessions.role,
      mode: demoSessions.mode,
      runId: demoSessions.runId,
      customerId: demoSessions.customerId,
      displayName: demoSessions.displayName,
      expiresAt: demoSessions.expiresAt,
    })
    .from(demoSessions)
    .where(eq(demoSessions.tokenHash, tokenHash))
    .get();
  return row as SessionRow | undefined;
}

function toSession(row: SessionRow): DemoSession {
  if (!row.runId) {
    throw new DemoSessionError("This demo session needs to be restarted.");
  }
  const customer = row.customerId === seedTenant.id ? seedTenant : null;
  return {
    role: row.role,
    mode: row.mode,
    runId: row.runId,
    displayName: row.displayName,
    customerId: row.customerId,
    customerName: customer?.name ?? null,
    expiresAt: row.expiresAt,
  };
}

export async function createDemoSession(
  request: Request,
  role: Role,
  customerId: string | null,
  mode: DemoMode = "role",
  freshRun = false,
) {
  if (!['support', 'customer', 'engineer'].includes(role)) {
    throw new DemoSessionError("Choose a valid demo persona.", 400);
  }
  if (!['role', 'guided'].includes(mode)) {
    throw new DemoSessionError("Choose a valid demo mode.", 400);
  }
  if (mode === "guided" && role !== "support") {
    throw new DemoSessionError("Guided review uses the observer workspace.", 400);
  }
  if (mode === "role" && role === "customer" && !customerId) {
    throw new DemoSessionError(
      "Customer admin access requires a customer workspace.",
      400,
    );
  }
  const customer = customerId === seedTenant.id ? seedTenant : null;
  if (customerId && !customer) {
    throw new DemoSessionError("Customer workspace not found.", 404);
  }

  const db = getD1();
  await ensureSessionTables(db);
  const previousToken = readCookie(request);
  const previousHash = previousToken ? await hashToken(previousToken) : null;
  const previous = previousHash ? await readSessionRow(db, previousHash) : null;
  const previousIsActive =
    previous && new Date(previous.expiresAt).getTime() > Date.now();
  const runId = !freshRun && previousIsActive && previous.runId
    ? previous.runId
    : crypto.randomUUID();

  const token = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await hashToken(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + sessionHours * 60 * 60 * 1000);
  const runExpiresAt = new Date(createdAt.getTime() + runHours * 60 * 60 * 1000);
  const displayName = mode === "guided" ? "Guided reviewer" : personaNames[role];
  const scopedCustomerId = mode === "role" && role === "customer" ? customerId : null;

  const statements = [
    db
      .prepare(
        `INSERT OR IGNORE INTO demo_runs (
          id, scenario_version, created_at, updated_at, expires_at
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        runId,
        "16",
        createdAt.toISOString(),
        createdAt.toISOString(),
        runExpiresAt.toISOString(),
      ),
    db
      .prepare(
        `INSERT INTO demo_sessions (
          token_hash, role, mode, run_id, customer_id, display_name, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        tokenHash,
        role,
        mode,
        runId,
        scopedCustomerId,
        displayName,
        createdAt.toISOString(),
        expiresAt.toISOString(),
      ),
  ];
  if (previousHash) {
    statements.push(
      db.prepare("DELETE FROM demo_sessions WHERE token_hash = ?").bind(previousHash),
    );
  }
  await db.batch(statements);

  const session: DemoSession = {
    role,
    mode,
    runId,
    displayName,
    customerId: scopedCustomerId,
    customerName: scopedCustomerId ? customer?.name ?? null : null,
    expiresAt: expiresAt.toISOString(),
  };
  return {
    session,
    cookie: serializeCookie(token, request, sessionHours * 60 * 60),
  };
}

export async function requireDemoSession(request: Request): Promise<DemoSession> {
  const token = readCookie(request);
  if (!token) throw new DemoSessionError("Demo access is required.");

  const db = getD1();
  await ensureSessionTables(db);
  const tokenHash = await hashToken(token);
  const row = await readSessionRow(db, tokenHash);
  if (!row || new Date(row.expiresAt).getTime() <= Date.now()) {
    if (row) {
      await db
        .prepare("DELETE FROM demo_sessions WHERE token_hash = ?")
        .bind(tokenHash)
        .run();
    }
    throw new DemoSessionError("Demo access has expired.");
  }
  return toSession(row);
}

export async function deleteDemoSession(request: Request) {
  const token = readCookie(request);
  if (token) {
    const db = getD1();
    await ensureSessionTables(db);
    await db
      .prepare("DELETE FROM demo_sessions WHERE token_hash = ?")
      .bind(await hashToken(token))
      .run();
  }
  return serializeCookie("", request, 0);
}
