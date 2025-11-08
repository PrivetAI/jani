import { useEffect, useState } from 'react';

interface Character {
  id: string;
  name: string;
  slug: string;
  visibility: string;
}

export const App = () => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/characters', {
      headers: {
        'x-telegram-id': 'pwa-user',
      },
    })
      .then((res) => res.json())
      .then(setCharacters)
      .catch(() => setError('Не удалось загрузить персонажей. Проверьте работу бэкенда.'));
  }, []);

  return (
    <div className="app">
      <header>
        <h1>Архиватор — режим отладки</h1>
        <p className="banner">⚠ Реальные платежи доступны только в Telegram. Сейчас режим отладки.</p>
      </header>
      {error ? (
        <p className="error">{error}</p>
      ) : (
        <section className="characters">
          <h2>Персонажи</h2>
          <ul>
            {characters.map((character) => (
              <li key={character.id}>
                <strong>{character.name}</strong>
                <span className="meta">({character.visibility})</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default App;
