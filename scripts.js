const metrics = [
    'agricultural_productivity',
    'bay_delta_estuary_ecology',
    'delta_freshwater_export',
    'environmental_flows',
    'freshwater_in_delta',
    'groundwater_storage',
    'resevoir_storage',
    'salmon_abundance'
];
const allowedMetric = null;

let currentMetric = null;
let currentData = null;
let currentDataChatGPT = null;
let currentDataManual = null;

// Initialize UI state and bind listeners.
function init() {
    renderMetricCards();
    setupTabListeners();
    updateTabState(false);
}

// Render metric selector cards with enabled/disabled state.
function renderMetricCards() {
    const grid = document.getElementById('metricGrid');
    grid.innerHTML = metrics.map(metric => {
        const isAllowed = !allowedMetric || metric === allowedMetric;
        const disabledClass = isAllowed ? '' : 'disabled';
        const clickHandler = `onclick="selectMetric('${metric}')"`; 
        return `
        <div class="metric-card ${disabledClass}" data-metric="${metric}" ${clickHandler} aria-disabled="${!isAllowed}">
            <div class="metric-name">${formatMetricName(metric)}</div>
        </div>
    `;
    }).join('');
}

// Convert metric keys into display-friendly titles.
function formatMetricName(metric) {
    return metric.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Handle metric selection and load data for all panels.
async function selectMetric(metric) {
    if (allowedMetric && metric !== allowedMetric) {
        return;
    }
    // Update active state
    document.querySelectorAll('.metric-card').forEach(card => {
        card.classList.toggle('active', card.dataset.metric === metric);
    });

    currentMetric = metric;
    updateTabState(true);
    const selectedMetric = document.getElementById('selectedMetric');
    if (selectedMetric) {
        selectedMetric.textContent = formatMetricName(metric);
    }
    
    // Load both datasets
    try {
        const [chatgptResponse, manualResponse] = await Promise.all([
            fetch(`chatgpt_responses/${metric}.json`),
            fetch(`manual_responses/${metric}.json`)
        ]);
        
        currentDataChatGPT = await chatgptResponse.json();
        currentDataManual = await manualResponse.json();
        currentData = currentDataChatGPT; // For overview compatibility
        
        renderOverview();
        renderLegalStandards();
        renderTiers();
        renderAgencies();
    } catch (error) {
        console.error('Error loading data:', error);
        alert('Error loading data for ' + formatMetricName(metric));
    }
}

// Wire tab click behavior and content switching.
function setupTabListeners() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.classList.contains('is-disabled')) {
                return;
            }
            const tabName = tab.dataset.tab;
            
            // Update active tab
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update active content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(tabName).classList.add('active');
        });
    });
}

// Enable or disable tabs based on selection state.
function updateTabState(isEnabled) {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('is-disabled', !isEnabled);
        tab.setAttribute('aria-disabled', String(!isEnabled));
        if (!isEnabled) {
            tab.setAttribute('tabindex', '-1');
        } else {
            tab.removeAttribute('tabindex');
        }
    });
}

