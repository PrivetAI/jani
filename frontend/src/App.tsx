import { useEffect, useState } from 'react';
import { apiRequest } from './lib/api.ts';
import { useTelegramInitData } from './hooks/useTelegramInitData.ts';

interface Character {
  id: number;
  name: string;
  description: string;
  avatarUrl: string | null;
  accessType: 'free' | 'premium';
}

interface Profile {
  telegramUserId: number;
  username: string | null;
  lastCharacterId: number | null;
  subscriptionStatus: 'none' | 'active' | 'expired';
  subscriptionEndAt: string | null;
  isAdmin: boolean;
}

interface DialogMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}

const APP_TABS = [
  { id: 'characters', label: 'Персонажи' },
  { id: 'subscription', label: 'Подписка' },
  { id: 'profile', label: 'Профиль' },
] as const;

type AppTab = (typeof APP_TABS)[number]['id'];

interface AdminCharacter {
  id: number;
  name: string;
  description: string;
  avatarUrl: string | null;
  systemPrompt: string;
  accessType: 'free' | 'premium';
  isActive: boolean;
  createdAt: string;
}

interface AdminUser {
  telegramUserId: number;
  username: string | null;
  subscriptionStatus: string;
  subscriptionEndAt: string | null;
  createdAt: string;
}

interface AdminStats {
  totalUsers: number;
  activeSubscriptions: number;
  messagesCount: number;
  topCharactersByUsers: { character_id: number; name: string; users: number }[];
  topCharactersByMessages: { character_id: number; name: string; messages: number }[];
}

const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? 'your_bot';

function formatDate(input: string | null) {
  if (!input) return '—';
  return new Date(input).toLocaleDateString();
}

