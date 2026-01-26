import { useState } from 'react';
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

interface InvoiceResponse {
    invoiceLink: string;
    tier: Tier;
}

const TIERS: Tier[] = [
    { id: 'weekly', stars: 149, days: 7, label: '7 дней' },
    { id: 'monthly', stars: 349, days: 30, label: '30 дней' },
    { id: 'quarterly', stars: 949, days: 90, label: '90 дней', highlight: true },
];

export function SubscriptionPage() {
    const navigate = useNavigate();
    const { profile, initData, loadProfile } = useUserStore();
    const [loading, setLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handlePurchase = async (tierId: string) => {
        if (!initData) return;

        setLoading(tierId);
        setError(null);

        try {
            const data = await apiRequest<InvoiceResponse>('/api/payments/create-invoice', {
                method: 'POST',
                body: { tier: tierId },
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

    const isActive = profile?.subscriptionStatus === 'active';

    return (
        <div className="min-h-screen p-4 pb-24">
            <div className="max-w-lg mx-auto">
                {/* Back button */}
                <button
                    onClick={() => navigate('/profile')}
                    className="mb-6 text-text-muted hover:text-text-primary transition-colors text-sm"
                >
                    ← Назад
                </button>

                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold mb-2 text-text-primary">
                        Premium
                    </h1>
                    <p className="text-text-muted">Разблокируй все возможности</p>
                </div>

                {/* Current status */}
                {isActive && (
                    <div className="mb-6 p-4 rounded-2xl bg-surface-light border border-border">
                        <p className="text-sm text-text-primary font-medium">Premium активен</p>
                        {profile?.subscriptionEndAt && (
                            <p className="text-xs text-text-muted mt-1">
                                до {new Date(profile.subscriptionEndAt).toLocaleDateString('ru-RU', {
                                    day: 'numeric',
                                    month: 'long'
                                })}
                            </p>
                        )}
                    </div>
                )}

                {/* Benefits */}
                <div className="mb-8 space-y-3">
                    <div className="flex items-center gap-3 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                        <span className="text-text-secondary">Безлимитные сообщения</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                        <span className="text-text-secondary">Доступ ко всем персонажам</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                        <span className="text-text-secondary">Создавай персонажей только для себя</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                        <span className="text-text-secondary">Приоритетные ответы</span>
                    </div>
                </div>

                {/* Error message */}
                {error && (
                    <div className="mb-4 p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
                        {error}
                    </div>
                )}

                {/* Tier cards */}
                <div className="space-y-3 mb-8">
                    {TIERS.map((tier) => (
                        <button
                            key={tier.id}
                            onClick={() => handlePurchase(tier.id)}
                            disabled={loading !== null}
                            className={`w-full p-4 rounded-2xl border transition-all text-left
                                ${tier.highlight
                                    ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/20'
                                    : 'bg-surface-light border-border hover:border-primary/30'
                                }
                                ${loading === tier.id ? 'opacity-50 cursor-wait' : 'hover:scale-[1.01]'}
                                disabled:cursor-not-allowed`}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className={`font-semibold ${tier.highlight ? 'text-primary' : 'text-text-primary'}`}>
                                        {tier.label}
                                    </p>
                                    {tier.highlight && (
                                        <p className="text-xs text-primary/70 mt-0.5">Лучшая цена</p>
                                    )}
                                </div>
                                <div className={`px-4 py-2 rounded-xl font-semibold
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

                {/* Trust elements */}
                <div className="space-y-2 text-xs text-text-muted">
                    <p>Без автопродления — разовый платёж</p>
                    <p>Мгновенная активация после оплаты</p>
                    <p>Безопасная оплата через Telegram</p>
                </div>

                {/* Footer */}
                <p className="mt-8 text-xs text-text-muted text-center opacity-50">
                    Поддержка <a href="https://t.me/Olegceocash" target="_blank" rel="noopener noreferrer" className="underline hover:text-text-secondary">@Olegceocash</a>
                </p>
            </div>
        </div>
    );
}


