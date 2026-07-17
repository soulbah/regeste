// LiteRT.js embedding spike — GO/NO-GO vs transformers.js.
// Compares EmbeddingGemma on four paths with identical texts and prefixes:
//   A. transformers.js gemma q4 WebGPU (current app path)
//   B. LiteRT.js gemma mixed-precision seq512 WebGPU (ML Drift)
//   C. LiteRT.js same model on XNNPACK CPU (threaded wasm)
//   D. transformers.js multilingual-e5-small q8 WASM (current CPU fallback)
// Drift: cosine(A_i, B_i) per text on 256-d truncated+renormalized vectors,
// plus top-5 retrieval overlap per query between A and B rankings.

import {
	AutoModel,
	AutoTokenizer,
	pipeline,
	type FeatureExtractionPipeline,
	type PreTrainedModel,
	type PreTrainedTokenizer,
	type Tensor as HfTensor
} from '@huggingface/transformers';
import {
	loadLiteRt,
	loadAndCompile,
	Tensor as LrtTensor,
	type CompiledModel
} from '@litertjs/core';

const GEMMA_HF = 'onnx-community/embeddinggemma-300m-ONNX';
const E5_HF = 'Xenova/multilingual-e5-small';
const TFLITE_URL = '/models/embeddinggemma-300M_seq512_mixed-precision.tflite';
const WASM_DIR = '/node_modules/@litertjs/core/wasm/';
const SEQ_LEN = 512;
const DIMS = 256;
const BATCH_SIZE = 16;

const logEl = document.getElementById('log')!;
function log(msg: string) {
	console.log(msg);
	logEl.textContent += msg + '\n';
}

// ---------------------------------------------------------------- corpus

const SEEDS_FR = [
	`Le contrat d'assurance habitation couvre les dommages causés par un incendie, une explosion ou la foudre. La garantie s'applique aux biens mobiliers situés dans le logement assuré, dans la limite du plafond indiqué aux conditions particulières. Une franchise de {N} euros reste à la charge de l'assuré pour chaque sinistre déclaré. Les dommages causés intentionnellement par l'assuré ou avec sa complicité sont exclus de la garantie.`,
	`En cas de dégât des eaux, l'assuré doit prendre toutes les mesures nécessaires pour limiter l'aggravation des dommages et déclarer le sinistre dans un délai de cinq jours ouvrés à compter de sa découverte. La recherche de fuite est prise en charge jusqu'à {N} euros par événement. Les canalisations enterrées situées hors du bâtiment ne sont pas couvertes par la présente garantie.`,
	`La responsabilité civile vie privée garantit les conséquences pécuniaires des dommages corporels, matériels et immatériels causés aux tiers. Le plafond de garantie s'élève à {N} millions d'euros par année d'assurance pour l'ensemble des dommages corporels. Les activités professionnelles exercées à domicile nécessitent une extension de garantie souscrite séparément.`,
	`Le locataire doit souscrire une assurance couvrant les risques locatifs avant la remise des clés. Le loyer mensuel s'élève à {N} euros charges comprises, payable le premier jour de chaque mois. Le dépôt de garantie correspond à un mois de loyer hors charges et sera restitué dans un délai maximal de deux mois après l'état des lieux de sortie.`,
	`La facture numéro {N} établie le douze mars concerne la fourniture et la pose de menuiseries extérieures en aluminium. Le montant total s'élève à quatre mille deux cents euros toutes taxes comprises, dont sept cents euros de taxe sur la valeur ajoutée. Le règlement est exigible à trente jours fin de mois, tout retard entraînant des pénalités calculées au taux légal en vigueur.`,
	`L'assistance rapatriement intervient lorsque l'assuré se trouve à plus de {N} kilomètres de son domicile. Les frais médicaux engagés à l'étranger sont remboursés en complément des prestations servies par les organismes sociaux, dans la limite du plafond contractuel. Une avance sur frais d'hospitalisation peut être consentie sur simple appel au plateau d'assistance.`,
	`Le tableau des garanties précise pour chaque option le montant maximal d'indemnisation, la franchise applicable et le délai de carence. La formule confort inclut le remplacement à neuf du mobilier pendant {N} ans à compter de la date d'achat. Les objets de valeur doivent être déclarés individuellement lorsque leur valeur unitaire dépasse le seuil fixé aux conditions générales.`,
	`La résiliation du contrat peut intervenir à chaque échéance annuelle moyennant un préavis de deux mois notifié par lettre recommandée. Depuis la loi consommation, l'assuré peut résilier à tout moment après la première année, la résiliation prenant effet {N} jours après réception de la notification par l'assureur. La portion de prime correspondant à la période non courue est remboursée.`
];
const SEEDS_EN = [
	`The tenant shall maintain the premises in good repair and shall not make structural alterations without the prior written consent of the landlord. The monthly rent of {N} euros is due on the first day of each month. A late payment charge applies after a grace period of five business days, calculated at the statutory interest rate then in force.`,
	`This service agreement covers preventive maintenance visits scheduled twice per year and unlimited corrective interventions with a guaranteed response time of {N} hours. Spare parts remain the property of the provider until full payment of the corresponding invoice. The agreement renews automatically for successive one-year terms unless terminated with sixty days notice.`,
	`The insurance certificate confirms coverage for professional liability up to {N} million euros per claim and per policy year. The deductible for property damage claims is stated in the special conditions. Claims must be reported within eight days of the insured becoming aware of the circumstances likely to give rise to a claim.`,
	`Invoice number {N} covers consulting services delivered during the month of April, including forty hours of technical analysis and the preparation of the final audit report. Payment is due within thirty days of the invoice date. Any dispute regarding the invoiced amounts must be raised in writing within fifteen days of receipt.`
];

