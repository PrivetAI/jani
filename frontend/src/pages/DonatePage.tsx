import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { apiRequest } from '../lib/api';

interface Tier {
    id: string;
    stars: number;
    days: number;
    label: string;
    highlight?: boolean;
}

interface Bundle {
    id: string;
    stars: number;
    messages: number;
    label: string;
}

interface InvoiceResponse {
    invoiceLink: string;
}

interface ReferralStats {
    totalReferrals: number;
    totalMessagesEarned: number;
    registrationRewards: number;
    purchaseRewards: number;
}

const TIERS: Tier[] = [
    { id: 'monthly', stars: 349, days: 30, label: '1 месяц' },
    { id: 'quarterly', stars: 899, days: 90, label: '3 месяца', highlight: true },
];

const BUNDLES: Bundle[] = [
    { id: 'bundle_100', stars: 149, messages: 100, label: '100 сообщений' },
    { id: 'bundle_300', stars: 319, messages: 300, label: '300 сообщений' },
    { id: 'bundle_700', stars: 589, messages: 700, label: '700 сообщений' },
];

export function DonatePage() {
    const navigate = useNavigate();
    const { profile, initData, loadProfile } = useUserStore();
    const [loading, setLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [referralLink, setReferralLink] = useState<string | null>(null);
    const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (initData) {
            apiRequest<{ referralLink: string }>('/api/referral/link', { initData })
                .then(data => setReferralLink(data.referralLink))
                .catch(() => { });

            apiRequest<{ stats: ReferralStats }>('/api/referral/stats', { initData })
                .then(data => setReferralStats(data.stats))
                .catch(() => { });
        }
    }, [initData]);

    const handlePurchase = async (tierId: string, type: 'subscription' | 'bundle') => {
        if (!initData) return;

        setLoading(tierId);
        setError(null);

        try {
            const data = await apiRequest<InvoiceResponse>('/api/payments/create-invoice', {
                method: 'POST',
                body: { tier: tierId, type },
                initData,
            });

            if (window.Telegram?.WebApp?.openInvoice) {
                window.Telegram.WebApp.openInvoice(data.invoiceLink, (status) => {
                    if (status === 'paid') {
                        loadProfile();
                        setError(null);
                    } else if (status === 'failed') {
                        setError('Платёж не прошёл. Попробуйте ещё раз.');
                    }
                    setLoading(null);
                });
            } else {
                setError('Откройте приложение через Telegram');
                setLoading(null);
            }
        } catch (err) {
            setError((err as Error).message || 'Ошибка при создании платежа');
            setLoading(null);
        }
    };

    const handleCopyLink = async () => {
        if (!referralLink) return;
        try {
            await navigator.clipboard.writeText(referralLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = referralLink;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };


    const isActive = profile?.subscriptionStatus === 'active';
    const bonusMessages = profile?.bonusMessages ?? 0;

    return (
        <div className="min-h-screen p-4 pb-24">
            <div className="max-w-lg mx-auto">
                {/* Back button */}
                <button
                    onClick={() => navigate('/profile')}
                    className="mb-4 text-text-muted hover:text-text-primary transition-colors text-sm"
                >
                    ← Назад
                </button>

                {/* Header */}
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-text-primary">Поддержать проект</h1>
                </div>

                {/* Error message */}
                {error && (
                    <div className="mb-4 p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
                        {error}
                    </div>
                )}

                {/* ==================== 1. REFERRAL SECTION ==================== */}
                <section className="mb-6 p-5 rounded-2xl bg-gradient-to-br from-primary/10 to-indigo-500/10 border border-primary/20">
                    <div className="text-center mb-4">
                        <span className="text-3xl mb-2 block">🎁</span>
                        <h2 className="text-lg font-bold text-text-primary">Бесплатные сообщения</h2>
                        <p className="text-sm text-text-secondary mt-1">
                            Пригласи друга и получите по <span className="text-text-muted line-through">30</span> <span className="text-primary font-semibold">100 сообщений</span> каждый
                        </p>
                        <p className="text-xs text-text-muted mt-1">
                            +50 бонусных если друг совершит любую покупку
                        </p>
                    </div>

                    {referralLink && (
                        <div className="flex gap-2">
                            <button
                                onClick={handleCopyLink}
                                className="flex-1 py-3 px-4 rounded-xl bg-surface border border-border text-text-primary font-medium hover:border-primary/40 transition-all active:scale-[0.98]"
                            >
                                {copied ? '✓ Скопировано!' : 'Копировать ссылку'}
                            </button>
                        </div>
                    )}

                    {referralStats && referralStats.totalReferrals > 0 && (
                        <div className="mt-4 pt-4 border-t border-primary/20 grid grid-cols-2 gap-4 text-center">
                            <div>
                                <p className="text-xl font-bold text-primary">{referralStats.totalReferrals}</p>
                                <p className="text-xs text-text-muted">друзей пришло</p>
                            </div>
                            <div>
                                <p className="text-xl font-bold text-primary">+{referralStats.totalMessagesEarned}</p>
                                <p className="text-xs text-text-muted">сообщений получено</p>
                            </div>
                        </div>
                    )}
                </section>

                {/* ==================== 2. PREMIUM SUBSCRIPTION ==================== */}
                <section className="mb-6">
                    <div className="text-center mb-4">
                        <h2 className="text-lg font-bold text-text-primary">⭐ Premium-подписка</h2>
                        <p className="text-sm text-text-muted mt-1">Безлимит сообщений + продвинутая ии модель</p>
                    </div>

                    {/* Current status */}
                    {isActive && (
                        <div className="mb-3 p-3 rounded-xl bg-success/10 border border-success/20 text-center">
                            <p className="text-sm text-success font-medium">✓ Premium активен</p>
                            {profile?.subscriptionEndAt && (
                                <p className="text-xs text-text-muted mt-0.5">
                                    до {new Date(profile.subscriptionEndAt).toLocaleDateString('ru-RU', {
                                        day: 'numeric', month: 'long'
                                    })}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="space-y-2">
                        {TIERS.map((tier) => (
                            <button
                                key={tier.id}
                                onClick={() => handlePurchase(tier.id, 'subscription')}
                                disabled={loading !== null}
                                className={`w-full p-4 rounded-xl border transition-all
                                    ${tier.highlight
                                        ? 'bg-primary/10 border-primary/40'
                                        : 'bg-surface-light border-border hover:border-primary/30'
                                    }
                                    ${loading === tier.id ? 'opacity-50 cursor-wait' : 'hover:scale-[1.01] active:scale-[0.99]'}
                                    disabled:cursor-not-allowed`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="text-left">
                                        <p className={`font-semibold ${tier.highlight ? 'text-primary' : 'text-text-primary'}`}>
                                            {tier.label}
                                        </p>
                                        {tier.highlight && (
                                            <p className="text-xs text-primary/70">Лучшая цена</p>
                                        )}
                                    </div>
                                    <div className={`px-4 py-2 rounded-lg font-bold text-lg
                                        ${tier.highlight
                                            ? 'bg-primary text-white'
                                            : 'bg-surface border border-border text-text-primary'
                                        }`}
                                    >
                                        {loading === tier.id ? '...' : `${tier.stars} ★`}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>

                {/* ==================== 3. MESSAGE BUNDLES ==================== */}
                <section className="mb-6">
                    <div className="text-center mb-4">
                        <h2 className="text-lg font-bold text-text-primary"> Пакеты сообщений</h2>
                        <p className="text-sm text-text-muted mt-1">Работают сверх дневного лимита • Не сгорают</p>
                    </div>

                    {/* Current balance */}
                    {bonusMessages > 0 && (
                        <div className="mb-3 p-3 rounded-xl bg-primary/10 border border-primary/20 text-center">
                            <p className="text-sm text-text-primary">
                                Баланс: <span className="font-bold text-primary">{bonusMessages}</span> сообщений
                            </p>
                        </div>
                    )}

                    <div className="space-y-2">
                        {BUNDLES.map((bundle) => (
                            <button
                                key={bundle.id}
                                onClick={() => handlePurchase(bundle.id, 'bundle')}
                                disabled={loading !== null}
                                className={`w-full p-4 rounded-xl border transition-all
                                    bg-surface-light border-border hover:border-primary/30
                                    ${loading === bundle.id ? 'opacity-50 cursor-wait' : 'hover:scale-[1.01] active:scale-[0.99]'}
                                    disabled:cursor-not-allowed`}
                            >
                                <div className="flex items-center justify-between">
                                    <p className="font-semibold text-text-primary">{bundle.label}</p>
                                    <div className="px-4 py-2 rounded-lg font-bold text-lg bg-surface border border-border text-text-primary">
                                        {loading === bundle.id ? '...' : `${bundle.stars} ★`}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>

                {/* Trust elements */}
                <div className="text-center text-xs text-text-muted space-y-1.5">
                    <p>✓ Без автопродления — разовый платёж</p>
                    <p>✓ Мгновенная активация</p>
                    <p>✓ Безопасная оплата через Telegram Stars</p>
                </div>

                {/* Footer */}
                <p className="mt-6 text-xs text-text-muted text-center opacity-50">
                    Поддержка <a href="https://t.me/Olegceocash" target="_blank" rel="noopener noreferrer" className="underline">@Olegceocash</a>
                </p>
            </div>
        </div>
    );
}
