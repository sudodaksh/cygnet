/**
 * Utility for automatically starting a signal-cli-rest-api service.
 *
 * Supports two modes:
 *   - "docker"  (default) — runs the official Docker image
 *   - "binary"            — spawns a local signal-cli-rest-api binary
 *
 * In both cases the function waits until GET /v1/health returns 200,
 * then resolves with a ServiceHandle containing the service URL and a stop() method.
 *
 * Example:
 *   const svc = await startSignalService({ configDir: "~/.local/share/signal-cli" });
 *   const bot = new Bot({ signalService: svc.url, phoneNumber: "+49..." });
 *   process.once("SIGTERM", () => { bot.stop(); svc.stop(); });
 *   await bot.start();
 */

export interface ServiceConfig {
  /**
   * How to launch the service.
   * - "docker"  (default) – pulls and runs the Docker image
   * - "binary"            – spawns a local binary
   */
  mode?: "docker" | "binary";

  /**
   * Path to the signal-cli config directory on the HOST machine.
   * This is where signal-cli stores credentials and keys.
   * Typically: ~/.local/share/signal-cli
   * Required.
   */
  configDir: string;

  /**
   * Port to listen on. Default: 8080.
   */
  port?: number;

  /**
   * signal-cli-rest-api execution mode.
   * - "native"   (default) – faster, uses signal-cli native binary
   * - "normal"             – uses signal-cli JVM
   * - "json-rpc"           – experimental JSON-RPC mode
   */
  signalMode?: "normal" | "native" | "json-rpc";

  // --- Docker-specific ---

  /**
   * Docker image to use. Default: "bbernhard/signal-cli-rest-api".
   */
  image?: string;

  /**
   * Docker container name. Default: "signal-service".
   * If a container with this name already exists and is stopped, it will be
   * restarted rather than creating a new one.
   */
  containerName?: string;

  /**
   * Remove the container when stop() is called. Default: true.
   * Set to false to keep the container for faster subsequent starts.
   */
  removeOnStop?: boolean;

  // --- Binary-specific ---

  /**
   * Path to the signal-cli-rest-api binary.
   * Required when mode === "binary".
   */
  binaryPath?: string;

  /**
   * Tmp directory for attachments. Default: "/tmp".
   */
  attachmentTmpDir?: string;

  /**
   * Tmp directory for avatars. Default: "/tmp".
   */
  avatarTmpDir?: string;

  // --- Health check ---

  /**
   * How long to wait for the service to become healthy, in ms. Default: 30000.
   */
  startupTimeout?: number;

  /**
   * How often to poll GET /v1/health, in ms. Default: 500.
   */
  healthCheckInterval?: number;
}

export interface ServiceHandle {
  /** The base URL of the running service, e.g. "http://localhost:8080". */
  readonly url: string;

  /**
   * Stop the service.
   * For Docker: stops (and optionally removes) the container.
   * For binary: kills the spawned process.
   */
  stop(): Promise<void>;
}

// ---------------------------------------------------------------------------

export async function startSignalService(
  config: ServiceConfig,
): Promise<ServiceHandle> {
  const mode = config.mode ?? "docker";
  const port = config.port ?? 8080;
  const url = `http://localhost:${port}`;

  if (mode === "docker") {
    return startDocker(config, port, url);
  }
  return startBinary(config, port, url);
}

// ---------------------------------------------------------------------------
// Docker
// ---------------------------------------------------------------------------

