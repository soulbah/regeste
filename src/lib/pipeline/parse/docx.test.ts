import { describe, expect, it } from 'vitest';
import { tableRowContext } from './docx';

describe('DOCX table retrieval context', () => {
	it('repeats headers on every data row without changing row source text', () => {
		expect(
			tableRowContext(['Référence', 'Capacité', 'Classe'], ['BX-77', '42 kg', 'renforcée'])
		).toBe('Référence: BX-77 | Capacité: 42 kg | Classe: renforcée');
	});
});
