// D2 (spec 011): FR/EN detection by stopword counts — no model, no network.
// Good enough to badge documents and warn about uncovered languages later.

const FR = new Set(
	'le la les un une des du de et est sont dans pour que qui pas sur avec ce cette ses son sa mais ou où donc car ne se au aux par plus sans être avoir été fait comme tout tous elle il ils nous vous leur leurs'.split(
		' '
	)
);
const EN = new Set(
	'the a an and is are in for that which not on with this these its his her but or so because no be have been done as all every she he they we you their of to from at by it was were will would can could'.split(
		' '
	)
);

export function detectLanguage(text: string): 'fr' | 'en' | null {
	const words = text
		.slice(0, 2500)
		.toLowerCase()
		.split(/[^\p{L}']+/u)
		.filter(Boolean);
	if (words.length < 10) return null;
	let fr = 0;
	let en = 0;
	for (const w of words) {
		if (FR.has(w)) fr++;
		if (EN.has(w)) en++;
	}
	const total = fr + en;
	if (total < words.length * 0.05) return null;
	if (fr > en * 1.3) return 'fr';
	if (en > fr * 1.3) return 'en';
	return null;
}