async function startDocker(
  config: ServiceConfig,
  port: number,
  url: string,
): Promise<ServiceHandle> {
  const image = config.image ?? "bbernhard/signal-cli-rest-api";
  const containerName = config.containerName ?? "signal-service";
  const signalMode = config.signalMode ?? "native";
  const removeOnStop = config.removeOnStop ?? true;

  // Resolve configDir (expand ~)
  const configDir = expandHome(config.configDir);

  // Check if the container already exists
  const inspectResult = await exec([
    "docker",
    "inspect",
    "--format={{.State.Status}}",
    containerName,
  ]);

  if (inspectResult.code === 0) {
    const status = inspectResult.stdout.trim();
    if (status === "running") {
      console.log(`[cygnet] Container "${containerName}" is already running.`);
    } else {
      console.log(
        `[cygnet] Container "${containerName}" exists (${status}), starting it…`,
      );
      await execOrThrow(["docker", "start", containerName]);
    }
  } else {
    // Container does not exist — create and start it
    console.log(`[cygnet] Starting Docker container "${containerName}"…`);
    await execOrThrow([
      "docker",
      "run",
      "-d",
      "--name",
      containerName,
      "-p",
      `${port}:${port}`,
      "-v",
      `${configDir}:/home/.local/share/signal-cli`,
      "-e",
      `MODE=${signalMode}`,
      "-e",
      `PORT=${port}`,
      image,
    ]);
  }

  await waitForHealth(url, config);
  console.log(`[cygnet] signal-cli-rest-api ready at ${url}`);

  return {
    url,
    async stop() {
      console.log(`[cygnet] Stopping container "${containerName}"…`);
      await exec(["docker", "stop", containerName]);
      if (removeOnStop) {
        await exec(["docker", "rm", containerName]);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Binary
// ---------------------------------------------------------------------------

async function startBinary(
  config: ServiceConfig,
  port: number,
  url: string,
): Promise<ServiceHandle> {
  if (!config.binaryPath) {
    throw new Error(
      '[cygnet] ServiceConfig.binaryPath is required when mode === "binary"',
    );
  }

  const binaryPath = expandHome(config.binaryPath);
  const configDir = expandHome(config.configDir);
  const attachmentTmpDir = config.attachmentTmpDir ?? "/tmp";
  const avatarTmpDir = config.avatarTmpDir ?? "/tmp";

  console.log(`[cygnet] Spawning signal-cli-rest-api binary…`);

  const proc = Bun.spawn(
    [
      binaryPath,
      `-signal-cli-config=${configDir}`,
      `-attachment-tmp-dir=${attachmentTmpDir}`,
      `-avatar-tmp-dir=${avatarTmpDir}`,
    ],
    {
      env: {
        ...process.env,
        PORT: String(port),
        MODE: config.signalMode ?? "native",
      },
      stdout: "inherit",
      stderr: "inherit",
    },
  );

  // If the process dies during startup, surface the error immediately
  proc.exited.then((code) => {
    if (code !== 0 && code !== null) {
      console.error(`[cygnet] signal-cli-rest-api exited with code ${code}`);
    }
  });

  await waitForHealth(url, config);
  console.log(`[cygnet] signal-cli-rest-api ready at ${url}`);

  return {
    url,
    async stop() {
      console.log("[cygnet] Stopping signal-cli-rest-api binary…");
      proc.kill();
      await proc.exited;
    },
  };
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

async function waitForHealth(
  url: string,
  config: Pick<ServiceConfig, "startupTimeout" | "healthCheckInterval">,
): Promise<void> {
  const timeout = config.startupTimeout ?? 30_000;
  const interval = config.healthCheckInterval ?? 500;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/v1/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      // Not ready yet
    }
    await sleep(interval);
  }

  throw new Error(
    `[cygnet] signal-cli-rest-api did not become healthy within ${timeout}ms. ` +
    `Check that the service is configured correctly and that port ${new URL(url).port} is free.`,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function exec(args: string[]): Promise<ExecResult> {
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code: code ?? 0, stdout, stderr };
}

async function execOrThrow(args: string[]): Promise<void> {
  const result = await exec(args);
  if (result.code !== 0) {
    throw new Error(
      `Command failed (exit ${result.code}): ${args.join(" ")}\n${result.stderr}`,
    );
  }
}

function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    return home + p.slice(1);
  }
  return p;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