function makePassages(count: number): string[] {
	const out: string[] = [];
	const seeds = [...SEEDS_FR, ...SEEDS_EN];
	for (let i = 0; i < count; i++) {
		const a = seeds[i % seeds.length].replaceAll('{N}', String(100 + ((i * 37) % 900)));
		const b = seeds[(i * 5 + 3) % seeds.length].replaceAll('{N}', String(50 + ((i * 13) % 400)));
		out.push(`${a} ${b}`.slice(0, 1100));
	}
	return out;
}
const QUERIES = [
	'Quelle est la franchise en cas de sinistre incendie ?',
	'Quel est le délai pour déclarer un dégât des eaux ?',
	'Quel est le plafond de la responsabilité civile ?',
	'Quel est le montant du loyer mensuel ?',
	'Quel est le montant total de la facture de menuiseries ?',
	'À partir de quelle distance l assistance rapatriement s applique-t-elle ?',
	'Combien de temps dure le remplacement à neuf du mobilier ?',
	'Comment résilier le contrat après la première année ?',
	'When is the monthly rent due?',
	'What is the guaranteed response time for maintenance?',
	'What is the professional liability coverage limit?',
	'When is the consulting invoice payable?'
];

// ------------------------------------------------- shared vector helpers

function truncNorm(source: Float32Array, sourceDims: number, row = 0): Float32Array {
	const v = new Float32Array(DIMS);
	let norm = 0;
	for (let i = 0; i < DIMS; i++) {
		const x = source[row * sourceDims + i];
		v[i] = x;
		norm += x * x;
	}
	norm = Math.sqrt(norm) || 1;
	for (let i = 0; i < DIMS; i++) v[i] /= norm;
	return v;
}
function cosine(a: Float32Array, b: Float32Array): number {
	let s = 0;
	for (let i = 0; i < a.length; i++) s += a[i] * b[i];
	return s;
}
const prefixGemma = (t: string, kind: 'query' | 'passage') =>
	kind === 'query' ? `task: search result | query: ${t}` : `title: none | text: ${t}`;
