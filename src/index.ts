export interface Env {
	LOKI_PUSH_URL: string;
	LOKI_CREDENTIALS?: string;
}

// The live worker has only LOKI_PUSH_URL, with the credentials inside the URL
// (https://user:token@host/…). fetch() doesn't send those by itself, so they
// become the authorization header here. LOKI_CREDENTIALS, when set, wins.
function pushTarget(env: Env): { url: string; headers: Record<string, string> } {
	const headers: Record<string, string> = { 'content-type': 'application/json' };
	const url = new URL(env.LOKI_PUSH_URL);
	if (env.LOKI_CREDENTIALS) {
		headers.authorization = `Basic ${env.LOKI_CREDENTIALS}`;
	} else if (url.username || url.password) {
		const credentials = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;
		headers.authorization = `Basic ${btoa(credentials)}`;
	}
	url.username = '';
	url.password = '';

	return { url: url.toString(), headers };
}

function toLogNanoSeconds(timestamp: number) {
	return (timestamp * 1000000).toLocaleString('fullwide', { useGrouping: false });
}

export default {
	async tail(events: TraceItem[], env: Env, context: ExecutionContext) {
		const data = this.transformEvents(events);
		if (data.streams.length == 0) {
			return;
		}

		const target = pushTarget(env);
		const response = await fetch(target.url, {
			method: 'POST',
			headers: target.headers,
			body: JSON.stringify(data),
		});
		// A refused push must fail the invocation: otherwise lost logs look
		// like success in the worker's own analytics.
		if (!response.ok) {
			throw new Error(`Loki refused the push with status ${response.status}`);
		}
	},

	transformEvents(events: TraceItem[]) {
		const streams: { stream: Record<string, string>; values: [string, string][] }[] = [];
		for (const event of events) {
			this.transformEvent(event).forEach((stream) => streams.push(stream));
		}

		return { streams };
	},

	transformEvent(event: TraceItem) {
		if (!event.scriptName) {
			return [];
		}

		const streams: { stream: Record<string, string>; values: [string, string][] }[] = [];

		const logsByLevel: Record<string, [string, string][]> = {};
		for (const log of event.logs) {
			if (!(log.level in logsByLevel)) {
				logsByLevel[log.level] = [];
			}

			const [logMessage] = log.message;
			if (logMessage) {
				logsByLevel[log.level].push([toLogNanoSeconds(log.timestamp), logMessage]);
			}
		}

		for (const [level, logs] of Object.entries(logsByLevel)) {
			if (level == 'debug') {
				continue;
			}

			streams.push({
				stream: {
					level,
					outcome: event.outcome,
					app: event.scriptName,
				},
				values: logs,
			});
		}

		if (event.exceptions.length) {
			streams.push({
				stream: {
					level: 'error',
					outcome: event.outcome,
					app: event.scriptName,
				},
				values: event.exceptions.map((e) => [toLogNanoSeconds(e.timestamp), `${e.name}: ${e.message}`]),
			});
		}

		// One line for an invocation that didn't end normally, for example a
		// client that disconnected: such an invocation often logs nothing itself.
		if (event.outcome != 'ok' && event.outcome != 'exception') {
			streams.push({
				stream: {
					level: 'warn',
					outcome: event.outcome,
					app: event.scriptName,
				},
				values: [[toLogNanoSeconds(event.eventTimestamp ?? Date.now()), JSON.stringify(describeInvocation(event))]],
			});
		}

		return streams;
	},
};

// Only what identifies the request without its query string: the query holds
// access keys and signatures.
function describeInvocation(event: TraceItem) {
	const line: Record<string, unknown> = { event: 'invocation_ended', outcome: event.outcome };

	const info = event.event as any;
	const request = info?.request;
	if (request) {
		line.method = request.method;
		try {
			const url = new URL(request.url);
			line.host = url.hostname;
			line.path = url.pathname;
		} catch {
			// the line is still useful without the URL
		}
		line.ray = request.headers?.['cf-ray'];
		line.colo = request.cf?.colo;
		line.asn = request.cf?.asn;
		line.country = request.cf?.country;
	}
	if (info?.response?.status !== undefined) {
		line.status = info.response.status;
	}

	return line;
}
