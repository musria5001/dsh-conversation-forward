/**
 * Host half of the forward panel.
 *
 * The browser half picks messages and submits one `[forward-request]`; the agent
 * turns that request into final text (verbatim or its own summary) and posts it
 * here. This half owns session creation, so the panel needs no other plugin's
 * session tooling.
 *
 * POST /api/forward-panel/create
 *   { cwd: string, prompt: string, title?: string }
 *   -> { ok: true, sessionId, workspaceId? } | { ok: false, code, params? }
 */
import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import Schema from "@deepseek-ai/schemastery";

export const name = "dsh-conversation-forward";
/* `sessionPersistence` is read through `ctx.get()` at request time: declaring it
 * as a required inject would keep the whole plugin pending on a host that lacks it. */
export const inject = ["webServer", "agents", "agentPresets", "workspaceRegistry"];

export const Config = Schema.object({
	provider: Schema.string().default("").description("兜底 provider；留空则自动继承来源会话（推荐）"),
	model: Schema.string().default("").description("兜底模型；留空则自动继承来源会话（推荐）"),
	reasoningEffort: Schema.string().default("").description("可选兜底推理强度，例如 high / medium / low"),
	preset: Schema.string().default("").description("agent 预设名；留空则继承来源会话，再退回 standard")
});

const ROUTE = "/api/forward-panel/create";
const BODY_LIMIT = 4_000_000;
const DEFAULT_PRESET = "standard";

function json(res, status, value) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(value));
}

/** Only a loopback page may drive this route. */
function isLoopbackRequest(req) {
	const headers = req && req.headers ? req.headers : {};
	const host = String(headers.host || "");
	return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host);
}

