import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { apiRequest } from '../lib/api';
import { getCharacterAvatarUrl } from '../lib/imageUrl';
import { Icon } from '../components/Icon';

interface MyCharacter {
    id: number;
    name: string;
    avatarUrl?: string;
    isApproved: boolean;
    grammaticalGender?: 'male' | 'female';
}

interface MessageLimits {
    total: number;
    remaining: number;
    resetsAt: string | null;
}

export function ProfilePage() {
    const navigate = useNavigate();
    const { profile, initData, updateProfile, isLoading } = useUserStore();
    const [activeTab, setActiveTab] = useState<'settings' | 'characters'>('settings');
    const [myCharacters, setMyCharacters] = useState<MyCharacter[]>([]);
    const [loadingChars, setLoadingChars] = useState(false);
    const [limits, setLimits] = useState<MessageLimits | null>(null);
    const [countdown, setCountdown] = useState<string>('');

    const [form, setForm] = useState({
        displayName: '',
        nickname: '',
        gender: 'prefer-not-to-say',
        language: 'ru',
        voicePerson: 3 as 1 | 3
    });
    const [nicknameError, setNicknameError] = useState<string | null>(null);

    useEffect(() => {
        if (profile) {
            setForm({
                displayName: profile.displayName || '',
                nickname: profile.nickname || '',
                gender: profile.gender || 'prefer-not-to-say',
                language: profile.language || 'ru',
                voicePerson: profile.voicePerson || 3
            });
        }
    }, [profile]);

    // Load user's characters when switching to characters tab
    useEffect(() => {
        if (activeTab === 'characters' && initData && profile) {
            setLoadingChars(true);
            apiRequest<{ author: any; characters: MyCharacter[] }>(`/api/authors/${profile.id}`, { initData })
                .then(data => setMyCharacters(data.characters || []))
                .catch(() => setMyCharacters([]))
                .finally(() => setLoadingChars(false));
        }
    }, [activeTab, initData, profile]);

    // Load message limits
    useEffect(() => {
        if (initData && profile?.subscriptionStatus !== 'active') {
            apiRequest<{ messagesLimit: MessageLimits | null }>('/api/limits', { initData })
                .then(data => {
                    if (data.messagesLimit) {
                        setLimits(data.messagesLimit);
                    }
                })
                .catch(() => { });
        }
    }, [initData, profile?.subscriptionStatus]);

    // Countdown timer
    useEffect(() => {
        if (!limits?.resetsAt) {
            setCountdown('');
            return;
        }

        const updateCountdown = () => {
            const now = new Date().getTime();
            const reset = new Date(limits.resetsAt!).getTime();
            const diff = reset - now;

            if (diff <= 0) {
                setCountdown('скоро');
                return;
            }

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            setCountdown(`${hours}ч ${minutes}м`);
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 60000); // Update every minute
        return () => clearInterval(interval);
    }, [limits?.resetsAt]);

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
        <div className="min-h-screen p-4 pb-24">
            <div className="glass-card max-w-lg mx-auto">
                <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                    Профиль
                </h2>

                {/* Tabs */}
                <div className="flex gap-2 mb-6">
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-all
                            ${activeTab === 'settings'
                                ? 'bg-primary text-white'
                                : 'bg-surface-light border border-border text-text-secondary hover:text-text-primary'
                            }`}
                    >
                        <Icon name="settings" size={16} className="inline mr-1" /> Настройки
                    </button>
                    <button
                        onClick={() => setActiveTab('characters')}
                        className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-all
                            ${activeTab === 'characters'
                                ? 'bg-primary text-white'
                                : 'bg-surface-light border border-border text-text-secondary hover:text-text-primary'
                            }`}
                    >
                        <Icon name="user" size={16} className="inline mr-1" /> Мои персонажи
                    </button>
                </div>

                {activeTab === 'settings' && (
                    <>
                        {/* Info Section */}
                        <div className="space-y-2 mb-4 p-4 rounded-xl bg-surface-light border border-border">
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
                                    {profile.subscriptionStatus === 'active' ? <><Icon name="check" size={14} className="inline mr-1" /> Активна</> : <><Icon name="cross" size={14} className="inline mr-1" /> Нет</>}
                                </span>
                            </p>
                        </div>

                        {/* Daily Limit & Bonus Messages */}
                        {profile.subscriptionStatus !== 'active' && (
                            <div className="mb-6 grid grid-cols-2 gap-3">
                                {/* Daily Limit */}
                                {limits && limits.remaining !== undefined && limits.total !== undefined && (
                                    <div className="p-4 rounded-xl bg-surface-light border border-border">
                                        <p className="text-xs text-text-muted mb-1">Дневной лимит</p>
                                        <p className="text-xl font-bold text-text-primary">
                                            <Icon name="bolt" size={16} className="inline" /> {limits.remaining}<span className="text-sm font-normal text-text-muted">/{limits.total}</span>
                                        </p>
                                        {countdown && (
                                            <p className="text-xs text-text-muted mt-1"><Icon name="clock" size={12} className="inline mr-1" /> {countdown}</p>
                                        )}
                                    </div>
                                )}
                                {/* Bonus Messages */}
                                <div className="p-4 rounded-xl bg-surface-light border border-border">
                                    <p className="text-xs text-text-muted mb-1">Бонусные</p>
                                    <p className="text-xl font-bold text-blue-400">
                                        <Icon name="bolt" size={16} className="inline" /> {profile.bonusMessages ?? 0}
                                    </p>
                                    <p className="text-xs text-text-muted mt-1">Не сгорают</p>
                                </div>
                            </div>
                        )}

                        {/* Subscription button */}
                        {profile.subscriptionStatus === 'active' ? (
                            <div
                                onClick={() => navigate('/donate')}
                                className="mb-6 p-4 rounded-xl bg-surface-light border border-border cursor-pointer hover:border-border-light transition-colors"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl"><Icon name="bolt" size={20} /></span>
                                        <div>
                                            <p className="text-sm font-medium text-text-primary">Premium активен</p>
                                            <p className="text-xs text-text-muted">до {profile.subscriptionEndAt ? new Date(profile.subscriptionEndAt).toLocaleDateString('ru-RU') : '—'}</p>
                                        </div>
                                    </div>
                                    <span className="text-text-muted">→</span>
                                </div>
                            </div>
                        ) : (
                            <div
                                onClick={() => navigate('/donate')}
                                className="mb-6 p-4 rounded-xl bg-surface-light border border-border cursor-pointer hover:border-primary/50 transition-colors"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl"><Icon name="bolt" size={20} /></span>
                                        <div>
                                            <p className="text-sm font-medium text-text-primary">Получить сообщения</p>
                                            <p className="text-xs text-text-muted">Пригласить друзей или купить premium</p>
                                        </div>
                                    </div>
                                    <span className="text-primary font-medium text-sm">Открыть →</span>
                                </div>
                            </div>
                        )}

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

                            <div>
                                <label className="block text-sm text-text-secondary mb-2">Лицо персонажа в диалоге</label>
                                <select
                                    value={form.voicePerson}
                                    onChange={e => setForm({ ...form, voicePerson: Number(e.target.value) as 1 | 3 })}
                                    className="w-full px-4 py-3 rounded-xl bg-surface-light border border-border text-text-primary
                                        focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                                >
                                    <option value={3}>3-е лицо ("Мигель смотрит на тебя...")</option>
                                    <option value={1}>1-е лицо ("Я смотрю на тебя...")</option>
                                </select>
                                <p className="mt-1 text-xs text-text-muted">Как персонажи описывают свои действия</p>
                            </div>
                        </div>

                        <button
                            onClick={handleSave}
                            disabled={isLoading}
                            className="w-full mt-8 mb-8 py-3 px-6 rounded-xl font-semibold text-white transition-all duration-200
                                bg-gradient-to-r from-primary to-indigo-500
                                hover:from-primary/90 hover:to-indigo-500/90 hover:shadow-lg hover:shadow-primary/20
                                disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? 'Сохранение...' : 'Сохранить изменения'}
                        </button>
                    </>
                )}

                {activeTab === 'characters' && (
                    <div>
                        {/* Create button */}
                        <button
                            onClick={() => navigate('/create-character')}
                            className="w-full mb-6 py-3 px-6 rounded-xl font-medium transition-all
                                bg-gradient-to-r from-primary to-indigo-500 text-white
                                hover:shadow-lg hover:shadow-primary/30
                                flex items-center justify-center gap-2"
                        >
                            <span>Создать персонажа</span>
                        </button>

                        {/* Characters list */}
                        {loadingChars ? (
                            <div className="text-center py-8 text-text-muted">Загрузка...</div>
                        ) : myCharacters.length === 0 ? (
                            <div className="text-center py-8 text-text-muted">
                                У вас пока нет персонажей
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {myCharacters.map(char => (
                                    <div
                                        key={char.id}
                                        className="flex items-center gap-3 p-3 rounded-xl bg-surface-light border border-border"
                                    >
                                        <img src={getCharacterAvatarUrl(char.avatarUrl, char.grammaticalGender)} alt="" className="w-12 h-12 rounded-lg object-cover" />
                                        <div
                                            className={`flex-1 ${char.isApproved ? 'cursor-pointer' : ''}`}
                                            onClick={() => char.isApproved && navigate(`/character/${char.id}`)}
                                        >
                                            <h4 className="font-medium text-text-primary">{char.name}</h4>
                                            {char.isApproved ? (
                                                <span className="text-xs text-success"><Icon name="check" size={12} className="inline mr-1" /> Одобрен</span>
                                            ) : (
                                                <span className="text-xs text-yellow-400"><Icon name="hourglass" size={12} className="inline mr-1" /> На модерации</span>
                                            )}
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/edit-character/${char.id}`);
                                            }}
                                            className="px-3 py-1 text-sm rounded-lg bg-surface border border-border text-text-secondary hover:border-primary transition-colors cursor-pointer"
                                        >
                                            <Icon name="edit" size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}


