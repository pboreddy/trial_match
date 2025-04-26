'use client';

import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  const supabase = createClient(); // Use the browser client

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login'); // Redirect to login after logout
    router.refresh(); // Refresh server components
  };

  return (
    <Button variant="outline" size="sm" onClick={handleLogout}>
      Logout
    </Button>
  );
} 