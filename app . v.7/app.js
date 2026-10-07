/**
 * Enterprise Real Estate SaaS - Core Application Logic
 * Principal UI/UX Frontend Engineer Implementation
 */

// ==========================================
// 1. GLOBAL STATE MANAGEMENT
// ==========================================
const AppState = {
    kpis: {
        activeDeals: 1248,
        todayRevenue: 4200000
    },
    pipeline: [
        { id: 'd1', client: 'Ahmed Hassan', property: 'Skyline Villa', value: 12500000, stage: 'leads' },
        { id: 'd2', client: 'Sara Kamel', property: 'Commercial Hub', value: 8400000, stage: 'qualified' },
        { id: 'd3', client: 'Omar Youssef', property: 'Sea View Chalet', value: 3200000, stage: 'negotiation' },
        { id: 'd4', client: 'Nour El-Din', property: 'Penthouse A1', value: 25000000, stage: 'closing' }
    ],
    inventory: [
        { id: 'p1', title: 'Skyline Villa', type: 'Residential', price: 12500000, location: 'New Capital', status: 'Available' },
        { id: 'p2', title: 'Commercial Hub Office', type: 'Commercial', price: 8400000, location: 'Zayed', status: 'Reserved' },
        { id: 'p3', title: 'Sea View Chalet', type: 'Coastal', price: 3200000, location: 'North Coast', status: 'Available' },
        { id: 'p4', title: 'Penthouse A1', type: 'Residential', price: 25000000, location: 'Tagamoa', status: 'Sold' }
    ],
    cil: [
        { id: 'c1', broker: 'Remax Elite', clientName: 'Mahmoud Zaki', project: 'Skyline', timestamp: Date.now() + 86400000 },
        { id: 'c2', broker: 'Coldwell Banker', clientName: 'Laila Tarek', project: 'Sea View', timestamp: Date.now() + 3600000 }
    ],
    timers: [] // To clear CIL intervals on view change
};

// ==========================================
// 2. STATE SYNCHRONIZATION & UI UPDATES
// ==========================================
const formatCurrency = (val) => '$' + (val / 1000000).toFixed(1) + 'M';

function updateHeaderKPIs() {
    // Select KPI elements based on the HTML structure provided previously
    const kpiValues = document.querySelectorAll('.flex.flex-col.items-end span.font-medium.leading-none.mt-1');
    if (kpiValues.length >= 2) {
        kpiValues[0].textContent = AppState.kpis.activeDeals.toLocaleString();
        kpiValues[1].textContent = formatCurrency(AppState.kpis.todayRevenue);
    }
}

