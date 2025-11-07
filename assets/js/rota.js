import { logAction } from './firebase.js';
import { setupModalInteraction, openConfirmationModal } from './ui.js';
import { getCurrentUser } from './auth.js';

function generateAndDisplayRota(forceRandom = false) {
    const rotaLoading = document.getElementById('rota-loading');
    const rotaContent = document.getElementById('rota-content');
    const rotaTableBody = document.getElementById('rota-table-body');
    
    if (!rotaLoading || !rotaContent || !rotaTableBody) return;

    rotaLoading.style.display = 'block';
    rotaContent.style.display = 'none';

    // Lista fixa de salmistas (a lista real deve ser mantida na autenticação ou em Firebase)
    const salmistasSource = ["ANA BONIN", "ÊNIO HENRIQUE", "WILLIAN FALAVINA", "CAMILA FALAVINA", "JUNIOR CAVALCANTE", "KARLA VANESSA", "KAIO VINICIUS", "JULIO CÉSAR"];

    if (salmistasSource.length < 2) {
        rotaTableBody.innerHTML = '<tr><td colspan="3" class="text-center p-4">São necessários ao menos 2 salmistas.</td></tr>';
        rotaLoading.style.display = 'none';
        rotaContent.style.display = 'block';
        return;
    }

    // Delay para simular carregamento e garantir que o loading apareça
    setTimeout(() => {
        const now = new Date();
        let baseSeed;

        if (forceRandom) {
            baseSeed = Math.random() * 100000;
        } else {
            // Seed baseado no mês/ano para garantir consistência
            const startYear = now.getFullYear();
            const startMonth = now.getMonth();
            baseSeed = startYear * 100 + startMonth;
        }

        // Seeder function
        const seededRandom = (seed) => {
            var x = Math.sin(seed++) * 10000;
            return x - Math.floor(x);
        };
        
        // Fisher-Yates shuffle com seed
        const seededShuffle = (array, seed) => {
            let m = array.length, t, i;
            let currentSeed = seed;

            // Função de randomização interna que usa e incrementa a seed
            const random = () => {
                var x = Math.sin(currentSeed++) * 10000;
                return x - Math.floor(x);
            };

            while (m) {
                i = Math.floor(random() * m--);
                t = array[m];
                array[m] = array[i];
                array[i] = t;
            }
            return array;
        };

        const yearlySalmistaOrder = seededShuffle([...salmistasSource], baseSeed);
        const yearlySubstitutoOrder = seededShuffle([...salmistasSource], baseSeed + 1);

        let salmistaIndex = 0;
        let substitutoIndex = 0;
        rotaTableBody.innerHTML = '';

        for (let i = 0; i < 12; i++) {
            let salmista, substituto;
            let attempts = 0;
            const maxAttempts = salmistasSource.length * salmistasSource.length; // Safety break

            // Garante que o Salmista e o Substituto não sejam a mesma pessoa
            while (attempts < maxAttempts) {
                salmista = yearlySalmistaOrder[salmistaIndex % yearlySalmistaOrder.length];
                substituto = yearlySubstitutoOrder[substitutoIndex % yearlySubstitutoOrder.length];

                if (salmista !== substituto) {
                    salmistaIndex++;
                    substitutoIndex++;
                    break;
                } else {
                    substitutoIndex++; // Tenta o próximo substituto
                }
                attempts++;
            }
            
            // Cria a data do primeiro domingo do mês futuro
            const targetDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const dateOfFirstSunday = (7 - targetDate.getDay()) % 7 + 1;
            targetDate.setDate(dateOfFirstSunday);
            
            const isCurrent = targetDate.getMonth() === now.getMonth() && targetDate.getFullYear() === now.getFullYear();

            rotaTableBody.innerHTML += `
                <tr class="${isCurrent ? 'current-month' : ''}">
                    <td>${targetDate.toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: 'long', year: 'numeric' })}</td>
                    <td class="font-semibold text-brand-dark-blue dark:text-brand-blue">${salmista}</td>
                    <td>${substituto}</td>
                </tr>
            `;
        }

        rotaLoading.style.display = 'none';
        rotaContent.style.display = 'flex';
    }, 50);
}

export function initializeRotaModal() {
    setupModalInteraction('rota-modal', 'open-rota-modal', 'close-rota-modal', () => {
        const regenerateBtn = document.getElementById('regenerate-rota-btn');
        const user = getCurrentUser();
        
        if (user && (user.role === 'admin' || user.role === 'super-admin')) {
            regenerateBtn.classList.remove('hidden');
        } else {
            regenerateBtn.classList.add('hidden');
        }
        
        // Always generate on open, but not randomly unless forced
        generateAndDisplayRota(false); 
    });
    
    document.getElementById('regenerate-rota-btn')?.addEventListener('click', () => {
        openConfirmationModal(
            "Tem certeza que deseja forçar uma nova geração aleatória da Escala de Salmistas?",
            () => {
                 generateAndDisplayRota(true);
                 logAction('Nova Escala Gerada', 'Salmistas', 'Forçou a geração aleatória da escala.');
            }
        );
    });
}