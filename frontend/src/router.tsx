import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from './App';
import { OnboardingPage } from './pages/OnboardingPage';
import { CharactersPage } from './pages/CharactersPage';
import { CharacterPage } from './pages/CharacterPage';
import { ChatPage } from './pages/ChatPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';

export const router = createBrowserRouter([
    {
        path: '/',
        element: <App />,
        children: [
            {
                index: true,
                element: <Navigate to="/characters" replace />,
            },
            {
                path: 'onboarding',
                element: <OnboardingPage />,
            },
            {
                path: 'characters',
                element: <CharactersPage />,
            },
            {
                path: 'character/:id',
                element: <CharacterPage />,
            },
            {
                path: 'chat/:id',
                element: <ChatPage />,
            },
            {
                path: 'profile',
                element: <ProfilePage />,
            },
            {
                path: 'admin',
                element: <AdminPage />,
            },
        ],
    },
]);
