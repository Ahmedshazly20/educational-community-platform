import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { AppProviders } from './app/AppProviders';
import { router } from './app/Router';
import { useAuthStore } from './stores/authStore';

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);

  React.useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
