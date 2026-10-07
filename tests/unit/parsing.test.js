import { describe, expect, it } from 'vitest';
import * as app from '../../src/progression.js';

describe('parseRepRange', () => {
    it('lê a faixa "X a Y repetições"', () => {
        expect({ ...app.parseRepRange('10 a 12 repetições') }).toEqual({ min: 10, max: 12 });
        expect({ ...app.parseRepRange('6 a 8 repetições') }).toEqual({ min: 6, max: 8 });
    });

    it('aceita espaços variados', () => {
        expect({ ...app.parseRepRange('8a10') }).toEqual({ min: 8, max: 10 });
    });

    it('devolve null quando não há faixa', () => {
        expect(app.parseRepRange('até a falha')).toBeNull();
        expect(app.parseRepRange('12 repetições')).toBeNull();
        expect(app.parseRepRange('')).toBeNull();
        expect(app.parseRepRange(undefined)).toBeNull();
    });
});

describe('parseNumber', () => {
    it('lê inteiros e decimais com vírgula ou ponto', () => {
        expect(app.parseNumber('40')).toBe(40);
        expect(app.parseNumber('22,5')).toBe(22.5);
        expect(app.parseNumber('22.5')).toBe(22.5);
    });

    it('pega o primeiro número de um texto livre', () => {
        expect(app.parseNumber('22,5kg')).toBe(22.5);
        expect(app.parseNumber(' 8 reps')).toBe(8);
        expect(app.parseNumber('10 + 10')).toBe(10);
    });

    it('devolve NaN quando não há número', () => {
        expect(app.parseNumber('')).toBeNaN();
        expect(app.parseNumber('kg')).toBeNaN();
        expect(app.parseNumber(null)).toBeNaN();
        expect(app.parseNumber(undefined)).toBeNaN();
    });
});
