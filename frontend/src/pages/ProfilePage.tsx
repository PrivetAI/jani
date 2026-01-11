import { useEffect, useState } from 'react';
import { useUserStore } from '../store/userStore';

export function ProfilePage() {
    const { profile, updateProfile, isLoading } = useUserStore();
    const [form, setForm] = useState({
        displayName: '',
        nickname: '',
        gender: 'prefer-not-to-say',
        language: 'ru'
    });
    const [nicknameError, setNicknameError] = useState<string | null>(null);

    useEffect(() => {
        if (profile) {
            setForm({
                displayName: profile.displayName || '',
                nickname: profile.nickname || '',
                gender: profile.gender || 'prefer-not-to-say',
                language: profile.language || 'ru'
            });
        }
    }, [profile]);

    const handleSave = async () => {
        setNicknameError(null);
        try {
            await updateProfile(form);
            alert('Профиль обновлен!');
        } catch (err: any) {
            if (err.message?.includes('никнейм')) {
                setNicknameError(err.message);
            } else {
                alert('Ошибка сохранения');
            }
        }
    };

    if (!profile) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-text-secondary animate-pulse-slow">Загрузка профиля...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-4">
            <div className="glass-card max-w-lg mx-auto">
                <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                    Настройки профиля
                </h2>

                {/* Info Section */}
                <div className="space-y-2 mb-6 p-4 rounded-xl bg-surface-light border border-border">
                    <p className="text-sm">
                        <span className="text-text-muted">ID:</span>{' '}
                        <span className="text-text-primary">{profile.telegramUserId}</span>
                    </p>
                    <p className="text-sm">
                        <span className="text-text-muted">Никнейм:</span>{' '}
                        <span className="text-text-primary">{profile.nickname || '—'}</span>
                    </p>
                    <p className="text-sm">
                        <span className="text-text-muted">Подписка:</span>{' '}
                        <span className={profile.subscriptionStatus === 'active' ? 'text-success' : 'text-text-secondary'}>
                            {profile.subscriptionStatus === 'active' ? '✅ Активна' : '❌ Нет'}
                        </span>
                    </p>
                </div>

                <hr className="border-border my-6" />

                {/* Form */}
                <div className="space-y-5">
                    <div>
                        <label className="block text-sm text-text-secondary mb-2">Как к тебе обращаться(ботам)?</label>
                        <input
                            type="text"
                            inputMode="text"
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            value={form.displayName}
                            onChange={e => setForm({ ...form, displayName: e.target.value })}
                            placeholder="Твое имя"
                            className="w-full px-4 py-3 rounded-xl bg-surface-light border border-border text-text-primary
                                placeholder:text-text-muted focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-text-secondary mb-2">Никнейм (уникальное имя)</label>
                        <input
                            type="text"
                            inputMode="text"
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            value={form.nickname}
                            onChange={e => {
                                setNicknameError(null);
                                setForm({ ...form, nickname: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') });
                            }}
                            placeholder="username123"
                            maxLength={30}
                            className={`w-full px-4 py-3 rounded-xl bg-surface-light border text-text-primary
                                placeholder:text-text-muted focus:outline-none focus:ring-2
                                ${nicknameError ? 'border-danger focus:border-danger focus:ring-danger/20' : 'border-border focus:border-primary/50 focus:ring-primary/20'}`}
                        />
                        {nicknameError && (
                            <p className="mt-1 text-sm text-danger">{nicknameError}</p>
                        )}
                        <p className="mt-1 text-xs text-text-muted">Только латинские буквы, цифры и _</p>
                    </div>

                    <div>
                        <label className="block text-sm text-text-secondary mb-2">Пол (влияет на обращение персонажей)</label>
                        <select
                            value={form.gender}
                            onChange={e => setForm({ ...form, gender: e.target.value })}
                            className="w-full px-4 py-3 rounded-xl bg-surface-light border border-border text-text-primary
                                focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                        >
                            <option value="male">Мужской</option>
                            <option value="female">Женский</option>
                            <option value="non-binary">Не бинарный</option>
                            <option value="prefer-not-to-say">Не указывать</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm text-text-secondary mb-2">Язык общения</label>
                        <select
                            value={form.language}
                            onChange={e => setForm({ ...form, language: e.target.value })}
                            className="w-full px-4 py-3 rounded-xl bg-surface-light border border-border text-text-primary
                                focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                        >
                            <option value="ru">Русский</option>
                            <option value="en">English</option>
                        </select>
                    </div>
                </div>

                <button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="w-full mt-8 py-3 px-6 rounded-xl font-semibold text-white transition-all duration-200
                        bg-gradient-to-r from-primary to-indigo-500
                        hover:from-primary/90 hover:to-indigo-500/90 hover:shadow-lg hover:shadow-primary/20
                        disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isLoading ? 'Сохранение...' : 'Сохранить изменения'}
                </button>
            </div>
        </div>
    );
}