export default function App() {
  const { initData, loaded } = useTelegramInitData();
  const [view, setView] = useState<'app' | 'admin'>('app');
  const [appTab, setAppTab] = useState<AppTab>('characters');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [charactersError, setCharactersError] = useState<string | null>(null);
  const [messages, setMessages] = useState<DialogMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [adminCharacters, setAdminCharacters] = useState<AdminCharacter[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [selectedAdminCharacterId, setSelectedAdminCharacterId] = useState<number | null>(null);
  const [createForm, setCreateForm] = useState({
    name: '',
    description_long: '',
    avatar_url: '/characters/placeholder.jpg',
    system_prompt: '',
    access_type: 'free' as 'free' | 'premium',
    is_active: true,
  });
  const [editForm, setEditForm] = useState({
    name: '',
    description_long: '',
    avatar_url: '',
    system_prompt: '',
    access_type: 'free' as 'free' | 'premium',
    is_active: true,
  });

  const loadProfile = async () => {
    if (!initData) return;
    try {
      const data = await apiRequest<{ profile: Profile }>('/api/profile', { initData });
      setProfile(data.profile);
    } catch (error) {
      setCharactersError((error as Error).message);
    }
  };

  const loadCharacters = async () => {
    if (!initData) return;
    try {
      const data = await apiRequest<{ characters: Character[] }>('/api/characters', {
        initData,
      });
      setCharacters(data.characters);
      setCharactersError(null);
      const desiredId = profile?.lastCharacterId;
      const initial = data.characters.find((c) => c.id === desiredId) ?? data.characters[0] ?? null;
      if (initial) {
        void selectCharacter(initial, false);
      } else {
        setSelectedCharacter(null);
        setMessages([]);
      }
    } catch (error) {
      setCharactersError((error as Error).message);
    }
  };

  const loadDialogs = async (characterId: number) => {
    if (!initData) return;
    const data = await apiRequest<{ messages: DialogMessage[] }>(`/api/dialogs/${characterId}`, { initData });
    setMessages(data.messages);
  };

  const selectCharacter = async (character: Character, persist = true) => {
    setSelectedCharacter(character);
    try {
      await loadDialogs(character.id);
      setCharactersError(null);
    } catch (error) {
      setMessages([]);
      setCharactersError((error as Error).message);
      return;
    }
    if (persist && initData) {
      try {
        await apiRequest('/api/profile/last-character', {
          method: 'PATCH',
          body: { characterId: character.id },
          initData,
        });
        setProfile((prev) => (prev ? { ...prev, lastCharacterId: character.id } : prev));
      } catch (error) {
        console.error(error);
      }
    }
  };

  useEffect(() => {
    if (!profile?.lastCharacterId || characters.length === 0) {
      return;
    }
    if (selectedCharacter?.id === profile.lastCharacterId) {
      return;
    }
    const candidate = characters.find((c) => c.id === profile.lastCharacterId);
    if (candidate) {
      void selectCharacter(candidate, false);
    }
  }, [profile?.lastCharacterId, characters, selectedCharacter?.id]);

  const resolvedSelectedCharacterName =
    selectedCharacter?.name ??
    (profile?.lastCharacterId ? characters.find((c) => c.id === profile.lastCharacterId)?.name ?? null : null);

  const handleActivateSubscription = async () => {
    if (!initData) return;
    setLoading(true);
    try {
      await apiRequest('/api/subscriptions/mock-checkout', {
        method: 'POST',
        body: { amountStars: 199 },
        initData,
      });
      await loadProfile();
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const openChatInTelegram = (characterId: number) => {
    const url = `https://t.me/${botUsername}?start=${characterId}`;
    window.open(url, '_blank');
  };

  const loadAdminData = async () => {
    if (!initData || !profile?.isAdmin) return;
    try {
      const [charactersPayload, usersPayload, statsPayload] = await Promise.all([
        apiRequest<{ characters: AdminCharacter[] }>('/api/admin/characters', { initData }),
        apiRequest<{ users: AdminUser[] }>('/api/admin/users', { initData }),
        apiRequest<{ stats: AdminStats }>('/api/admin/stats', { initData }),
      ]);
      setAdminCharacters(charactersPayload.characters);
      setAdminUsers(usersPayload.users);
      setAdminStats(statsPayload.stats);
      if (!selectedAdminCharacterId && charactersPayload.characters.length) {
        setSelectedAdminCharacterId(charactersPayload.characters[0].id);
      }
    } catch (error) {
      alert((error as Error).message);
    }
  };

  useEffect(() => {
    if (loaded && initData) {
      loadProfile();
      loadCharacters();
    }
  }, [loaded, initData]);

  useEffect(() => {
    if (view === 'admin' && profile?.isAdmin) {
      loadAdminData();
    }
  }, [view, profile?.isAdmin, initData]);

  useEffect(() => {
    if (!selectedAdminCharacterId) {
      return;
    }
    const current = adminCharacters.find((char) => char.id === selectedAdminCharacterId);
    if (current) {
      setEditForm({
        name: current.name,
        description_long: current.description,
        avatar_url: current.avatarUrl ?? '',
        system_prompt: current.systemPrompt,
        access_type: current.accessType,
        is_active: current.isActive,
      });
    }
  }, [selectedAdminCharacterId, adminCharacters]);

  if (!loaded) {
    return <div className="app">Загрузка...</div>;
  }

  if (!initData) {
    return <div className="app">Откройте приложение из Telegram.</div>;
  }

  return (
    <div className="app">
      {profile?.isAdmin && (
        <div className="view-toggle">
          <button className={view === 'app' ? 'active' : ''} onClick={() => setView('app')}>
            Пользовательский режим
          </button>
          <button className={view === 'admin' ? 'active' : ''} onClick={() => setView('admin')}>
            Админка
          </button>
        </div>
      )}

      {view === 'app' && (
        <div className="app-view">
          <nav className="tabs tabs-app">
            {APP_TABS.map((item) => (
              <button
                key={item.id}
                className={appTab === item.id ? 'active' : ''}
                onClick={() => setAppTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {appTab === 'characters' && (
            <section className="card characters-section">
              <div className="section-header">
                <div>
                  <h2>Персонажи</h2>
                  <p className="section-subtitle">Выберите собеседника и перейдите к чату в Telegram</p>
                </div>
                <button className="refresh-btn" onClick={loadCharacters}>
                  Обновить список
                </button>
              </div>
              {charactersError && <p className="error-text">{charactersError}</p>}
              <div className="characters-grid">
                {characters.map((character) => (
                  <article
                    key={character.id}
                    className={`character-card ${selectedCharacter?.id === character.id ? 'selected' : ''}`}
                  >
                    <div className="character-avatar">
                      <img src={character.avatarUrl ?? '/characters/placeholder.jpg'} alt={character.name} />
                      <span className={`badge ${character.accessType === 'premium' ? 'badge-premium' : 'badge-free'}`}>
                        {character.accessType === 'premium' ? 'Премиум' : 'Бесплатный'}
                      </span>
                    </div>
                    <h3>{character.name}</h3>
                    <p>{character.description}</p>
                    <div className="character-actions">
                      <button onClick={() => selectCharacter(character)}>Выбрать</button>
                      <button className="secondary" onClick={() => openChatInTelegram(character.id)}>
                        Открыть чат
                      </button>
                    </div>
                  </article>
                ))}
                {characters.length === 0 && <p>Нет доступных персонажей.</p>}
              </div>
              {selectedCharacter && (
                <div className="history-panel">
                  <h3>История с {selectedCharacter.name}</h3>
                  {messages.length === 0 ? (
                    <p>Нет сообщений</p>
                  ) : (
                    <ul>
                      {messages.map((msg) => (
                        <li key={msg.id}>
                          <span className="role">{msg.role === 'user' ? 'Вы' : selectedCharacter.name}</span>
                          <span>{msg.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}

          {appTab === 'subscription' && profile && (
            <section className="card subscription-card">
              <h2>Подписка</h2>
              <p className="status">
                Статус:{' '}
                <strong>
                  {profile.subscriptionStatus === 'active'
                    ? 'Активна'
                    : profile.subscriptionStatus === 'expired'
                    ? 'Истекла'
                    : 'Нет подписки'}
                </strong>
              </p>
              <p>Доступна до: {formatDate(profile.subscriptionEndAt)}</p>
              <button onClick={handleActivateSubscription} disabled={loading}>
                {profile.subscriptionStatus === 'active' ? 'Продлить' : 'Оформить'} подписку
              </button>
            </section>
          )}

          {appTab === 'profile' && profile && (
            <section className="card profile-card">
              <h2>Профиль</h2>
              <div className="profile-grid">
                <div>
                  <span className="label">Telegram ID</span>
                  <strong>{profile.telegramUserId}</strong>
                </div>
                <div>
                  <span className="label">Ник</span>
                  <strong>{profile.username ?? '—'}</strong>
                </div>
                <div>
                  <span className="label">Выбранный персонаж</span>
                  <strong>{resolvedSelectedCharacterName ?? 'не выбран'}</strong>
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {view === 'admin' && profile?.isAdmin && (
        <section className="admin-panel">
          <h2>Админка</h2>
          <button onClick={loadAdminData}>Обновить данные</button>

          <div className="admin-block">
            <h3>Редактирование персонажа</h3>
            <p className="admin-hint">
              Изображения кладём в папку `/characters`, лучше портретный кадр (например 1200×848). Пример пути: `/characters/alisa.jpg`.
            </p>
            <label>
              Выбор персонажа
              <select
                value={selectedAdminCharacterId ?? ''}
                onChange={(e) => setSelectedAdminCharacterId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— выберите персонажа —</option>
                {adminCharacters.map((char) => (
                  <option key={char.id} value={char.id}>
                    {char.name} ({char.accessType})
                  </option>
                ))}
              </select>
            </label>
            {selectedAdminCharacterId && (
              <>
                <label>
                  Имя
                  <input value={editForm.name} onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))} />
                </label>
                <label>
                  Карточка персонажа (характер/описание)
                  <textarea
                    value={editForm.description_long}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, description_long: e.target.value }))}
                  />
                </label>
                <label>
                  Аватар (путь)
                  <input
                    value={editForm.avatar_url}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, avatar_url: e.target.value }))}
                  />
                  <span className="small-hint">Рекомендуемый размер 1200×848, кроп под портрет.</span>
                </label>
                <label>
                  Системный промпт (W++/JSON описание стиля)
                  <textarea
                    value={editForm.system_prompt}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, system_prompt: e.target.value }))}
                  />
                </label>
                <label>
                  Тип
                  <select
                    value={editForm.access_type}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, access_type: e.target.value as 'free' | 'premium' }))
                    }
                  >
                    <option value="free">Бесплатный</option>
                    <option value="premium">Премиум</option>
                  </select>
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={editForm.is_active}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                  />
                  Активен в списке
                </label>
                <button
                  onClick={async () => {
                    if (!initData || !selectedAdminCharacterId) return;
                    try {
                      await apiRequest(`/api/admin/characters/${selectedAdminCharacterId}`, {
                        method: 'PUT',
                        body: editForm,
                        initData,
                      });
                      loadAdminData();
                    } catch (error) {
                      alert((error as Error).message);
                    }
                  }}
                >
                  Сохранить изменения
                </button>
                <button
                  className="danger"
                  onClick={async () => {
                    if (!initData || !selectedAdminCharacterId) return;
                    const approved = window.confirm('Удалить персонажа? Это действие нельзя отменить.');
                    if (!approved) return;
                    try {
                      await apiRequest(`/api/admin/characters/${selectedAdminCharacterId}`, {
                        method: 'DELETE',
                        initData,
                      });
                      setSelectedAdminCharacterId(null);
                      setEditForm({
                        name: '',
                        description_long: '',
                        avatar_url: '',
                        system_prompt: '',
                        access_type: 'free',
                        is_active: true,
                      });
                      loadAdminData();
                    } catch (error) {
                      alert((error as Error).message);
                    }
                  }}
                >
                  Удалить персонажа
                </button>
              </>
            )}
          </div>

          <div className="admin-block">
            <h3>Новый персонаж</h3>
            <label>
              Имя
              <input value={createForm.name} onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))} />
            </label>
            <label>
              Карточка персонажа (характер/описание)
              <textarea
                value={createForm.description_long}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, description_long: e.target.value }))}
              />
            </label>
            <label>
              Аватар (путь)
              <input
                value={createForm.avatar_url}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, avatar_url: e.target.value }))}
              />
              <span className="small-hint">Рекомендуемый размер 1200×848, кроп под портрет.</span>
            </label>
            <label>
              Системный промпт (W++/JSON описание стиля)
              <textarea
                value={createForm.system_prompt}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, system_prompt: e.target.value }))}
              />
            </label>
            <label>
              Тип
              <select
                value={createForm.access_type}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, access_type: e.target.value as 'free' | 'premium' }))
                }
              >
                <option value="free">Бесплатный</option>
                <option value="premium">Премиум</option>
              </select>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={createForm.is_active}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              />
              Активен в списке
            </label>
            <button
              onClick={async () => {
                if (!initData) return;
                try {
                  await apiRequest('/api/admin/characters', {
                    method: 'POST',
                    body: createForm,
                    initData,
                  });
                  setCreateForm({
                    name: '',
                    description_long: '',
                    avatar_url: '/characters/placeholder.jpg',
                    system_prompt: '',
                    access_type: 'free' as 'free' | 'premium',
                    is_active: true,
                  });
                  loadAdminData();
                } catch (error) {
                  alert((error as Error).message);
                }
              }}
            >
              Создать
            </button>
          </div>

          {adminStats && (
            <div className="admin-block">
              <h3>Статистика</h3>
              <p>Пользователи: {adminStats.totalUsers}</p>
              <p>Активные подписки: {adminStats.activeSubscriptions}</p>
              <p>Сообщения за период: {adminStats.messagesCount}</p>
              <div className="tops">
                <div>
                  <strong>Топ по пользователям</strong>
                  <ul>
                    {adminStats.topCharactersByUsers.map((item) => (
                      <li key={item.character_id}>
                        {item.name}: {item.users}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong>Топ по сообщениям</strong>
                  <ul>
                    {adminStats.topCharactersByMessages.map((item) => (
                      <li key={item.character_id}>
                        {item.name}: {item.messages}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="admin-block">
            <h3>Пользователи</h3>
            <ul>
              {adminUsers.map((user) => (
                <li key={user.telegramUserId}>
                  {user.username ?? user.telegramUserId} — {user.subscriptionStatus}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
