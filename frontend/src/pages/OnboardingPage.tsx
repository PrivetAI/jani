import { useState } from 'react';
import { useUserStore } from '../store/userStore';
import { useNavigate } from 'react-router-dom';

export function OnboardingPage() {
    const [checked, setChecked] = useState(false);
    const { confirmAdult, isLoading } = useUserStore();
    const navigate = useNavigate();

    const handleConfirm = async () => {
        if (!checked) return;
        await confirmAdult();
        navigate('/characters');
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="glass-card max-w-md w-full">
                <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                    Добро пожаловать в Jani
                </h2>
                <p className="text-text-secondary mb-6 leading-relaxed">
                    Здесь ты можешь общаться с AI-персонажами на любые темы.
                    Мы создаем пространство для свободного общения без ограничений.
                </p>

                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
                    <h3 className="text-amber-400 font-semibold mb-2 flex items-center gap-2">
                        <span>⚠️</span> Важно
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
                        className="mt-1 w-5 h-5 rounded border-2 border-border-light bg-transparent checked:bg-primary checked:border-primary transition-colors cursor-pointer"
                    />
                    <span className="text-text-secondary text-sm group-hover:text-text-primary transition-colors">
                        Мне исполнилось 18 лет, и я принимаю условия использования.
                    </span>
                </label>

                <button
                    onClick={handleConfirm}
                    disabled={!checked || isLoading}
                    className="w-full py-3 px-6 rounded-xl font-semibold text-white transition-all duration-200
                        bg-gradient-to-r from-primary to-indigo-500
                        hover:from-primary/90 hover:to-indigo-500/90 hover:shadow-lg hover:shadow-primary/20
                        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
                >
                    {isLoading ? 'Загрузка...' : 'Начать'}
                </button>
            </div>
        </div>
    );
}