const prefixE5 = (t: string, kind: 'query' | 'passage') => `${kind}: ${t}`;

// ------------------------------------------------------- engine: tfjs gemma

let hfTokenizer: PreTrainedTokenizer;
let hfGemma: PreTrainedModel;
async function loadTfjsGemma(): Promise<number> {
	const t0 = performance.now();
	[hfTokenizer, hfGemma] = await Promise.all([
		AutoTokenizer.from_pretrained(GEMMA_HF),
		AutoModel.from_pretrained(GEMMA_HF, { device: 'webgpu', dtype: 'q4' })
	]);
	return performance.now() - t0;
}
async function embedTfjsGemma(texts: string[], kind: 'query' | 'passage'): Promise<Float32Array[]> {
	const out: Float32Array[] = [];
	const prefixed = texts.map((t) => prefixGemma(t, kind));
	for (let i = 0; i < prefixed.length; i += BATCH_SIZE) {
		const batch = prefixed.slice(i, i + BATCH_SIZE);
		const inputs = await hfTokenizer(batch, { padding: true, truncation: true, max_length: 2048 });
		const output = (await hfGemma(inputs)) as unknown as { sentence_embedding: HfTensor };
		const tensor = output.sentence_embedding;
		const dims = tensor.dims[tensor.dims.length - 1];
		const data = tensor.data as Float32Array;
		for (let r = 0; r < batch.length; r++) out.push(truncNorm(data, dims, r));
		tensor.dispose();
	}
	return out;
}

// ---------------------------------------------------------- engine: tfjs e5

let e5: FeatureExtractionPipeline;
async function loadE5(): Promise<number> {
	const t0 = performance.now();
	e5 = (await pipeline('feature-extraction', E5_HF, {
		dtype: 'q8',
		device: 'wasm'
	})) as FeatureExtractionPipeline;
	return performance.now() - t0;
}
async function embedE5(texts: string[], kind: 'query' | 'passage'): Promise<Float32Array[]> {
	const out: Float32Array[] = [];
	const prefixed = texts.map((t) => prefixE5(t, kind));
	for (let i = 0; i < prefixed.length; i += BATCH_SIZE) {
		const batch = prefixed.slice(i, i + BATCH_SIZE);
		const tensor = await e5(batch, { pooling: 'mean', normalize: true });
		const dims = tensor.dims[tensor.dims.length - 1];
		const data = tensor.data as Float32Array;
		for (let r = 0; r < batch.length; r++) {
			out.push(new Float32Array(data.subarray(r * dims, (r + 1) * dims)));
		}
		tensor.dispose();
	}
	return out;
}

// ------------------------------------------------------- engines: LiteRT.js

let litertLoaded = false;
let modelBytes: Uint8Array | null = null;
const lrtModels: Partial<Record<'webgpu' | 'wasm', CompiledModel>> = {};
let lrtInputNames: string[] = [];

async function loadLitert(accel: 'webgpu' | 'wasm', numThreads?: number): Promise<number> {
	const t0 = performance.now();
	if (!hfTokenizer) hfTokenizer = await AutoTokenizer.from_pretrained(GEMMA_HF);
	if (!litertLoaded) {
		await loadLiteRt(WASM_DIR, { threads: crossOriginIsolated });
		litertLoaded = true;
		log(`litert wasm runtime loaded (threads=${crossOriginIsolated})`);
	}
	if (!modelBytes) {
		modelBytes = new Uint8Array(await (await fetch(TFLITE_URL)).arrayBuffer());
		log(`tflite fetched: ${(modelBytes.length / 1e6).toFixed(1)} MB`);
	}
	const model = await loadAndCompile(modelBytes, {
		accelerator: accel,
		...(accel === 'wasm' && numThreads ? { cpuOptions: { numThreads } } : {})
	});
	lrtModels[accel] = model;
	const ins = model.getInputDetails();
	const outs = model.getOutputDetails();
	lrtInputNames = ins.map((d) => d.name);
	log(
		`litert ${accel} inputs: ${ins.map((d) => `${d.name}${JSON.stringify([...d.shape])}:${d.dtype}`).join(', ')} | outputs: ${outs.map((d) => `${d.name}${JSON.stringify([...d.shape])}:${d.dtype}`).join(', ')} | fullyAccelerated=${model.isFullyAccelerated}`
	);
	return performance.now() - t0;
}

