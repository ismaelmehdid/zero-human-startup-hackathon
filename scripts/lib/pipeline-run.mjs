// Run a pipeline now on the development server and follow it to the end. Shared by run.mjs and demo.mjs.
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { WORKSPACE_ROOT, connect } from './rocketride.mjs';

const RUN_TIMEOUT_SECONDS = 20 * 60;
const POLL_INTERVAL_MS = 3000;
const HEARTBEAT_SECONDS = 30;
const MONITOR_TYPES = ['task', 'summary', 'flow', 'output'];
const LIFECYCLE_LANES = new Set(['open', 'closing', 'close']);
const CONNECTION_VARIABLES = new Set(['ROCKETRIDE_URI', 'ROCKETRIDE_APIKEY']);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Read a pipeline by name (pipelines/<name>.pipe) or path, plus what a run needs to know about it. */
export async function loadPipeline(target) {
	const filePath = target.endsWith('.pipe') ? path.resolve(WORKSPACE_ROOT, target) : path.join(WORKSPACE_ROOT, 'pipelines', `${target}.pipe`);
	const relativePath = path.relative(WORKSPACE_ROOT, filePath);
	const text = await readFile(filePath, 'utf8').catch(() => {
		throw new Error(`Pipeline file not found: ${relativePath}`);
	});
	const pipeline = JSON.parse(text);
	const sources = pipeline.source ? [pipeline.source] : pipeline.components.filter((c) => c.config?.mode === 'Source').map((c) => c.id);
	if (sources.length !== 1) throw new Error(`Expected exactly one source in ${relativePath}, found: ${sources.join(', ') || 'none'}`);
	return {
		name: path.basename(filePath, '.pipe'),
		filePath,
		relativePath,
		projectId: pipeline.project_id,
		source: sources[0],
		briefs: pipeline.components.filter((c) => c.provider === 'filestore_source').map((c) => c.config?.parameters?.path).filter(Boolean),
		// Read from the file on every run, so the required secrets follow edits to the pipeline.
		secrets: [...new Set([...text.matchAll(/\$\{(ROCKETRIDE_[A-Z0-9_]+)\}/g)].map((match) => match[1]))]
			.filter((name) => !CONNECTION_VARIABLES.has(name))
			.sort(),
	};
}

/** Secrets the pipeline references that are set neither in .env nor in the server-side environment. */
export async function findMissingSecrets(client, spec) {
	const serverKeys = new Set(await client.account.getEnvironmentKeys().catch(() => []));
	return spec.secrets.filter((name) => !process.env[name] && !serverKeys.has(name));
}

/** Briefs the pipeline reads that have no repo copy. */
export async function findMissingRepoBriefs(spec) {
	const missing = [];
	for (const briefPath of spec.briefs) {
		await access(path.join(WORKSPACE_ROOT, briefPath)).catch(() => missing.push(briefPath));
	}
	return missing;
}

/** Upload the repo copy of each brief the pipeline reads, so the repo copy is what runs. */
export async function uploadBriefs(client, spec, log) {
	for (const briefPath of spec.briefs) {
		const text = await readFile(path.join(WORKSPACE_ROOT, briefPath), 'utf8');
		await client.fsWriteString(briefPath, text);
		if ((await client.fsReadString(briefPath)) !== text) throw new Error(`${briefPath}: the file store copy does not match the repo copy after upload`);
		log(`uploaded the repo copy of ${briefPath} to the file store`);
	}
}

/** Stop when a brief is missing from the file store; warn when it differs from the repo copy. */
export async function checkBriefs(client, spec, log) {
	for (const briefPath of spec.briefs) {
		if (!(await client.fsStat(briefPath)).exists) {
			throw new Error(`${briefPath} is not in the file store. Upload it: bash scripts/upload-briefs.sh ${briefPath}`);
		}
		const local = await readFile(path.join(WORKSPACE_ROOT, briefPath), 'utf8').catch(() => undefined);
		if (local !== undefined && local !== (await client.fsReadString(briefPath))) {
			log(`warning: the file store copy of ${briefPath} differs from the repo copy`);
		} else {
			log(`brief ${briefPath}: present in the file store`);
		}
	}
}

function printResults(spec, results) {
	if (results.length === 0) {
		console.log(`\n[${spec.name}] no response captured (re-run with --raw to see every event).`);
		return;
	}
	for (const { key, value } of results) {
		console.log(`\n[${spec.name}] response "${key}":`);
		for (const item of Array.isArray(value) ? value : [value]) {
			console.log(typeof item === 'string' ? item : JSON.stringify(item, null, 2));
		}
	}
}

/**
 * Start the pipeline, print its progress and final response, and resolve to { ok, reason, results, status }.
 * A run fails when it cannot start, times out, ends with a non-zero exit code, or ends with errors and no
 * response. Errors next to a response are printed but do not fail the run. Ctrl-C terminates the run.
 */
