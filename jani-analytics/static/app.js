// Jani Analytics - Dashboard JS

let currentData = null;
let charts = {};

// Chart.js defaults
Chart.defaults.color = '#71717a';
Chart.defaults.borderColor = '#27272a';

const COLORS = {
    primary: '#8b5cf6',
    secondary: '#22c55e',
    tertiary: '#f59e0b',
    quaternary: '#ef4444',
    palette: ['#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']
};

// Init
document.addEventListener('DOMContentLoaded', () => {
    loadBackups();
    setupEventListeners();
});

function setupEventListeners() {
    // Upload
    document.getElementById('uploadInput').addEventListener('change', handleUpload);

    // Backup select
    document.getElementById('backupSelect').addEventListener('change', (e) => {
        if (e.target.value) loadAnalytics(e.target.value);
    });

    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Compare
    document.getElementById('compareBtn').addEventListener('click', handleCompare);
}

async function loadBackups() {
    try {
        const res = await fetch('/api/backups');
        const backups = await res.json();

        const select = document.getElementById('backupSelect');
        const compare1 = document.getElementById('compareBackup1');
        const compare2 = document.getElementById('compareBackup2');

        select.innerHTML = '<option value="">Выберите бэкап...</option>';
        compare1.innerHTML = '<option value="">Бэкап 1...</option>';
        compare2.innerHTML = '<option value="">Бэкап 2...</option>';

        backups.forEach(b => {
            const opt = `<option value="${b.id}">${b.name} (${new Date(b.uploaded_at).toLocaleDateString()})</option>`;
            select.innerHTML += opt;
            compare1.innerHTML += opt;
            compare2.innerHTML += opt;
        });

        // Auto-select first
        if (backups.length > 0) {
            select.value = backups[0].id;
            loadAnalytics(backups[0].id);
        }
    } catch (e) {
        console.error('Failed to load backups:', e);
    }
}

async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const loading = document.getElementById('loading');
    loading.classList.remove('hidden');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error(await res.text());

        const result = await res.json();
        await loadBackups();

        document.getElementById('backupSelect').value = result.id;
        loadAnalytics(result.id);
    } catch (e) {
        alert('Ошибка загрузки: ' + e.message);
    } finally {
        loading.classList.add('hidden');
        e.target.value = '';
    }
}

async function loadAnalytics(backupId) {
    const loading = document.getElementById('loading');
    const dashboard = document.getElementById('dashboard');
    const noData = document.getElementById('noData');

    loading.classList.remove('hidden');
    dashboard.classList.add('hidden');
    noData.classList.add('hidden');

    try {
        const res = await fetch(`/api/analytics/${backupId}`);
        if (!res.ok) throw new Error('Failed to load analytics');

        currentData = await res.json();
        renderDashboard();

        dashboard.classList.remove('hidden');
    } catch (e) {
        console.error(e);
        noData.classList.remove('hidden');
    } finally {
        loading.classList.add('hidden');
    }
}