async function tokenizeForLitert(text: string): Promise<{ ids: Int32Array; mask: Int32Array }> {
	const enc = await hfTokenizer([text], { padding: false, truncation: true, max_length: SEQ_LEN });
	const rawIds = enc.input_ids.data as BigInt64Array | Int32Array;
	const ids = new Int32Array(SEQ_LEN); // pad id 0
	const mask = new Int32Array(SEQ_LEN);
	const n = Math.min(rawIds.length, SEQ_LEN);
	for (let i = 0; i < n; i++) {
		ids[i] = Number(rawIds[i]);
		mask[i] = 1;
	}
	return { ids, mask };
}

async function embedLitert(
	texts: string[],
	kind: 'query' | 'passage',
	accel: 'webgpu' | 'wasm'
): Promise<Float32Array[]> {
	const model = lrtModels[accel]!;
	const out: Float32Array[] = [];
	for (const raw of texts) {
		const { ids, mask } = await tokenizeForLitert(prefixGemma(raw, kind));
		const input: Record<string, LrtTensor> = {};
		const idsT = new LrtTensor(ids, [1, SEQ_LEN]);
		const maskT = new LrtTensor(mask, [1, SEQ_LEN]);
		let usedMask = false;
		for (const name of lrtInputNames) {
			if (/mask/i.test(name)) {
				input[name] = maskT;
				usedMask = true;
			} else input[name] = idsT;
		}
		const outputs = await model.run(input);
		const first = Object.values(outputs)[0];
		const data = (await first.data()) as Float32Array;
		const dims = data.length; // batch 1
		out.push(truncNorm(data, dims, 0));
		for (const t of Object.values(outputs)) t.delete();
		idsT.delete();
		if (!usedMask) maskT.delete();
	}
	return out;
}

// ----------------------------------------------------------------- bench

interface EngineResult {
	loadMs?: number;
	passagesMs?: number;
	passagesPerSec?: number;
	est470s?: number;
	queryP50Ms?: number;
	error?: string;
}

async function timeQueries(embed: (t: string[]) => Promise<Float32Array[]>): Promise<number> {
	const times: number[] = [];
	for (let i = 0; i < 9; i++) {
		const t0 = performance.now();
		await embed([QUERIES[i % QUERIES.length]]);
		times.push(performance.now() - t0);
	}
	times.sort((a, b) => a - b);
	return times[Math.floor(times.length / 2)];
}

async function benchEngine(
	name: string,
	passages: string[],
	load: () => Promise<number>,
	embed: (t: string[], kind: 'query' | 'passage') => Promise<Float32Array[]>
): Promise<{ result: EngineResult; passageVecs?: Float32Array[]; queryVecs?: Float32Array[] }> {
	const result: EngineResult = {};
	try {
		result.loadMs = Math.round(await load());
		log(`${name}: loaded in ${result.loadMs} ms`);
		await embed(passages.slice(0, 4), 'passage'); // warmup
		const t0 = performance.now();
		const passageVecs = await embed(passages, 'passage');
		result.passagesMs = Math.round(performance.now() - t0);
		result.passagesPerSec = +(passages.length / (result.passagesMs / 1000)).toFixed(2);
		result.est470s = +(470 / result.passagesPerSec).toFixed(1);
		const queryVecs = await embed(QUERIES, 'query');
		result.queryP50Ms = +(await timeQueries((t) => embed(t, 'query'))).toFixed(1);
		log(
			`${name}: ${passages.length} passages in ${result.passagesMs} ms → ${result.passagesPerSec}/s (470 chunks ≈ ${result.est470s}s) | query p50 ${result.queryP50Ms} ms`
		);
		return { result, passageVecs, queryVecs };
	} catch (err) {
		result.error = String(err);
		log(`${name}: FAILED ${result.error}`);
		return { result };
	}
}