export async function runPipeline(spec, { rawEvents = false, consoleLogs = false } = {}) {
	const startedAt = Date.now();
	const elapsed = () => Math.round((Date.now() - startedAt) / 1000);
	const log = (message) => console.log(`[${spec.name} +${elapsed()}s] ${message}`);
	const results = [];
	const seenErrors = new Set();
	let lastStatus = '';
	let lastStep = '';
	let taskBegun = false; // the monitor first replays the previous run's status; ignore it until this run begins
	let taskEnded = false;
	let eventStatus;

	const collectResult = (flowBody) => {
		for (const candidate of [flowBody.result, flowBody.trace?.result, flowBody.trace]) {
			if (!candidate || typeof candidate !== 'object' || !candidate.result_types) continue;
			for (const key of Object.keys(candidate.result_types)) {
				if (candidate[key] !== undefined) results.push({ key, value: candidate[key] });
			}
			return;
		}
	};

	const onEvent = async (event) => {
		const body = event.body ?? {};
		if (rawEvents) console.log(`[event] ${event.event} ${JSON.stringify(body).slice(0, 800)}`);
		if (event.event === 'apaevt_task' && (body.action === 'begin' || body.action === 'end')) {
			if (body.action === 'begin') taskBegun = true;
			if (body.action === 'end' && taskBegun) taskEnded = true;
			log(`task ${body.action}`);
		} else if (event.event === 'apaevt_status_update' && taskBegun) {
			eventStatus = body;
			if (body.status && body.status !== lastStatus) {
				lastStatus = body.status;
				log(`status: ${body.status}`);
			}
			for (const error of body.errors ?? []) {
				if (!seenErrors.has(error)) {
					seenErrors.add(error);
					log(`error: ${error}`);
				}
			}
		} else if (event.event === 'apaevt_flow') {
			if (body.trace?.error) log(`error in ${(body.pipes ?? []).join(' > ')}: ${body.trace.error}`);
			const param = body.trace?.data?.param;
			if (body.op === 'enter' && param?.op === 'tool.invoke') {
				log(`${body.component} calls tool ${param.tool_name ?? '?'}`); // name only: inputs and outputs can hold personal data
			} else if (body.op === 'enter' && body.trace?.lane && !LIFECYCLE_LANES.has(body.trace.lane)) {
				const step = `${body.component} <- ${body.trace.lane}`;
				if (step !== lastStep) {
					lastStep = step;
					log(step);
				}
			}
			if (body.op === 'end') collectResult(body);
		} else if (event.event === 'output' && consoleLogs) {
			const text = String(body.output ?? '').trim();
			if (text) log(`${body.category ?? 'output'}: ${text}`);
		}
	};

	const client = await connect({ onEvent });
	let token;
	const onSigint = async () => {
		if (token) {
			log('Ctrl-C: terminating the run on the server...');
			await client.terminate(token).catch((error) => log(`terminate failed: ${error?.message ?? error}`));
		}
		await client.disconnect().catch(() => {});
		process.exit(130);
	};
	process.once('SIGINT', onSigint);

	try {
		await client.addMonitor({ projectId: spec.projectId, source: spec.source }, MONITOR_TYPES);
		log(`starting ${spec.relativePath} (project ${spec.projectId}, source ${spec.source})`);
		try {
			// 'full' is the only level whose flow events carry tool calls (trace.data.param.op === 'tool.invoke'),
			// which the demo UI in apps/staffingAgent-ui displays.
			({ token } = await client.use({ filepath: spec.filePath, pipelineTraceLevel: 'full' }));
		} catch (error) {
			return { ok: false, reason: `could not start: ${error?.message ?? error}`, results };
		}
		log('started; following the run until it completes');

		let status;
		let timedOut = false;
		let nextHeartbeat = HEARTBEAT_SECONDS;
		for (;;) {
			const polled = await client.getTaskStatus(token).catch(() => undefined);
			if (polled) status = polled;
			if (status?.completed || taskEnded) break;
			if (elapsed() > RUN_TIMEOUT_SECONDS) {
				timedOut = true;
				log(`still running after ${RUN_TIMEOUT_SECONDS}s: terminating`);
				await client.terminate(token).catch(() => {});
				break;
			}
			if (elapsed() >= nextHeartbeat) {
				log(`still running (status: ${status?.status || lastStatus || 'unknown'})`);
				nextHeartbeat += HEARTBEAT_SECONDS;
			}
			await sleep(POLL_INTERVAL_MS);
		}
		await sleep(1500); // let the final flow and status events arrive
		if (!status?.completed && eventStatus?.completed) status = eventStatus;

		const errors = status?.errors ?? [...seenErrors];
		log(`finished: completed=${status?.completed ?? false} exitCode=${status?.exitCode ?? '?'} ${status?.exitMessage ?? ''}`.trim());
		for (const error of errors) if (!seenErrors.has(error)) log(`error: ${error}`);
		for (const warning of (status?.warnings ?? []).slice(-5)) log(`warning: ${warning}`);
		printResults(spec, results);

		if (timedOut) return { ok: false, reason: `still running after ${RUN_TIMEOUT_SECONDS}s, so it was terminated`, results, status };
		if (!status?.completed) return { ok: false, reason: 'the run ended without a completed status', results, status };
		if ((status.exitCode ?? 0) !== 0) {
			return { ok: false, reason: `exit code ${status.exitCode}${status.exitMessage ? `: ${status.exitMessage}` : ''}`, results, status };
		}
		if (errors.length > 0 && results.length === 0) {
			return { ok: false, reason: `ended with ${errors.length} error(s) and no response. First error: ${errors[0]}`, results, status };
		}
		return { ok: true, results, status };
	} finally {
		process.removeListener('SIGINT', onSigint);
		await client.removeMonitor({ projectId: spec.projectId, source: spec.source }, MONITOR_TYPES).catch(() => {});
		await client.disconnect().catch(() => {});
	}
}