// ==========================================
// 3. DYNAMIC RENDERING MODULES
// ==========================================
const Views = {
    // --- MODULE: ACTION CENTER ---
    'action-center': () => `
        <div class="flex justify-between items-end mb-8">
            <div>
                <h1 class="text-2xl font-semibold tracking-tight text-white mb-1">Action Center</h1>
                <p class="text-sm text-textMuted">Real-time overview of pending tasks, alerts, and system health.</p>
            </div>
            <button class="px-4 py-2 text-sm font-medium rounded-md bg-primary text-white hover:bg-primaryHover transition-all shadow-lg shadow-primary/20">
                <i class="fa-solid fa-rotate mr-2"></i> Refresh SLA
            </button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div class="bg-surface border border-red-500/30 rounded-xl p-5 relative overflow-hidden">
                <div class="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                <h3 class="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1">Urgent SLA Breach</h3>
                <p class="text-white font-medium">3 Contracts pending signature > 48h</p>
                <button class="mt-3 text-xs bg-red-500/10 text-red-400 px-3 py-1.5 rounded hover:bg-red-500/20">Escalate to Legal</button>
            </div>
            <div class="bg-surface border border-yellow-500/30 rounded-xl p-5 relative overflow-hidden">
                <div class="absolute top-0 left-0 w-1 h-full bg-yellow-500"></div>
                <h3 class="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-1">High Priority Clients</h3>
                <p class="text-white font-medium">VIP Client 'Ahmed Hassan' requested callback</p>
                <button class="mt-3 text-xs bg-yellow-500/10 text-yellow-400 px-3 py-1.5 rounded hover:bg-yellow-500/20">Action Now</button>
            </div>
            <div class="bg-surface border border-green-500/30 rounded-xl p-5 relative overflow-hidden">
                <div class="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                <h3 class="text-xs font-semibold text-green-400 uppercase tracking-wider mb-1">System Health</h3>
                <p class="text-white font-medium">All Microservices operational</p>
                <p class="mt-2 text-xs text-textMuted">Latency: 42ms | Uptime: 99.99%</p>
            </div>
        </div>
    `,

    // --- MODULE: SALES PIPELINE (KANBAN) ---
    'sales-pipeline': () => {
        const stages = ['leads', 'qualified', 'negotiation', 'closing'];
        const stageTitles = { leads: 'New Leads', qualified: 'Qualified', negotiation: 'Negotiation', closing: 'Closing' };
        
        let boardHtml = `<div class="flex justify-between items-end mb-6">
                            <div><h1 class="text-2xl font-semibold text-white">Sales Pipeline</h1></div>
                         </div>
                         <div class="grid grid-cols-4 gap-4 h-[calc(100vh-200px)]">`;
        
        stages.forEach(stage => {
            const items = AppState.pipeline.filter(d => d.stage === stage);
            const totalStageValue = items.reduce((sum, d) => sum + d.value, 0);
            
            boardHtml += `
                <div class="bg-surface/50 border border-borderline rounded-xl p-3 flex flex-col">
                    <div class="flex justify-between items-center mb-4 px-1">
                        <h3 class="text-sm font-semibold text-textMain">${stageTitles[stage]}</h3>
                        <span class="text-xs text-textMuted">${formatCurrency(totalStageValue)}</span>
                    </div>
                    <div class="flex-1 overflow-y-auto space-y-3">
                        ${items.map(deal => `
                            <div class="bg-elevated border border-borderline p-3 rounded-lg shadow-sm hover:border-primary/50 transition-colors group cursor-pointer">
                                <h4 class="text-sm font-medium text-white mb-1">${deal.client}</h4>
                                <p class="text-xs text-textMuted mb-3"><i class="fa-solid fa-building mr-1"></i>${deal.property}</p>
                                <div class="flex justify-between items-center">
                                    <span class="text-xs font-semibold text-primary">$${(deal.value/1000000).toFixed(1)}M</span>
                                    ${stage !== 'closing' ? `<button data-action="move-deal" data-id="${deal.id}" class="text-xs bg-surface border border-borderline px-2 py-1 rounded hover:bg-primary hover:text-white transition-colors">Move <i class="fa-solid fa-arrow-right ml-1"></i></button>` : `<span class="text-xs text-green-400"><i class="fa-solid fa-check"></i> Won</span>`}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });
        boardHtml += `</div>`;
        return boardHtml;
    },

    // --- MODULE: PROPERTY INVENTORY ---
    'property-inventory': () => `
        <div class="flex justify-between items-end mb-6">
            <h1 class="text-2xl font-semibold text-white">Property Inventory</h1>
            <div class="flex gap-2">
                <select class="bg-elevated text-sm border border-borderline text-textMain rounded px-3 py-1.5 focus:outline-none focus:border-primary">
                    <option>All Types</option>
                    <option>Residential</option>
                    <option>Commercial</option>
                </select>
            </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            ${AppState.inventory.map(prop => `
                <div class="bg-surface border border-borderline rounded-xl overflow-hidden group hover:border-primary/50 transition-all">
                    <div class="h-32 bg-elevated relative">
                        <div class="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                        <div class="absolute top-2 right-2 bg-base/80 backdrop-blur px-2 py-1 rounded text-[10px] font-semibold uppercase ${prop.status === 'Available' ? 'text-green-400' : prop.status === 'Reserved' ? 'text-yellow-400' : 'text-red-400'}">${prop.status}</div>
                    </div>
                    <div class="p-4">
                        <h3 class="text-sm font-medium text-white mb-1 truncate">${prop.title}</h3>
                        <p class="text-xs text-textMuted mb-3"><i class="fa-solid fa-location-dot mr-1"></i>${prop.location} • ${prop.type}</p>
                        <div class="text-sm font-semibold text-primary">$${prop.price.toLocaleString()}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `,

    // --- MODULE: CIL RADAR ---
    'cil-radar': () => `
        <div class="mb-6">
            <h1 class="text-2xl font-semibold text-white mb-1">CIL Radar (Client Information Lead)</h1>
            <p class="text-sm text-textMuted">Protect broker leads and manage expiration timers.</p>
        </div>
        <div class="bg-surface border border-borderline rounded-xl overflow-hidden">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-elevated border-b border-borderline text-xs uppercase text-textMuted tracking-wider">
                        <th class="p-4 font-medium">Client Name</th>
                        <th class="p-4 font-medium">Brokerage</th>
                        <th class="p-4 font-medium">Project</th>
                        <th class="p-4 font-medium text-right">Protection Timer</th>
                    </tr>
                </thead>
                <tbody>
                    ${AppState.cil.map(lead => `
                        <tr class="border-b border-borderline/50 hover:bg-white/5 transition-colors">
                            <td class="p-4 text-sm font-medium text-white">${lead.clientName}</td>
                            <td class="p-4 text-sm text-textMuted"><i class="fa-solid fa-handshake text-primary/50 mr-2"></i>${lead.broker}</td>
                            <td class="p-4 text-sm text-textMuted">${lead.project}</td>
                            <td class="p-4 text-sm font-mono text-right text-yellow-400 cil-timer" data-expire="${lead.timestamp}">Loading...</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `,

    // --- MODULE: FINANCIAL ENGINE ---
    'financial-engine': () => `
        <div class="mb-6">
            <h1 class="text-2xl font-semibold text-white mb-1">Financial Engine</h1>
            <p class="text-sm text-textMuted">Advanced installment algorithms and commission splitting.</p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div class="bg-surface border border-borderline rounded-xl p-6">
                <h3 class="text-sm font-semibold text-textMain mb-4 border-b border-borderline pb-2">Deal Parameters</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-xs text-textMuted mb-1">Total Unit Price (EGP)</label>
                        <input type="number" id="fin-price" value="10000000" class="w-full bg-elevated border border-borderline rounded-md px-3 py-2 text-white focus:outline-none focus:border-primary">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs text-textMuted mb-1">Downpayment (%)</label>
                            <input type="number" id="fin-dp" value="10" class="w-full bg-elevated border border-borderline rounded-md px-3 py-2 text-white focus:outline-none focus:border-primary">
                        </div>
                        <div>
                            <label class="block text-xs text-textMuted mb-1">Duration (Years)</label>
                            <input type="number" id="fin-years" value="7" class="w-full bg-elevated border border-borderline rounded-md px-3 py-2 text-white focus:outline-none focus:border-primary">
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs text-textMuted mb-1">Broker Commission (%)</label>
                        <input type="number" id="fin-comm" value="5" class="w-full bg-elevated border border-borderline rounded-md px-3 py-2 text-white focus:outline-none focus:border-primary">
                    </div>
                    <button data-action="calc-finance" class="w-full mt-2 bg-primary text-white py-2 rounded-md hover:bg-primaryHover transition-colors font-medium text-sm">Calculate Engine</button>
                </div>
            </div>
            <div class="bg-elevated border border-borderline rounded-xl p-6 flex flex-col justify-center relative overflow-hidden">
                <div class="absolute -right-10 -top-10 text-[100px] text-white/[0.02]"><i class="fa-solid fa-chart-pie"></i></div>
                <h3 class="text-sm font-semibold text-textMain mb-6">Execution Results</h3>
                <div id="fin-results" class="space-y-5 relative z-10 opacity-50">
                    <div>
                        <p class="text-xs text-textMuted">Downpayment Amount</p>
                        <p class="text-xl font-semibold text-white" id="res-dp">---</p>
                    </div>
                    <div>
                        <p class="text-xs text-textMuted">Monthly Installment</p>
                        <p class="text-xl font-semibold text-primary" id="res-month">---</p>
                    </div>
                    <div class="pt-4 border-t border-borderline">
                        <p class="text-xs text-textMuted">Broker Commission Split</p>
                        <p class="text-xl font-semibold text-green-400" id="res-comm">---</p>
                    </div>
                </div>
            </div>
        </div>
    `,

    // --- MODULE: AI VOICE SIMULATOR ---
    'ai-voice-simulator': () => `
        <div class="mb-6">
            <h1 class="text-2xl font-semibold text-white mb-1 flex items-center gap-3">
                AI Voice Simulator <span class="bg-purple-500/20 text-purple-400 text-[10px] px-2 py-0.5 rounded border border-purple-500/30">NLP Beta</span>
            </h1>
            <p class="text-sm text-textMuted">Simulate extracting structured CRM data from unstructured sales voice notes.</p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div class="bg-surface border border-borderline rounded-xl p-6 flex flex-col">
                <h3 class="text-sm font-semibold text-textMain mb-4">Input Voice Note Transcription</h3>
                <textarea id="ai-input" class="w-full flex-1 bg-elevated border border-borderline rounded-md p-4 text-sm text-white focus:outline-none focus:border-purple-500 resize-none mb-4" placeholder="Example: Client called, his name is Youssef. He is looking for a 3-bedroom villa in New Capital, budget around 15 million. Contact him tomorrow."></textarea>
                <button data-action="run-ai" class="w-full bg-purple-600 text-white py-2.5 rounded-md hover:bg-purple-500 transition-colors font-medium text-sm flex justify-center items-center gap-2">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Process via AI
                </button>
            </div>
            <div class="bg-surface border border-borderline rounded-xl p-6 relative">
                <div id="ai-overlay" class="absolute inset-0 bg-base/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center hidden rounded-xl">
                    <i class="fa-solid fa-circle-notch fa-spin text-purple-500 text-3xl mb-3"></i>
                    <span class="text-sm text-purple-300">Extracting Entities...</span>
                </div>
                <h3 class="text-sm font-semibold text-textMain mb-4 border-b border-borderline pb-2">Structured Output Payload</h3>
                <pre id="ai-output" class="text-xs font-mono text-textMuted bg-elevated p-4 rounded-md overflow-x-auto h-[250px]">Waiting for input...</pre>
            </div>
        </div>
    `
};

// ==========================================
// 4. ACTION CONTROLLERS & LOGIC
// ==========================================

function handleKanbanMove(dealId) {
    const deal = AppState.pipeline.find(d => d.id === dealId);
    if(!deal) return;

    const stages = ['leads', 'qualified', 'negotiation', 'closing'];
    const currentIndex = stages.indexOf(deal.stage);
    
    if (currentIndex < stages.length - 1) {
        deal.stage = stages[currentIndex + 1];
        
        // If moved to closing, update revenue KPI
        if (deal.stage === 'closing') {
            AppState.kpis.todayRevenue += deal.value;
            updateHeaderKPIs();
        }
        
        // Re-render pipeline
        document.getElementById('main-content-view').innerHTML = Views['sales-pipeline']();
    }
}

function calculateFinancials() {
    const price = parseFloat(document.getElementById('fin-price').value);
    const dpPercent = parseFloat(document.getElementById('fin-dp').value);
    const years = parseFloat(document.getElementById('fin-years').value);
    const commPercent = parseFloat(document.getElementById('fin-comm').value);

    if(!price || !dpPercent || !years) return;

    const dpAmount = price * (dpPercent / 100);
    const remaining = price - dpAmount;
    const months = years * 12;
    const monthlyInst = remaining / months;
    const commission = price * (commPercent / 100);

    const formatEGP = (num) => 'EGP ' + num.toLocaleString(undefined, { maximumFractionDigits: 0 });

    document.getElementById('res-dp').textContent = formatEGP(dpAmount);
    document.getElementById('res-month').textContent = formatEGP(monthlyInst);
    document.getElementById('res-comm').textContent = formatEGP(commission);
    
    document.getElementById('fin-results').classList.remove('opacity-50');
}

function runAiSimulation() {
    const input = document.getElementById('ai-input').value;
    if(!input.trim()) return;

    const overlay = document.getElementById('ai-overlay');
    const output = document.getElementById('ai-output');
    
    overlay.classList.remove('hidden');
    
    // Simulate API delay and processing
    setTimeout(() => {
        const mockResponse = {
            status: "success",
            confidence_score: 0.94,
            extracted_entities: {
                client_name: input.match(/name is (\w+)/i) ? input.match(/name is (\w+)/i)[1] : "Unknown",
                property_type: input.toLowerCase().includes('villa') ? 'Villa' : 'Apartment',
                location: input.toLowerCase().includes('capital') ? 'New Capital' : 'Unspecified',
                budget_est: input.match(/(\d+)\s*million/i) ? parseInt(input.match(/(\d+)\s*million/i)[1]) * 1000000 : null,
                action_required: "Callback",
                urgency: "High"
            },
            raw_intent: "Property Purchase Query"
        };
        
        output.textContent = JSON.stringify(mockResponse, null, 2);
        output.classList.replace('text-textMuted', 'text-green-400');
        overlay.classList.add('hidden');
    }, 1500);
}

function startCilTimers() {
    // Clear old intervals
    AppState.timers.forEach(t => clearInterval(t));
    AppState.timers = [];

    const updateUI = () => {
        document.querySelectorAll('.cil-timer').forEach(el => {
            const expire = parseInt(el.getAttribute('data-expire'));
            const now = Date.now();
            const diff = expire - now;

            if (diff <= 0) {
                el.textContent = "EXPIRED";
                el.classList.replace('text-yellow-400', 'text-red-500');
            } else {
                const h = Math.floor(diff / (1000 * 60 * 60));
                const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const s = Math.floor((diff % (1000 * 60)) / 1000);
                el.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            }
        });
    };

    updateUI(); // run immediately
    const interval = setInterval(updateUI, 1000);
    AppState.timers.push(interval);
}

// ==========================================
// 5. ROUTER & EVENT DELEGATION
// ==========================================

function renderView(viewName) {
    const container = document.getElementById('main-content-view');
    
    // Clear old timers if we leave CIL view
    if(viewName !== 'cil-radar') {
        AppState.timers.forEach(t => clearInterval(t));
        AppState.timers = [];
    }

    // Render HTML
    if (Views[viewName]) {
        container.innerHTML = Views[viewName]();
    }

    // Post-render specific logic
    if (viewName === 'cil-radar') {
        startCilTimers();
    }

    // Trigger CSS animation reflow
    container.classList.remove('fade-in');
    void container.offsetWidth; 
    container.classList.add('fade-in');
}

function initGlobalDelegation() {
    document.body.addEventListener('click', (e) => {
        // 1. Sidebar Navigation Handling (Note: UI active state is handled in index.html, this is purely rendering logic)
        const navBtn = e.target.closest('[data-view]');
        if (navBtn) {
            const view = navBtn.getAttribute('data-view');
            renderView(view);
            return;
        }

        // 2. Action Buttons Handling
        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
            const action = actionBtn.getAttribute('data-action');
            
            if (action === 'move-deal') {
                handleKanbanMove(actionBtn.getAttribute('data-id'));
            } 
            else if (action === 'calc-finance') {
                calculateFinancials();
            }
            else if (action === 'run-ai') {
                runAiSimulation();
            }
        }
    });
}

// ==========================================
// 6. INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    // Sync header on load
    updateHeaderKPIs();
    
    // Setup event delegation
    initGlobalDelegation();

    // Since Action Center is the default in HTML, we ensure state is synced but don't overwrite the canvas immediately unless navigated.
    // If user clicks Action Center again, the View function will render the HTML version (without chart, for simplicity in SPA, or you can add chart init back here).
    // Note: The index.html already renders Action Center + Chart natively on first load.
});