function drift(
	a: { passageVecs?: Float32Array[]; queryVecs?: Float32Array[] },
	b: { passageVecs?: Float32Array[]; queryVecs?: Float32Array[] }
) {
	if (!a.passageVecs || !b.passageVecs || !a.queryVecs || !b.queryVecs) return null;
	const cos: number[] = [];
	for (let i = 0; i < a.passageVecs.length; i++)
		cos.push(cosine(a.passageVecs[i], b.passageVecs[i]));
	for (let i = 0; i < a.queryVecs.length; i++) cos.push(cosine(a.queryVecs[i], b.queryVecs[i]));
	const sorted = [...cos].sort((x, y) => x - y);
	const mean = cos.reduce((s, x) => s + x, 0) / cos.length;
	// top-5 retrieval overlap per query, A-ranking vs B-ranking
	let overlap = 0;
	for (let q = 0; q < a.queryVecs.length; q++) {
		const rank = (qv: Float32Array, ps: Float32Array[]) =>
			ps
				.map((p, i) => ({ i, s: cosine(qv, p) }))
				.sort((x, y) => y.s - x.s)
				.slice(0, 5)
				.map((x) => x.i);
		const ta = new Set(rank(a.queryVecs[q], a.passageVecs));
		const tb = rank(b.queryVecs[q], b.passageVecs);
		overlap += tb.filter((i) => ta.has(i)).length / 5;
	}
	return {
		meanCos: +mean.toFixed(4),
		minCos: +sorted[0].toFixed(4),
		p5Cos: +sorted[Math.floor(sorted.length * 0.05)].toFixed(4),
		top5Overlap: +(overlap / a.queryVecs.length).toFixed(3)
	};
}

async function run(passageCount = 128) {
	const env = {
		crossOriginIsolated,
		cores: navigator.hardwareConcurrency,
		webgpu: !!(navigator as unknown as { gpu?: unknown }).gpu,
		ua: navigator.userAgent
	};
	log(JSON.stringify(env));
	const passages = makePassages(passageCount);

	const tfjsGemma = await benchEngine('tfjs-gemma-webgpu', passages, loadTfjsGemma, embedTfjsGemma);
	const lrtGpu = await benchEngine(
		'litert-gemma-webgpu',
		passages,
		() => loadLitert('webgpu'),
		(t, k) => embedLitert(t, k, 'webgpu')
	);
	const threads = Math.min(Math.max(2, (navigator.hardwareConcurrency || 4) - 2), 8);
	const lrtCpu = await benchEngine(
		'litert-gemma-cpu',
		passages,
		() => loadLitert('wasm', threads),
		(t, k) => embedLitert(t, k, 'wasm')
	);
	const e5r = await benchEngine('tfjs-e5-wasm', passages, loadE5, embedE5);

	const results = {
		env,
		threads,
		engines: {
			'tfjs-gemma-webgpu': tfjsGemma.result,
			'litert-gemma-webgpu': lrtGpu.result,
			'litert-gemma-cpu': lrtCpu.result,
			'tfjs-e5-wasm': e5r.result
		},
		driftGpu: drift(tfjsGemma, lrtGpu),
		driftCpu: drift(tfjsGemma, lrtCpu)
	};
	log('RESULTS ' + JSON.stringify(results, null, 1));
	(window as unknown as Record<string, unknown>).spikeResults = results;
	return results;
}

(window as unknown as Record<string, unknown>).spikeRun = run;
log('ready — call spikeRun(128) from the console/CDP');
