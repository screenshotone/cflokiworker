export interface Env {
	LOKI_PUSH_URL: string;
}

export default {
	async tail(events: TraceItem[], env: Env) {
		const data = this.transformEvents(events);
		if (data.streams.length == 0) {
			return;
		}

		fetch(env.LOKI_PUSH_URL, {
			method: 'POST',
			body: JSON.stringify(data),
		});
	},

	transformEvents(events: TraceItem[]) {
		const streams: { stream: Record<string, string>; values: [string, string][] }[] = [];
		for (const event of events) {
			this.transformEvent(event).forEach((stream) => streams.push(stream));
		}

		return { streams };
	},

	transformEvent(event: TraceItem) {
		if (!(event.outcome == 'ok' || event.outcome == 'exception') || !event.scriptName) {
			return [];
		}

		const streams: { stream: Record<string, string>; values: [string, string][] }[] = [];

		const logsByLevel: Record<string, [string, string][]> = {};
		for (const log of event.logs) {
			if (!(log.level in logsByLevel)) {
				logsByLevel[log.level] = [];
			}
			logsByLevel[log.level].push([(log.timestamp * 100000).toString(), log.message]);
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
				values: event.exceptions.map((e) => [(e.timestamp * 100000).toString(), `${e.name}: ${e.message}`]),
			});
		}

		return streams;
	},
};