function renderDashboard() {
    if (!currentData) return;

    const { overview, users, messages, characters, financial, referrals, retention } = currentData;

    // Overview
    document.getElementById('totalUsers').textContent = formatNumber(overview.total_users);
    document.getElementById('totalMessages').textContent = formatNumber(overview.total_messages);
    document.getElementById('totalCharacters').textContent = overview.total_characters;
    document.getElementById('totalRevenue').textContent = formatNumber(overview.total_revenue);
    document.getElementById('conversionRate').textContent = financial.conversion_rate + '%';

    // Users tab
    document.getElementById('usersTotal').textContent = formatNumber(users.total);
    document.getElementById('usersPremium').textContent = formatNumber(users.premium);
    document.getElementById('usersFree').textContent = formatNumber(users.free);
    document.getElementById('usersAdult').textContent = `${users.adult_confirmed} (${users.adult_confirmed_pct}%)`;
    document.getElementById('usersReferred').textContent = `${users.referred} (${users.referred_pct}%)`;
    document.getElementById('dau').textContent = formatNumber(users.dau);
    document.getElementById('wau').textContent = formatNumber(users.wau);
    document.getElementById('mau').textContent = formatNumber(users.mau);

    renderChart('languagesChart', 'doughnut', {
        labels: users.languages.slice(0, 5).map(l => l.name),
        datasets: [{ data: users.languages.slice(0, 5).map(l => l.count), backgroundColor: COLORS.palette }]
    });

    renderChart('newUsersChart', 'line', {
        labels: users.new_users_by_day.map(d => d.date.slice(5)),
        datasets: [{
            label: 'Новые пользователи',
            data: users.new_users_by_day.map(d => d.count),
            borderColor: COLORS.primary,
            backgroundColor: COLORS.primary + '20',
            fill: true,
            tension: 0.3
        }]
    });

    // Retention table
    const retentionBody = document.querySelector('#retentionTable tbody');
    retentionBody.innerHTML = retention.cohorts.map(c => `
        <tr>
            <td>${c.week}</td>
            <td>${c.users}</td>
            <td>${c.d1} (${c.d1_pct}%)</td>
            <td>${c.d7} (${c.d7_pct}%)</td>
            <td>${c.d30} (${c.d30_pct}%)</td>
        </tr>
    `).join('');

    // Messages tab
    document.getElementById('messagesTotal').textContent = formatNumber(messages.total);
    document.getElementById('messagesUser').textContent = formatNumber(messages.total_user_messages);
    document.getElementById('avgMsgsAll').textContent = messages.avg_per_user;
    document.getElementById('avgMsgsFree').textContent = messages.avg_per_free_user;
    document.getElementById('avgMsgsPremium').textContent = messages.avg_per_premium_user;
    document.getElementById('avgTokens').textContent = messages.avg_tokens;

    renderChart('msgsDistributionChart', 'bar', {
        labels: messages.distribution.map(d => d.bucket),
        datasets: [{
            label: 'Пользователей',
            data: messages.distribution.map(d => d.users),
            backgroundColor: COLORS.primary
        }]
    });

    const hours = Array.from({ length: 24 }, (_, i) => i);
    const hourlyData = hours.map(h => {
        const found = messages.hourly.find(x => x.hour === h);
        return found ? found.count : 0;
    });

    renderChart('hourlyChart', 'bar', {
        labels: hours.map(h => h + ':00'),
        datasets: [{
            label: 'Сообщений',
            data: hourlyData,
            backgroundColor: COLORS.secondary
        }]
    });

    renderChart('modelsChart', 'doughnut', {
        labels: messages.models.slice(0, 5).map(m => m.name.split('/').pop()),
        datasets: [{ data: messages.models.slice(0, 5).map(m => m.count), backgroundColor: COLORS.palette }]
    });

    renderChart('msgsByDayChart', 'line', {
        labels: messages.messages_by_day.map(d => d.date.slice(5)),
        datasets: [{
            label: 'Сообщений',
            data: messages.messages_by_day.map(d => d.count),
            borderColor: COLORS.primary,
            backgroundColor: COLORS.primary + '20',
            fill: true,
            tension: 0.3
        }]
    });

    // Characters tab - A/B Testing
    const abBody = document.querySelector('#abTestTable tbody');
    abBody.innerHTML = characters.ab_test.map(ab => `
        <tr>
            <td><strong>v${ab.version}</strong></td>
            <td>${ab.characters}</td>
            <td>${formatNumber(ab.messages)}</td>
            <td>${formatNumber(ab.users)}</td>
            <td><strong>${ab.avg_msgs_per_user}</strong></td>
        </tr>
    `).join('');

    const ratingsBody = document.querySelector('#ratingsTable tbody');
    ratingsBody.innerHTML = characters.ratings_by_version.map(r => `
        <tr>
            <td>v${r.version}</td>
            <td>${r.likes}</td>
            <td>${r.dislikes}</td>
            <td>${r.like_ratio}%</td>
        </tr>
    `).join('');

    if (characters.emotional_by_version.length > 0) {
        renderChart('emotionalChart', 'bar', {
            labels: characters.emotional_by_version.map(e => 'v' + e.version),
            datasets: [
                { label: 'Attraction', data: characters.emotional_by_version.map(e => e.avg_attraction), backgroundColor: COLORS.palette[0] },
                { label: 'Trust', data: characters.emotional_by_version.map(e => e.avg_trust), backgroundColor: COLORS.palette[1] },
                { label: 'Affection', data: characters.emotional_by_version.map(e => e.avg_affection), backgroundColor: COLORS.palette[2] }
            ]
        });
    }

    renderChart('ugcChart', 'doughnut', {
        labels: characters.ugc_stats.map(u => u.type),
        datasets: [{ data: characters.ugc_stats.map(u => u.messages), backgroundColor: [COLORS.primary, COLORS.secondary] }]
    });

    const topCharsBody = document.querySelector('#topCharsTable tbody');
    topCharsBody.innerHTML = characters.top_characters.slice(0, 10).map(c => `
        <tr>
            <td>${c.name}</td>
            <td>${formatNumber(c.messages)}</td>
            <td>${c.users}</td>
            <td>v${c.prompt_version || '?'}</td>
        </tr>
    `).join('');

    // Financial tab
    document.getElementById('finRevenue').textContent = formatNumber(financial.total_revenue);
    document.getElementById('finPaying').textContent = formatNumber(financial.paying_users);
    document.getElementById('finArpu').textContent = financial.arpu;
    document.getElementById('finArppu').textContent = financial.arppu;
    document.getElementById('finConversion').textContent = financial.conversion_rate;
    document.getElementById('finActiveSubs').textContent = financial.active_subscriptions;

    renderChart('tierChart', 'bar', {
        labels: financial.by_tier.map(t => t.tier),
        datasets: [{
            label: 'Доход',
            data: financial.by_tier.map(t => t.revenue),
            backgroundColor: COLORS.primary
        }]
    });

    renderChart('paymentStatusChart', 'doughnut', {
        labels: financial.payment_statuses.map(s => s.status),
        datasets: [{ data: financial.payment_statuses.map(s => s.count), backgroundColor: COLORS.palette }]
    });

    renderChart('revenueByDayChart', 'line', {
        labels: financial.revenue_by_day.map(d => d.date.slice(5)),
        datasets: [{
            label: 'Доход',
            data: financial.revenue_by_day.map(d => d.revenue),
            borderColor: COLORS.secondary,
            backgroundColor: COLORS.secondary + '20',
            fill: true,
            tension: 0.3
        }]
    });

    // Referrals tab
    document.getElementById('refTotal').textContent = referrals.total_referred;
    document.getElementById('refActive').textContent = referrals.active_referrers;
    document.getElementById('refPaying').textContent = referrals.referred_paying;
    document.getElementById('refConversion').textContent = referrals.referred_conversion;

    const topRefBody = document.querySelector('#topReferrersTable tbody');
    topRefBody.innerHTML = referrals.top_referrers.map(r => `
        <tr><td>${r.username}</td><td>${r.referrals}</td></tr>
    `).join('');

    const rewardsBody = document.querySelector('#rewardsTable tbody');
    rewardsBody.innerHTML = referrals.rewards.map(r => `
        <tr><td>${r.type}</td><td>${r.count}</td><td>${r.messages}</td></tr>
    `).join('');
}