// Render summary stats for the selected metric.
function renderOverview() {
    if (!currentDataChatGPT && !currentDataManual) return;

    const getStats = (data) => {
        const legalCount = data['Legal Standards']?.length || 0;
        const tierCount = Object.keys(data.Tiers || {}).length;
        const agencyCount = data['Governing Agencies']?.length || 0;
        
        let totalPolicies = 0;
        Object.values(data.Tiers || {}).forEach(tier => {
            const policies = Array.isArray(tier) ? tier : tier?.policies;
            if (Array.isArray(policies)) {
                totalPolicies += policies.length;
            }
        });

        return { legalCount, tierCount, agencyCount, totalPolicies };
    };

    const chatgptStats = getStats(currentDataChatGPT || {});
    const manualStats = getStats(currentDataManual || {});

    document.getElementById('overviewInline').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">Legal Standards</div>
                <div class="stat-split"><span class="stat-split-manual">Manual +${manualStats.legalCount}</span> / <span class="stat-split-chatgpt">ChatGPT +${chatgptStats.legalCount}</span></div>
                <div class="stat-split-note">Count of legal standards identified</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Tiered Implications</div>
                <div class="stat-split"><span class="stat-split-manual">Manual +${manualStats.totalPolicies}</span> / <span class="stat-split-chatgpt">ChatGPT +${chatgptStats.totalPolicies}</span></div>
                <div class="stat-split-note">Count of policy implications across tiers</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Agencies</div>
                <div class="stat-split"><span class="stat-split-manual">Manual +${manualStats.agencyCount}</span> / <span class="stat-split-chatgpt">ChatGPT +${chatgptStats.agencyCount}</span></div>
                <div class="stat-split-note">Governing agencies listed</div>
            </div>
        </div>
    `;
    triggerMount(document.getElementById('overviewInline'));
    const summaryBar = document.querySelector('.summary-bar');
    if (summaryBar) {
        summaryBar.classList.remove('is-empty');
    }
}

// Render a single legal standard card.
function renderLegalCard(standard, source, index) {
    return `
        <div class="card legal-card" data-legal-standard="${standard.legal_standard_id || ''}" data-legal-index="${index}">
            <div class="legal-card-header">
                <div class="card-title">${standard.legal_standard || '<span class="error-display" style="display: inline; padding: 2px 6px;">Error</span>'}</div>
                <button class="legal-card-toggle" type="button" aria-expanded="false" aria-controls="legal-expand-${source}-${index}">
                    <span class="legal-card-toggle-label">Details</span>
                    <span class="legal-card-toggle-icon" aria-hidden="true"></span>
                </button>
            </div>
            <div class="card-caption">${standard.caption || '<span class="error-display" style="display: inline; padding: 2px 6px;">Error</span>'}</div>
            <div class="legal-card-expand" id="legal-expand-${source}-${index}" aria-hidden="true">
                <div class="card-note">${standard.info || '<span class="error-display" style="display: inline; padding: 2px 6px;">Error</span>'}</div>
            </div>
        </div>
    `;
}

// Show legal standards with paired-row arrows for cards sharing an order value.
function renderLegalStandards() {
    if (!currentDataChatGPT || !currentDataManual) return;

    const legalEmptyState = document.getElementById('legalEmptyState');
    const legalComparison = document.getElementById('legalComparison');
    if (legalEmptyState && legalComparison) {
        legalEmptyState.classList.add('is-hidden');
        legalComparison.classList.remove('is-hidden');
    }

    const manualStandards = currentDataManual['Legal Standards'] || [];
    const chatgptStandards = currentDataChatGPT['Legal Standards'] || [];

    // Separate each source's standards into ordered (has order field) and unordered.
    const groupByOrder = (standards) => {
        const ordered = new Map();
        const unordered = [];
        standards.forEach((standard) => {
            const orderValue = Number(standard?.order);
            if (Number.isFinite(orderValue)) {
                ordered.set(orderValue, standard);
            } else {
                unordered.push(standard);
            }
        });
        return { ordered, unordered };
    };

    const manual = groupByOrder(manualStandards);
    const chatgpt = groupByOrder(chatgptStandards);

    // All order keys present in either source, ascending.
    const allOrderKeys = new Set([...manual.ordered.keys(), ...chatgpt.ordered.keys()]);
    const sortedOrderKeys = [...allOrderKeys].sort((a, b) => a - b);
    const hasPaired = sortedOrderKeys.length > 0;
    const hasUnordered = manual.unordered.length > 0 || chatgpt.unordered.length > 0;

    let idCounter = 0;

    // Build one paired row per shared order value.
    const pairedRowsHTML = sortedOrderKeys.map(orderKey => {
        const manualStd = manual.ordered.get(orderKey);
        const chatgptStd = chatgpt.ordered.get(orderKey);
        return `
            <div class="legal-pair-row">
                <div class="legal-pair-cell">
                    ${manualStd
                        ? renderLegalCard(manualStd, 'Manual', idCounter++)
                        : '<div class="legal-pair-empty">Not identified</div>'}
                </div>
                <div class="legal-pair-connector">
                    <span class="legal-pair-arrow">&#x2194;</span>
                </div>
                <div class="legal-pair-cell">
                    ${chatgptStd
                        ? renderLegalCard(chatgptStd, 'ChatGPT', idCounter++)
                        : '<div class="legal-pair-empty">Not identified</div>'}
                </div>
            </div>
        `;
    }).join('');

    // Build unordered two-column section.
    const unorderedManualHTML = manual.unordered.map(std => renderLegalCard(std, 'Manual', idCounter++)).join('');
    const unorderedChatgptHTML = chatgpt.unordered.map(std => renderLegalCard(std, 'ChatGPT', idCounter++)).join('');

    let html = '';

    if (hasPaired) {
        html += `
            <div class="legal-pair-header">
                <div class="comparison-panel-title" style="border:none;margin:0;padding:0;">
                    Manual Results <span class="panel-count">(${manualStandards.length})</span>
                </div>
                <div></div>
                <div class="comparison-panel-title" style="border:none;margin:0;padding:0;">
                    ChatGPT Results <span class="panel-count">(${chatgptStandards.length})</span>
                </div>
            </div>
            ${pairedRowsHTML}
        `;
    }

    if (hasPaired && hasUnordered) {
        html += `<div class="legal-standards-divider">Unique Standards</div>`;
    }

    if (hasUnordered) {
        html += `
            <div class="comparison-container" style="margin-top: 4px;">
                <div class="comparison-panel">
                    ${!hasPaired ? `<div class="comparison-panel-title">Manual Results <span class="panel-count">(${manualStandards.length})</span></div>` : ''}
                    ${unorderedManualHTML || ''}
                </div>
                <div class="comparison-panel">
                    ${!hasPaired ? `<div class="comparison-panel-title">ChatGPT Results <span class="panel-count">(${chatgptStandards.length})</span></div>` : ''}
                    ${unorderedChatgptHTML || ''}
                </div>
            </div>
        `;
    }

    if (!hasPaired && !hasUnordered) {
        html = '<div class="empty-state"><h3>No legal standards data available</h3></div>';
    }

    legalComparison.innerHTML = html;

    // Attach expand/collapse toggle listeners.
    legalComparison.querySelectorAll('.legal-card-toggle').forEach((button) => {
        button.addEventListener('click', () => {
            const card = button.closest('.legal-card');
            if (!card) return;
            const isExpanded = button.getAttribute('aria-expanded') === 'true';
            const nextExpanded = !isExpanded;
            button.setAttribute('aria-expanded', String(nextExpanded));
            card.classList.toggle('is-expanded', nextExpanded);
            const expandTarget = card.querySelector('.legal-card-expand');
            if (expandTarget) {
                expandTarget.setAttribute('aria-hidden', String(!nextExpanded));
            }
        });
    });

    triggerMount(legalComparison);
}

// Render tiered implications comparison layout.
function renderTiers() {
    const tiersEmptyState = document.getElementById('tiersEmptyState');
    const tiersAligned = document.getElementById('tiersAligned');
    if (!currentDataChatGPT && !currentDataManual) {
        if (tiersEmptyState && tiersAligned) {
            tiersEmptyState.classList.remove('is-hidden');
            tiersAligned.classList.add('is-hidden');
        }
        return;
    }

    if (tiersEmptyState && tiersAligned) {
        tiersEmptyState.classList.add('is-hidden');
        tiersAligned.classList.remove('is-hidden');
    }

    const tierOrder = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'];
    const content = document.getElementById('tiersAligned');
    const chatgptTiers = currentDataChatGPT && currentDataChatGPT.Tiers ? currentDataChatGPT.Tiers : null;
    const manualTiers = currentDataManual && currentDataManual.Tiers ? currentDataManual.Tiers : null;

    content.innerHTML = tierOrder.map((tierName) => {
        const tierNumber = tierName.split(' ')[1];
        const chatTierData = chatgptTiers ? chatgptTiers[tierName] : null;
        const manualTierData = manualTiers ? manualTiers[tierName] : null;
        const chatPolicies = Array.isArray(chatTierData) ? chatTierData : chatTierData?.policies;
        const manualPolicies = Array.isArray(manualTierData) ? manualTierData : manualTierData?.policies;
        const tierDefinition = (!Array.isArray(chatTierData) && chatTierData?.threshold)
            || (!Array.isArray(manualTierData) && manualTierData?.threshold)
            || '';
        const chatCount = Array.isArray(chatPolicies) ? chatPolicies.length : 0;
        const manualCount = Array.isArray(manualPolicies) ? manualPolicies.length : 0;

        return `
            <details class="tier-row" open>
                <summary class="tier-header tier-${tierNumber}">
                    <span class="tier-header-content">
                        <span class="tier-header-title">${tierName}</span>
                        ${tierDefinition ? `<span class="tier-header-note">&mdash; ${tierDefinition}</span>` : ''}
                    </span>
                    <span class="tier-toggle" aria-hidden="true"></span>
                </summary>
                <div class="tier-columns">
                    <div class="comparison-panel">
                        <div class="comparison-panel-title">Manual Results <span class="panel-count">(${manualCount})</span></div>
                        ${manualPolicies ? renderTierPolicies(manualPolicies, tierNumber, 'manual') : '<div class="error-display">Error: Missing Tier</div>'}
                    </div>
                    <div class="comparison-panel">
                        <div class="comparison-panel-title">ChatGPT Results <span class="panel-count">(${chatCount})</span></div>
                        ${chatPolicies ? renderTierPolicies(chatPolicies, tierNumber, 'chatgpt') : '<div class="error-display">Error: Missing Tier</div>'}
                    </div>
                </div>
            </details>
        `;
    }).join('');

    setupTierToggleAnimation();
    setupPolicyCardDropdowns(content);
    triggerMount(content);
}

// Animate tier collapse/expand behavior for details rows.
function setupTierToggleAnimation() {
    document.querySelectorAll('.tier-row > summary').forEach((summary) => {
        const details = summary.parentElement;
        const content = details.querySelector('.tier-columns');
        if (!details || !content) return;

        summary.addEventListener('click', (event) => {
            if (!details.open) {
                return;
            }

            event.preventDefault();
            if (details.classList.contains('is-closing')) return;

            content.style.maxHeight = `${content.scrollHeight}px`;
            details.classList.add('is-closing');

            requestAnimationFrame(() => {
                content.style.maxHeight = '0px';
            });

            const onTransitionEnd = (e) => {
                if (e.propertyName !== 'max-height') return;
                details.classList.remove('is-closing');
                details.open = false;
                content.style.maxHeight = '';
                content.removeEventListener('transitionend', onTransitionEnd);
            };

            content.addEventListener('transitionend', onTransitionEnd);
        });
    });
}

// Render policy cards within a tier column.
function renderTierPolicies(policies, tierNumber, source) {
    if (!Array.isArray(policies) || policies.length === 0) {
        return '<div class="empty-state"><h3>No policy data available for this tier</h3></div>';
    }

    const sortedPolicies = policies
        .map((policy, index) => ({
            policy,
            index,
            rank: getLikelihoodRank(policy?.likelihood_score)
        }))
        .sort((a, b) => (a.rank - b.rank) || (a.index - b.index))
        .map(item => item.policy);

    return `
        <div class="tier-policy-grid">
            ${sortedPolicies.map((policy, index) => `
                <div class="policy-card tier-${tierNumber}">
                    <div class="policy-name">${policy.policy_name || '<span class="error-display" style="display: inline; padding: 2px 6px;">Error</span>'}</div>
                    ${policy.relationship ? `<div class="relationship ${getLikelihoodClass(policy.likelihood_score) || getRelationshipClass(policy.relationship)}">${getLikelihoodLabel(policy.likelihood_score) || policy.relationship}</div>` : '<div class="error-display" style="padding: 4px 12px; display: inline-block; font-size: 0.85rem;">Error: Missing relationship</div>'}
                    <button class="policy-card-toggle" type="button" aria-expanded="false" aria-controls="policy-expand-${source}-${tierNumber}-${index}">
                        <span class="policy-card-toggle-label">Details</span>
                        <span class="policy-card-toggle-icon" aria-hidden="true"></span>
                    </button>
                    <div class="policy-card-expand" id="policy-expand-${source}-${tierNumber}-${index}" aria-hidden="true">
                        <div class="card-note">${policy.note || '<span class="error-display" style="display: inline; padding: 2px 6px;">Error</span>'}</div>
                    </div>
                </div>
            `).join('')}
</div>
`;
}

function setupPolicyCardDropdowns(container) {
    if (!container) return;
    container.querySelectorAll('.policy-card-toggle').forEach((button) => {
        button.addEventListener('click', () => {
            const card = button.closest('.policy-card');
            if (!card) return;
            const isExpanded = button.getAttribute('aria-expanded') === 'true';
            const nextExpanded = !isExpanded;
            button.setAttribute('aria-expanded', String(nextExpanded));
            card.classList.toggle('is-expanded', nextExpanded);
            const expandTarget = card.querySelector('.policy-card-expand');
            if (expandTarget) {
                expandTarget.setAttribute('aria-hidden', String(!nextExpanded));
            }
        });
    });
}

// Map likelihood score to a CSS class.
function getLikelihoodClass(score) {
    if (score === 1) return 'likelihood-1';
    if (score === 2) return 'likelihood-2';
    if (score === 3) return 'likelihood-3';
    return '';
}

// Rank likelihood score for sorting (lower is higher priority).
function getLikelihoodRank(score) {
    if (score === 3) return 0; // Most Likely first
    if (score === 2) return 1;
    if (score === 1) return 2;
    return 3;
}

// Map likelihood score to a human-friendly label.
function getLikelihoodLabel(score) {
    if (score === 1) return 'Least Likely';
    if (score === 2) return 'Moderately Likely';
    if (score === 3) return 'Most Likely';
    return '';
}

// Map relationship text to a CSS class.
function getRelationshipClass(relationship) {
    const rel = relationship.toLowerCase();
    if (rel.includes('indirect')) {
        return 'relationship-indirect';
    } else if (rel.includes('direct')) {
        return 'relationship-direct';
    }
    if (rel.includes('met') || rel.includes('aligned') || rel.includes('supported')) {
        return 'relationship-met';
    } else if (rel.includes('triggered') || rel.includes('watched')) {
        return 'relationship-triggered';
    } else if (rel.includes('violated') || rel.includes('noncompliant') || rel.includes('at-risk')) {
        return 'relationship-violated';
    }
    return 'relationship-other';
}

// Render governing agencies comparison panels.
function renderAgencies() {
    const agenciesEmptyState = document.getElementById('agenciesEmptyState');
    const agenciesComparison = document.getElementById('agenciesComparison');
    if (!currentDataChatGPT && !currentDataManual) {
        if (agenciesEmptyState && agenciesComparison) {
            agenciesEmptyState.classList.remove('is-hidden');
            agenciesComparison.classList.add('is-hidden');
        }
        return;
    }

    if (agenciesEmptyState && agenciesComparison) {
        agenciesEmptyState.classList.add('is-hidden');
        agenciesComparison.classList.remove('is-hidden');
    }

    const agenciesCountChatGPT = document.getElementById('agenciesCountChatGPT');
    const agenciesCountManual = document.getElementById('agenciesCountManual');
    if (agenciesCountChatGPT) {
        agenciesCountChatGPT.textContent = `(${currentDataChatGPT && currentDataChatGPT['Governing Agencies'] ? currentDataChatGPT['Governing Agencies'].length : 0})`;
    }
    if (agenciesCountManual) {
        agenciesCountManual.textContent = `(${currentDataManual && currentDataManual['Governing Agencies'] ? currentDataManual['Governing Agencies'].length : 0})`;
    }

    if (currentDataChatGPT && currentDataChatGPT['Governing Agencies']) {
        renderAgenciesPanel(currentDataChatGPT, 'ChatGPT');
    } else {
        document.getElementById('agenciesContentChatGPT').innerHTML = '<div class="error-display">Error: No agency data</div>';
    }

    if (currentDataManual && currentDataManual['Governing Agencies']) {
        renderAgenciesPanel(currentDataManual, 'Manual');
    } else {
        document.getElementById('agenciesContentManual').innerHTML = '<div class="error-display">Error: No agency data</div>';
    }
    triggerMount(agenciesComparison);
}

// Retrigger mount animation on an element.
function triggerMount(element) {
    if (!element) return;
    element.classList.remove('is-mounted');
    void element.offsetHeight;
    element.classList.add('is-mounted');
}

// Render one agencies column (ChatGPT or Manual).
function renderAgenciesPanel(data, source) {
    const agencies = data['Governing Agencies'] || [];
    const sortedAgencies = [...agencies].sort((a, b) => {
        const aCount = Array.isArray(a.pertains_to_legal_standards) ? a.pertains_to_legal_standards.length : 0;
        const bCount = Array.isArray(b.pertains_to_legal_standards) ? b.pertains_to_legal_standards.length : 0;
        if (bCount !== aCount) return bCount - aCount;
        const aName = (a.name || '').toLowerCase();
        const bName = (b.name || '').toLowerCase();
        return aName.localeCompare(bName);
    });
    const elementId = source === 'ChatGPT' ? 'agenciesContentChatGPT' : 'agenciesContentManual';
    const content = document.getElementById(elementId);
    
    if (agencies.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <h3>No agency data available for this outcome</h3>
            </div>
        `;
        return;
    }

    content.innerHTML = `
        <div class="agency-grid">
            ${sortedAgencies.map(agency => `
                <div class="agency-card">
                    <div class="agency-name">${agency.name || '<span class="error-display" style="display: inline; padding: 2px 6px;">Error</span>'}</div>
                    <div class="agency-chip">In ${Array.isArray(agency.pertains_to_legal_standards) ? agency.pertains_to_legal_standards.length : 0} Legal Standards</div>
                    <div class="card-note">${agency.note || '<span class="error-display" style="display: inline; padding: 2px 6px;">Error</span>'}</div>
                </div>
            `).join('')}
        </div>
    `;
}

// Initialize on load
init();