/** Read one JSON request body with a hard size cap. */
function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > BODY_LIMIT) {
				reject(new Error("E_BODY_TOO_LARGE"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}

/** One durable user message value for `agent.followup`. */
function userMessage(text) {
	return { id: randomUUID(), role: "user", content: [{ type: "text", text }], source: { kind: "user" } };
}

/**
 * Read what a source session is actually running with, so the new session
 * inherits this host's own configuration instead of asking the user.
 *
 * `sessionPersistence` is an optional inject: on a host without it this returns
 * an empty result and the caller falls back to plugin config.
 *
 * @param ctx - plugin context (may or may not carry `sessionPersistence`).
 * @param sessionId - the session the forward request came from.
 * @returns `{ route: {provider, model, reasoningEffort} | null, preset: string }`.
 */
async function readSourceConfig(ctx, sessionId) {
	const empty = { route: null, preset: "" };
	if (typeof sessionId !== "string" || sessionId === "") return empty;
	const persistence = typeof ctx.get === "function" ? ctx.get("sessionPersistence") : undefined;
	if (persistence === undefined || persistence === null) return empty;
	try {
		const handle = await persistence.open(sessionId, "read");
		try {
			const result = await handle.read();
			const events = Array.isArray(result && result.events) ? result.events : [];
			let config = null;
			let preset = "";
			for (const event of events) {
				if (!event || typeof event !== "object") continue;
				if (event.type === "request/header") {
					const header = event.data && event.data.header;
					if (header && header.config && typeof header.config === "object") config = header.config;
				}
				if (event.type === "session") {
					const header = event.data && event.data.header;
					if (header && typeof header.agentPreset === "string") preset = header.agentPreset;
				}
			}
			return {
				route: config === null ? null : {
					provider: typeof config.provider === "string" ? config.provider : "",
					model: typeof config.model === "string" ? config.model : "",
					reasoningEffort: typeof config.reasoningEffort === "string" ? config.reasoningEffort : ""
				},
				preset
			};
		}
		finally {
			await handle.close();
		}
	}
	catch (error) {
		console.warn("[forward-panel] inherit route failed:", error instanceof Error ? error.message : String(error));
		return empty;
	}
}

/** Create one main session bound to `cwd`, attach it to that workspace, post the first message. */
async function createSession(ctx, cwd, prompt, route, preset) {
	const sessionId = "sb-" + randomUUID();
	const selection = {};
	if (route !== undefined && route !== null) {
		if (typeof route.provider === "string" && route.provider !== "") selection.provider = route.provider;
		if (typeof route.model === "string" && route.model !== "") selection.model = route.model;
		if (typeof route.reasoningEffort === "string" && route.reasoningEffort !== "") selection.reasoningEffort = route.reasoningEffort;
	}
	const created = await ctx.agents.create({
		sessionId,
		meta: { cwd },
		/* The preset persona prefix interpolates `{{model}}`, and a bare agent has no
		 * model on its first request header, so the initial route is pinned here.
		 * Deliberately no per-request hook: after creation the session must behave
		 * like any other and keep honouring the composer's model picker. */
		agentOptions: { ...selection },
		setup: async (agentCtx) => {
			try {
				await ctx.agentPresets.mount(agentCtx, preset);
			}
			catch (error) {
				console.warn("[forward-panel] preset mount failed:", error instanceof Error ? error.message : String(error));
			}
		}
	});
	const agent = created.agent;
	let workspaceId;
	try {
		const workspace = await ctx.workspaceRegistry.resolveByPath(cwd);
		if (workspace !== undefined) {
			await workspace.attachSession(sessionId);
			workspaceId = workspace.id;
		}
	}
	catch (error) {
		console.warn("[forward-panel] workspace attach failed:", error instanceof Error ? error.message : String(error));
	}
	agent.followup(userMessage(prompt));
	return { sessionId, workspaceId };
}

export function apply(ctx, config) {
	const settings = config !== null && typeof config === "object" ? config : {};
	const fallbackRoute = {
		provider: typeof settings.provider === "string" ? settings.provider.trim() : "",
		model: typeof settings.model === "string" ? settings.model.trim() : "",
		reasoningEffort: typeof settings.reasoningEffort === "string" ? settings.reasoningEffort.trim() : ""
	};
	const preset = typeof settings.preset === "string" && settings.preset.trim() !== "" ? settings.preset.trim() : DEFAULT_PRESET;
	/* Idempotency window: the same (cwd, prompt) posted twice in a row — a double
	 * click or an agent retry — must reuse the first session instead of creating a
	 * second one. */
	const recent = new Map();
	const DEDUPE_MS = 15_000;
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: ROUTE,
		handler: async (req, res) => {
			if (req.method !== "POST") return json(res, 405, { ok: false, code: "E_POST_ONLY" });
			if (!isLoopbackRequest(req)) return json(res, 403, { ok: false, code: "E_LOOPBACK_ONLY" });
			let payload;
			try {
				payload = JSON.parse(await readBody(req));
			}
			catch (error) {
				return json(res, 400, { ok: false, code: "E_BAD_BODY", params: { message: error instanceof Error ? error.message : String(error) } });
			}
			const cwd = payload && typeof payload.cwd === "string" ? payload.cwd : "";
			const prompt = payload && typeof payload.prompt === "string" ? payload.prompt.trim() : "";
			if (cwd === "") return json(res, 400, { ok: false, code: "E_NO_CWD" });
			if (prompt === "") return json(res, 400, { ok: false, code: "E_NO_PROMPT" });
			try {
				if (!statSync(cwd).isDirectory()) throw new Error("not a directory");
			}
			catch {
				return json(res, 400, { ok: false, code: "E_CWD_MISSING", params: { cwd } });
			}
			/* Resolution: explicit request route → the source session's own route
			 * (fully adaptive) → plugin config → a clear error. */
			const fromPayload = payload && payload.route && typeof payload.route === "object" ? payload.route : {};
			const sourceSessionId = payload && typeof payload.sessionId === "string" ? payload.sessionId : "";
			const source = fromPayload.provider !== undefined && fromPayload.provider !== "" && fromPayload.model !== undefined && fromPayload.model !== ""
				? { route: null, preset: "" }
				: await readSourceConfig(ctx, sourceSessionId);
			const inherited = source.route;
			const route = {
				provider: typeof fromPayload.provider === "string" && fromPayload.provider !== ""
					? fromPayload.provider
					: (inherited !== null && inherited.provider !== "" ? inherited.provider : fallbackRoute.provider),
				model: typeof fromPayload.model === "string" && fromPayload.model !== ""
					? fromPayload.model
					: (inherited !== null && inherited.model !== "" ? inherited.model : fallbackRoute.model),
				reasoningEffort: typeof fromPayload.reasoningEffort === "string" && fromPayload.reasoningEffort !== ""
					? fromPayload.reasoningEffort
					: (inherited !== null && inherited.reasoningEffort !== "" ? inherited.reasoningEffort : fallbackRoute.reasoningEffort)
			};
			const effectivePreset = preset !== "" ? preset : (source.preset !== "" ? source.preset : DEFAULT_PRESET);
			if (route.provider === "" || route.model === "") {
				return json(res, 400, {
					ok: false,
					code: "E_NO_MODEL",
					params: { hint: "请求里带上 sessionId（自动继承该会话的模型），或在 设置 → 插件 → 摘选转发 里填写 provider / model" }
				});
			}
			const dedupeKey = cwd + "\u0000" + prompt;
			const now = Date.now();
			for (const [key, entry] of recent) {
				if (now - entry.at > DEDUPE_MS) recent.delete(key);
			}
			const seen = recent.get(dedupeKey);
			if (seen !== undefined) {
				return json(res, 200, { ok: true, ...seen.value, preset: seen.preset, deduped: true });
			}
			try {
				const out = await createSession(ctx, cwd, prompt, route, effectivePreset);
				const value = { sessionId: out.sessionId, ...(out.workspaceId === undefined ? {} : { workspaceId: out.workspaceId }) };
				recent.set(dedupeKey, { at: now, value, preset: effectivePreset });
				return json(res, 200, {
					ok: true,
					...out,
					preset: effectivePreset,
					...(out.workspaceId === undefined
						? { note: "该目录不是已注册工作区：会话已建好，但不会出现在侧栏分组下（可把目录加为工作区后重试）" }
						: {})
				});
			}
			catch (error) {
				return json(res, 500, { ok: false, code: "E_CREATE_FAILED", params: { message: error instanceof Error ? error.message : String(error) } });
			}
		}
	}), "forward-panel.create-route");
}
