import { useState } from 'react';
import { useUserStore } from '../store/userStore';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';

export function OnboardingPage() {
    const [step, setStep] = useState(1);
    const [name, setName] = useState('');
    const [nickname, setNickname] = useState('');
    const [gender, setGender] = useState<'male' | 'female' | 'non-binary' | ''>('');
    const [checked, setChecked] = useState(false);
    const { confirmAdult, updateProfile, isLoading } = useUserStore();
    const navigate = useNavigate();

    const handleNext = () => {
        if (step === 1 && name.trim() && nickname.trim() && gender) {
            setStep(2);
        }
    };

    const handleConfirm = async () => {
        if (!checked) return;

        await updateProfile({
            displayName: name.trim(),
            nickname: nickname.trim(),
            gender
        });
        await confirmAdult();
        navigate('/characters');
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="glass-card max-w-md w-full">
                <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                    Добро пожаловать в inny
                </h2>

                {step === 1 && (
                    <>
                        <p className="text-text-secondary mb-6">
                            Расскажи немного о себе
                        </p>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-sm text-text-secondary mb-2">
                                    Как к тебе обращаться? *
                                </label>
                                <input
                                    type="text"
                                    inputMode="text"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Твоё имя"
                                    className="w-full px-4 py-3 rounded-xl bg-surface-light border border-border 
                                        text-text-primary placeholder:text-text-muted
                                        focus:outline-none focus:border-primary transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-text-secondary mb-2">
                                    Уникальный никнейм *
                                </label>
                                <input
                                    type="text"
                                    inputMode="text"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    value={nickname}
                                    onChange={e => setNickname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                    placeholder="username123"
                                    maxLength={30}
                                    className="w-full px-4 py-3 rounded-xl bg-surface-light border border-border 
                                        text-text-primary placeholder:text-text-muted
                                        focus:outline-none focus:border-primary transition-colors"
                                />
                                <p className="mt-1 text-xs text-text-muted">Только латинские буквы, цифры и _</p>
                            </div>


                            <div>
                                <label className="block text-sm text-text-secondary mb-2">
                                    Твой пол *
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setGender('male')}
                                        className={`py-3 px-2 rounded-xl border transition-all text-sm ${gender === 'male'
                                            ? 'bg-primary/20 border-primary text-primary'
                                            : 'bg-surface-light border-border text-text-secondary hover:border-primary/50'
                                            }`}
                                    >
                                        <Icon name="male" size={16} className="inline mr-1" /> Мужской
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setGender('female')}
                                        className={`py-3 px-2 rounded-xl border transition-all text-sm ${gender === 'female'
                                            ? 'bg-accent/20 border-accent text-accent'
                                            : 'bg-surface-light border-border text-text-secondary hover:border-accent/50'
                                            }`}
                                    >
                                        <Icon name="female" size={16} className="inline mr-1" /> Женский
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setGender('non-binary')}
                                        className={`py-3 px-2 rounded-xl border transition-all text-sm ${gender === 'non-binary'
                                            ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                                            : 'bg-surface-light border-border text-text-secondary hover:border-purple-500/50'
                                            }`}
                                    >
                                        <Icon name="nonbinary" size={16} className="inline mr-1" /> Другой
                                    </button>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleNext}
                            disabled={!name.trim() || !nickname.trim() || !gender}
                            className="w-full py-3 px-6 rounded-xl font-semibold text-white transition-all duration-200
                                bg-gradient-to-r from-primary to-indigo-500
                                hover:from-primary/90 hover:to-indigo-500/90 hover:shadow-lg hover:shadow-primary/20
                                disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Далее
                        </button>
                    </>
                )}

                {step === 2 && (
                    <>
                        <p className="text-text-secondary mb-6 leading-relaxed">
                            Здесь ты можешь общаться с AI-персонажами на любые темы.
                            Мы создаем пространство для свободного общения без ограничений.
                        </p>

                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
                            <h3 className="text-amber-400 font-semibold mb-2 flex items-center gap-2">
                                <span><Icon name="warning" size={16} /></span> Важно
                            </h3>
                            <p className="text-amber-200/80 text-sm">
                                Контент может содержать материалы для взрослых (18+).
                            </p>
                        </div>

                        <label className="flex items-start gap-3 cursor-pointer mb-6 group">
                            <input
                                type="checkbox"
                                checked={checked}
                                onChange={e => setChecked(e.target.checked)}
                                className="mt-1 w-5 h-5 rounded border-2 border-border-light bg-transparent 
                                    checked:bg-primary checked:border-primary transition-colors cursor-pointer"
                            />
                            <span className="text-text-secondary text-sm group-hover:text-text-primary transition-colors">
                                Мне исполнилось 18 лет, и я принимаю условия использования.
                            </span>
                        </label>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep(1)}
                                className="py-3 px-6 rounded-xl font-semibold text-text-secondary 
                                    bg-surface-light border border-border hover:bg-surface transition-colors"
                            >
                                Назад
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={!checked || isLoading}
                                className="flex-1 py-3 px-6 rounded-xl font-semibold text-white transition-all duration-200
                                    bg-gradient-to-r from-primary to-indigo-500
                                    hover:from-primary/90 hover:to-indigo-500/90 hover:shadow-lg hover:shadow-primary/20
                                    disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
                            >
                                {isLoading ? 'Загрузка...' : 'Начать'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

