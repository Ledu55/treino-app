// Ficha atual (A/B/C/D). No item 6 do roadmap vira a primeira ficha do novo modelo de dados.
export const workoutNames = {
    A: 'Treino A - Inferiores',
    B: 'Treino B - Superiores',
    C: 'Treino C - Inferiores 2',
    D: 'Treino D - Superiores 2'
};

export const treinos = {
    "A": [
        { nome: "Extensão de Panturrilha Esticada", series: 3, reps: "12 a 15 repetições", descanso: 60, img: "gifs/standing-calf-raise.gif", instrucoes: "Em pé, com as pernas esticadas, eleve os calcanhares o máximo possível e desça controladamente sem tocar o peso. Também pode ser executado no leg press." },
        { nome: "Cadeira Abdutora", series: 3, reps: "10 a 12 repetições", descanso: 90, img: "gifs/hip-abduction-machine.gif", instrucoes: "Sentada, com as pernas apoiadas nas almofadas, afaste as pernas contra a resistência e retorne devagar." },
        { nome: "Cadeira Flexora", series: 2, reps: "10 a 12 repetições", descanso: 90, img: "gifs/seated-leg-curl.gif", instrucoes: "Flexione os joelhos trazendo o calcanhar em direção ao glúteo contra a resistência e retorne controlando o movimento." },
        { nome: "Agachamento", series: 3, reps: "6 a 8 repetições", descanso: 150, img: "gifs/barbell-squat.gif", instrucoes: "Apoie totalmente as costas e a cabeça no encosto, posicionar os pés na plataforma e descer de forma controlada até formar um ângulo de pelo menos 90 graus. Pode escolher a máquina de sua preferência." },
        { nome: "Stiff", series: 3, reps: "8 a 10 repetições", descanso: 120, img: "gifs/barbell-romanian-deadlift.gif", instrucoes: "Desça o tronco flexionando o quadril, mantendo a barra próxima às pernas, e retorne contraindo o glúteo." },
        { nome: "Cadeira Extensora", series: 2, reps: "10 a 12 repetições", descanso: 90, img: "gifs/leg-extension.gif", instrucoes: "Sentada, estenda os joelhos elevando o peso até as pernas ficarem quase retas e desça controladamente." }
    ],
    "B": [
        { nome: "Supino Inclinado Máquina", series: 2, reps: "10 a 12 repetições", descanso: 90, img: "gifs/incline-chest-press-machine.gif", instrucoes: "Sentada no banco inclinado, empurre os handles para cima/frente até quase estender os braços e retorne controlando a descida." },
        { nome: "Remada Unilateral Máquina", series: 2, reps: "10 a 12 repetições", descanso: 90, img: "gifs/seated-row-machine.gif", instrucoes: "Sentada, puxe o handle em direção ao tronco contraindo as costas, um braço de cada vez, controlando a volta." },
        { nome: "Elevação Lateral", incremento: 1, series: 3, reps: "10 a 12 repetições", descanso: 60, img: "gifs/dumbbell-lateral-raise.gif", instrucoes: "Em pé, com halteres ao lado do corpo, eleve os braços lateralmente até a altura dos ombros, cotovelos levemente flexionados, e desça devagar." },
        { nome: "Elevação Frontal Inclinada", incremento: 1, series: 2, reps: "12 a 15 repetições", descanso: 60, img: "gifs/elevacao-frontal-inclinada.gif", instrucoes: "Apoiada no banco inclinado, eleve os halteres à frente até a altura dos ombros e retorne controladamente." },
        { nome: "Triceps Francês", incremento: 1, series: 2, reps: "8 a 10 repetições", descanso: 60, img: "gifs/seated-dumbbell-triceps-extension.gif", instrucoes: "Sentada, segure o halter atrás da cabeça com os dois braços e estenda os cotovelos elevando o peso, controlando a descida." },
        { nome: "Elevação de Pernas", series: 3, reps: "12 a 15 repetições", descanso: 60, img: "gifs/lying-leg-raise.gif", instrucoes: "Deitada, com as pernas esticadas, eleve-as até formar um ângulo de 90° com o tronco e desça sem tocar o chão." }
    ],
    "C": [
        { nome: "Extensão de Panturrilha Esticada", series: 3, reps: "12 a 15 repetições", descanso: 60, img: "gifs/standing-calf-raise.gif", instrucoes: "Em pé, com as pernas esticadas, eleve os calcanhares o máximo possível e desça controladamente sem tocar o peso." },
        { nome: "Cadeira Adutora", series: 2, reps: "12 a 15 repetições", descanso: 90, img: "gifs/hip-adduction-machine.gif", instrucoes: "Sentada, com as pernas apoiadas nas almofadas, aproxime as pernas contra a resistência e retorne devagar." },
        { nome: "Banco Romano com Peso", series: 3, reps: "10 a 12 repetições", descanso: 120, img: "gifs/weighted-back-extension.gif", instrucoes: "Deitada de bruços no banco com o quadril apoiado, segure o peso e flexione o tronco para baixo, retornando até alinhar com as pernas." },
        { nome: "Leg Press", series: 3, reps: "8 a 10 repetições", descanso: 150, img: "gifs/leg-press.gif", instrucoes: "Sentada no aparelho, empurre a plataforma estendendo os joelhos sem travá-los totalmente e retorne controlando a descida." },
        { nome: "Búlgaro", incremento: 1, series: 2, reps: "8 a 10 repetições", descanso: 120, img: "gifs/dumbbell-bulgarian-split-squat.gif", instrucoes: "Com um pé apoiado atrás em um banco e halteres nas mãos, flexione o joelho da frente descendo até quase 90° e suba." },
        { nome: "Cadeira Flexora", series: 2, reps: "10 a 12 repetições", descanso: 90, img: "gifs/seated-leg-curl.gif", instrucoes: "Flexione os joelhos trazendo o calcanhar em direção ao glúteo contra a resistência e retorne controlando o movimento." }
    ],
    "D": [
        { nome: "Desenvolvimento de Ombros", series: 3, reps: "8 a 10 repetições", descanso: 90, img: "gifs/lever-shoulder-press.gif", instrucoes: "Sentada, empurre os pegadores para cima até quase estender os braços acima da cabeça e desça controladamente. Também pode ser feito com halteres." },
        { nome: "Puxador Frontal", series: 3, reps: "8 a 10 repetições", descanso: 90, img: "gifs/lat-pulldown.gif", instrucoes: "Sentada, puxe a barra em direção à parte superior do peito contraindo as costas e retorne controlando a subida." },
        { nome: "Elevação Lateral", incremento: 1, series: 2, reps: "10 a 12 repetições", descanso: 60, img: "gifs/dumbbell-lateral-raise.gif", instrucoes: "Em pé, com halteres ao lado do corpo, eleve os braços lateralmente até a altura dos ombros, cotovelos levemente flexionados, e desça devagar." },
        { nome: "Crucifixo", incremento: 1, series: 2, reps: "10 a 12 repetições", descanso: 90, img: "gifs/dumbbell-fly.gif", instrucoes: "Deitada no banco com halteres, abra os braços lateralmente em arco até sentir alongamento no peito e retorne unindo-os acima do corpo." },
        { nome: "Rosca Alternada", incremento: 1, series: 2, reps: "10 a 12 repetições", descanso: 60, img: "gifs/dumbbell-curl.gif", instrucoes: "Em pé ou sentada, flexione o cotovelo elevando o halter até o ombro, alternando os braços, e desça controladamente." },
        { nome: "Abdominal Máquina", series: 3, reps: "10 a 12 repetições", descanso: 60, img: "gifs/seated-ab-crunch-machine.gif", instrucoes: "Sentada, flexione o tronco contraindo o abdômen contra a resistência e retorne controlando o movimento." }
    ]
};