function renderChart(id, type, data) {
    const canvas = document.getElementById(id);
    if (!canvas) return;

    if (charts[id]) {
        charts[id].destroy();
    }

    charts[id] = new Chart(canvas, {
        type,
        data,
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: type === 'doughnut',
                    position: 'right'
                }
            },
            scales: type !== 'doughnut' ? {
                y: { beginAtZero: true }
            } : undefined
        }
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

async function handleCompare() {
    const id1 = document.getElementById('compareBackup1').value;
    const id2 = document.getElementById('compareBackup2').value;

    if (!id1 || !id2) {
        alert('Выберите оба бэкапа');
        return;
    }

    try {
        const res = await fetch(`/api/compare/${id1}/${id2}`);
        const data = await res.json();

        const result = document.getElementById('compareResult');
        const body = document.getElementById('compareTableBody');

        const metrics = [
            { key: 'users', label: 'Пользователей', v1: data.backup1.total_users, v2: data.backup2.total_users },
            { key: 'messages', label: 'Сообщений', v1: data.backup1.total_messages, v2: data.backup2.total_messages },
            { key: 'characters', label: 'Персонажей', v1: data.backup1.total_characters, v2: data.backup2.total_characters },
            { key: 'payments', label: 'Платежей', v1: data.backup1.total_payments, v2: data.backup2.total_payments },
            { key: 'revenue', label: 'Доход (stars)', v1: data.backup1.total_revenue, v2: data.backup2.total_revenue }
        ];

        body.innerHTML = metrics.map(m => {
            const diff = data.diff[m.key];
            const cls = diff > 0 ? 'delta-positive' : diff < 0 ? 'delta-negative' : '';
            const sign = diff > 0 ? '+' : '';
            return `
                <tr>
                    <td>${m.label}</td>
                    <td>${formatNumber(m.v1)}</td>
                    <td>${formatNumber(m.v2)}</td>
                    <td class="${cls}">${sign}${formatNumber(diff)}</td>
                </tr>
            `;
        }).join('');

        result.classList.remove('hidden');
    } catch (e) {
        alert('Ошибка сравнения: ' + e.message);
    }
}

function formatNumber(n) {
    if (n === null || n === undefined) return '-';
    return n.toLocaleString('ru-RU');
}
