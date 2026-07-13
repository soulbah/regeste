import { E5_EMBEDDING_MODEL, GEMMA_EMBEDDING_MODEL } from '$lib/pipeline/embed-model';

export interface SemanticCalibrationProfile {
	version: 1;
	model: string;
	dims: number;
	prototypeVersion: number;
	minScore: number;
	minMargin: number;
	predictionSetRadius: number;
	calibrationCases: number;
	note: string;
}

const PROFILES: readonly SemanticCalibrationProfile[] = [
	{
		version: 1,
		model: GEMMA_EMBEDDING_MODEL,
		dims: 256,
		prototypeVersion: 3,
		minScore: 0.42,
		minMargin: 0.03,
		predictionSetRadius: 0.03,
		calibrationCases: 120,
		note: 'Browser-held-out calibration, corpus v1'
	},
	{
		version: 1,
		model: E5_EMBEDDING_MODEL,
		dims: 384,
		prototypeVersion: 3,
		minScore: 0.5,
		minMargin: 0.08,
		predictionSetRadius: 0.03,
		calibrationCases: 0,
		note: 'Conservative registered fallback; recalibration required before route mutation'
	}
] as const;

export function semanticProfileKey(model: string, dims: number, prototypeVersion: number): string {
	return `${prototypeVersion}:${model}:${dims}`;
}

export function getSemanticCalibration(
	model: string,
	dims: number,
	prototypeVersion: number
): SemanticCalibrationProfile | null {
	const profile = PROFILES.find(
		(item) =>
			item.model === model && item.dims === dims && item.prototypeVersion === prototypeVersion
	);
	return profile && profile.calibrationCases > 0 ? profile : null;
}
