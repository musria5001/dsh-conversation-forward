/**
 * Forward panel: a compact control beside the composer's attach row opens a
 * picker over the conversation's user and assistant rows. The user picks
 * verbatim or summary, a scope, and one of two delivery modes:
 *   - new-workspace: the agent creates a fresh workspace + session and sends the
 *     forwarding copy into it as that session's first message;
 *   - text: the agent only prints the copy in this conversation, so the user can
 *     forward it by hand.
 * The component submits a compact request through the composer; the agent
 * resolves the `seq` list and does the rest.
 */
window.__ModuleLoader__.load({
	id: "dsh-forward-panel",
	factory: (require) => {
		const React = require("react");
		const h = React.createElement;

		const PANEL_ID = "forward-panel";
		const MAX_ITEM_CHARS = 4000;
		const MAX_TOTAL_CHARS = 60000;

		const CSS = [
			".dfp-trigger{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 8px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer}",
			".dfp-trigger:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".dfp-trigger[data-active]{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary)}",
			".dfp-trigger span.dfp-count{font-variant-numeric:tabular-nums;color:var(--dsw-alias-brand-primary)}",
			".dfp-btn{font:inherit;font-size:11px;height:24px;padding:0 10px;border-radius:6px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer}",
			".dfp-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".dfp-btn[data-primary]{background:var(--dsw-alias-brand-primary);border-color:transparent;color:var(--dsw-alias-label-primary-foreground)}",
			".dfp-btn[disabled]{opacity:.45;cursor:default}",
			".dfp-backdrop{position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}",
			".dfp-panel{width:min(780px,92vw);max-height:78vh;display:flex;flex-direction:column;border-radius:14px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 18px 48px rgba(0,0,0,.45);overflow:hidden}",
			".dfp-head{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:.5px solid var(--dsw-alias-border-l2)}",
			".dfp-title{font-size:13px;font-weight:500;flex:1;min-width:0}",
			".dfp-sub{font-size:10px;color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code)}",
			".dfp-list{overflow:auto;padding:6px 8px;flex:1;min-height:0}",
			".dfp-row{display:flex;gap:8px;align-items:flex-start;padding:6px 8px;border-radius:8px;font-size:12px;line-height:1.5}",
			".dfp-row:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".dfp-row input{margin-top:3px}",
			".dfp-role{flex:none;font-size:10px;padding:1px 6px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);margin-top:1px}",
			".dfp-role[data-role=assistant]{color:var(--dsw-alias-brand-primary)}",
			".dfp-text{flex:1;min-width:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;color:var(--dsw-alias-label-secondary)}",
			".dfp-row[data-tool] .dfp-text{color:var(--dsw-alias-label-tertiary);font-style:italic}",
			".dfp-seq{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code)}",
			".dfp-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 16px;border-top:.5px solid var(--dsw-alias-border-l2)}",
			".dfp-seg{display:flex;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;overflow:hidden}",
			".dfp-seg button{font:inherit;font-size:11px;height:24px;padding:0 10px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}",
			".dfp-seg button[data-on]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}",
			".dfp-input{font:inherit;font-size:11px;height:24px;width:300px;border-radius:6px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:0 8px}",
			".dfp-path{display:flex;align-items:center;gap:6px}",
			".dfp-hint{font-size:10px;color:var(--dsw-alias-label-tertiary);flex-basis:100%}",
			".dfp-icon{display:block}",
			".dfp-empty{padding:24px;text-align:center;font-size:12px;color:var(--dsw-alias-label-tertiary)}",
			".dfp-fold{flex:none;width:18px;height:18px;padding:0;border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:11px;line-height:1}",
			".dfp-child{margin-left:24px}",
			".dfp-row[data-tool] .dfp-fold:hover{color:var(--dsw-alias-label-primary)}"
		].join("");

		/** Recursively collect visible text; reasoning/thinking blocks are skipped. */
		function collectText(value, depth, out) {
			if (value === null || value === undefined || depth > 5) return;
			if (typeof value === "string") {
				if (value.trim() !== "") out.push(value);
				return;
			}
			if (Array.isArray(value)) {
				for (const item of value) collectText(item, depth + 1, out);
				return;
			}
			if (typeof value !== "object") return;
			const type = String(value.type ?? value.kind ?? "");
			if (/reasoning|thinking/i.test(type)) return;
			if (typeof value.text === "string") {
				if (value.text.trim() !== "") out.push(value.text);
				return;
			}
			for (const key of ["content", "blocks", "parts", "children", "value", "finalNode", "data", "node", "message", "block", "segments", "items", "step"]) {
				if (value[key] !== undefined) collectText(value[key], depth + 1, out);
			}
		}

		function textOf(value) {
			const out = [];
			collectText(value, 0, out);
			return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
		}

		/** Count tool calls carried by any value and collect their names. */
		function toolInfoOf(value) {
			const state = { count: 0, names: [] };
			const walk = (item, depth) => {
				if (item === null || item === undefined || depth > 6) return;
				if (Array.isArray(item)) {
					for (const child of item) walk(child, depth + 1);
					return;
				}
				if (typeof item !== "object") return;
				const type = String(item.type ?? item.kind ?? "");
				if (/tool/i.test(type)) {
					state.count += 1;
					const name = item.name ?? item.toolName ?? (item.data && item.data.name) ?? "";
					if (typeof name === "string" && name !== "") state.names.push(name);
				}
				for (const key of ["content", "blocks", "parts", "children", "value", "finalNode", "data", "node", "message", "block", "segments", "items", "step"]) {
					if (item[key] !== undefined) walk(item[key], depth + 1);
				}
			};
			walk(value, 0);
			return state;
		}

		/** Fold consecutive tool-call steps into one collapsible group. */
		function buildGroups(rows) {
			const out = [];
			let current = null;
			for (const row of rows) {
				const isToolStep = row.toolOnly === true && (row.toolCount || 0) > 0;
				if (isToolStep) {
					if (!current) {
						current = { type: "group", key: "g" + row.seq, rows: [] };
						out.push(current);
					}
					current.rows.push(row);
					continue;
				}
				current = null;
				out.push({ type: "row", row });
			}
			return out;
		}

		/** Workspace choices for the original new-session flow. */
		function workspaceList(snapshot) {
			const items = snapshot && Array.isArray(snapshot.items) ? snapshot.items : [];
			return items
				.filter((item) => item && typeof item.path === "string" && item.path !== "")
				.map((item) => ({
					id: String(item.workspaceId ?? item.path),
					path: item.path,
					title: String(item.title ?? item.path)
				}));
		}

		/** First finite number among the candidates. */
		function firstNumber(...values) {
			for (const value of values) {
				const number = Number(value);
				if (Number.isFinite(number)) return number;
			}
			return Number.NaN;
		}

		/**
		 * Picker entries built from the Chat store (assistant text lives in
		 * `data.blocks`), with `legacy.nodes` as a fallback for rows the store has
		 * not materialized. Text-bearing rows stay selectable; tool-only steps stay
		 * visible (collapsed) as context but are never forwarded.
		 */
		function readableEntries(chat) {
			const stats = { user: 0, assistant: 0, withText: 0, toolOnly: 0, empty: 0, missing: 0, kinds: "" };
			const kindHist = new Map();
			const found = new Map();
			const order = chat && Array.isArray(chat.order) ? chat.order : [];
			const store = chat && chat.nodes;
			for (const key of order) {
				let node;
				try {
					node = store && typeof store.get === "function" ? store.get(key) : undefined;
				}
				catch (error) {
					node = undefined;
				}
				if (!node) {
					stats.missing += 1;
					continue;
				}
				const data = node.data ?? node;
				const kindName = String(node.kind ?? "");
				kindHist.set(kindName, (kindHist.get(kindName) ?? 0) + 1);
				/* A settled turn keeps its answer in the tail's `closing` payload; the
				 * per-step rows usually hold reasoning only. */
				const closing = kindName === "turn-tail" && data && data.closing ? data.closing : null;
				const nested = data && data.finalNode ? data.finalNode : null;
				const source = closing ?? nested ?? data;
				const blocks = source && Array.isArray(source.blocks) ? source.blocks : null;
				const isAssistant = blocks !== null || kindName === "assistant" || closing !== null || nested !== null;
				const isUser = !isAssistant && (kindName === "user" || (data && data.kind === "user"));
				if (!isAssistant && !isUser) continue;
				const seq = firstNumber(
					closing && closing.finalNode && closing.finalNode.seq,
					nested && nested.seq,
					closing && closing.seq,
					kindName === "user" && data && data.seq,
					node.anchorSeq,
					data && data.seq,
					node.seq
				);
				if (!Number.isFinite(seq)) continue;
				const text = textOf(source);
				const tool = toolInfoOf(source);
				found.set(seq, {
					seq,
					kind: isAssistant ? "assistant" : "user",
					text,
					toolCount: tool.count,
					toolNames: tool.names
				});
			}
			stats.kinds = Array.from(kindHist.entries())
				.map(([kind, count]) => kind + "=" + count)
				.join(" ");
			const legacy = chat && chat.legacy && Array.isArray(chat.legacy.nodes) ? chat.legacy.nodes : [];
			for (const node of legacy) {
				const kind = String(node && node.kind ? node.kind : "");
				if (kind !== "user" && kind !== "assistant") continue;
				const seq = Number(node.seq);
				if (!Number.isFinite(seq) || found.has(seq)) continue;
				const text = textOf(node);
				const tool = toolInfoOf(node);
				if (text === "" && tool.count === 0) continue;
				found.set(seq, { seq, kind, text, toolCount: tool.count, toolNames: tool.names });
			}
			const rows = [];
			for (const entry of found.values()) {
				if (entry.kind === "user") stats.user += 1;
				else stats.assistant += 1;
				if (entry.text !== "") {
					stats.withText += 1;
					rows.push({ seq: entry.seq, kind: entry.kind, label: entry.text, toolOnly: false, toolCount: 0 });
					continue;
				}
				if (entry.toolCount > 0) {
					stats.toolOnly += 1;
					const names = Array.from(new Set(entry.toolNames)).slice(0, 4).join(", ");
					rows.push({
						seq: entry.seq,
						kind: entry.kind,
						label: "⚙ " + entry.toolCount + " 次工具调用" + (names === "" ? "" : "（" + names + "）"),
						toolOnly: true,
						toolCount: entry.toolCount
					});
					continue;
				}
				if (entry.kind === "user") {
					stats.withText += 1;
					rows.push({ seq: entry.seq, kind: "user", label: "（非文本消息）", toolOnly: true, toolCount: 0 });
					continue;
				}
				stats.empty += 1;
			}
			rows.sort((a, b) => a.seq - b.seq);
			return { rows, hidden: stats.empty, stats };
		}

		/** Clamp each item and the whole payload so a submit stays affordable. */
		function clipItems(items) {
			let total = 0;
			let truncated = false;
			const out = items.map((item) => {
				let text = String(item.text ?? "");
				if (text.length > MAX_ITEM_CHARS) {
					text = text.slice(0, MAX_ITEM_CHARS) + "…（本条已截断）";
					truncated = true;
				}
				if (total + text.length > MAX_TOTAL_CHARS) {
					const room = Math.max(0, MAX_TOTAL_CHARS - total);
					text = text.slice(0, room) + "…（超出总长已截断）";
					truncated = true;
				}
				total += text.length;
				return { seq: item.seq, role: item.role, text };
			});
			return { items: out, truncated };
		}

		function Icon() {
			return h("svg", {
				className: "dfp-icon",
				width: 14,
				height: 14,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.8,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true
			},
				h("path", { d: "M4 12h9" }),
				h("path", { d: "M9 6l6 6-6 6" }),
				h("path", { d: "M20 5v14" }));
		}

		function ForwardPanel(props) {
			const chat = props.useChat((value) => value);
			/* Original new-session flow: pick one of the existing workspaces. */
			const workspaces = props.useWorkspaces((value) => value);
			const [open, setOpen] = React.useState(false);
			const [picked, setPicked] = React.useState(() => new Set());
			const [mode, setMode] = React.useState("verbatim");
			const [scope, setScope] = React.useState("selected");
			const [deliver, setDeliver] = React.useState("new-workspace");
			const [target, setTarget] = React.useState("");
			const [sent, setSent] = React.useState(false);
			const [folded, setFolded] = React.useState(() => new Set());

			const parsed = readableEntries(chat);
			const rows = parsed.rows;
			const stats = parsed.stats;
			const sendable = rows.filter((row) => row.toolOnly !== true);
			const count = scope === "all" ? sendable.length : sendable.filter((row) => picked.has(row.seq)).length;
			const groups = buildGroups(rows);
			const targets = workspaceList(workspaces);
			const effectiveTarget = target || (targets[0] ? targets[0].path : "");

			function toggleFold(key) {
				const next = new Set(folded);
				if (next.has(key)) next.delete(key);
				else next.add(key);
				setFolded(next);
			}

			function toggle(seq) {
				const next = new Set(picked);
				if (next.has(seq)) next.delete(seq);
				else next.add(seq);
				setPicked(next);
				setSent(false);
			}

			function submit() {
				const chosen = scope === "all" ? sendable : sendable.filter((row) => picked.has(row.seq));
				const clipped = clipItems(chosen
					.filter((row) => Number.isFinite(row.seq) && row.seq > 0)
					.map((row) => ({ seq: row.seq, role: row.kind, text: row.label })));
				if (clipped.items.length === 0) return;
				const payload = {
					sessionId: props.sessionId ?? null,
					mode,
					scope,
					deliver,
					workspace: deliver === "new-workspace" ? (effectiveTarget || null) : null,
					truncated: clipped.truncated,
					seqs: clipped.items.map((item) => item.seq),
					items: clipped.items
				};
				const where = deliver === "new-workspace"
					? "先把选中的 items 整理成最终文案（原文或摘要），然后调用本机回环接口 POST "
						+ "`/api/forward-panel/create`，请求体 `{\"cwd\": " + JSON.stringify(payload.workspace)
						+ ", \"sessionId\": " + JSON.stringify(payload.sessionId)
						+ ", \"prompt\": \"<最终文案>\"}`"
						+ "——接口由本插件提供，会新建会话并把 prompt 作为首条消息；模型自动继承 sessionId 所属会话，"
						+ "若接口返回 E_NO_MODEL 再补一个 `\"route\": {\"provider\": \"…\", \"model\": \"…\"}` 重试；"
						+ "成功后在本对话回复工作区路径与返回的 sessionId"
					: "不要新建会话或工作区，直接在本对话用 ``` 代码块输出可复制的转发文案";
				const text = "[forward-request]\n" + JSON.stringify(payload)
					+ "\n执行要求：" + where + "。"
					+ (mode === "summary" ? "mode=summary：把 items 压缩成一段摘要。" : "mode=verbatim：逐条保留原文、角色与时序。")
					+ (clipped.truncated ? "注意 payload.truncated=true，长文已被截断。" : "")
					+ "不要询问，直接执行。";
				try {
					props.inputActions.setDraft(text);
					props.inputActions.submit();
					setSent(true);
					setTimeout(() => {
						setOpen(false);
						setPicked(new Set());
					}, 600);
				}
				catch (error) {
					setSent(false);
				}
			}

			const trigger = h("button", {
				type: "button",
				className: "dfp-trigger",
				title: "摘选对话，生成可转发的文案",
				"aria-label": "摘选对话",
				"data-active": picked.size > 0 ? "" : undefined,
				onClick: () => setOpen(!open)
			},
				h(Icon),
				h("span", { className: "dfp-count" }, picked.size > 0 ? String(picked.size) : "摘选"),
				h("style", null, CSS));

			function renderRow(row, child) {
				return h("label", {
					className: "dfp-row" + (child ? " dfp-child" : ""),
					key: "r" + row.seq,
					"data-tool": row.toolOnly ? "" : undefined
				},
					h("input", {
						type: "checkbox",
						checked: picked.has(row.seq),
						onChange: () => toggle(row.seq)
					}),
					h("span", { className: "dfp-role", "data-role": row.kind }, row.kind === "user" ? "我" : "AI"),
					h("span", { className: "dfp-text" }, row.label.replace(/\s+/g, " ").slice(0, 200)),
					h("span", { className: "dfp-seq" }, "#" + row.seq));
			}

			function renderGroup(group) {
				const isOpen = folded.has(group.key);
				const total = group.rows.reduce((sum, row) => sum + (row.toolCount || 0), 0);
				const head = h("div", { className: "dfp-row", key: group.key, "data-tool": "" },
					h("button", {
						type: "button",
						className: "dfp-fold",
						onClick: () => toggleFold(group.key),
						"aria-label": isOpen ? "折叠该组" : "展开该组"
					}, isOpen ? "▾" : "▸"),
					h("span", { className: "dfp-role", "data-role": "assistant" }, "AI"),
					h("span", { className: "dfp-text" },
						"⚙ " + group.rows.length + " 步 · " + (total > 0 ? total : group.rows.length) + " 次工具调用（不转发）"),
					h("span", { className: "dfp-seq" },
						"#" + group.rows[0].seq + "–" + group.rows[group.rows.length - 1].seq));
				const children = isOpen ? group.rows.map((row) => renderRow(row, true)) : [];
				return h(React.Fragment, null, head, children);
			}

			const list = rows.length === 0
				? h("div", { className: "dfp-empty" }, "没有可转发的消息（节点 " + (stats.user + stats.assistant) + " 条，均无文本）")
				: groups.map((group) => group.type === "group"
					? renderGroup(group)
					: renderRow(group.row));

			const panel = open
				? h("div", {
					className: "dfp-backdrop",
					onClick: (event) => { if (event.target === event.currentTarget) setOpen(false); }
				},
					h("div", { className: "dfp-panel" },
						h("div", { className: "dfp-head" },
							h("span", { className: "dfp-title" }, "摘选转发"),
							h("span", { className: "dfp-sub" },
								"我 " + stats.user + " · AI " + stats.assistant + " · 有文本 " + stats.withText
								+ " · 仅工具 " + stats.toolOnly + " · 空 " + stats.empty + (stats.missing > 0 ? " · 未载 " + stats.missing : "")),
							h("button", { type: "button", className: "dfp-btn", onClick: () => setPicked(new Set(sendable.map((row) => row.seq))) }, "全选"),
							h("button", { type: "button", className: "dfp-btn", onClick: () => setPicked(new Set()) }, "清除"),
							h("button", { type: "button", className: "dfp-btn", onClick: () => setOpen(false) }, "关闭")),
						h("div", { className: "dfp-list" }, list),
						h("div", { className: "dfp-foot" },
							h("div", { className: "dfp-seg" },
								h("button", { type: "button", "data-on": mode === "verbatim" ? "" : undefined, onClick: () => setMode("verbatim") }, "原文"),
								h("button", { type: "button", "data-on": mode === "summary" ? "" : undefined, onClick: () => setMode("summary") }, "摘要")),
							h("div", { className: "dfp-seg" },
								h("button", { type: "button", "data-on": scope === "selected" ? "" : undefined, onClick: () => setScope("selected") }, "选中"),
								h("button", { type: "button", "data-on": scope === "all" ? "" : undefined, onClick: () => setScope("all") }, "整段会话")),
							h("div", { className: "dfp-seg" },
								h("button", { type: "button", "data-on": deliver === "new-workspace" ? "" : undefined, onClick: () => setDeliver("new-workspace") }, "新建对话"),
								h("button", { type: "button", "data-on": deliver === "text" ? "" : undefined, onClick: () => setDeliver("text") }, "文案生成")),
							deliver === "new-workspace"
								? h("select", {
									className: "dfp-input",
									value: effectiveTarget,
									onChange: (event) => setTarget(event.target.value),
									"aria-label": "目标工作区"
								}, targets.map((item) => h("option", { key: item.id, value: item.path }, item.title)))
								: null,
							h("button", {
								type: "button",
								className: "dfp-btn",
								"data-primary": "",
								disabled: count === 0,
								onClick: submit
							}, sent ? "已提交 ✓" : deliver === "new-workspace" ? "新建对话" : "生成文案"),
							h("span", { className: "dfp-hint" },
								deliver === "new-workspace"
									? "在所选工作区新建会话，转发文案作为首条消息；完成后我给你工作区路径和会话 id"
									: "不新建任何东西，只在本对话输出一段可复制的文案"),
							h("span", { className: "dfp-hint" },
								"单条 " + MAX_ITEM_CHARS + " 字、总计 " + (MAX_TOTAL_CHARS / 1000) + "k 字内，超出自动截断；工具调用不转发"))))
				: null;

			return h(React.Fragment, null, trigger, panel);
		}

		const inject = ["slots"];

		function apply(ctx) {
			ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
				name: "conversation.input.left",
				id: PANEL_ID,
				order: 5
			}, ForwardPanel));
		}

		return { inject, apply };
	}
});
