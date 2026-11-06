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

export const name = "dsh-forward-panel";
export const inject = ["webServer", "agents", "agentPresets", "workspaceRegistry"];

export const Config = Schema.object({
	provider: Schema.string().default("").description("新建会话使用的 provider（留空则用请求里自带的 route）"),
	model: Schema.string().default("").description("新建会话使用的模型 id（留空则用请求里自带的 route）"),
	reasoningEffort: Schema.string().default("").description("可选的推理强度，例如 high / medium / low"),
	preset: Schema.string().default("standard").description("新建会话挂载的 agent 预设名")
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
		/* A bare agent has no model on its request header, and the preset's persona
		 * prefix needs one (`{{model}}`), so the route pins the caller's route. */
		agentOptions: { ...selection },
		setup: async (agentCtx) => {
			try {
				await ctx.agentPresets.mount(agentCtx, preset);
			}
			catch (error) {
				console.warn("[forward-panel] preset mount failed:", error instanceof Error ? error.message : String(error));
			}
			if (selection.provider !== undefined && selection.model !== undefined) {
				agentCtx.on("agent/request", async (payload, next) => {
					const resolved = await next();
					return {
						...resolved,
						provider: selection.provider,
						model: selection.model,
						...(selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort })
					};
				});
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
			const fromPayload = payload && payload.route && typeof payload.route === "object" ? payload.route : {};
			const route = {
				provider: typeof fromPayload.provider === "string" && fromPayload.provider !== "" ? fromPayload.provider : fallbackRoute.provider,
				model: typeof fromPayload.model === "string" && fromPayload.model !== "" ? fromPayload.model : fallbackRoute.model,
				reasoningEffort: typeof fromPayload.reasoningEffort === "string" && fromPayload.reasoningEffort !== "" ? fromPayload.reasoningEffort : fallbackRoute.reasoningEffort
			};
			if (route.provider === "" || route.model === "") {
				return json(res, 400, { ok: false, code: "E_NO_MODEL", params: { hint: "请在 设置 → 插件 → 摘选转发 里填写 provider 与 model，或在请求里带上 route" } });
			}
			try {
				const out = await createSession(ctx, cwd, prompt, route, preset);
				return json(res, 200, { ok: true, ...out });
			}
			catch (error) {
				return json(res, 500, { ok: false, code: "E_CREATE_FAILED", params: { message: error instanceof Error ? error.message : String(error) } });
			}
		}
	}), "forward-panel.create-route");
}
