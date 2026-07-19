// WebLLM downloads its weights from huggingface.co and its model libs from
// raw.githubusercontent.com. Both are cross-origin and fail under the
// cross-origin isolation Private mode requires (see routes/cdn). Rewrite every
// model record so those files load through our same-origin /cdn proxy instead.

import { prebuiltAppConfig, type AppConfig } from '@mlc-ai/web-llm';

function proxied(rawUrl: string, origin: string): string {
	try {
		const url = new URL(rawUrl);
		if (url.origin === origin) return rawUrl; // already same-origin
		return `${origin}/cdn/${url.host}${url.pathname}${url.search}`;
	} catch {
		return rawUrl; // relative or malformed — leave it
	}
}

/** prebuiltAppConfig with every weights/lib URL routed through /cdn. */
export function proxiedAppConfig(origin: string): AppConfig {
	return {
		...prebuiltAppConfig,
		model_list: prebuiltAppConfig.model_list.map((record) => ({
			...record,
			model: proxied(record.model, origin),
			model_lib: proxied(record.model_lib, origin)
		}))
	};
}
