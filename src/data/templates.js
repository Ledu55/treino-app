// Modelos prontos de ficha. Ao escolher um modelo, a pessoa recebe uma cópia com ids novos
// (store.js → createPlan), que pode editar à vontade.

const ex = (exerciseId, series, reps, descanso) => ({ exerciseId, series, reps: `${reps} repetições`, descanso, obs: '' });

export const TEMPLATES = [
    {
        id: 'abcd',
        nome: 'Ficha A/B/C/D',
        descricao: '4 treinos: inferiores e superiores alternados, 6 exercícios cada.',
        treinos: [
            {
                nome: 'Treino A - Inferiores',
                exercicios: [
                    ex('panturrilha-em-pe', 3, '12 a 15', 60),
                    ex('cadeira-abdutora', 3, '10 a 12', 90),
                    ex('cadeira-flexora', 2, '10 a 12', 90),
                    ex('agachamento', 3, '6 a 8', 150),
                    ex('stiff', 3, '8 a 10', 120),
                    ex('cadeira-extensora', 2, '10 a 12', 90)
                ]
            },
            {
                nome: 'Treino B - Superiores',
                exercicios: [
                    ex('supino-inclinado-maquina', 2, '10 a 12', 90),
                    ex('remada-unilateral-maquina', 2, '10 a 12', 90),
                    ex('elevacao-lateral', 3, '10 a 12', 60),
                    ex('elevacao-frontal-inclinada', 2, '12 a 15', 60),
                    ex('triceps-frances', 2, '8 a 10', 60),
                    ex('elevacao-de-pernas', 3, '12 a 15', 60)
                ]
            },
            {
                nome: 'Treino C - Inferiores 2',
                exercicios: [
                    ex('panturrilha-em-pe', 3, '12 a 15', 60),
                    ex('cadeira-adutora', 2, '12 a 15', 90),
                    ex('banco-romano-com-peso', 3, '10 a 12', 120),
                    ex('leg-press', 3, '8 a 10', 150),
                    ex('bulgaro', 2, '8 a 10', 120),
                    ex('cadeira-flexora', 2, '10 a 12', 90)
                ]
            },
            {
                nome: 'Treino D - Superiores 2',
                exercicios: [
                    ex('desenvolvimento-ombros', 3, '8 a 10', 90),
                    ex('puxador-frontal', 3, '8 a 10', 90),
                    ex('elevacao-lateral', 2, '10 a 12', 60),
                    ex('crucifixo', 2, '10 a 12', 90),
                    ex('rosca-alternada', 2, '10 a 12', 60),
                    ex('abdominal-maquina', 3, '10 a 12', 60)
                ]
            }
        ]
    },
    {
        id: 'corpo-inteiro',
        nome: 'Corpo inteiro A/B',
        descricao: 'Para começar: 2 treinos de corpo inteiro, alternados, 2 ou 3 vezes por semana.',
        treinos: [
            {
                nome: 'Treino A',
                exercicios: [
                    ex('leg-press', 3, '10 a 12', 120),
                    ex('supino-inclinado-maquina', 3, '10 a 12', 90),
                    ex('puxador-frontal', 3, '10 a 12', 90),
                    ex('cadeira-flexora', 2, '10 a 12', 90),
                    ex('elevacao-lateral', 2, '12 a 15', 60),
                    ex('prancha', 3, '20 a 40', 60)
                ]
            },
            {
                nome: 'Treino B',
                exercicios: [
                    ex('agachamento-goblet', 3, '10 a 12', 120),
                    ex('remada-baixa', 3, '10 a 12', 90),
                    ex('desenvolvimento-halteres', 3, '10 a 12', 90),
                    ex('elevacao-pelvica', 3, '10 a 12', 90),
                    ex('rosca-alternada', 2, '10 a 12', 60),
                    ex('triceps-corda', 2, '10 a 12', 60)
                ]
            }
        ]
    },
    {
        id: 'abc',
        nome: 'ABC: empurrar, puxar e pernas',
        descricao: '3 treinos: peito/ombros/tríceps, costas/bíceps e pernas/glúteos.',
        treinos: [
            {
                nome: 'Treino A - Peito, ombros e tríceps',
                exercicios: [
                    ex('supino-reto-halteres', 3, '8 a 10', 120),
                    ex('supino-inclinado-maquina', 3, '10 a 12', 90),
                    ex('desenvolvimento-ombros', 3, '8 a 10', 90),
                    ex('elevacao-lateral', 3, '12 a 15', 60),
                    ex('triceps-corda', 3, '10 a 12', 60)
                ]
            },
            {
                nome: 'Treino B - Costas e bíceps',
                exercicios: [
                    ex('puxador-frontal', 3, '8 a 10', 90),
                    ex('remada-baixa', 3, '10 a 12', 90),
                    ex('remada-serrote', 3, '10 a 12', 90),
                    ex('crucifixo-inverso', 2, '12 a 15', 60),
                    ex('rosca-alternada', 3, '10 a 12', 60)
                ]
            },
            {
                nome: 'Treino C - Pernas e glúteos',
                exercicios: [
                    ex('agachamento', 3, '8 a 10', 150),
                    ex('stiff', 3, '8 a 10', 120),
                    ex('elevacao-pelvica', 3, '10 a 12', 90),
                    ex('cadeira-extensora', 2, '10 a 12', 90),
                    ex('cadeira-flexora', 2, '10 a 12', 90),
                    ex('panturrilha-em-pe', 3, '12 a 15', 60)
                ]
            }
        ]
    }
];

export function getTemplate(id) {
    return TEMPLATES.find((t) => t.id === id) || null;
}
