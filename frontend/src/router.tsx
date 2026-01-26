import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from './App';
import { OnboardingPage } from './pages/OnboardingPage';
import { CharactersPage } from './pages/CharactersPage';
import { CharacterPage } from './pages/CharacterPage';
import { ChatPage } from './pages/ChatPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';
import { AuthorPage } from './pages/AuthorPage';
import { CreateCharacterPage } from './pages/CreateCharacterPage';
import { SubscriptionPage } from './pages/SubscriptionPage';

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
                path: 'subscription',
                element: <SubscriptionPage />,
            },
            {
                path: 'admin',
                element: <AdminPage />,
            },
            {
                path: 'author/:id',
                element: <AuthorPage />,
            },
            {
                path: 'create-character',
                element: <CreateCharacterPage />,
            },
            {
                path: 'edit-character/:id',
                element: <CreateCharacterPage />,
            },
        ],
    },
]);
